import { NextResponse } from 'next/server';
import { ADMIN, requireFeature, requireSession } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { findAll, toId } from '@/lib/dbHandler';
import { isLeft } from '@/lib/fees';
import { Refused } from '@/lib/ledger';
import { listPromotions, promote, stateToken, undoPromotion } from '@/lib/promotion';
import { parsePromotionSteps } from '@/lib/promotionPlan';
import { jsonError, readBody } from '@/lib/http';
import type { SchoolClass, Student } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** What the Promotion page needs: classes, their current students, and past promotions. */
export async function GET() {
  const session = await requireSession(ADMIN);
  if (session instanceof NextResponse) return session;
  const locked = await requireFeature(session, 'promotion');
  if (locked) return locked;
  const { schoolId } = session;

  try {
    const [classes, students, history] = await Promise.all([
      findAll<SchoolClass>('classes', schoolId),
      findAll<Student>('students', schoolId),
      listPromotions(schoolId),
    ]);
    return NextResponse.json(
      {
        classes: classes.map(({ id, name, section, monthlyFee, annualCharges }) => ({ id, name, section, monthlyFee, annualCharges })),
        students: students
          .filter((s) => !isLeft(s) && s.classId != null)
          .map(({ id, name, fatherName, classId, monthlyFee, annualCharges }) => ({ id, name, fatherName, classId, monthlyFee, annualCharges })),
        history,
        token: stateToken(history[0]),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error(`GET promotion failed for ${schoolId}:`, err);
    return jsonError('Failed to load classes for promotion', 500);
  }
}

/** Promotes: { steps: [{fromClassId, to, fee, addAnnualCharges, keepBack}], token }. */
export async function POST(request: Request) {
  const session = await requireSession(ADMIN);
  if (session instanceof NextResponse) return session;
  const locked = await requireFeature(session, 'promotion');
  if (locked) return locked;

  const body = await readBody(request);
  const steps = parsePromotionSteps(body?.steps);
  if (typeof steps === 'string') return jsonError(steps, 400);
  if (typeof body?.token !== 'string') return jsonError('Reload the page and try again.', 400);

  try {
    const result = await promote(session, steps, body.token);
    await audit(session, 'student.promote', result.summary);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Refused) return jsonError(err.message, 400);
    console.error(`Promotion failed for ${session.schoolId}:`, err);
    return jsonError('Promotion failed; nothing was changed. Please try again.', 500);
  }
}

/** ?id= undoes that promotion, if it is the latest one. */
export async function DELETE(request: Request) {
  const session = await requireSession(ADMIN);
  if (session instanceof NextResponse) return session;
  const locked = await requireFeature(session, 'promotion');
  if (locked) return locked;

  const id = toId(new URL(request.url).searchParams.get('id'));
  if (id === null) return jsonError('ID is required', 400);

  try {
    const result = await undoPromotion(session, id);
    const when = result.doneAt.slice(0, 10);
    const changed = result.changedSince.length
      ? `; ${result.changedSince.length} kept their newer class or fee (edited since): ${result.changedSince.slice(0, 10).join(', ')}${result.changedSince.length > 10 ? ', ...' : ''}`
      : '';
    const missing = result.missing ? `; ${result.missing} deleted since` : '';
    await audit(session, 'student.unpromote', `Undid the class promotion of ${when}: ${result.restored} student(s) put back${changed}${missing}`);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Refused) return jsonError(err.message, 400);
    console.error(`Undoing promotion failed for ${session.schoolId}:`, err);
    return jsonError('Undo failed; nothing was changed. Please try again.', 500);
  }
}
