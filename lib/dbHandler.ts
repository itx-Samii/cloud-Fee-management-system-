import crypto from 'crypto';
import type postgres from 'postgres';
import { getDb, transaction, type Db } from './db';
import { cleanCharges } from './fees';
import { toNumber } from './http';
import type { RecordId, SchoolConfig } from './types';

export { MIN_PASSWORD_LENGTH, USERNAME_PATTERN, USERNAME_RULES } from './credentials';

export const LEGACY_SCHOOL_ID = 'school_brookfield';

export type CollectionName = 'students' | 'fees' | 'payments' | 'classes' | 'expenses' | 'staff' | 'salaries_history' | 'users';

export const BACKUP_COLLECTIONS: CollectionName[] = ['students', 'fees', 'payments', 'expenses', 'staff', 'salaries_history', 'classes', 'users'];

type Doc = Record<string, unknown>;

// --- Columns ---
// What each table holds, in the app's field names. Anything else in a record (from an old backup,
// say) is dropped, and values are coerced to the column's type before they reach the database.

type Kind = 'text' | 'int' | 'amount' | 'time' | 'bool' | 'json';
interface Field {
  kind: Kind;
  /** For NOT NULL columns: used when the record has no usable value. */
  fallback?: () => unknown;
}

const text = (fallback?: string): Field => ({ kind: 'text', ...(fallback !== undefined && { fallback: () => fallback }) });
const int: Field = { kind: 'int' };
const amount = (fallback?: number): Field => ({ kind: 'amount', ...(fallback !== undefined && { fallback: () => fallback }) });
const time = (defaultNow = false): Field => ({ kind: 'time', ...(defaultNow && { fallback: () => new Date().toISOString() }) });
const flag: Field = { kind: 'bool', fallback: () => false };
const json: Field = { kind: 'json' };

const VOUCHER_STATUSES = ['Paid', 'Unpaid', 'Partially Paid'];

export const TABLES: Record<CollectionName, Record<string, Field>> = {
  students: {
    name: text(''),
    fatherName: text(),
    parentPhone: text(),
    admissionNumber: text(),
    rollNumber: int,
    classId: int,
    monthlyFee: amount(0),
    discount: amount(0),
    monthlyCharges: json,
    annualCharges: amount(0),
    paidAnnualCharges: amount(0),
    status: text('Active'),
    leftAt: time(),
    createdAt: time(true),
    updatedAt: time(),
  },
  classes: {
    name: text(''),
    section: text(''),
    monthlyFee: amount(0),
    annualCharges: amount(0),
    createdAt: time(true),
  },
  fees: {
    studentId: int,
    studentName: text(),
    fatherName: text(),
    admissionNumber: text(),
    classId: int,
    className: text(),
    month: text(''),
    year: text(''),
    amount: amount(0),
    baseAmount: amount(),
    discount: amount(),
    charges: json,
    status: text('Unpaid'),
    issueDate: time(),
    dueDate: time(),
    paymentDate: time(),
    paidTuition: amount(),
    paidAC: amount(),
    totalReceived: amount(),
    fineCharged: amount(),
    fineWaived: flag,
    isACOnly: flag,
  },
  payments: {
    requestId: text(),
    requestFingerprint: text(),
    voucherId: { kind: 'int', fallback: () => 0 },
    studentId: int,
    studentName: text(),
    className: text(),
    month: text(),
    year: text(),
    paidTuition: amount(0),
    paidAC: amount(0),
    amount: amount(0),
    receivedAt: time(true),
    receivedBy: text(''),
    receivedByName: text(),
    allocations: json,
    reversedAt: time(),
    reversedBy: text(),
  },
  expenses: {
    category: text('Other'),
    amount: amount(0),
    description: text(''),
    date: time(true),
  },
  staff: {
    name: text(''),
    designation: text(''),
    salary: amount(0),
    deductionPerOff: amount(0),
    joinedDate: time(),
    status: text('Active'),
  },
  salaries_history: {
    staffId: int,
    staffName: text(''),
    month: text(),
    year: text(),
    amount: amount(0),
    offs: amount(0),
    deduction: amount(0),
    paymentDate: time(true),
  },
  users: {
    username: text(''),
    password: text(''),
    displayName: text(''),
    role: text('accountant'),
    status: text('active'),
    createdAt: time(true),
  },
};

