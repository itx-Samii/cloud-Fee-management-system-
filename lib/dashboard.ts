import type { Expense, FeeVoucher, Payment, SalaryRecord, Student } from './types';

export type DashboardPeriod = 'monthly' | 'all-time';

// A date entered without a time is a calendar date. Keep its day on every computer.
function accountingDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value + 'T00:00:00' : value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function sameMonth(date: Date, now: Date) {
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

const amount = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

function outflows(expenses: Expense[], salaries: SalaryRecord[]) {
  return [
    ...expenses.filter((expense) => expense.category?.toLowerCase() !== 'salary').map((expense) => ({ date: expense.date, amount: amount(expense.amount) })),
    ...salaries.map((salary) => ({ date: salary.paymentDate, amount: amount(salary.amount) })),
  ];
}

export function dashboardExpenses(expenses: Expense[], salaries: SalaryRecord[], mode: DashboardPeriod, now = new Date()) {
  return outflows(expenses, salaries).reduce((sum, entry) => {
    if (!entry.date) return sum;
    if (mode === 'all-time') return sum + entry.amount;
    const date = accountingDate(entry.date);
    return date && sameMonth(date, now) ? sum + entry.amount : sum;
  }, 0);
}

/** Receipt dates, rather than the last payment date on a voucher, determine monthly income. */
export function dashboardIncome(fees: FeeVoucher[], students: Student[], payments: Payment[], mode: DashboardPeriod, now = new Date()) {
  const active = payments.filter((p) => !p.reversedAt);
  const selected = active.filter((p) => {
    const date = accountingDate(p.receivedAt);
    return mode === 'all-time' || Boolean(date && sameMonth(date, now));
  });
  const allocated = new Map<string, number>();
  for (const p of active) {
    for (const a of p.allocations ?? [{ voucherId: p.voucherId, amount: p.paidTuition }]) {
      const id = String(a.voucherId);
      allocated.set(id, (allocated.get(id) ?? 0) + a.amount);
    }
  }
  const legacyTuition = fees.reduce((sum, v) => {
    if (v.isACOnly) return sum;
    const paid = v.paidTuition ?? (v.status === 'Paid' ? v.amount : Math.max(0, (v.totalReceived ?? 0) - (v.paidAC ?? 0)));
    return sum + Math.max(0, paid - (allocated.get(String(v.id)) ?? 0));
  }, 0);
  const legacyAC = Math.max(0, students.reduce((sum, s) => sum + (s.paidAnnualCharges ?? 0), 0)
    - active.reduce((sum, p) => sum + p.paidAC, 0));
  const tuition = selected.reduce((sum, p) => sum + p.paidTuition, 0) + (mode === 'all-time' ? legacyTuition : 0);
  const annualCharges = selected.reduce((sum, p) => sum + p.paidAC, 0) + (mode === 'all-time' ? legacyAC : 0);
  return { tuition, annualCharges, gross: tuition + annualCharges, legacyUnallocated: legacyTuition + legacyAC };
}

export interface DashboardPoint {
  date: Date;
  collections: number;
  expenses: number;
}

/** Bucket dated ledger entries on the same basis as the summary cards. */
export function dashboardCashFlow(payments: Payment[], expenses: Expense[], salaries: SalaryRecord[], mode: DashboardPeriod, now = new Date()): DashboardPoint[] {
  const daily = mode === 'monthly';
  const points = new Map<number, DashboardPoint>();

  function bucket(date: Date) {
    const start = new Date(date.getFullYear(), date.getMonth(), daily ? date.getDate() : 1);
    const key = start.getTime();
    const existing = points.get(key);
    if (existing) return existing;
    const point = { date: start, collections: 0, expenses: 0 };
    points.set(key, point);
    return point;
  }

  for (const entry of payments) {
    if (entry.reversedAt) continue;
    const date = accountingDate(entry.receivedAt);
    if (date && (!daily || sameMonth(date, now))) bucket(date).collections += amount(entry.paidTuition) + amount(entry.paidAC);
  }
  for (const entry of outflows(expenses, salaries)) {
    const date = accountingDate(entry.date);
    if (date && (!daily || sameMonth(date, now))) bucket(date).expenses += entry.amount;
  }

  if (daily) {
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    for (let day = 1; day <= end; day++) bucket(new Date(now.getFullYear(), now.getMonth(), day));
  } else if (points.size) {
    // Include gaps so a quiet month occupies the same space as an active one.
    const dates = [...points.keys()].sort((a, b) => a - b);
    const first = new Date(dates[0]);
    const last = dates[dates.length - 1];
    for (const month = new Date(first); month.getTime() < last; month.setMonth(month.getMonth() + 1)) bucket(month);
  }
  return [...points.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}
