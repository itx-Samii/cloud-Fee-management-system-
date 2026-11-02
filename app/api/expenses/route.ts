import { NextResponse } from 'next/server';
import { STAFF, requireFeature, requireSession } from '@/lib/auth';
import { audit, rupees } from '@/lib/audit';
import { deleteRecord, findAll, findById, insertRecord } from '@/lib/dbHandler';
import { jsonError, readBody, toNumber, toText } from '@/lib/http';
import type { Expense } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await requireSession(STAFF);
  if (session instanceof NextResponse) return session;
  const { schoolId } = session;

  try {
    const now = new Date().toISOString();
    const expenses = (await findAll<Expense>('expenses', schoolId)).map((e) => ({ ...e, date: e.date || now }));
    expenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return NextResponse.json(expenses);
  } catch (err) {
    console.error(`GET expenses failed for ${schoolId}:`, err);
    return jsonError('Failed to load expenses', 500);
  }
}

export async function POST(request: Request) {
  const session = await requireSession(STAFF);
  if (session instanceof NextResponse) return session;
  const locked = await requireFeature(session, 'expenses');
  if (locked) return locked;
  const { schoolId } = session;

  const body = await readBody(request);
  if (!body) return jsonError('Invalid request', 400);
  const amount = toNumber(body.amount);
  if (amount <= 0) return jsonError('Expense amount must be greater than zero', 400);

  const date = toText(body.date);
  try {
    const expense = await insertRecord('expenses', schoolId, {
      category: toText(body.category) || 'Other',
      amount,
      description: toText(body.description) ?? '',
      date: date && !isNaN(Date.parse(date)) ? date : new Date().toISOString(),
    });
    const note = expense.description ? `: ${expense.description}` : '';
    await audit(session, 'expense.add', `Added ${expense.category} expense of ${rupees(amount)}${note}`);
    return NextResponse.json(expense);
  } catch (err) {
    console.error(`POST expense failed for ${schoolId}:`, err);
    return jsonError('Failed to create expense', 500);
  }
}

export async function DELETE(request: Request) {
  const session = await requireSession(STAFF);
  if (session instanceof NextResponse) return session;
  const locked = await requireFeature(session, 'expenses');
  if (locked) return locked;
  const { schoolId } = session;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return jsonError('ID required', 400);

  try {
    const expense = await findById<Expense>('expenses', schoolId, id);
    if (!expense || !(await deleteRecord('expenses', schoolId, expense.id))) return jsonError('Expense not found', 404);
    const note = expense.description ? ` (${expense.description})` : '';
    const what = `${expense.category ?? 'Other'} expense of ${rupees(expense.amount)}${note}`;
    await audit(session, 'expense.delete', `Deleted ${what} dated ${String(expense.date ?? '').slice(0, 10)}`);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`DELETE expense failed for ${schoolId}:`, err);
    return jsonError('Failed to delete expense', 500);
  }
}
