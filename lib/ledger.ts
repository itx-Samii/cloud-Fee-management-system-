import { audit, rupees } from './audit';
import { transaction, type Db } from './db';
import { findAll, findById, insertIfNew, insertRecord, nothingReceived, readConfig, toId, updateRecord } from './dbHandler';
import { featureOn } from './features';
import { DEFAULT_FEATURES, getFeatures } from './license';
import {
  MAX_CHARGES,
  advanceDueDate,
  arrearsFor,
  chargesTotal,
  classLabel,
  currentPeriod,
  feeSettingsOf,
  isLeft,
  lateFineOf,
  monthOfPeriod,
  monthlyBill,
  newVoucher,
  periodOf,
  periodLabel,
  tuitionOwed,
  voucherStatus,
  withBalances,
  type FeeSettings,
} from './fees';
import type { Session } from './session';
import type { Allocation, Charge, FeeVoucher, Payment, RecordId, SchoolClass, Student } from './types';

// Moving money: taking payments (oldest month first, then advance fee), late fines, charges on
// vouchers, and reversing receipts. Each of these runs in one transaction holding a lock on the
// student, so two cashiers working on the same family at once take turns, and a failure part-way
// leaves nothing half-done.

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : parseFloat(String(value)) || 0);
const roundRupees = (value: number) => Math.round(value * 100) / 100;

const DAY_MS = 24 * 60 * 60 * 1000;

/** At most this many months of fees can be paid ahead in one go. */
export const MAX_ADVANCE_MONTHS = 12;

/** A request turned down, with the reason for the person who made it. Nothing was saved. */
export class Refused extends Error {}

/** The school's fee rules. With Late Fine switched off by the Super Admin, no new fines are charged. */
export async function loadFeeSettings(schoolId: string): Promise<FeeSettings> {
  const [config, features] = await Promise.all([readConfig(schoolId), getFeatures(schoolId).catch(() => DEFAULT_FEATURES)]);
  const settings = feeSettingsOf(config);
  return featureOn(features, 'lateFine') ? settings : { ...settings, lateFine: 0 };
}

/** Fresh balances for one voucher (after a payment, say). */
export async function voucherWithBalance(schoolId: string, voucher: FeeVoucher): Promise<FeeVoucher> {
  const [settings, siblings, student] = await Promise.all([
    loadFeeSettings(schoolId),
    voucher.studentId == null ? [] : findAll<FeeVoucher>('fees', schoolId, { studentId: voucher.studentId }),
    voucher.studentId == null ? null : findById<Student>('students', schoolId, voucher.studentId),
  ]);
  const students = new Map(student ? [[String(voucher.studentId), student]] : []);
  return withBalances([voucher], siblings, students, settings)[0];
}

/**
 * Waits for, then holds until the transaction ends, the lock on one student's money (or on a
 * lone voucher with no student).
 */
export async function lockStudent(tx: Db, schoolId: string, studentId: unknown, voucherId?: unknown) {
  const key = studentId == null ? `${schoolId}:voucher:${voucherId}` : `${schoolId}:student:${studentId}`;
  await tx`select pg_advisory_xact_lock(hashtext(${key}))`;
}

/** Saves a voucher's payment fields, with totals and status worked out from them. */
async function saveVoucher(tx: Db, schoolId: string, v: FeeVoucher): Promise<FeeVoucher | null> {
  return updateRecord<FeeVoucher>(
    'fees',
    schoolId,
    v.id,
    {
      paidTuition: v.paidTuition,
      paidAC: v.paidAC,
      totalReceived: num(v.paidTuition) + num(v.paidAC),
      status: voucherStatus(v),
      paymentDate: v.paymentDate,
      fineCharged: v.fineCharged,
      fineWaived: v.fineWaived === true,
    },
    tx
  );
}

async function changeAnnualChargesPaid(tx: Db, schoolId: string, studentId: unknown, change: number) {
  const id = toId(studentId);
  if (id === null || change === 0) return;
  await tx`
    update students set paid_annual_charges = greatest(0, paid_annual_charges + ${change})
    where school_id = ${schoolId} and id = ${id}`;
}

export interface PaymentInput {
  requestId: string;
  paidTuition: number;
  paidAC: number;
  /** Waive the late fine on the vouchers this payment reaches instead of charging it. */
  waiveFine: boolean;
  /** Keep tuition beyond everything owed as advance fee for the coming months. */
  advance: boolean;
  /** Put the student's monthly charges on vouchers made for advance fee (off when Extra Charges is switched off). */
  monthlyCharges: boolean;
}

