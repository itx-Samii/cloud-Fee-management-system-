import { NextResponse } from 'next/server';
import { STAFF, requireFeature, requireSession } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { familyOf, getParentLogin, removeParentLogin, revealParentPin, setParentPin } from '@/lib/parents';
import { whatsappNumber } from '@/lib/whatsapp';
import { jsonError, readBody, toText } from '@/lib/http';
import type { Session } from '@/lib/session';

export const dynamic = 'force-dynamic';
const PRIVATE_RESPONSE = { 'Cache-Control': 'no-store' };

type Family = { error: NextResponse } | { error?: undefined; phone: string; names: string };

/** The family behind a phone number given by staff, or the error to send back. */
async function familyFor(session: Session, phoneInput: string | null | undefined): Promise<Family> {
  const phone = whatsappNumber(phoneInput ?? undefined);
  if (!phone) return { error: jsonError('A valid parent phone number is required', 400) };
  const family = await familyOf(session.schoolId, phone);
  if (family.length === 0) return { error: jsonError('No student has this parent phone number', 404) };
  return { phone, names: family.map((s) => s.name).join(', ') };
}

async function guard() {
  const session = await requireSession(STAFF);
  if (session instanceof NextResponse) return session;
  return (await requireFeature(session, 'parentPortal')) ?? session;
}

/** ?phone= : whether the family has a portal login, since when and when it was last used. */
export async function GET(request: Request) {
  const session = await guard();
  if (session instanceof NextResponse) return session;
  try {
    const found = await familyFor(session, new URL(request.url).searchParams.get('phone'));
    if (found.error) return found.error;
    return NextResponse.json({ phone: found.phone, login: await getParentLogin(session.schoolId, found.phone) }, { headers: PRIVATE_RESPONSE });
  } catch (err) {
    console.error(`GET parent login failed for ${session.schoolId}:`, err);
    return jsonError('Failed to load the parent login', 500);
  }
}

/** { phone }: gives the family a new PIN. */
export async function POST(request: Request) {
  const session = await guard();
  if (session instanceof NextResponse) return session;
  const body = await readBody(request);
  try {
    const found = await familyFor(session, toText(body?.phone));
    if (found.error) return found.error;
    const { pin, reset } = await setParentPin(session, found.phone);
    await audit(session, reset ? 'parent.reset' : 'parent.add', `${reset ? 'Gave a new parent portal PIN to' : 'Opened a parent portal login for'} +${found.phone} (${found.names})`);
    return NextResponse.json({ phone: found.phone, pin, reset }, { headers: PRIVATE_RESPONSE });
  } catch (err) {
    console.error(`Setting parent PIN failed for ${session.schoolId}:`, err);
    return jsonError('Failed to set the PIN', 500);
  }
}

/** { phone }: reveals the existing PIN only to staff at that school. */
export async function PATCH(request: Request) {
  const session = await guard();
  if (session instanceof NextResponse) return session;
  const body = await readBody(request);
  try {
    const found = await familyFor(session, toText(body?.phone));
    if (found.error) return found.error;
    const result = await revealParentPin(session, found.phone, found.names);
    if (result.status === 'missing') return jsonError('This family has no portal login. Refresh the ledger.', 404);
    if (result.status === 'unavailable') return jsonError('This PIN cannot be shown. Use New PIN to issue one you can view later.', 409);
    return NextResponse.json({ pin: result.pin }, { headers: PRIVATE_RESPONSE });
  } catch {
    return jsonError('Could not show the PIN. Try again.', 500);
  }
}

/** ?phone= : closes the family's portal login; anyone signed in with it is signed out. */
export async function DELETE(request: Request) {
  const session = await guard();
  if (session instanceof NextResponse) return session;
  try {
    const found = await familyFor(session, new URL(request.url).searchParams.get('phone'));
    if (found.error) return found.error;
    if (!(await removeParentLogin(session.schoolId, found.phone))) return jsonError('This family has no portal login', 404);
    await audit(session, 'parent.remove', `Closed the parent portal login of +${found.phone} (${found.names})`);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`Removing parent login failed for ${session.schoolId}:`, err);
    return jsonError('Failed to close the login', 500);
  }
}
