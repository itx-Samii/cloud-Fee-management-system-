import { getDb, type Db } from './db';
import { toNumber } from './http';
import type { Session } from './session';

// Append-only record of who changed what (the audit_log table), shown to principals on the
// Activity Log page. Nothing in the app edits or deletes it, and backups/restores leave it alone.

export type AuditAction =
  | 'login'
  | 'password.change'
  | 'vouchers.generate'
  | 'payment.receive'
  | 'payment.reverse'
  | 'voucher.delete'
  | 'voucher.charges'
  | 'student.add'
  | 'student.edit'
  | 'student.delete'
  | 'student.import'
  | 'student.promote'
  | 'student.unpromote'
  | 'class.add'
  | 'class.edit'
  | 'class.delete'
  | 'expense.add'
  | 'expense.delete'
  | 'staff.add'
  | 'staff.edit'
  | 'staff.delete'
  | 'salary.pay'
  | 'salary.reverse'
  | 'user.add'
  | 'user.edit'
  | 'user.delete'
  | 'parent.add'
  | 'parent.reset'
  | 'parent.reveal'
  | 'parent.remove'
  | 'backup.download'
  | 'backup.restore'
  | 'settings.edit';

/** "Rs. 12,500" */
export function rupees(amount: unknown): string {
  return `Rs. ${toNumber(amount).toLocaleString('en-US')}`;
}

/** "Exam Fee Rs. 500, Transport Rs. 2,000", or "none". */
export function describeCharges(charges: { label: string; amount: number }[] | null | undefined): string {
  return (charges ?? []).map((c) => `${c.label} ${rupees(c.amount)}`).join(', ') || 'none';
}

/** "monthly fee 3000 → 2500, discount 0 → 500" for the fields that actually changed. */
export function describeChanges(before: object, after: object, labels: Record<string, string>): string {
  const was = before as Record<string, unknown>;
  const now = after as Record<string, unknown>;
  return Object.entries(labels)
    .filter(([field]) => field in now && String(now[field] ?? '') !== String(was[field] ?? ''))
    .map(([field, label]) => `${label} ${String(was[field] ?? '-') || '-'} → ${String(now[field] ?? '-') || '-'}`)
    .join(', ');
}

/**
 * With a transaction, failure aborts the action too. Older callers without a transaction
 * have already saved their action, so those failures are logged without claiming it failed.
 */
export async function audit(session: Session, action: AuditAction, summary: string, tx?: Db): Promise<void> {
  try {
    const db = tx ?? await getDb();
    // Millisecond times, so the Activity Log can page with "older than the last one shown".
    await db`
      insert into audit_log (school_id, at, username, display_name, role, action, summary)
      values (${session.schoolId}, ${new Date().toISOString()}, ${session.username}, ${session.displayName}, ${session.role}, ${action}, ${summary})`;
  } catch (err) {
    if (tx) throw err;
    console.error(`Audit log write failed (${action}):`, err);
  }
}
