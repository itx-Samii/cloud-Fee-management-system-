import type { ArrearsLine, Charge, FeeVoucher, SchoolClass, SchoolConfig, Student } from './types';

// Fee arithmetic shared by the API and the pages, so a challan, the collection screen and the
// server always agree on what is owed. No database or browser code in here.

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const DEFAULT_DUE_DAYS = 10;

export interface FeeSettings {
  dueDays: number;
  lateFine: number;
}

export function feeSettingsOf(config: SchoolConfig): FeeSettings {
  return {
    dueDays: config.dueDays ?? DEFAULT_DUE_DAYS,
    lateFine: config.lateFine ?? 0,
  };
}

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : parseFloat(String(value)) || 0);

/** Orders vouchers by billing month: 2026 × 12 + month index. */
export function periodOf(v: { month?: string; year?: string | number }): number {
  return (parseInt(String(v.year)) || 0) * 12 + Math.max(0, MONTHS.indexOf(String(v.month)));
}

/** The billing month a period number (see periodOf) stands for. */
export function monthOfPeriod(period: number): { month: string; year: string } {
  return { month: MONTHS[period % 12], year: String(Math.floor(period / 12)) };
}

export const currentPeriod = (now: Date = new Date()) => now.getFullYear() * 12 + now.getMonth();

// --- Charges on top of the monthly fee ---

export const MAX_CHARGES = 20;
const MAX_CHARGE_LABEL = 40;

const roundRupees = (value: number) => Math.round(value * 100) / 100;

/** The well-formed charges in `value` (a label and an amount above zero), tidied; the rest dropped. */
export function cleanCharges(value: unknown): Charge[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((c) => ({
      label: typeof c?.label === 'string' ? c.label.trim().slice(0, MAX_CHARGE_LABEL) : '',
      amount: roundRupees(num(c?.amount)),
    }))
    .filter((c) => c.label && c.amount > 0)
    .slice(0, MAX_CHARGES);
}

/** Charges sent by a form: the list, or what is wrong with it. */
export function parseCharges(value: unknown): Charge[] | string {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) return 'Charges must be a list';
  if (value.length > MAX_CHARGES) return `At most ${MAX_CHARGES} charges`;
  for (const c of value) {
    const label = typeof c?.label === 'string' ? c.label.trim() : '';
    const amount = typeof c?.amount === 'number' ? c.amount : parseFloat(String(c?.amount ?? ''));
    if (!label) return 'Every charge needs a name (e.g. Exam Fee)';
    if (label.length > MAX_CHARGE_LABEL) return `"${label}" is too long; keep charge names to ${MAX_CHARGE_LABEL} characters`;
    if (!Number.isFinite(amount) || amount <= 0) return `Enter an amount above zero for "${label}"`;
  }
  return cleanCharges(value);
}

export const chargesTotal = (charges: Charge[] | null | undefined) => (charges ?? []).reduce((sum, c) => sum + num(c.amount), 0);

/** The tuition part of a voucher: its fee before the discount, without the charges. */
export const tuitionOf = (v: Pick<FeeVoucher, 'amount' | 'baseAmount' | 'discount' | 'charges'>) =>
  v.baseAmount ?? Math.max(0, num(v.amount) - chargesTotal(v.charges) + num(v.discount));

/** What a new voucher bills the student for a month: fee less discount, plus monthly charges. */
export const monthlyBill = (student: Pick<Student, 'monthlyFee' | 'discount' | 'monthlyCharges'>) =>
  Math.max(0, num(student.monthlyFee) - num(student.discount)) + chargesTotal(student.monthlyCharges);

export function classLabel(cls: SchoolClass | undefined, classId: unknown): string {
  return cls ? `${cls.name}${cls.section ? ' - ' + cls.section : ''}` : `Class ${classId}`;
}

