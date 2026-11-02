import { NextResponse } from 'next/server';
import { STAFF, requireFeature, requireSession } from '@/lib/auth';
import { findAll } from '@/lib/dbHandler';
import { isLeft, studentDues, vouchersByStudent } from '@/lib/fees';
import { loadFeeSettings } from '@/lib/ledger';
import { jsonError } from '@/lib/http';
import type { Defaulter, FeeVoucher, SchoolClass, Student } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Everyone with overdue fees, biggest balance first: unpaid tuition on bills past their due date
 * (late fines included) plus outstanding annual charges. Bills not yet due don't count, so the
 * list isn't the whole school on the 1st of the month. ?classId= and ?minMonths= narrow it.
 */
export async function GET(request: Request) {
  const session = await requireSession(STAFF);
  if (session instanceof NextResponse) return session;
  const locked = await requireFeature(session, 'defaulters');
  if (locked) return locked;
  const { schoolId } = session;

  const params = new URL(request.url).searchParams;
  const classId = params.get('classId');
  const minMonths = Math.max(0, parseInt(params.get('minMonths') || '0') || 0);

  try {
    const [fees, students, classes, { lateFine }] = await Promise.all([
      findAll<FeeVoucher>('fees', schoolId),
      findAll<Student>('students', schoolId),
      findAll<SchoolClass>('classes', schoolId),
      loadFeeSettings(schoolId),
    ]);
    const classNames = new Map(classes.map((c) => [String(c.id), `${c.name}${c.section ? ` - ${c.section}` : ''}`]));
    const vouchersOf = vouchersByStudent(fees);

    const now = new Date();
    const list: Defaulter[] = students
      .filter((s) => !classId || classId === 'all' || String(s.classId) === classId)
      .map((s) => {
        const { overdue, annualCharges, lastPayment } = studentDues(s, vouchersOf.get(String(s.id)) ?? [], lateFine, now);
        return {
          studentId: s.id,
          name: s.name,
          fatherName: s.fatherName,
          parentPhone: s.parentPhone,
          admissionNumber: s.admissionNumber,
          classId: s.classId,
          className: classNames.get(String(s.classId)) ?? 'Unassigned',
          left: isLeft(s),
          months: overdue.months,
          oldestUnpaid: overdue.oldest,
          tuition: overdue.tuition,
          fines: overdue.fines,
          annualCharges,
          total: overdue.tuition + annualCharges,
          lastPayment,
        };
      })
      .filter((d) => d.total > 0 && d.months >= minMonths)
      .sort((a, b) => b.total - a.total);

    return NextResponse.json(list, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error(`GET defaulters failed for ${schoolId}:`, err);
    return jsonError('Failed to load the defaulter list', 500);
  }
}
