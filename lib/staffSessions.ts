import { getDb } from './db';

/** Changed by database triggers whenever credentials, roles or account status change. */
export async function staffSessionRevision(username: string): Promise<string> {
  const db = await getDb();
  const [row] = await db`select revision from staff_session_revisions where username = ${username.toLowerCase()}`;
  return String(row?.revision ?? '0');
}