const MAX_INT = 2_147_483_647;

/** A record id as stored: a positive whole number, or null if `value` can't be one. */
export function toId(value: unknown): number | null {
  const str = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^\d+$/.test(str)) return null;
  const n = Number(str);
  return n > 0 && n <= MAX_INT ? n : null;
}

function coerce(kind: Kind, value: unknown): unknown {
  if (value === undefined || value === null) return null;
  switch (kind) {
    case 'text':
      return typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : null;
    case 'int':
      return toId(value);
    case 'amount': {
      const n = typeof value === 'string' ? toNumber(value.replace(/,/g, ''), NaN) : toNumber(value, NaN);
      return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
    }
    case 'time': {
      if (value === '') return null;
      const date = value instanceof Date ? value : new Date(typeof value === 'number' ? value : String(value));
      return isNaN(date.getTime()) ? null : date.toISOString();
    }
    case 'bool':
      return value === true || value === 'true' ? true : value === false || value === 'false' ? false : null;
    case 'json':
      return typeof value === 'object' ? value : null;
  }
}

/** Fixes values the table's checks would refuse, for records from old backups or imports. */
function tidy(table: CollectionName, row: Doc): Doc {
  if (table === 'fees' && 'status' in row && !VOUCHER_STATUSES.includes(String(row.status))) {
    row.status = toNumber(row.paidTuition) + toNumber(row.paidAC) > 0 ? 'Partially Paid' : 'Unpaid';
  }
  if (table === 'users') {
    if ('role' in row && row.role !== 'admin') row.role = 'accountant';
    if ('status' in row && row.status !== 'blocked') row.status = 'active';
    if (typeof row.username === 'string') row.username = row.username.toLowerCase();
  }
  return row;
}

/**
 * The record as a row for `table`: every column (for inserts) or just the fields given (for
 * updates), each coerced to its type, with the column's fallback where a NOT NULL value is missing.
 */
export function toRow(table: CollectionName, record: Doc, mode: 'insert' | 'update'): Doc {
  if (table === 'payments' && Array.isArray(record.allocations)) {
    // Voucher ids are matched as numbers when a voucher's receipts are looked up.
    const allocations = record.allocations.map((a: Doc) =>
      a && typeof a === 'object' ? { ...a, voucherId: toId(a.voucherId) ?? a.voucherId, amount: toNumber(a.amount) } : a
    );
    record = { ...record, allocations };
  }
  for (const field of ['charges', 'monthlyCharges']) {
    if (field in record && record[field] != null) record = { ...record, [field]: cleanCharges(record[field]) };
  }
  // Some older salary records carry `date` instead of paymentDate.
  if (table === 'salaries_history' && record.paymentDate == null && record.date != null) record = { ...record, paymentDate: record.date };
  const row: Doc = {};
  for (const [field, spec] of Object.entries(TABLES[table])) {
    if (mode === 'update' && !(field in record)) continue;
    const value = coerce(spec.kind, record[field]);
    row[field] = value ?? spec.fallback?.() ?? null;
  }
  return tidy(table, row);
}

/** toRow, ready to hand to a query: JSON columns are marked as such (else arrays go in as Postgres arrays). */
export function toDbRow(db: Db, table: CollectionName, record: Doc, mode: 'insert' | 'update'): Record<string, string> {
  const row = toRow(table, record, mode);
  for (const [field, spec] of Object.entries(TABLES[table])) {
    if (spec.kind === 'json' && row[field] != null) row[field] = db.json(row[field] as postgres.JSONValue);
  }
  return row as Record<string, string>;
}

// --- Queries ---

/** `and field = value` for each entry; an array value matches any of its items. */
function conditions(db: Db, table: CollectionName, where: Doc) {
  return Object.entries(where).map(([field, value]) => {
    const kind = field === 'id' ? 'int' : (TABLES[table][field]?.kind ?? 'text');
    const values = (Array.isArray(value) ? value : [value]).map((v) => coerce(kind, v)).filter((v) => v !== null);
    if (values.length === 0) return db`and false`;
    return Array.isArray(value) ? db`and ${db(field)} in ${db(values as string[])}` : db`and ${db(field)} = ${values[0] as string}`;
  });
}

const all = (fragments: ReturnType<typeof conditions>, db: Db) => fragments.reduce((acc, f) => db`${acc} ${f}`, db``);