export interface PaymentResult {
  receipt: Payment;
  voucher: FeeVoucher;
}

/**
 * Takes a payment against `voucherId`. Tuition clears the student's earlier unpaid months first,
 * oldest first, then this voucher, then later months already billed. Anything beyond that is
 * advance fee: with `input.advance`, vouchers for the coming months are made and paid (up to
 * MAX_ADVANCE_MONTHS); without it the payment is refused. Annual charges go to the student.
 * An overdue voucher gets its late fine fixed (or waived) as the payment reaches it.
 * Returns null if the voucher doesn't exist in this school; throws Refused if it can't be taken.
 */
export async function receivePayment(session: Session, voucherId: RecordId, input: PaymentInput): Promise<PaymentResult | null> {
  const { schoolId } = session;
  const id = toId(voucherId);
  if (id === null) return null;
  const { lateFine, dueDays } = await loadFeeSettings(schoolId);

  return transaction(async (tx) => {
    const fingerprint = JSON.stringify([id, input.paidTuition, input.paidAC, input.waiveFine, input.advance]);
    await tx`select pg_advisory_xact_lock(hashtext(${`${schoolId}:payment:${input.requestId}`}))`;
    const [previous] = await tx`select * from payments where school_id = ${schoolId} and request_id = ${input.requestId}`;
    if (previous) {
      if (previous.requestFingerprint !== fingerprint) throw new Refused('This payment request was already used with different details. Reload the voucher.');
      if (previous.reversedAt) throw new Refused('This payment was already received and reversed. Start a new payment.');
      const voucher = await findById<FeeVoucher>('fees', schoolId, id, tx);
      if (!voucher) throw new Refused('This payment was already received, but its voucher is no longer available. Check the Cash Book.');
      return { receipt: previous as unknown as Payment, voucher };
    }
    const [peek] = await tx`select student_id from fees where school_id = ${schoolId} and id = ${id}`;
    if (!peek) return null;
    await lockStudent(tx, schoolId, peek.studentId, id);

    const target = await findById<FeeVoucher>('fees', schoolId, id, tx);
    if (!target) return null;
    const now = new Date();
    const receivedAt = now.toISOString();
    const others =
      target.studentId == null
        ? []
        : ((await tx`
            select * from fees
            where school_id = ${schoolId} and student_id = ${target.studentId} and id <> ${id}`) as unknown as FeeVoucher[]);
    const unpaid = others.filter((v) => v.status !== 'Paid');
    const byId = new Map(unpaid.map((v) => [String(v.id), v]));

    /** Fixes the overdue fine on a voucher about to receive money, or waives it. */
    const settleFine = (v: FeeVoucher): Pick<Allocation, 'fineCharged' | 'fineWaived'> => {
      const fine = lateFineOf(v, lateFine, now);
      if (!fine || v.fineCharged) return {};
      if (input.waiveFine) {
        v.fineWaived = true;
        return { fineWaived: fine };
      }
      v.fineCharged = fine;
      return { fineCharged: fine };
    };

    let remaining = input.paidTuition;
    const allocations: Allocation[] = [];

    /** Puts as much of what's left as `v` still owes on it. */
    const payOn = async (v: FeeVoucher, extra: Pick<Allocation, 'created'> = {}) => {
      const fine = settleFine(v);
      const applied = Math.min(remaining, tuitionOwed(v, lateFine, now));
      if (applied <= 0) return;
      remaining = roundRupees(remaining - applied);
      v.paidTuition = num(v.paidTuition) + applied;
      v.paymentDate = receivedAt;
      await saveVoucher(tx, schoolId, v);
      allocations.push({ voucherId: v.id, month: v.month, year: String(v.year), amount: applied, ...fine, ...extra });
    };

    for (const line of arrearsFor(target, unpaid, lateFine, now)) {
      if (remaining <= 0) break;
      const older = byId.get(String(line.voucherId));
      if (older) await payOn(older);
    }

    let voucher: FeeVoucher | null = target;
    const fine = remaining > 0 ? settleFine(target) : {};
    const applied = Math.min(remaining, tuitionOwed(target, lateFine, now));
    if (applied > 0 || input.paidAC > 0) {
      remaining = roundRupees(remaining - applied);
      if (applied > 0) target.paidTuition = num(target.paidTuition) + applied;
      target.paidAC = num(target.paidAC) + input.paidAC;
      target.paymentDate = receivedAt;
      voucher = await saveVoucher(tx, schoolId, target);
      allocations.push({ voucherId: target.id, month: target.month, year: String(target.year), amount: applied, ...fine });
    }
    if (!voucher) return null;

    const later = unpaid.filter((v) => periodOf(v) > periodOf(target)).sort((a, b) => periodOf(a) - periodOf(b));
    for (const v of later) {
      if (remaining <= 0) break;
      await payOn(v);
    }

    if (remaining > 0) {
      if (!input.advance) {
        throw new Refused(`${rupees(remaining)} is more than everything owed. To keep it as advance fee for the coming months, tick "advance fee".`);
      }
      const student = target.studentId == null ? null : await findById<Student>('students', schoolId, target.studentId, tx);
      if (!student) throw new Refused('This voucher has no student record, so no advance fee can be taken on it.');
      if (isLeft(student)) throw new Refused(`${student.name} has left the school, so no advance fee can be taken.`);
      const billed = input.monthlyCharges ? student : { ...student, monthlyCharges: [] };
      if (monthlyBill(billed) <= 0) throw new Refused(`${student.name} has no monthly fee to pay ahead.`);
      const cls = student.classId == null ? null : await findById<SchoolClass>('classes', schoolId, student.classId, tx);
      const className = classLabel(cls ?? undefined, student.classId);

      // Months after the last one billed, in order, each made and paid in turn.
      let period = Math.max(periodOf(target), ...others.map(periodOf));
      for (let months = 0; remaining > 0; months++) {
        if (months === MAX_ADVANCE_MONTHS) throw new Refused(`That is more than ${MAX_ADVANCE_MONTHS} months of fees in advance.`);
        period += 1;
        const { month, year } = monthOfPeriod(period);
        const made = await insertIfNew('fees', schoolId, newVoucher(billed, className, month, year, now, advanceDueDate(period, dueDays, now)), tx);
        // Someone generating that month's vouchers just now got there first: pay theirs.
        const [v] = made
          ? [made as unknown as FeeVoucher]
          : ((await tx`
              select * from fees
              where school_id = ${schoolId} and student_id = ${student.id} and year = ${year} and month = ${month} and due_date is not null`) as unknown as FeeVoucher[]);
        if (v) await payOn(v, made ? { created: true } : {});
      }
    }

    if (input.paidAC > 0) await changeAnnualChargesPaid(tx, schoolId, target.studentId, input.paidAC);

    const receipt = (await insertRecord(
      'payments',
      schoolId,
      {
        requestId: input.requestId,
        requestFingerprint: fingerprint,
        voucherId: target.id,
        studentId: target.studentId,
        studentName: target.studentName,
        className: target.className,
        month: target.month,
        year: target.year,
        paidTuition: input.paidTuition,
        paidAC: input.paidAC,
        amount: input.paidTuition + input.paidAC,
        receivedAt,
        receivedBy: session.username,
        receivedByName: session.displayName,
        allocations,
      },
      tx
    )) as unknown as Payment;

    const months = (lines: Allocation[]) => lines.map((a) => `${periodLabel(a)} ${rupees(a.amount)}`).join(', ');
    const otherAllocations = allocations.filter((a) => String(a.voucherId) !== String(target.id) && a.amount > 0);
    const arrears = otherAllocations.filter((a) => !a.created);
    const advance = otherAllocations.filter((a) => a.created);
    const charged = allocations.reduce((sum, a) => sum + (a.fineCharged ?? 0), 0);
    const waived = allocations.reduce((sum, a) => sum + (a.fineWaived ?? 0), 0);
    const notes = [
      arrears.length ? `incl. arrears ${months(arrears)}` : '',
      advance.length ? `advance fee ${months(advance)}` : '',
      charged ? `late fine ${rupees(charged)} charged` : '',
      waived ? `late fine ${rupees(waived)} waived` : '',
    ].filter(Boolean);
    await audit(session, 'payment.receive', `Received ${rupees(receipt.amount)} from ${target.studentName ?? 'student'} for ${periodLabel(target)} (voucher #${target.id}, receipt #${receipt.id})${notes.length ? `; ${notes.join('; ')}` : ''}`, tx);
    return { receipt, voucher };
  });
}

