import { getDb } from './db';
import { whatsappNumber } from './whatsapp';
import type { Session } from './session';

// Fee reminders staff opened in WhatsApp, one at a time or one family after another from the
// Defaulter List. WhatsApp tells the app nothing back, so a row means the message was opened ready
// to send, by whom and when.

export interface ReminderInput {
  phone: string;
  studentIds: number[];
  amount: number;
}

export interface LastReminder {
  at: string;
  by: string;
}

/** More than any school's defaulter list; stops a runaway request. */
const MAX_PER_REQUEST = 500;

/** The reminders in a request body, checked; or what is wrong with them. */
export function parseReminders(value: unknown): ReminderInput[] | string {
  if (!Array.isArray(value) || value.length === 0) return 'No reminders given';
  if (value.length > MAX_PER_REQUEST) return `At most ${MAX_PER_REQUEST} reminders at a time`;
  const list: ReminderInput[] = [];
  for (const raw of value as Record<string, unknown>[]) {
    const phone = whatsappNumber(typeof raw?.phone === 'string' ? raw.phone : undefined);
    if (!phone) return `"${String(raw?.phone ?? '')}" is not a phone number`;
    const ids = Array.isArray(raw.studentIds) ? raw.studentIds.map(Number) : [];
    if (ids.length === 0 || ids.some((id) => !Number.isInteger(id) || id <= 0)) return 'Each reminder needs the students it was about';
    const amount = Number(raw.amount ?? 0);
    if (!Number.isFinite(amount) || amount < 0) return 'The amount must be a positive number';
    list.push({ phone, studentIds: [...new Set(ids)], amount: Math.round(amount * 100) / 100 });
  }
  return list;
}

/** Saves the reminders, keeping only this school's students. Returns how many were saved. */
export async function recordReminders(session: Session, list: ReminderInput[]): Promise<number> {
  const db = await getDb();
  const ids = [...new Set(list.flatMap((r) => r.studentIds))];
  const known = new Set(
    (await db`select id from students where school_id = ${session.schoolId} and id in ${db(ids)}`).map((r) => Number(r.id))
  );
  const rows = list
    .map((r) => ({ ...r, studentIds: r.studentIds.filter((id) => known.has(id)) }))
    .filter((r) => r.studentIds.length > 0)
    .map((r) => ({
      schoolId: session.schoolId,
      sentBy: session.username,
      sentByName: session.displayName,
      phone: r.phone,
      studentIds: db.json(r.studentIds),
      amount: r.amount,
    }));
  if (rows.length === 0) return 0;
  await db`insert into reminders ${db(rows as unknown as Record<string, string>[], 'schoolId', 'sentBy', 'sentByName', 'phone', 'studentIds', 'amount')}`;
  return rows.length;
}

/** Each student's latest reminder in the last 90 days. */
export async function lastReminders(schoolId: string): Promise<Map<string, LastReminder>> {
  const db = await getDb();
  const rows = await db`
    select distinct on (sid) sid, sent_at, coalesce(sent_by_name, sent_by) as by
    from reminders, jsonb_array_elements_text(student_ids) as sid
    where school_id = ${schoolId} and sent_at > now() - interval '90 days'
    order by sid, sent_at desc`;
  return new Map(rows.map((r) => [String(r.sid), { at: String(r.sentAt), by: String(r.by) }]));
}