export async function findAll<T>(collection: CollectionName, schoolId: string, where: Doc = {}, db?: Db): Promise<T[]> {
  const q = db ?? await getDb();
  const rows = await q`
    select * from ${q(collection)}
    where school_id = ${schoolId} ${all(conditions(q, collection, where), q)}
    order by id`;
  return rows as unknown as T[];
}

export async function findById<T>(collection: CollectionName, schoolId: string, id: RecordId, db?: Db): Promise<T | null> {
  const key = toId(id);
  if (key === null) return null;
  const q = db ?? (await getDb());
  const [row] = await q`select * from ${q(collection)} where school_id = ${schoolId} and id = ${key}`;
  return (row as T) ?? null;
}

/** Students counted against the license: everyone who hasn't left. */
export async function countCurrentStudents(schoolId: string, db?: Db): Promise<number> {
  const q = db ?? await getDb();
  const [{ count }] = await q`select count(*) from students where school_id = ${schoolId} and lower(status) <> 'left'`;
  return count as number;
}

/**
 * Hands out `count` consecutive new ids for the school, atomically, so two people saving at once
 * never collide. Never below the highest id already stored (after a restore, say).
 */
export async function reserveIds(db: Db, collection: CollectionName, schoolId: string, count: number): Promise<number> {
  const top = db`(select coalesce(max(id), 0) from ${db(collection)} where school_id = ${schoolId})`;
  const [{ seq }] = await db`
    insert into counters (school_id, name, seq) values (${schoolId}, ${collection}, ${top} + ${count})
    on conflict (school_id, name) do update set seq = greatest(counters.seq, ${top}) + ${count}
    returning seq`;
  return (seq as number) - count + 1;
}

/** Take this before locking student rows or reserving student IDs. The numbering trigger shares it. */
export async function lockStudentNumbering(db: Db, schoolId: string): Promise<void> {
  await db`select pg_advisory_xact_lock(hashtext(${`${schoolId}:student-numbering`}))`;
}

/** Reserve numbers supplied by imported records before the trigger fills blanks in the same batch. */
async function seedStudentNumbers(db: Db, schoolId: string, docs: Doc[]): Promise<void> {
  const highest = new Map<string, number>();
  for (const doc of docs) {
    const admission = /^ADM-([0-9]{1,9})$/i.exec(String(doc.admissionNumber ?? '').trim());
    if (admission) highest.set('student-admission', Math.max(highest.get('student-admission') ?? 0, Number(admission[1])));
    const classId = toId(doc.classId);
    const roll = toId(doc.rollNumber);
    if (classId && roll) {
      const series = `student-roll:${classId}`;
      highest.set(series, Math.max(highest.get(series) ?? 0, roll));
    }
  }
  const counters = Array.from(highest, ([name, seq]) => ({ schoolId, name, seq }));
  if (counters.length === 0) return;
  await db`insert into counters ${db(counters, 'schoolId', 'name', 'seq')}
    on conflict (school_id, name) do update set seq = greatest(counters.seq, excluded.seq)`;
}

// Postgres takes at most 65,535 values per statement.
const ROWS_PER_INSERT = 1000;

/** Inserts records that already carry their schoolId and id. */
async function insertRows(db: Db, collection: CollectionName, records: Doc[], skipDuplicates: boolean): Promise<Doc[]> {
  const columns = ['schoolId', 'id', ...Object.keys(TABLES[collection])];
  const rows = records.map((record) => ({ ...toDbRow(db, collection, record, 'insert'), schoolId: record.schoolId, id: record.id }));
  const inserted: Doc[] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
    const batch = rows.slice(i, i + ROWS_PER_INSERT);
    const result = await db`
      insert into ${db(collection)} ${db(batch as Record<string, string>[], columns)}
      ${skipDuplicates ? db`on conflict do nothing` : db``}
      returning *`;
    inserted.push(...(result as unknown as Doc[]));
  }
  return inserted;
}