/**
 * Marks a receipt reversed and takes its money back off the vouchers and the student. Vouchers it
 * made as advance fee go again while their month is still to come (and nothing else was paid on
 * them), except `keep`, which the caller deletes itself.
 */
async function undoReceipt(tx: Db, session: Session, receiptId: number, keep?: number): Promise<Payment | null> {
  const { schoolId } = session;
  const [receipt] = (await tx`
    update payments set reversed_at = now(), reversed_by = ${session.username}
    where school_id = ${schoolId} and id = ${receiptId} and reversed_at is null
    returning *`) as unknown as Payment[];
  if (!receipt) return null;

  // Receipts from before allocations were recorded paid only their own voucher.
  const allocations = receipt.allocations ?? [{ voucherId: receipt.voucherId, amount: receipt.paidTuition }];
  for (const line of allocations) {
    const v = await findById<FeeVoucher>('fees', schoolId, line.voucherId, tx);
    if (!v) continue;
    if (num(line.amount) > 0) v.paidTuition = Math.max(0, num(v.paidTuition) - num(line.amount));
    if (String(line.voucherId) === String(receipt.voucherId) && receipt.paidAC > 0) {
      v.paidAC = Math.max(0, num(v.paidAC) - receipt.paidAC);
    }
    if (line.fineCharged) v.fineCharged = undefined;
    if (line.fineWaived) v.fineWaived = false;
    await saveVoucher(tx, schoolId, v);

    if (line.created && v.id !== keep && periodOf(v) > currentPeriod()) {
      await tx`delete from fees where school_id = ${schoolId} and id = ${v.id} and ${nothingReceived(tx)}`;
    }
  }

  if (receipt.paidAC > 0) await changeAnnualChargesPaid(tx, schoolId, receipt.studentId, -receipt.paidAC);
  return receipt;
}

