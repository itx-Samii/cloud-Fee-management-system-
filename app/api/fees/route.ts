import { NextResponse } from 'next/server';
import { STAFF, hasFeature, requireFeature, requireSession } from '@/lib/auth';
import { audit, describeCharges, rupees } from '@/lib/audit';
import { getDb } from '@/lib/db';
import { findAll, findById, insertNewRecords, nothingReceived, toId } from '@/lib/dbHandler';
import { chargesTotal, classLabel, isLeft, newVoucher, parseCharges, periodLabel, withBalances } from '@/lib/fees';
import {
  Refused,
  addChargeToVouchers,
  loadFeeSettings,
  receivePayment,
  reverseVoucher,
  setVoucherCharges,
  voucherWithBalance,
} from '@/lib/ledger';
import { jsonError, readBody, toNumber, toText } from '@/lib/http';
import type { FeeVoucher, SchoolClass, Student } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await requireSession(STAFF);
  if (session instanceof NextResponse) return session;
  const { schoolId } = session;

  const params = new URL(request.url).searchParams;
  const id = params.get('id');
  const studentId = params.get('studentId');
  const classId = params.get('classId');
  const status = params.get('status');
  const month = params.get('month');
  const year = params.get('year');
  const search = params.get('search')?.toLowerCase();
  const limit = parseInt(params.get('limit') || '10000') || 10000;

  try {
    // One student's vouchers (or one voucher's student's) are all that's needed to work out their
    // arrears; anything broader needs every voucher.
    let narrowTo: { studentId: unknown } | { id: unknown } | null = null;
    if (studentId) narrowTo = { studentId };
    else if (id) {
      const voucher = await findById<FeeVoucher>('fees', schoolId, id);
      if (!voucher) return NextResponse.json([]);
      narrowTo = voucher.studentId != null ? { studentId: voucher.studentId } : { id: voucher.id };
    }
    const [allFees, classes, settings] = await Promise.all([
      findAll<FeeVoucher>('fees', schoolId, narrowTo ?? {}),
      findAll<SchoolClass>('classes', schoolId),
      loadFeeSettings(schoolId),
    ]);
    const students = narrowTo
      ? await findAll<Student>('students', schoolId, { id: [...new Set(allFees.map((f) => f.studentId).filter((s) => s != null))] })
      : await findAll<Student>('students', schoolId);
    const studentsById = new Map(students.map((s) => [String(s.id), s]));
    const classesById = new Map(classes.map((c) => [String(c.id), c]));

    // Some older vouchers only store the studentId; fill in the details for display.
    let fees = allFees.map((f) => {
      const student = !f.studentName && f.studentId ? studentsById.get(String(f.studentId)) : undefined;
      if (!student) return f;
      return {
        ...f,
        studentName: student.name,
        fatherName: student.fatherName,
        admissionNumber: student.admissionNumber,
        className: classLabel(classesById.get(String(student.classId)), student.classId),
        classId: student.classId,
      };
    });

    if (id) fees = fees.filter((f) => String(f.id) === id);
    if (studentId) fees = fees.filter((f) => String(f.studentId) === studentId);
    if (classId && classId !== 'all') fees = fees.filter((f) => String(f.classId) === classId);
    if (status && status !== 'all') fees = fees.filter((f) => f.status === status);
    if (month && month !== 'all') fees = fees.filter((f) => f.month === month);
    if (year && year !== 'all') fees = fees.filter((f) => String(f.year) === year);
    if (search) {
      fees = fees.filter(
        (f) =>
          [f.studentName, f.fatherName, f.admissionNumber].some((v) => String(v ?? '').toLowerCase().includes(search)) ||
          String(f.id).toLowerCase() === search
      );
    }

    // Arrears, fines and balances are worked out fresh, so every screen shows what is owed today.
    return NextResponse.json(withBalances(fees.slice(0, limit), allFees, studentsById, settings));
  } catch (err) {
    console.error(`GET fees failed for ${schoolId}:`, err);
    return jsonError('Failed to load fee records', 500);
  }
}

/**
 * Generates the month's vouchers for the given students, one class, or everyone. Skips students
 * already billed for that month and students who have left.
 */
