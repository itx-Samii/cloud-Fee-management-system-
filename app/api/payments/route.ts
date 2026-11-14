import { NextResponse } from 'next/server';
import { ADMIN, STAFF, requireFeature, requireSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { findAll } from '@/lib/dbHandler';
import { reverseReceipt } from '@/lib/ledger';
import { jsonError } from '@/lib/http';
import type { Payment } from '@/lib/types';

export const dynamic = 'force-dynamic';

const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

/**
 * Receipts issued in [from, to), for the Daily Cash Book. The browser sends the bounds of the day
 * in its own timezone, so "today" means the school's today rather than the server's.
 * ?studentId= instead lists every receipt of one student (the student ledger).
 */
export async function GET(request: Request) {
  const session = await requireSession(STAFF);
  if (session instanceof NextResponse) return session;

  const params = new URL(request.url).searchParams;
  const studentId = params.get('studentId');
  const locked = await requireFeature(session, studentId ? 'studentLedger' : 'cashbook');
  if (locked) return locked;
  if (studentId) {
    try {
      const payments = await findAll<Payment>('payments', session.schoolId, { studentId });
      payments.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
      return NextResponse.json(payments, { headers: { 'Cache-Control': 'no-store' } });
    } catch (err) {
      console.error(`GET payments failed for ${session.schoolId}:`, err);
      return jsonError('Failed to load receipts', 500);
    }
  }

  const from = new Date(params.get('from') ?? '');
  const to = new Date(params.get('to') ?? '');
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || to <= from) return jsonError('Choose a valid date range', 400);
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) return jsonError('The date range can be at most one year', 400);

  try {
    const db = await getDb();
    const payments = await db`
      select * from payments
      where school_id = ${session.schoolId} and received_at >= ${from} and received_at < ${to}
      order by received_at, id`;
    return NextResponse.json(payments, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error(`GET payments failed for ${session.schoolId}:`, err);
    return jsonError('Failed to load receipts', 500);
  }
}

/** Reverses one receipt (principal only). It stays in the Cash Book, marked reversed. */
export async function DELETE(request: Request) {
  const session = await requireSession(ADMIN);
  if (session instanceof NextResponse) return session;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return jsonError('Receipt number required', 400);

  try {
    const receipt = await reverseReceipt(session, id);
    if (!receipt) return jsonError('Receipt not found, or already reversed', 404);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`DELETE payment failed for ${session.schoolId}:`, err);
    return jsonError('Failed to reverse the receipt', 500);
  }
}