/** Adds records with new ids; returns them as stored. */
export async function insertRecords<T extends Doc>(collection: CollectionName, schoolId: string, docs: T[], db?: Db): Promise<(T & { id: number })[]> {
  if (docs.length === 0) return [];
  if (collection === 'students' && !db) return transaction((tx) => insertRecords(collection, schoolId, docs, tx));
  const q = db ?? (await getDb());
  if (collection === 'students') {
    await lockStudentNumbering(q, schoolId);
    await seedStudentNumbers(q, schoolId, docs);
  }
  const firstId = await reserveIds(q, collection, schoolId, docs.length);
  const records = docs.map((doc, i) => ({ ...doc, schoolId, id: firstId + i }));
  return (await insertRows(q, collection, records, false)) as (T & { id: number })[];
}

/**
 * Like insertRecords, but rows a unique index refuses (already there) are skipped instead of
 * failing the batch. Returns how many went in.
 */
export async function insertNewRecords<T extends Doc>(collection: CollectionName, schoolId: string, docs: T[]): Promise<number> {
  if (docs.length === 0) return 0;
  const db = await getDb();
  const firstId = await reserveIds(db, collection, schoolId, docs.length);
  const records = docs.map((doc, i) => ({ ...doc, schoolId, id: firstId + i }));
  return (await insertRows(db, collection, records, true)).length;
}

export async function insertRecord<T extends Doc>(collection: CollectionName, schoolId: string, doc: T, db?: Db): Promise<T & { id: number }> {
  const [record] = await insertRecords(collection, schoolId, [doc], db);
  return record;
}

/** Adds one record unless a unique index already holds one like it. Returns it as stored, or null. */
export async function insertIfNew<T extends Doc>(collection: CollectionName, schoolId: string, doc: T, db: Db): Promise<(T & { id: number }) | null> {
  const id = await reserveIds(db, collection, schoolId, 1);
  const [record] = await insertRows(db, collection, [{ ...doc, schoolId, id }], true);
  return (record as T & { id: number }) ?? null;
}

export async function updateRecord<T>(collection: CollectionName, schoolId: string, id: RecordId, fields: Doc, db?: Db): Promise<T | null> {
  const key = toId(id);
  if (key === null) return null;
  const q = db ?? (await getDb());
  const changes = toDbRow(q, collection, fields, 'update');
  if (Object.keys(changes).length === 0) return findById<T>(collection, schoolId, key, q);
  const [row] = await q`
    update ${q(collection)} set ${q(changes)}
    where school_id = ${schoolId} and id = ${key}
    returning *`;
  return (row as T) ?? null;
}

export async function deleteRecord(collection: CollectionName, schoolId: string, id: RecordId): Promise<boolean> {
  const key = toId(id);
  if (key === null) return false;
  const db = await getDb();
  const result = await db`delete from ${db(collection)} where school_id = ${schoolId} and id = ${key}`;
  return result.count > 0;
}

/** Vouchers no money has been taken against. Only these may disappear without leaving a trace. */
export const nothingReceived = (db: Db) => db`status not in ('Paid', 'Partially Paid') and coalesce(total_received, 0) <= 0`;

/** Problems that would stop a backup section from going in, checked before anything is written. */
export function checkRestoreSection(collection: CollectionName, docs: Doc[]): string | null {
  const seen = new Set<number>();
  for (const doc of docs) {
    if (doc.id === undefined || doc.id === null) continue; // given a new id
    const id = toId(doc.id);
    if (id === null) return `Section "${collection}" has a record with an invalid id (${JSON.stringify(doc.id)})`;
    if (seen.has(id)) return `Section "${collection}" has two records with id ${id}`;
    seen.add(id);
  }
  return null;
}

/**
 * Swaps a school's records in each section for the given ones, keeping their ids (records without
 * one get new ids). Run it inside a transaction; check the sections with checkRestoreSection first.
 */
export async function replaceSections(tx: Db, schoolId: string, sections: [CollectionName, Doc[]][]): Promise<void> {
  if (sections.some(([collection]) => collection === 'students')) await lockStudentNumbering(tx, schoolId);
  for (const [collection, docs] of sections) {
    await tx`delete from ${tx(collection)} where school_id = ${schoolId}`;
    let nextId = docs.reduce((max, doc) => Math.max(max, toId(doc.id) ?? 0), 0) + 1;
    const records = docs.map((doc) => ({ ...doc, schoolId, id: toId(doc.id) ?? nextId++ }));
    if (collection === 'students') await seedStudentNumbers(tx, schoolId, records);
    await insertRows(tx, collection, records, false);
  }
}

/**
 * Restores a backup: all sections in one transaction, so if anything fails, the school's data is
 * left exactly as it was.
 */
