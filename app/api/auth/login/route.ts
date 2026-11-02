import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { getDb } from '@/lib/db';
import {
  LEGACY_SCHOOL_ID,
  hashPassword,
  isPlaintextPassword,
  readConfig,
  safeEqual,
  updateConfig,
  updateRecord,
  verifyPassword,
} from '@/lib/dbHandler';
import type { AppUser } from '@/lib/types';
import { encodeSession, sessionCookieOptions, SESSION_COOKIE, type Session } from '@/lib/session';
import { getSession } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { jsonError, readBody, toText } from '@/lib/http';

// Failed attempts per IP + username, kept in this server process: enough to stop password guessing.
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; first: number }>();

function isLockedOut(key: string): boolean {
  const entry = failures.get(key);
  if (!entry) return false;
  if (Date.now() - entry.first > FAILURE_WINDOW_MS) {
    failures.delete(key);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

function recordFailure(key: string) {
  const entry = failures.get(key);
  if (!entry || Date.now() - entry.first > FAILURE_WINDOW_MS) failures.set(key, { count: 1, first: Date.now() });
  else entry.count++;
}

type LoginResult = Session | { error: string; status: number } | null;

async function loginSuperAdmin(password: string): Promise<Session | null> {
  const master = await readConfig('master');
  let ok: boolean;

  if (master.superAdminPassword) {
    ok = verifyPassword(password, master.superAdminPassword);
    if (ok && isPlaintextPassword(master.superAdminPassword)) {
      await updateConfig('master', { superAdminPassword: hashPassword(password) });
    }
  } else {
    // Until a password has been saved, SUPERADMIN_PASSWORD from the environment is the only way in.
    const initial = process.env.SUPERADMIN_PASSWORD;
    ok = !!initial && safeEqual(password, initial);
    if (ok) await updateConfig('master', { superAdminPassword: hashPassword(password) });
  }

  return ok ? { username: 'superadmin', role: 'superadmin', displayName: 'Master SaaS Controller', schoolId: 'master' } : null;
}

async function authenticate(username: string, password: string): Promise<LoginResult> {
  if (username === 'superadmin') return loginSuperAdmin(password);

  const db = await getDb();

  // School principals live in their school's settings rather than in the users table. (Schools
  // set up in the single-school days are found by id: school_<username>.)
  const [school] = await db`
    select school_id, admin_password, school_name from school_settings
    where admin_username = ${username} or school_id = ${`school_${username}`}
    order by admin_username = ${username} desc nulls last
    limit 1`;
  if (school) {
    const stored = school.adminPassword;
    if (!verifyPassword(password, stored)) return null;
    if (isPlaintextPassword(stored)) await updateConfig(school.schoolId, { adminPassword: hashPassword(password) });
    return { username, role: 'admin', displayName: school.schoolName || 'School Principal', schoolId: school.schoolId };
  }

  // The principal of the original single-school install.
  if (username === 'admin') {
    const { adminPassword } = await readConfig(LEGACY_SCHOOL_ID);
    if (!adminPassword || !verifyPassword(password, adminPassword)) return null;
    if (isPlaintextPassword(adminPassword)) await updateConfig(LEGACY_SCHOOL_ID, { adminPassword: hashPassword(password) });
    return { username: 'admin', role: 'admin', displayName: 'Brook Field Principal', schoolId: LEGACY_SCHOOL_ID };
  }

  // Usernames are unique across schools (the database enforces it), so this finds at most one.
  const [user] = (await db`select * from users where lower(username) = ${username}`) as unknown as AppUser[];
  if (!user || !verifyPassword(password, user.password)) return null;
  if (user.status === 'blocked') return { error: 'Your account has been deactivated by the administrator', status: 403 };
  const schoolId = user.schoolId ?? LEGACY_SCHOOL_ID;
  if (isPlaintextPassword(user.password)) await updateRecord('users', schoolId, user.id, { password: hashPassword(password) });

  return {
    username: user.username,
    // Never trust a stored role beyond what a school can grant.
    role: user.role === 'admin' ? 'admin' : 'accountant',
    displayName: user.displayName || user.username,
    schoolId,
  };
}

export async function POST(request: Request) {
  const body = await readBody(request);
  const username = toText(body?.username)?.toLowerCase();
  const password = toText(body?.password);
  if (!username || !password) return jsonError('Username and password are required', 400);

  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  const attemptKey = `${ip}:${username}`;
  if (isLockedOut(attemptKey)) return jsonError('Too many failed attempts. Please wait 15 minutes and try again.', 429);

  try {
    const result = await authenticate(username, password);
    if (!result) {
      recordFailure(attemptKey);
      return jsonError('Incorrect username or password', 401);
    }
    if ('error' in result) return jsonError(result.error, result.status);

    failures.delete(attemptKey);
    (await cookies()).set(SESSION_COOKIE, encodeSession(result), sessionCookieOptions);
    if (result.role !== 'superadmin') {
      const local = ['local', '::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(ip);
      await audit(result, 'login', local ? 'Signed in on the server computer' : `Signed in from ${ip}`);
    }
    return NextResponse.json({ success: true, user: result });
  } catch (err) {
    console.error('Login failed:', err);
    return jsonError('Login failed. Please try again.', 500);
  }
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({ authenticated: true, user: session });
}
