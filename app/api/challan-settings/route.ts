import { NextResponse } from 'next/server';
import { ADMIN, STAFF, requireFeature, requireSession } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { validateChallanProfile } from '@/lib/challanProfile';
import { loadChallanProfile } from '@/lib/challanSettings';
import { transaction } from '@/lib/db';
import { jsonError, readBody } from '@/lib/http';

const headers = { 'Cache-Control': 'no-store' };

export async function GET() {
  const session = await requireSession(STAFF);
  if (session instanceof NextResponse) return session;
  try {
    return NextResponse.json(await loadChallanProfile(session.schoolId), { headers });
  } catch {
    return jsonError('Could not load challan settings.', 500);
  }
}

export async function PUT(request: Request) {
  const session = await requireSession(ADMIN);
  if (session instanceof NextResponse) return session;
  const locked = await requireFeature(session, 'generate');
  if (locked) return locked;
  const body = await readBody(request);
  if (!body) return jsonError('Invalid challan settings.', 400);
  const { profile, error, field } = validateChallanProfile(body);
  if (!profile) return NextResponse.json({ error, field }, { status: 400 });

  try {
    await transaction(async (tx) => {
      await tx`
        insert into school_settings (school_id, challan_profile) values (${session.schoolId}, ${tx.json(profile)})
        on conflict (school_id) do update set challan_profile = excluded.challan_profile, updated_at = now()`;
      await audit(session, 'settings.edit', 'Updated shared challan branding and payment instructions', tx);
    });
    return NextResponse.json({ profile, configured: true }, { headers });
  } catch {
    return jsonError('Could not save challan settings. Try again.', 500);
  }
}