export async function replaceAll(schoolId: string, sections: [CollectionName, Doc[]][]): Promise<void> {
  const db = await getDb();
  await db.begin((tx) => replaceSections(tx, schoolId, sections));
}

// --- Passwords ---

const SALT_LENGTH = 16;
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${hash}`;
}

/** Older installs stored some passwords as plain text. They still work, and login re-saves them hashed. */
export function isPlaintextPassword(stored: string): boolean {
  return !stored.includes(':');
}

export function safeEqual(a: string, b: string): boolean {
  const digest = (s: string) => crypto.createHash('sha256').update(s).digest();
  return crypto.timingSafeEqual(digest(a), digest(b));
}

export function verifyPassword(password: string, stored: unknown): boolean {
  if (!stored || typeof stored !== 'string') return false;
  if (isPlaintextPassword(stored)) return safeEqual(password, stored);
  try {
    const [salt, storedHash] = stored.split(':');
    const hash = crypto.scryptSync(password, salt, KEY_LENGTH);
    const expected = Buffer.from(storedHash, 'hex');
    return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
  } catch {
    return false;
  }
}

// --- Usernames ---

const RESERVED_USERNAMES = ['admin', 'superadmin'];

/**
 * Login doesn't ask which school you belong to, so a username may exist only once across all
 * schools: among principals (school settings), staff users, and the reserved names.
 */
export async function isUsernameTaken(username: string, except?: { schoolId: string; id: RecordId }, runner?: Db): Promise<boolean> {
  const name = username.toLowerCase();
  if (RESERVED_USERNAMES.includes(name)) return true;

  const db = runner ?? await getDb();
  const exceptId = except ? toId(except.id) : null;
  const [taken] = await db`
    select 1 from school_settings where admin_username = ${name} or school_id = ${`school_${name}`}
    union all
    select 1 from users
    where lower(username) = ${name}
      ${except ? db`and not (school_id = ${except.schoolId} and id = ${exceptId ?? 0})` : db``}
    limit 1`;
  return Boolean(taken);
}

/** For restore: which of these usernames already belong to another school (or are reserved). */
export async function usernamesTakenElsewhere(usernames: string[], schoolId: string): Promise<string[]> {
  const names = [...new Set(usernames.map((u) => u.toLowerCase()))];
  if (names.length === 0) return [];
  const db = await getDb();
  const rows = await db`
    select admin_username as name from school_settings where admin_username in ${db(names)}
    union
    select lower(username) as name from users where lower(username) in ${db(names)} and school_id <> ${schoolId}`;
  const taken = new Set(names.filter((n) => RESERVED_USERNAMES.includes(n)));
  rows.forEach((r) => taken.add(String(r.name)));
  return [...taken];
}

// --- School settings ---

const CONFIG_FIELDS: (keyof SchoolConfig)[] = ['adminUsername', 'adminPassword', 'schoolName', 'superAdminPassword', 'dueDays', 'lateFine'];

export async function readConfig(schoolId: string): Promise<SchoolConfig> {
  const db = await getDb();
  const [row] = await db`
    select admin_username, admin_password, school_name, super_admin_password, due_days, late_fine
    from school_settings where school_id = ${schoolId}`;
  if (row) return row as SchoolConfig;
  if (schoolId !== LEGACY_SCHOOL_ID) return {};

  // Fresh install: Brook Field's principal signs in as admin / brookfield and should change it at once.
  await db`
    insert into school_settings (school_id, admin_password) values (${schoolId}, ${hashPassword('brookfield')})
    on conflict (school_id) do nothing`;
  return readConfig(schoolId);
}

export async function updateConfig(schoolId: string, fields: SchoolConfig): Promise<void> {
  const changes: Doc = {};
  for (const field of CONFIG_FIELDS) {
    if (fields[field] !== undefined) changes[field] = fields[field];
  }
  const db = await getDb();
  const columns = Object.keys(changes);
  if (columns.length === 0) {
    await db`insert into school_settings (school_id) values (${schoolId}) on conflict (school_id) do nothing`;
    return;
  }
  await db`
    insert into school_settings ${db({ schoolId, ...changes } as Record<string, string>, 'schoolId', ...columns)}
    on conflict (school_id) do update set
      ${db(changes as Record<string, string>, ...columns)},
      updated_at = now()`;
}