/**
 * Undoes a receipt: the tuition comes off every voucher it reached, annual charges come off the
 * student, fines it fixed or waived are released, months it paid in advance are removed again, and
 * the receipt stays on file marked reversed.
 * Returns null if there is no such receipt or it was already reversed.
 */
export async function reverseReceipt(session: Session, receiptId: RecordId): Promise<Payment | null> {
  const { schoolId } = session;
  const id = toId(receiptId);
  if (id === null) return null;

  return transaction(async (tx) => {
    const [peek] = await tx`select student_id, voucher_id from payments where school_id = ${schoolId} and id = ${id}`;
    if (!peek) return null;
    await lockStudent(tx, schoolId, peek.studentId, peek.voucherId);
    const receipt = await undoReceipt(tx, session, id);
    if (receipt) await audit(session, 'payment.reverse', `Reversed receipt #${receipt.id}: ${rupees(receipt.amount)} from ${receipt.studentName ?? 'student'} for ${periodLabel(receipt)}`, tx);
    return receipt;
  });
}

export interface VoucherReversal {
  voucher: FeeVoucher;
  /** Money undone: the reversed receipts plus anything paid before receipts existed. */
  takenBack: number;
  receipts: number;
}

/**
 * Deletes a voucher that has money on it: every receipt that touched it is reversed in full
 * (including what those receipts paid on other months), then the voucher goes.
 */
export async function reverseVoucher(session: Session, voucherId: RecordId): Promise<VoucherReversal | null> {
  const { schoolId } = session;
  const id = toId(voucherId);
  if (id === null) return null;

  return transaction(async (tx) => {
    const [peek] = await tx`select student_id from fees where school_id = ${schoolId} and id = ${id}`;
    if (!peek) return null;
    await lockStudent(tx, schoolId, peek.studentId, id);

    const receipts = await tx`
      select id from payments
      where school_id = ${schoolId} and reversed_at is null
        and (voucher_id = ${id} or allocations @> ${tx.json([{ voucherId: id }])})
      order by id`;
    let takenBack = 0;
    for (const { id: receiptId } of receipts) {
      const undone = await undoReceipt(tx, session, receiptId as number, id);
      if (undone) takenBack += num(undone.amount);
    }

    const [voucher] = (await tx`delete from fees where school_id = ${schoolId} and id = ${id} returning *`) as unknown as FeeVoucher[];
    if (!voucher) return null;

    // Whatever is still on it was paid before receipts existed; only the voucher knows about it.
    takenBack += num(voucher.totalReceived);
    if (num(voucher.paidAC) > 0) await changeAnnualChargesPaid(tx, schoolId, voucher.studentId, -num(voucher.paidAC));
    await audit(session, 'voucher.delete', `Reversed voucher #${voucher.id} of ${voucher.studentName ?? 'student'} for ${periodLabel(voucher)} (${receipts.length} receipt(s)): ${rupees(takenBack)} taken back`, tx);
    return { voucher, takenBack, receipts: receipts.length };
  });
}

// --- Charges on vouchers (admission fee, exam fee...) ---