/** A new, unpaid voucher for one student and month, billing what the student is set up to pay. */
export function newVoucher(student: Student, className: string, month: string, year: string, issued: Date, dueDate: Date) {
  const baseAmount = num(student.monthlyFee);
  const discount = num(student.discount);
  const charges = cleanCharges(student.monthlyCharges);
  return {
    studentId: student.id,
    studentName: student.name,
    fatherName: student.fatherName,
    admissionNumber: student.admissionNumber,
    className,
    classId: student.classId,
    month,
    year,
    amount: monthlyBill({ ...student, monthlyCharges: charges }),
    baseAmount,
    discount,
    charges,
    status: 'Unpaid' as const,
    issueDate: issued.toISOString(),
    dueDate: dueDate.toISOString(),
    paymentDate: null,
    totalReceived: 0,
    paidTuition: 0,
    paidAC: 0,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Due date of a voucher for `period` made ahead of time: `dueDays` into that month (or from now, if later). */
export function advanceDueDate(period: number, dueDays: number, now: Date = new Date()): Date {
  const start = new Date(Math.floor(period / 12), period % 12, 1);
  return new Date(Math.max(start.getTime(), now.getTime()) + dueDays * DAY_MS);
}

/** Marked paid before amounts were tracked per payment; nothing is owed on it. */
function settledLegacy(v: FeeVoucher): boolean {
  return v.status === 'Paid' && v.paidTuition == null;
}

/**
 * The late fine a voucher owes: once charged it is fixed; before that it is pending while the
 * voucher is overdue and its tuition isn't fully paid. Vouchers without a due date never get one.
 */
export function lateFineOf(v: FeeVoucher, lateFine: number, now: Date = new Date()): number {
  if (v.fineWaived) return 0;
  if (v.fineCharged) return v.fineCharged;
  if (!lateFine || !v.dueDate || v.isACOnly || settledLegacy(v)) return 0;
  if (num(v.paidTuition) >= num(v.amount)) return 0;
  return now.getTime() > new Date(v.dueDate).getTime() ? lateFine : 0;
}

/** Tuition (plus any late fine) still owed on this voucher alone. */
export function tuitionOwed(v: FeeVoucher, lateFine: number, now: Date = new Date()): number {
  if (v.isACOnly || settledLegacy(v)) return 0;
  return Math.max(0, num(v.amount) + lateFineOf(v, lateFine, now) - num(v.paidTuition));
}

/** Paid when this month's tuition and fine are covered; annual charges are tracked per student. */
export function voucherStatus(v: FeeVoucher): FeeVoucher['status'] {
  if (settledLegacy(v) || num(v.paidTuition) >= num(v.amount) + num(v.fineCharged)) return 'Paid';
  return num(v.paidTuition) + num(v.paidAC) > 0 ? 'Partially Paid' : 'Unpaid';
}

/** The student's vouchers billed before `v` that still have tuition owing, oldest first. */
export function arrearsFor(v: FeeVoucher, studentVouchers: FeeVoucher[], lateFine: number, now: Date = new Date()): ArrearsLine[] {
  const period = periodOf(v);
  return studentVouchers
    .filter((other) => periodOf(other) < period && String(other.id) !== String(v.id))
    .sort((a, b) => periodOf(a) - periodOf(b))
    .map((other) => {
      const fine = other.fineCharged ? 0 : lateFineOf(other, lateFine, now);
      return { voucherId: other.id, month: other.month, year: String(other.year), amount: tuitionOwed(other, lateFine, now), ...(fine > 0 && { fine }) };
    })
    .filter((line) => line.amount > 0);
}

/**
 * Adds what is owed right now to each voucher: arrears from the student's earlier vouchers, the
 * late fine, the student's outstanding annual charges and the resulting balance.
 * `allVouchers` must include every voucher of the students concerned.
 */
export function withBalances(
  vouchers: FeeVoucher[],
  allVouchers: FeeVoucher[],
  students: Map<string, Student>,
  settings: FeeSettings,
  now: Date = new Date()
): FeeVoucher[] {
  const byStudent = vouchersByStudent(allVouchers);

  return vouchers.map((v) => {
    const arrears = v.studentId == null ? [] : arrearsFor(v, byStudent.get(String(v.studentId)) ?? [], settings.lateFine, now);
    const previousArrears = arrears.reduce((sum, line) => sum + line.amount, 0);
    const student = v.studentId == null ? undefined : students.get(String(v.studentId));
    const remainingAnnualCharges = student
      ? Math.max(0, num(student.annualCharges) - num(student.paidAnnualCharges))
      : num(v.remainingAnnualCharges);
    return {
      ...v,
      arrears,
      previousArrears,
      remainingAnnualCharges,
      lateFine: lateFineOf(v, settings.lateFine, now),
      balanceDue: tuitionOwed(v, settings.lateFine, now) + previousArrears + remainingAnnualCharges,
      ...(student?.parentPhone && { parentPhone: student.parentPhone }),
    };
  });
}

export interface StudentDues {
  /** Tuition owed on every voucher, due or not, fines included. */
  tuitionNow: number;
  annualCharges: number;
  /** tuitionNow + annualCharges: what the family would pay to clear everything today. */
  totalNow: number;
  /** Bills past their due date (older vouchers without one count as overdue). */
  overdue: { months: number; oldest: string; tuition: number; fines: number };
  lastPayment: string | null;
}

/** What one student owes, from all of their vouchers. */
export function studentDues(student: Student, vouchers: FeeVoucher[], lateFine: number, now: Date = new Date()): StudentDues {
  const sorted = [...vouchers].sort((a, b) => periodOf(a) - periodOf(b));
  const owed = (v: FeeVoucher) => tuitionOwed(v, lateFine, now);
  const isOverdue = (v: FeeVoucher) => !v.dueDate || new Date(v.dueDate).getTime() < now.getTime();
  const overdue = sorted.filter((v) => isOverdue(v) && owed(v) > 0);
  const tuitionNow = sorted.reduce((sum, v) => sum + owed(v), 0);
  const annualCharges = Math.max(0, num(student.annualCharges) - num(student.paidAnnualCharges));
  return {
    tuitionNow,
    annualCharges,
    totalNow: tuitionNow + annualCharges,
    overdue: {
      months: overdue.length,
      oldest: overdue[0] ? periodLabel(overdue[0]) : '',
      tuition: overdue.reduce((sum, v) => sum + owed(v), 0),
      fines: overdue.reduce((sum, v) => sum + lateFineOf(v, lateFine, now), 0),
    },
    lastPayment: sorted.map((v) => v.paymentDate).filter((d): d is string => !!d).sort().pop() ?? null,
  };
}

/** Groups vouchers by student id. */
export function vouchersByStudent(vouchers: FeeVoucher[]): Map<string, FeeVoucher[]> {
  const map = new Map<string, FeeVoucher[]>();
  for (const v of vouchers) {
    if (v.studentId == null) continue;
    const list = map.get(String(v.studentId)) ?? [];
    list.push(v);
    map.set(String(v.studentId), list);
  }
  return map;
}

export const isLeft = (student: Pick<Student, 'status'>) => String(student.status ?? '').toLowerCase() === 'left';

/** Years to offer in year pickers: the last five and next year, so the list never runs out. */
export function yearOptions(now: Date = new Date()): string[] {
  const year = now.getFullYear();
  return Array.from({ length: 7 }, (_, i) => String(year - 5 + i));
}

/** "September 2026" */
export const periodLabel = (v: { month?: string; year?: string | number }) => `${v.month ?? ''} ${v.year ?? ''}`.trim();
