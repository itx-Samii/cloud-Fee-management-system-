import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { signInParent } from '@/lib/parents';
import { encodeSession, sessionCookieOptions, SESSION_COOKIE } from '@/lib/session';
import { jsonError, readBody, toText } from '@/lib/http';

/** Parent sign-in: { phone, pin, schoolId? }. Answers { choose: [...] } if the PIN fits two schools. */
export async function POST(request: Request) {
  const body = await readBody(request);
  const phone = toText(body?.phone);
  const pin = toText(body?.pin)?.replace(/\s/g, '');
  if (!phone || !pin) return jsonError('Phone number and PIN are required', 400);

  try {
    const result = await signInParent(phone, pin, toText(body?.schoolId));
    if ('error' in result) return jsonError(result.error, result.status);
    if ('choose' in result) return NextResponse.json({ choose: result.choose });
    (await cookies()).set(SESSION_COOKIE, encodeSession(result.session), sessionCookieOptions);
    return NextResponse.json({ success: true, user: result.session });
  } catch (err) {
    console.error('Parent sign-in failed:', err);
    return jsonError('Sign-in failed. Please try again.', 500);
  }
}
