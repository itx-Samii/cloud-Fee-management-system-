import { NextResponse } from 'next/server';
import { jsonError, readBody } from '@/lib/http';
import { validateSignup } from '@/lib/signupDetails';
import { submitSignup } from '@/lib/signupRequests';

const WINDOW_MS = 15 * 60 * 1000;
let resetAt = 0;
const attempts = new Map<string, number>();

export async function POST(request: Request) {
  const validation = validateSignup(await readBody(request) ?? {});
  if (!validation.details) return NextResponse.json({ error: validation.error, field: validation.field }, { status: 400 });

  const now = Date.now();
  if (now >= resetAt) {
    attempts.clear();
    resetAt = now + WINDOW_MS;
  }
  const client = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const count = attempts.get(client) ?? 0;
  if (count >= 10 || (attempts.size >= 1000 && !attempts.has(client))) {
    return jsonError('Too many signup attempts. Wait 15 minutes and try again.', 429);
  }
  attempts.set(client, count + 1);

  try {
    if (!await submitSignup(validation.details)) {
      return NextResponse.json({ error: 'That username is in use or already has a pending request.', field: 'username' }, { status: 409 });
    }
    return NextResponse.json({ success: true }, { status: 201 });
  } catch {
    return jsonError('Could not submit the request. Try again.', 500);
  }
}