export async function POST(request: Request) {
  const session = await requireSession(STAFF);
  if (session instanceof NextResponse) return session;
  const { schoolId } = session;

  const locked = await requireFeature(session, 'generate');
  if (locked) return locked;
  const body = await readBody(request);
  if (!body) return jsonError('Invalid request', 400);
  const month = toText(body.month) || 'Unknown';
  const year = toText(body.year) || String(new Date().getFullYear());
  const classId = toText(body.classId);
  const requestedIds: unknown[] | null = Array.isArray(body.studentIds)
    ? body.studentIds
    : body.studentId !== undefined
      ? [body.studentId]
      : null;

  try {
    const [allStudents, classes, existing, settings, chargesOn] = await Promise.all([
      findAll<Student>('students', schoolId),
      findAll<SchoolClass>('classes', schoolId),
      findAll<FeeVoucher>('fees', schoolId, { month, year }),
      loadFeeSettings(schoolId),
      hasFeature(session, 'charges'),
    ]);

    const students = allStudents.filter((s) => !isLeft(s));
    let targets = students;
    if (requestedIds) targets = students.filter((s) => requestedIds.some((rid) => String(rid) === String(s.id)));
    else if (classId && classId !== 'all') targets = students.filter((s) => String(s.classId) === classId);

    const alreadyBilled = new Set(existing.map((f) => String(f.studentId)));
    const classesById = new Map(classes.map((c) => [String(c.id), c]));
    const issued = new Date();
    const dueDate = new Date(issued.getTime() + settings.dueDays * 24 * 60 * 60 * 1000);

    const vouchers = targets
      .filter((s) => !alreadyBilled.has(String(s.id)))
      .map((student) =>
        newVoucher(
          // With Extra Charges switched off, new vouchers bill the fee alone.
          chargesOn ? student : { ...student, monthlyCharges: [] },
          classLabel(classesById.get(String(student.classId)), student.classId),
          month,
          year,
          issued,
          dueDate
        )
      );

    if (vouchers.length === 0) return NextResponse.json({ success: true, count: 0, message: 'No new vouchers needed.' });

    // Another request may be generating the same month right now; the database keeps one each.
    const count = await insertNewRecords('fees', schoolId, vouchers);
    if (count > 0) await audit(session, 'vouchers.generate', `Generated ${count} voucher(s) for ${month} ${year}`);
    return NextResponse.json({ success: true, count });
  } catch (err) {
    console.error(`POST fees failed for ${schoolId}:`, err);
    return jsonError('Failed to generate vouchers', 500);
  }
}

/**
 * Takes a payment against a voucher and issues one numbered receipt. Tuition clears the student's
 * older unpaid months first; see receivePayment in lib/ledger.ts.
 */
export async function PUT(request: Request) {
  const session = await requireSession(STAFF);
  if (session instanceof NextResponse) return session;
  const { schoolId } = session;

  const body = await readBody(request);
  const id = toText(body?.id);
  if (!body || !id) return jsonError('Voucher ID required', 400);

  const paidTuition = toNumber(body.paidTuition);
  const paidAC = toNumber(body.paidAC);
  if (paidTuition < 0 || paidAC < 0) return jsonError('Payment amounts cannot be negative', 400);
  if (paidTuition === 0 && paidAC === 0) return jsonError('Enter an amount to receive', 400);
  const locked = (await requireFeature(session, 'collection')) ?? (body.advance === true ? await requireFeature(session, 'advance') : null);
  if (locked) return locked;

  try {
    const result = await receivePayment(session, id, {
      paidTuition,
      paidAC,
      waiveFine: body.waiveFine === true,
      advance: body.advance === true,
      monthlyCharges: await hasFeature(session, 'charges'),
    });
    if (!result) return jsonError('Voucher not found', 404);
    const { receipt, voucher } = result;

    const allocations = receipt.allocations ?? [];
    const months = (lines: typeof allocations) => lines.map((a) => `${periodLabel(a)} ${rupees(a.amount)}`).join(', ');
    const others = allocations.filter((a) => String(a.voucherId) !== String(voucher.id) && a.amount > 0);
    const arrears = others.filter((a) => !a.created);
    const advance = others.filter((a) => a.created);
    const charged = allocations.reduce((sum, a) => sum + (a.fineCharged ?? 0), 0);
    const waived = allocations.reduce((sum, a) => sum + (a.fineWaived ?? 0), 0);
    const notes = [
      arrears.length ? `incl. arrears ${months(arrears)}` : '',
      advance.length ? `advance fee ${months(advance)}` : '',
      charged ? `late fine ${rupees(charged)} charged` : '',
      waived ? `late fine ${rupees(waived)} waived` : '',
    ].filter(Boolean);
    await audit(
      session,
      'payment.receive',
      `Received ${rupees(receipt.amount)} from ${voucher.studentName ?? 'student'} for ${periodLabel(voucher)} ` +
        `(voucher #${voucher.id}, receipt #${receipt.id})${notes.length ? `; ${notes.join('; ')}` : ''}`
    );

    return NextResponse.json({
      ...(await voucherWithBalance(schoolId, voucher)),
      receiptNo: receipt.id,
      receivedBy: session.displayName,
      allocations,
    });
  } catch (err) {
    if (err instanceof Refused) return jsonError(err.message, 400);
    console.error(`PUT fees failed for ${schoolId}:`, err);
    return jsonError('Failed to process payment', 500);
  }
}

