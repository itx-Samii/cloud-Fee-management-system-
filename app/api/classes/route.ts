import { NextResponse } from 'next/server';
import { ADMIN, STAFF, requireFeature, requireSession } from '@/lib/auth';
import { audit, describeChanges } from '@/lib/audit';
import { deleteRecord, findAll, findById, insertRecord, updateRecord } from '@/lib/dbHandler';
import { jsonError, optionalNumber, readBody, toNumber, toText, withoutUndefined } from '@/lib/http';
import { isLeft } from '@/lib/fees';
import type { SchoolClass, Student } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await requireSession(STAFF);
  if (session instanceof NextResponse) return session;
  const { schoolId } = session;

  try {
    const [classes, students] = await Promise.all([
      findAll<SchoolClass>('classes', schoolId),
      findAll<Student>('students', schoolId),
    ]);
    const counts = new Map<string, number>();
    students.filter((s) => !isLeft(s)).forEach((s) => counts.set(String(s.classId), (counts.get(String(s.classId)) ?? 0) + 1));

    return NextResponse.json(
      classes.map((c) => ({ ...c, studentCount: counts.get(String(c.id)) ?? 0 })),
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error(`GET classes failed for ${schoolId}:`, err);
    return jsonError('Failed to fetch classes', 500);
  }
}

export async function POST(request: Request) {
  const session = await requireSession(ADMIN);
  if (session instanceof NextResponse) return session;
  const locked = await requireFeature(session, 'classes');
  if (locked) return locked;
  const { schoolId } = session;

  const body = await readBody(request);
  const name = toText(body?.name);
  if (!body || !name) return jsonError('Class name is required', 400);

  try {
    const created = await insertRecord('classes', schoolId, {
      name,
      section: toText(body.section) ?? '',
      monthlyFee: toNumber(body.monthlyFee),
      annualCharges: toNumber(body.annualCharges),
      createdAt: new Date().toISOString(),
    });
    await audit(session, 'class.add', `Added class ${name}${created.section ? ` - ${created.section}` : ''}`);
    return NextResponse.json(created);
  } catch (err) {
    console.error(`POST class failed for ${schoolId}:`, err);
    return jsonError('Failed to create class', 500);
  }
}

export async function PUT(request: Request) {
  const session = await requireSession(ADMIN);
  if (session instanceof NextResponse) return session;
  const locked = await requireFeature(session, 'classes');
  if (locked) return locked;
  const { schoolId } = session;

  const body = await readBody(request);
  const id = toText(body?.id);
  if (!body || !id) return jsonError('ID is required', 400);

  const changes = withoutUndefined({
    name: toText(body.name) || undefined,
    section: toText(body.section),
    monthlyFee: optionalNumber(body.monthlyFee),
    annualCharges: optionalNumber(body.annualCharges),
  });

  try {
    const before = await findById<SchoolClass>('classes', schoolId, id);
    const updated = before && (await updateRecord<SchoolClass>('classes', schoolId, before.id, changes));
    if (!before || !updated) return jsonError('Class not found', 404);

    const changed = describeChanges(before, changes, {
      name: 'name',
      section: 'section',
      monthlyFee: 'monthly fee',
      annualCharges: 'annual charges',
    });
    if (changed) await audit(session, 'class.edit', `Edited class ${before.name}: ${changed}`);
    return NextResponse.json(updated);
  } catch (err) {
    console.error(`PUT class failed for ${schoolId}:`, err);
    return jsonError('Failed to update class', 500);
  }
}

export async function DELETE(request: Request) {
  const session = await requireSession(ADMIN);
  if (session instanceof NextResponse) return session;
  const locked = await requireFeature(session, 'classes');
  if (locked) return locked;
  const { schoolId } = session;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return jsonError('ID is required', 400);

  try {
    const cls = await findById<SchoolClass>('classes', schoolId, id);
    if (!cls || !(await deleteRecord('classes', schoolId, cls.id))) return jsonError('Class not found', 404);
    await audit(session, 'class.delete', `Deleted class ${cls.name}${cls.section ? ` - ${cls.section}` : ''}`);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`DELETE class failed for ${schoolId}:`, err);
    return jsonError('Failed to delete class', 500);
  }
}
