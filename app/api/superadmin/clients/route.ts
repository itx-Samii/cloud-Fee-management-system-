import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import {
  LEGACY_SCHOOL_ID,
  MIN_PASSWORD_LENGTH,
  USERNAME_PATTERN,
  USERNAME_RULES,
  hashPassword,
  isUsernameTaken,
  updateConfig,
} from '@/lib/dbHandler';
import { DEFAULT_FEATURES, DEFAULT_MAX_STUDENTS, featuresOf, forgetLicenseStatus, isLegacySchool } from '@/lib/license';
import { jsonError, readBody, toNumber, toText } from '@/lib/http';

const PASSWORD_RULE = `Principal password must be at least ${MIN_PASSWORD_LENGTH} characters`;

const maxStudentsOf = (value: unknown) => Math.min(1_000_000, Math.max(1, Math.round(toNumber(value, DEFAULT_MAX_STUDENTS))));

export async function GET() {
  const session = await requireSession(['superadmin']);
  if (session instanceof NextResponse) return session;

  try {
    const db = await getDb();
    // The original single school gets its license record the first time this page opens.
    await db`
      insert into licenses (school_id, client_name, license_key, max_students, features)
      select ${LEGACY_SCHOOL_ID}, 'Brook Field School System', ${process.env.LICENSE_KEY || 'SCHOOL-PAY-DEMO-KEY-2026'},
             ${DEFAULT_MAX_STUDENTS}, ${db.json(DEFAULT_FEATURES)}
      where not exists (select 1 from licenses)
      on conflict do nothing`;

    // Students counted the way the license counts them: everyone who hasn't left.
    const clients = await db`
      select l.*, coalesce(s.current, 0)::int as current_students
      from licenses l
      left join (
        select school_id, count(*) as current from students where lower(status) <> 'left' group by school_id
      ) s on s.school_id = l.school_id
      order by l.created_at, l.school_id`;

    return NextResponse.json(
      clients.map((c) => ({
        id: c.schoolId,
        schoolId: c.schoolId,
        clientName: c.clientName,
        licenseKey: c.licenseKey,
        status: c.status,
        maxStudents: c.maxStudents,
        currentStudents: c.currentStudents,
        features: featuresOf(c.features),
        createdAt: c.createdAt,
        lastSync: c.lastSync,
      }))
    );
  } catch (err) {
    console.error('Fetching SaaS clients failed:', err);
    return jsonError('Failed to fetch SaaS clients', 500);
  }
}

export async function POST(request: Request) {
  const session = await requireSession(['superadmin']);
  if (session instanceof NextResponse) return session;

  const body = await readBody(request);
  const clientName = toText(body?.clientName);
  const licenseKey = toText(body?.licenseKey);
  const adminUsername = toText(body?.adminUsername)?.toLowerCase();
  const adminPassword = toText(body?.adminPassword);
  if (!clientName || !licenseKey || !adminUsername) {
    return jsonError('Client name, license key, and admin username are required', 400);
  }
  if (!USERNAME_PATTERN.test(adminUsername)) return jsonError(USERNAME_RULES, 400);
  if (!adminPassword || adminPassword.length < MIN_PASSWORD_LENGTH) return jsonError(PASSWORD_RULE, 400);

  try {
    const db = await getDb();
    const [keyTaken] = await db`select 1 from licenses where license_key = ${licenseKey}`;
    if (keyTaken) return jsonError('License key already exists', 400);
    if (await isUsernameTaken(adminUsername)) return jsonError('Principal Login Username is already taken', 400);

    const slug = clientName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const schoolId = `school_${slug}_${crypto.randomBytes(3).toString('hex')}`;
    const maxStudents = maxStudentsOf(body?.maxStudents);

    const [created] = await db`
      insert into licenses (school_id, client_name, admin_username, license_key, max_students, features)
      values (${schoolId}, ${clientName}, ${adminUsername}, ${licenseKey}, ${maxStudents}, ${db.json(DEFAULT_FEATURES)})
      returning *`;
    await updateConfig(schoolId, { adminUsername, adminPassword: hashPassword(adminPassword), schoolName: clientName });

    return NextResponse.json({ success: true, client: { ...created, id: schoolId } });
  } catch (err) {
    console.error('Creating SaaS client failed:', err);
    return jsonError('Failed to create SaaS client', 500);
  }
}

export async function PUT(request: Request) {
  const session = await requireSession(['superadmin']);
  if (session instanceof NextResponse) return session;

  const body = await readBody(request);
  const id = toText(body?.id);
  if (!body || !id) return jsonError('Client ID required', 400);

  const status = toText(body.status);
  if (status && status !== 'active' && status !== 'blocked') return jsonError('Invalid status', 400);
  const adminPassword = toText(body.adminPassword);
  if (adminPassword && adminPassword.length < MIN_PASSWORD_LENGTH) return jsonError(PASSWORD_RULE, 400);

  try {
    const db = await getDb();
    const [client] = await db`select * from licenses where school_id = ${id}`;
    if (!client) return jsonError('Client not found', 404);

    const licenseKey = toText(body.licenseKey);
    if (licenseKey && licenseKey !== client.licenseKey) {
      const [keyTaken] = await db`select 1 from licenses where license_key = ${licenseKey} and school_id <> ${id}`;
      if (keyTaken) return jsonError('License key already exists', 400);
    }

    const changes: Record<string, unknown> = { lastSync: new Date().toISOString() };
    if (status) changes.status = status;
    const clientName = toText(body.clientName);
    if (clientName) changes.clientName = clientName;
    if (body.maxStudents !== undefined) changes.maxStudents = maxStudentsOf(body.maxStudents);
    if (licenseKey) changes.licenseKey = licenseKey;
    if (body.features !== undefined) changes.features = db.json(featuresOf(body.features));

    const [updated] = await db`
      update licenses set ${db(changes as Record<string, string>)}
      where school_id = ${id}
      returning *`;

    if (adminPassword) await updateConfig(id, { adminPassword: hashPassword(adminPassword) });
    forgetLicenseStatus(id);

    return NextResponse.json({ success: true, client: { ...updated, id } });
  } catch (err) {
    console.error('Updating SaaS client failed:', err);
    return jsonError('Failed to update client profile', 500);
  }
}

/** Removes a school's license and logins. Its student and fee records are kept. */
export async function DELETE(request: Request) {
  const session = await requireSession(['superadmin']);
  if (session instanceof NextResponse) return session;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return jsonError('Client ID required', 400);
  // Deleting Brook Field would bring back the default admin / brookfield login on the next sign-in.
  if (isLegacySchool(id)) return jsonError('Brook Field is the original school and cannot be deleted. Block its license instead.', 400);

  try {
    const db = await getDb();
    const removed = await db.begin(async (tx) => {
      const { count } = await tx`delete from licenses where school_id = ${id}`;
      if (count === 0) return false;
      await tx`delete from school_settings where school_id = ${id}`;
      await tx`delete from users where school_id = ${id}`;
      return true;
    });
    if (!removed) return jsonError('Client not found', 404);
    forgetLicenseStatus(id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Deleting SaaS client failed:', err);
    return jsonError('Failed to delete SaaS client', 500);
  }
}
