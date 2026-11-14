import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';
import { LEGACY_SCHOOL_ID, readConfig, toDbRow, type CollectionName } from '@/lib/dbHandler';
import { staffSessionRevision } from '@/lib/staffSessions';
import { encodeSession, SESSION_COOKIE, type Role, type Session } from '@/lib/session';

export const SCHOOL = LEGACY_SCHOOL_ID;
export const OTHER_SCHOOL = 'school_other';

const jar = new Map<string, string>();

/** Stands in for the cookie store that next/headers hands route handlers. */
export const cookieStore = {
  get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) as string } : undefined),
  has: (name: string) => jar.has(name),
  set: (name: string, value: string) => void jar.set(name, value),
  delete: (name: string) => void jar.delete(name),
};

export async function signInAs(role: Role, schoolId = SCHOOL, username = role === 'accountant' ? 'cashier1' : 'admin'): Promise<Session> {
  await readConfig(schoolId);
  const session: Session = { username, role, displayName: `Test ${role}`, schoolId, revision: await staffSessionRevision(username) };
  jar.set(SESSION_COOKIE, encodeSession(session));
  return session;
}

/** A well-formed session signed by some other installation's secret. */
export function encodeForeignSession(session: Session): string {
  const ours = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = 'another-installation-secret';
  try {
    return encodeSession(session);
  } finally {
    process.env.SESSION_SECRET = ours;
  }
}

export function setSessionCookie(value: string) {
  jar.set(SESSION_COOKIE, value);
}

export function signOut() {
  jar.clear();
}

type Handler = (request: Request) => Promise<Response>;

/** Calls a route handler the way Next.js would and returns the status and parsed JSON. */
export async function call(handler: Handler, method: string, path: string, body?: unknown) {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (method === 'PUT' && path === '/api/fees' && body && typeof body === 'object') {
    body = { requestId: randomUUID(), ...body };
  }
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await handler(new Request(`http://localhost${path}`, init));
  const data: any = await res.json().catch(() => null);
  return { status: res.status, data };
}

/** Empties every table. */
export async function resetDatabase() {
  const db = await getDb();
  const tables = await db`select tablename from pg_tables where schemaname = current_schema()`;
  await db`truncate table ${db(tables.map((t) => t.tablename as string))} restart identity`;
}

/** Puts a record straight into a table, bypassing the API (another school's, say). */
export async function insertRaw(table: CollectionName, record: Record<string, unknown>) {
  const db = await getDb();
  const row = { ...toDbRow(db, table, record, 'insert'), schoolId: record.schoolId ?? SCHOOL, id: record.id };
  await db`insert into ${db(table)} ${db(row as Record<string, unknown> as Record<string, string>, Object.keys(row))}`;
}

/** Rows in a table across all schools, optionally only those with these column values. */
export async function countRows(table: CollectionName, where: Record<string, string> = {}): Promise<number> {
  const db = await getDb();
  const conditions = Object.entries(where).map(([field, value]) => db`and ${db(field)} = ${value}`);
  const [{ count }] = await db`select count(*) from ${db(table)} where true ${conditions.reduce((a, c) => db`${a} ${c}`, db``)}`;
  return count as number;
}

/** Today's bounds in this machine's timezone, as the Cash Book page sends them. */
export function todayRange(): string {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
}