/** Vouchers whose amounts were never tracked, or that only ever held annual charges: no charges go on these. */
const takesCharges = (v: FeeVoucher) => !v.isACOnly && !(v.status === 'Paid' && v.paidTuition == null);

/**
 * Saves new charges on a voucher whose student the caller has locked; its amount and status
 * follow. A voucher that was settled and now owes again gets a fresh due date, so the new charge
 * isn't fined straight away.
 */
async function applyCharges(tx: Db, schoolId: string, v: FeeVoucher, charges: Charge[], dueDays: number, now: Date): Promise<FeeVoucher> {
  const amount = roundRupees(Math.max(0, num(v.amount) - chargesTotal(v.charges)) + chargesTotal(charges));
  if (amount + num(v.fineCharged) < num(v.paidTuition)) {
    throw new Refused(
      `${rupees(v.paidTuition)} has already been paid on voucher #${v.id}, more than it would bill. Reverse that receipt first.`
    );
  }
  const owedAgain = voucherStatus(v) === 'Paid' && amount > num(v.amount);
  const overdue = v.dueDate && new Date(v.dueDate).getTime() < now.getTime();
  const changes = {
    charges,
    amount,
    status: voucherStatus({ ...v, amount }),
    ...(owedAgain && overdue && { dueDate: new Date(now.getTime() + dueDays * DAY_MS).toISOString() }),
  };
  return (await updateRecord<FeeVoucher>('fees', schoolId, v.id, changes, tx)) as FeeVoucher;
}

export interface ChargesChange {
  voucher: FeeVoucher;
  before: Charge[];
}

/**
 * Replaces the charges on one voucher. Returns null if there is no such voucher; throws Refused if
 * it can't take charges or would then bill less than was already paid on it.
 */
export async function setVoucherCharges(session: Session, voucherId: RecordId, charges: Charge[]): Promise<ChargesChange | null> {
  const { schoolId } = session;
  const id = toId(voucherId);
  if (id === null) return null;
  const { dueDays } = await loadFeeSettings(schoolId);

  return transaction(async (tx) => {
    const [peek] = await tx`select student_id from fees where school_id = ${schoolId} and id = ${id}`;
    if (!peek) return null;
    await lockStudent(tx, schoolId, peek.studentId, id);
    const v = await findById<FeeVoucher>('fees', schoolId, id, tx);
    if (!v) return null;
    if (!takesCharges(v)) throw new Refused(`Voucher #${v.id} is from before amounts were tracked and can't take charges.`);
    return { voucher: await applyCharges(tx, schoolId, v, charges, dueDays, new Date()), before: v.charges ?? [] };
  });
}

export interface BulkCharge {
  /** The vouchers that got the charge. */
  added: FeeVoucher[];
  /** Vouchers left alone: they already had a charge by that name, or can't take charges. */
  skipped: number;
}

/**
 * Adds one charge (an exam fee for a whole class, say) to each of these vouchers. A voucher that
 * already has a charge by that name is skipped, so doing it twice doesn't bill twice. All or nothing.
 */
export async function addChargeToVouchers(session: Session, voucherIds: RecordId[], charge: Charge): Promise<BulkCharge> {
  const { schoolId } = session;
  const ids = [...new Set(voucherIds.map(toId).filter((id): id is number => id !== null))];
  if (ids.length === 0) return { added: [], skipped: 0 };
  const { dueDays } = await loadFeeSettings(schoolId);
  const sameName = (c: Charge) => c.label.toLowerCase() === charge.label.toLowerCase();

  return transaction(async (tx) => {
    // Locked in one order, so two of these at once can't each wait for the other.
    const owners = await tx`
      select distinct student_id from fees
      where school_id = ${schoolId} and id in ${tx(ids)} and student_id is not null
      order by student_id`;
    for (const { studentId } of owners) await lockStudent(tx, schoolId, studentId, null);
    const lone = await tx`select id from fees where school_id = ${schoolId} and id in ${tx(ids)} and student_id is null order by id`;
    for (const { id } of lone) await lockStudent(tx, schoolId, null, id);

    const vouchers = (await tx`select * from fees where school_id = ${schoolId} and id in ${tx(ids)} order by id`) as unknown as FeeVoucher[];
    const now = new Date();
    const added: FeeVoucher[] = [];
    for (const v of vouchers) {
      const charges = v.charges ?? [];
      if (!takesCharges(v) || charges.some(sameName) || charges.length >= MAX_CHARGES) continue;
      added.push(await applyCharges(tx, schoolId, v, [...charges, charge], dueDays, now));
    }
    return { added, skipped: ids.length - added.length };
  });
}
