import { NextResponse } from 'next/server';
import { STAFF, requireFeature, requireSession } from '@/lib/auth';
import { findAll } from '@/lib/dbHandler';
import { isLeft, studentDues, vouchersByStudent } from '@/lib/fees';
import { loadFeeSettings } from '@/lib/ledger';
import { jsonError } from '@/lib/http';
import { samePhone } from '@/lib/whatsapp';
import type { FamilyMember, FeeVoucher, SchoolClass, Student } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * The student's family: every student with the same parent phone number (the student included),
 * with what each owes today and the family total. A student without a phone is a family of one.
 */
export async function GET(request: Request) {
  const session = await requireSession(STAFF);
  if (session instanceof NextResponse) return session;
  const locked = await requireFeature(session, 'studentLedger');
  if (locked) return locked;
  const { schoolId } = session;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return jsonError('Student ID is required', 400);

  try {
    const [students, classes, { lateFine }] = await Promise.all([
      findAll<Student>('students', schoolId),
      findAll<SchoolClass>('classes', schoolId),
      loadFeeSettings(schoolId),
    ]);
    const student = students.find((s) => String(s.id) === id);
    if (!student) return jsonError('Student not found', 404);

    const family = students.filter((s) => s === student || samePhone(s.parentPhone, student.parentPhone));
    const fees = await findAll<FeeVoucher>('fees', schoolId, { studentId: family.map((s) => s.id) });
    const vouchersOf = vouchersByStudent(fees);
    const classNames = new Map(classes.map((c) => [String(c.id), `${c.name}${c.section ? ` - ${c.section}` : ''}`]));

    const members: FamilyMember[] = family.map((s) => ({
      studentId: s.id,
      name: s.name,
      className: classNames.get(String(s.classId)) ?? 'Unassigned',
      left: isLeft(s),
      balance: studentDues(s, vouchersOf.get(String(s.id)) ?? [], lateFine).totalNow,
    }));
    return NextResponse.json(
      { phone: student.parentPhone ?? null, members, total: members.reduce((sum, m) => sum + m.balance, 0) },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error(`GET family failed for ${schoolId}:`, err);
    return jsonError('Failed to load the family', 500);
  }
}
