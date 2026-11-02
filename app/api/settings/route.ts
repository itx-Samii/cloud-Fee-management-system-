import { NextResponse } from 'next/server';
import { ADMIN, STAFF, requireFeature, requireSession } from '@/lib/auth';
import { audit, describeChanges } from '@/lib/audit';
import { readConfig, updateConfig } from '@/lib/dbHandler';
import { getLicense } from '@/lib/license';
import { featureOn } from '@/lib/features';
import { feeSettingsOf } from '@/lib/fees';
import { jsonError, optionalNumber, readBody, withoutUndefined } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * The school's fee rules (days until a voucher is due, and the late fine after that), plus the
 * school's name for messages to parents. With Late Fine switched off by the Super Admin the fine
 * reads 0 and `lateFineOn` is false.
 */
export async function GET() {
  const session = await requireSession(STAFF);
  if (session instanceof NextResponse) return session;

  try {
    const [config, license] = await Promise.all([readConfig(session.schoolId), getLicense(session.schoolId)]);
    const lateFineOn = featureOn(license.features, 'lateFine');
    const settings = feeSettingsOf(config);
    return NextResponse.json(
      { ...settings, ...(!lateFineOn && { lateFine: 0 }), lateFineOn, schoolName: config.schoolName || license.clientName },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error(`GET settings failed for ${session.schoolId}:`, err);
    return jsonError('Failed to load settings', 500);
  }
}

export async function PUT(request: Request) {
  const session = await requireSession(ADMIN);
  if (session instanceof NextResponse) return session;

  const body = await readBody(request);
  if (!body) return jsonError('Invalid request', 400);
  const dueDays = optionalNumber(body.dueDays);
  const lateFine = optionalNumber(body.lateFine);
  if (dueDays !== undefined && (!Number.isInteger(dueDays) || dueDays < 0 || dueDays > 90)) {
    return jsonError('Due days must be a whole number from 0 to 90', 400);
  }
  if (lateFine !== undefined && lateFine < 0) return jsonError('The late fine cannot be negative', 400);
  if (lateFine !== undefined) {
    const locked = await requireFeature(session, 'lateFine');
    if (locked) return locked;
  }

  try {
    const before = feeSettingsOf(await readConfig(session.schoolId));
    const changes = withoutUndefined({ dueDays, lateFine });
    await updateConfig(session.schoolId, changes);

    const changed = describeChanges(before, changes, { dueDays: 'days until due', lateFine: 'late fine (Rs.)' });
    if (changed) await audit(session, 'settings.edit', `Fee settings: ${changed}`);
    return NextResponse.json({ ...before, ...changes });
  } catch (err) {
    console.error(`PUT settings failed for ${session.schoolId}:`, err);
    return jsonError('Failed to save settings', 500);
  }
}
