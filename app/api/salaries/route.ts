import { NextResponse } from 'next/server';
import { ADMIN, STAFF, requireFeature, requireSession } from '@/lib/auth';
import { audit, rupees } from '@/lib/audit';
import { deleteRecord, findAll, findById, insertRecord } from '@/lib/dbHandler';
import { jsonError, readBody, toNumber, toText } from '@/lib/http';
import type { SalaryRecord, StaffMember } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Accountants can read payroll because the Expense Manager lists salaries alongside expenses.
// ?month=&year= narrows it to one payroll period (the Salaries page); without them, all history.
export async function GET(request: Request) {
  const session = await requireSession(STAFF);
  if (session instanceof NextResponse) return session;

  const params = new URL(request.url).searchParams;
  const period: Record<string, string> = {};
  const month = params.get('month');
  const year = params.get('year');
  if (month) period.month = month;
  if (year) period.year = year;

  try {
    const salaries = await findAll<SalaryRecord>('salaries_history', session.schoolId, period);
    salaries.sort((a, b) => new Date(b.paymentDate || 0).getTime() - new Date(a.paymentDate || 0).getTime());
    return NextResponse.json(salaries);
  } catch (err) {
    console.error(`GET salaries failed for ${session.schoolId}:`, err);
    return jsonError('Failed to load salaries', 500);
  }
}

export async function POST(request: Request) {
  const session = await requireSession(ADMIN);
  if (session instanceof NextResponse) return session;
  const locked = await requireFeature(session, 'salaries');
  if (locked) return locked;
  const { schoolId } = session;

  const body = await readBody(request);
  const staffId = toText(body?.staffId);
  if (!body || !staffId) return jsonError('Staff member is required', 400);

  try {
    const member = await findById<StaffMember>('staff', schoolId, staffId);
    if (!member) return jsonError('Staff member not found', 404);

    const month = toText(body.month);
    const year = toText(body.year);
    if (month && year) {
      const [alreadyPaid] = await findAll<SalaryRecord>('salaries_history', schoolId, { staffId: member.id, month, year });
      if (alreadyPaid) return jsonError(`${member.name} has already been paid for ${month} ${year}`, 400);
    }

    // The name is stored on the record so payroll history survives staff edits.
    const salary = await insertRecord('salaries_history', schoolId, {
      staffId: member.id,
      staffName: member.name,
      month,
      year,
      amount: toNumber(body.amount),
      offs: toNumber(body.offs),
      deduction: toNumber(body.deduction),
      paymentDate: new Date().toISOString(),
    });
    const period = month ? ` for ${month} ${year ?? ''}`.trimEnd() : '';
    await audit(session, 'salary.pay', `Paid ${rupees(salary.amount)} salary to ${member.name}${period}`);
    return NextResponse.json(salary);
  } catch (err) {
    console.error(`POST salary failed for ${schoolId}:`, err);
    return jsonError('Failed to record salary', 500);
  }
}

/** Reverses a salary payment. */
export async function DELETE(request: Request) {
  const session = await requireSession(ADMIN);
  if (session instanceof NextResponse) return session;
  const locked = await requireFeature(session, 'salaries');
  if (locked) return locked;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return jsonError('ID is required', 400);

  try {
    const salary = await findById<SalaryRecord>('salaries_history', session.schoolId, id);
    if (!salary || !(await deleteRecord('salaries_history', session.schoolId, salary.id))) {
      return jsonError('Salary record not found', 404);
    }
    const period = salary.month ? ` for ${salary.month} ${salary.year ?? ''}`.trimEnd() : '';
    await audit(session, 'salary.reverse', `Reversed ${rupees(salary.amount)} salary of ${salary.staffName}${period}`);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`DELETE salary failed for ${session.schoolId}:`, err);
    return jsonError('Failed to reverse salary', 500);
  }
}
