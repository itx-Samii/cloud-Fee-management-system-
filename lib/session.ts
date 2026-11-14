import { createHash, createHmac, timingSafeEqual } from 'crypto';

// Shared by proxy.ts and the route handlers, so it must not import next/headers.

/** 'parent' is a family signed in to the parent portal; its username is the family's phone number. */
export type Role = 'superadmin' | 'admin' | 'accountant' | 'parent';

export interface Session {
  username: string;
  role: Role;
  displayName: string;
  schoolId: string;
  /** When the session was signed in (ms), so a parent PIN reset can end older sessions. */
  issuedAt?: number;
  revision?: string;
}

export const SESSION_COOKIE = 'school-session';
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const ROLES: Role[] = ['superadmin', 'admin', 'accountant', 'parent'];

// No maxAge: the cookie dies with the browser, which matters on shared school PCs.
export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

function signingKey(): Buffer {
  // Falling back to the database URL: whoever knows it already owns the data.
  const secret = process.env.SESSION_SECRET || process.env.DATABASE_URL;
  if (!secret) throw new Error('SESSION_SECRET is not set. Add it to .env.local (see .env.example).');
  return createHash('sha256').update(`school-session:${secret}`).digest();
}

function sign(payload: string): string {
  return createHmac('sha256', signingKey()).update(payload).digest('base64url');
}

export function encodeSession(session: Session): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const { username, role, displayName, schoolId, revision } = session;
  const payload = Buffer.from(JSON.stringify({ username, role, displayName, schoolId, revision, exp })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(token: string | undefined): Session | null {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  try {
    const expected = Buffer.from(sign(payload));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data.exp !== 'number' || data.exp < Date.now() / 1000) return null;
    if (!ROLES.includes(data.role) || typeof data.username !== 'string' || typeof data.schoolId !== 'string') return null;

    return {
      username: data.username,
      role: data.role,
      displayName: typeof data.displayName === 'string' ? data.displayName : data.username,
      schoolId: data.schoolId,
      issuedAt: (data.exp - SESSION_TTL_SECONDS) * 1000,
      ...(typeof data.revision === 'string' && { revision: data.revision }),
    };
  } catch {
    return null;
  }
}