/**
 * Charges on top of the monthly fee (admission fee, exam fee...). Either
 *   { id, charges: [{label, amount}] }  replaces one voucher's charges, or
 *   { ids: [...], charge: {label, amount} }  adds one charge to each of those vouchers (a class's
 *   exam fee, say), skipping any that already has a charge by that name.
 */
export async function PATCH(request: Request) {
  const session = await requireSession(STAFF);
  if (session instanceof NextResponse) return session;
  const { schoolId } = session;

  const locked = await requireFeature(session, 'charges');
  if (locked) return locked;
  const body = await readBody(request);
  if (!body) return jsonError('Invalid request', 400);

  try {
    if (Array.isArray(body.ids)) {
      if (body.ids.length > 5000) return jsonError('Too many vouchers at once', 400);
      const parsed = parseCharges([body.charge]);
      if (typeof parsed === 'string') return jsonError(parsed, 400);
      const [charge] = parsed;
      const { added, skipped } = await addChargeToVouchers(session, body.ids, charge);
      if (added.length > 0) {
        const periods = [...new Set(added.map((v) => periodLabel(v)))];
        await audit(
          session,
          'voucher.charges',
          `Added ${charge.label} ${rupees(charge.amount)} to ${added.length} voucher(s)${periods.length === 1 ? ` for ${periods[0]}` : ''}`
        );
      }
      return NextResponse.json({ success: true, added: added.length, skipped });
    }

    const id = toText(body.id);
    if (!id) return jsonError('Voucher ID required', 400);
    const charges = parseCharges(body.charges);
    if (typeof charges === 'string') return jsonError(charges, 400);
    const result = await setVoucherCharges(session, id, charges);
    if (!result) return jsonError('Voucher not found', 404);
    const { voucher, before } = result;
    if (describeCharges(before) !== describeCharges(charges)) {
      await audit(
        session,
        'voucher.charges',
        `Charges on voucher #${voucher.id} of ${voucher.studentName ?? 'student'} for ${periodLabel(voucher)}: ` +
          `${describeCharges(before)} → ${describeCharges(charges)} (bill now ${rupees(voucher.amount)}, charges ${rupees(chargesTotal(charges))})`
      );
    }
    return NextResponse.json(await voucherWithBalance(schoolId, voucher));
  } catch (err) {
    if (err instanceof Refused) return jsonError(err.message, 400);
    console.error(`PATCH fees failed for ${schoolId}:`, err);
    return jsonError('Failed to save the charges', 500);
  }
}

/**
 * Deletes a voucher. Any staff member may delete one nothing was paid on. Once money has been
 * taken it is a reversal, which only the principal may do: every receipt that touched the voucher
 * is reversed (they stay on file, marked), then the voucher goes.
 */
export async function DELETE(request: Request) {
  const session = await requireSession(STAFF);
  if (session instanceof NextResponse) return session;
  const { schoolId } = session;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return jsonError('ID required', 400);

  try {
    if (session.role !== 'admin') {
      // Deciding and deleting in one step, so a payment arriving meanwhile can't slip past the check.
      const db = await getDb();
      const key = toId(id);
      const [voucher] = (key === null
        ? []
        : await db`delete from fees where school_id = ${schoolId} and id = ${key} and ${nothingReceived(db)} returning *`) as unknown as FeeVoucher[];
      if (!voucher) {
        if (await findById('fees', schoolId, id)) {
          return jsonError('Money has been received on this voucher. Only the principal can reverse it.', 403);
        }
        return jsonError('Voucher not found', 404);
      }
      await audit(session, 'voucher.delete', `Deleted unpaid voucher #${voucher.id} of ${voucher.studentName ?? 'student'} for ${periodLabel(voucher)}`);
      return NextResponse.json({ success: true });
    }

    const reversal = await reverseVoucher(session, id);
    if (!reversal) return jsonError('Voucher not found', 404);
    const { voucher, takenBack, receipts } = reversal;
    const what = `voucher #${voucher.id} of ${voucher.studentName ?? 'student'} for ${periodLabel(voucher)}`;
    await audit(
      session,
      'voucher.delete',
      takenBack > 0 || voucher.status !== 'Unpaid'
        ? `Reversed ${what}${receipts ? ` (${receipts} receipt(s))` : ''}${takenBack > 0 ? `: ${rupees(takenBack)} taken back` : ''}`
        : `Deleted unpaid ${what}`
    );
    return NextResponse.json({ success: true, takenBack, receipts });
  } catch (err) {
    console.error(`DELETE fees failed for ${schoolId}:`, err);
    return jsonError('Failed to reverse fee', 500);
  }
}
