import { NextResponse } from 'next/server';
import { requireFeature, requireSession } from '@/lib/auth';
import { parentSessionProblem, portalData } from '@/lib/parents';
import { jsonError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** The signed-in family's children with their vouchers, receipts and balances. Read-only. */
export async function GET() {
  const session = await requireSession(['parent']);
  if (session instanceof NextResponse) return session;
  const locked = await requireFeature(session, 'parentPortal');
  if (locked) return jsonError('The parent portal is switched off for this school. Please contact the school.', 403);

  try {
    const problem = await parentSessionProblem(session);
    if (problem) return jsonError(problem, 401);
    return NextResponse.json(await portalData(session), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error(`Parent portal failed for ${session.schoolId}:`, err);
    return jsonError('Could not load the fee details. Please try again.', 500);
  }
}
