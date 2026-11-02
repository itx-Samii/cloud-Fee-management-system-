import postgres from 'postgres';
import { SCHEMA_SQL } from './schema';

// The Postgres (Supabase) connection: one pool per server process, kept on globalThis so dev
// hot-reloads don't open new pools. Column names are snake_case in the database and camelCase in
// the app; NULL columns are left out of rows, as optional fields.

/** A query runner: the pool itself or an open transaction. */
export type Db = postgres.ISql;

const SPECIAL_COLUMNS: Record<string, string> = { paid_ac: 'paidAC', is_ac_only: 'isACOnly' };
const SPECIAL_FIELDS = Object.fromEntries(Object.entries(SPECIAL_COLUMNS).map(([column, field]) => [field, column]));

export const toField = (column: string) => SPECIAL_COLUMNS[column] ?? column.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
export const toColumn = (field: string) => SPECIAL_FIELDS[field] ?? field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

function withoutNulls(row: postgres.Row) {
  for (const key of Object.keys(row)) if (row[key] === null) delete row[key];
  return row;
}

/** Timestamps come back as ISO strings ("2026-11-01T09:30:00.000Z"), whatever the server's timezone. */
export function parseTimestamp(text: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?(?:([+-]\d{2})(?::?(\d{2}))?)?$/.exec(text);
  const iso = m ? `${m[1]}T${m[2]}${(m[3] ?? '.000').slice(0, 4).padEnd(4, '0')}${m[4] ? `${m[4]}:${m[5] ?? '00'}` : 'Z'}` : text;
  const date = new Date(iso);
  return isNaN(date.getTime()) ? text : date.toISOString();
}

const types = {
  // Rupee amounts are numeric(12,2): well within a JS number.
  numeric: { to: 1700, from: [1700], serialize: (x: unknown) => String(x), parse: (x: string) => parseFloat(x) },
  // count(*) and the audit log's id.
  int8: { to: 20, from: [20], serialize: (x: unknown) => String(x), parse: (x: string) => Number(x) },
  timestamptz: {
    to: 1184,
    from: [1114, 1184],
    serialize: (x: unknown) => (x instanceof Date ? x : new Date(String(x))).toISOString(),
    parse: parseTimestamp,
  },
  calendarDate: { to: 1082, from: [1082], serialize: (x: unknown) => String(x), parse: (x: string) => x },
};

/**
 * Supabase gives two pooled connection strings. The transaction pooler (port 6543) can't keep
 * prepared statements, and its Prisma-style "?pgbouncer=true" isn't a Postgres setting.
 */
export function connectionOptions(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('DATABASE_URL is not a valid connection string. If the password has symbols such as @ # / ?, URL-encode them.');
  }
  const pooled = parsed.port === '6543' || parsed.searchParams.get('pgbouncer') === 'true';
  parsed.searchParams.delete('pgbouncer');
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname);
  return {
    url: parsed.toString(),
    options: {
      // Supabase needs SSL; a local server usually has none. "?sslmode=" in the URL decides instead.
      ...(!parsed.searchParams.has('sslmode') && { ssl: local ? false : ('require' as const) }),
      prepare: !pooled,
      max: 10,
      idle_timeout: 20,
      connect_timeout: 15,
      onnotice: () => {},
      types,
      transform: { column: { from: toField, to: toColumn }, row: { from: withoutNulls } },
      connection: { application_name: 'school-pay-erp' },
    },
  };
}

const globalForDb = globalThis as typeof globalThis & {
  _sql?: postgres.Sql;
  _schemaPromise?: Promise<void>;
};

/** The connection pool. Created on first use (not at import), so `next build` needs no database. */
export function getSql(): postgres.Sql {
  if (!globalForDb._sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set. Add your Supabase connection string to .env.local (see .env.example).');
    const { url: cleanUrl, options } = connectionOptions(url);
    globalForDb._sql = postgres(cleanUrl, options) as unknown as postgres.Sql;
  }
  return globalForDb._sql;
}

// Any fixed number: two servers starting at once take turns creating the tables.
const SCHEMA_LOCK = 72_640_001;

/** Creates any missing tables, once per process. A failure is retried on the next request. */
export function schemaReady(): Promise<void> {
  globalForDb._schemaPromise ??= getSql()
    .begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(${SCHEMA_LOCK})`;
      await tx.unsafe(SCHEMA_SQL).simple();
    })
    .then(() => undefined)
    .catch((err) => {
      globalForDb._schemaPromise = undefined;
      throw err;
    });
  return globalForDb._schemaPromise;
}

/** The pool, once the tables exist. Every query in the app starts here. */
export async function getDb(): Promise<postgres.Sql> {
  await schemaReady();
  return getSql();
}

/** Runs `work` in one transaction: everything in it is saved together or not at all. */
export async function transaction<T>(work: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  const sql = await getDb();
  return (await sql.begin((tx) => work(tx))) as T;
}

/** Closes the pool (tests and scripts, so the process can exit). */
export async function closeDb(): Promise<void> {
  const sql = globalForDb._sql;
  globalForDb._sql = undefined;
  globalForDb._schemaPromise = undefined;
  await sql?.end({ timeout: 5 });
}

/** True for Postgres' "duplicate key" error. */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof postgres.PostgresError && err.code === '23505';
}
