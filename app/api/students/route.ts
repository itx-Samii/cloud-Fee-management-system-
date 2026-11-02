import { NextResponse } from 'next/server';
import { ADMIN, STAFF, hasFeature, requireFeature, requireSession } from '@/lib/auth';
import { audit, describeChanges, describeCharges, rupees } from '@/lib/audit';
import { getDb } from '@/lib/db';
import {
  countCurrentStudents,
  deleteRecord,
  findAll,
  findById,
  insertRecord,
  nothingReceived,
  toDbRow,
  toId,
  updateRecord,
} from '@/lib/dbHandler';
import { getLicense } from '@/lib/license';
import { chargesTotal, isLeft, parseCharges } from '@/lib/fees';
import { PHONE_PATTERN } from '@/lib/whatsapp';
import { jsonError, optionalNumber, readBody, toNumber, toText, withoutUndefined } from '@/lib/http';
import type { Charge, FeeVoucher, SchoolClass, Student } from '@/lib/types';

export const dynamic = 'force-dynamic';

const STATUSES = ['Active', 'Left'];

/**
 * ?id= returns one student; otherwise a page of students matching ?search=, ?classId= and
 * ?status=active|left (all by default).
 */
export async function GET(request: Request) {
  const session = await requireSession(STAFF);
  if (session instanceof NextResponse) return session;
  const { schoolId } = session;

  const params = new URL(request.url).searchParams;
  const page = Math.max(1, parseInt(params.get('page') || '1') || 1);
  const limit = Math.max(1, parseInt(params.get('limit') || '10') || 10);
  const search = params.get('search')?.toLowerCase() || '';
  const classId = params.get('classId') || 'all';
  const status = params.get('status')?.toLowerCase();
  const id = params.get('id');

  try {
    const [students, classes] = await Promise.all([
      findAll<Student>('students', schoolId),
      findAll<SchoolClass>('classes', schoolId),
    ]);
    const classNames = new Map(classes.map((c) => [String(c.id), `${c.name}${c.section ? ` - ${c.section}` : ''}`]));

    if (id) {
      const student = students.find((s) => String(s.id) === id);
      if (!student) return jsonError('Student not found', 404);
      return NextResponse.json({ ...student, className: classNames.get(String(student.classId)) ?? 'Unassigned' });
    }

    const filtered = students.filter((s) => {
      const matchesSearch = [s.name, s.fatherName, s.admissionNumber].some((v) =>
        String(v ?? '').toLowerCase().includes(search)
      );
      const matchesStatus = status === 'active' ? !isLeft(s) : status === 'left' ? isLeft(s) : true;
      return matchesSearch && matchesStatus && (classId === 'all' || String(s.classId) === classId);
    });

    const pageItems = filtered
      .slice((page - 1) * limit, page * limit)
      .map((s) => ({ ...s, className: classNames.get(String(s.classId)) ?? 'Unassigned' }));

    return NextResponse.json({
      total: filtered.length,
      page,
      limit,
      totalPages: Math.ceil(filtered.length / limit) || 1,
      students: pageItems,
      data: pageItems,
    });
  } catch (err) {
    console.error(`GET students failed for ${schoolId}:`, err);
    return jsonError('Failed to fetch students', 500);
  }
}

export async function POST(request: Request) {
  const session = await requireSession(ADMIN);
  if (session instanceof NextResponse) return session;
  const locked = await requireFeature(session, 'students');
  if (locked) return locked;
  const { schoolId } = session;

  const body = await readBody(request);
  const name = toText(body?.name);
  if (!body || !name) return jsonError('Student name is required', 400);
  const parentPhone = toText(body.parentPhone) || undefined;
  if (parentPhone && !PHONE_PATTERN.test(parentPhone)) return jsonError(`"${parentPhone}" is not a phone number`, 400);
  const monthlyCharges = parseCharges(body.monthlyCharges);
  if (typeof monthlyCharges === 'string') return jsonError(monthlyCharges, 400);
  const chargesLocked = monthlyCharges.length > 0 ? await requireFeature(session, 'charges') : null;
  if (chargesLocked) return chargesLocked;

  try {
    const [{ maxStudents }, current] = await Promise.all([getLicense(schoolId), countCurrentStudents(schoolId)]);
    if (current >= maxStudents) {
      return jsonError(
        `Student capacity reached (${maxStudents} max limit). Please contact Super Admin to upgrade your SaaS license.`,
        403
      );
    }

    const student = await insertRecord(
      'students',
      schoolId,
      withoutUndefined({
        name,
        fatherName: toText(body.fatherName),
        parentPhone,
        admissionNumber: toText(body.admissionNumber) || undefined,
        classId: toText(body.classId),
        monthlyFee: toNumber(body.monthlyFee),
        annualCharges: toNumber(body.annualCharges),
        discount: toNumber(body.discount),
        monthlyCharges,
        paidAnnualCharges: 0,
        status: toText(body.status) || 'Active',
        createdAt: new Date().toISOString(),
      })
    );
    await audit(session, 'student.add', `Added student ${name} (#${student.id}), monthly fee ${rupees(student.monthlyFee)}`);
    return NextResponse.json(student);
  } catch (err) {
    console.error(`POST student failed for ${schoolId}:`, err);
    return jsonError('Failed to create student', 500);
  }
}

// Accountants can edit students too: the Class-wise Tracking page lets them correct details.
export async function PUT(request: Request) {
  const session = await requireSession(STAFF);
  if (session instanceof NextResponse) return session;
  const { schoolId } = session;

  const body = await readBody(request);
  const id = toText(body?.id);
  if (!body || !id) return jsonError('ID is required', 400);

  const status = toText(body.status);
  if (status !== undefined && !STATUSES.includes(status)) return jsonError('Status must be Active or Left', 400);
  const parentPhone = toText(body.parentPhone);
  if (parentPhone && !PHONE_PATTERN.test(parentPhone)) return jsonError(`"${parentPhone}" is not a phone number`, 400);
  let monthlyCharges = body.monthlyCharges === undefined ? undefined : parseCharges(body.monthlyCharges);
  if (typeof monthlyCharges === 'string') return jsonError(monthlyCharges, 400);
  if (monthlyCharges !== undefined && !(await hasFeature(session, 'charges'))) {
    // Switched off: setting charges is refused, and an empty list leaves the stored ones alone.
    if (monthlyCharges.length > 0) return (await requireFeature(session, 'charges')) as NextResponse;
    monthlyCharges = undefined;
  }

  const changes = withoutUndefined({
    status,
    name: toText(body.name),
    fatherName: toText(body.fatherName),
    parentPhone,
    admissionNumber: toText(body.admissionNumber),
    classId: toText(body.classId),
    monthlyFee: optionalNumber(body.monthlyFee),
    discount: optionalNumber(body.discount),
    monthlyCharges,
    annualCharges: optionalNumber(body.annualCharges),
    paidAnnualCharges: optionalNumber(body.paidAnnualCharges),
  });

  try {
    const before = await findById<Student>('students', schoolId, id);
    if (!before) return jsonError('Student not found', 404);
    const now = new Date().toISOString();
    const leaving = status === 'Left' && !isLeft(before);
    const student = await updateRecord<Student>('students', schoolId, before.id, {
      ...changes,
      ...(leaving && { leftAt: now }),
      updatedAt: now,
    });
    if (!student) return jsonError('Student not found', 404);

    await syncUnpaidVouchers(schoolId, before, changes);
    const chargesBefore = describeCharges(before.monthlyCharges);
    const chargesNow = changes.monthlyCharges && describeCharges(changes.monthlyCharges);
    const changed = [
      describeChanges(before, changes, STUDENT_FIELDS),
      chargesNow && chargesNow !== chargesBefore ? `monthly charges ${chargesBefore} → ${chargesNow}` : '',
    ].filter(Boolean).join(', ');
    if (changed) await audit(session, 'student.edit', `Edited ${before.name} (#${before.id}): ${changed}`);
    return NextResponse.json(student);
  } catch (err) {
    console.error(`PUT student failed for ${schoolId}:`, err);
    return jsonError('Failed to update student', 500);
  }
}

const STUDENT_FIELDS = {
  status: 'status',
  name: 'name',
  fatherName: 'father name',
  parentPhone: 'parent phone',
  admissionNumber: 'admission no.',
  classId: 'class',
  monthlyFee: 'monthly fee',
  discount: 'discount',
  annualCharges: 'annual charges',
  paidAnnualCharges: 'annual charges paid',
};

/** Unpaid vouchers copy the student's details, fee and monthly charges, so carry edits over to them. */
async function syncUnpaidVouchers(schoolId: string, before: Student, changes: Partial<Student>) {
  const db = await getDb();
  const unpaid = db`school_id = ${schoolId} and student_id = ${toId(before.id) ?? 0} and status <> 'Paid'`;

  const details: Record<string, unknown> = withoutUndefined({
    studentName: changes.name,
    fatherName: changes.fatherName,
    admissionNumber: changes.admissionNumber,
    classId: changes.classId,
  });
  if (changes.classId !== undefined) {
    const cls = await findById<SchoolClass>('classes', schoolId, changes.classId);
    if (cls) details.className = `${cls.name}${cls.section ? ' - ' + cls.section : ''}`;
  }
  if (Object.keys(details).length > 0) {
    await db`update fees set ${db(toDbRow(db, 'fees', details, 'update'))} where ${unpaid}`;
  }

  const feeChanged = changes.monthlyFee !== undefined || changes.discount !== undefined;
  if (feeChanged) {
    const fee = db`coalesce(${changes.monthlyFee ?? null}::numeric, base_amount, 0)`;
    const discount = db`coalesce(${changes.discount ?? null}::numeric, discount, 0)`;
    const charges = db`coalesce((select sum((c->>'amount')::numeric) from jsonb_array_elements(charges) c), 0)`;
    await db`
      update fees set base_amount = ${fee}, discount = ${discount}, amount = greatest(0, ${fee} - ${discount}) + ${charges}
      where ${unpaid}`;
  }

  if (changes.monthlyCharges !== undefined) {
    // The old monthly charges come off (matched by name) and the new ones go on; one-off charges
    // such as an exam fee stay.
    const replaced = new Set([...(before.monthlyCharges ?? []), ...changes.monthlyCharges].map((c) => c.label.toLowerCase()));
    const vouchers = (await db`select id, amount, charges from fees where ${unpaid} and not is_ac_only`) as unknown as FeeVoucher[];
    for (const v of vouchers) {
      const kept = (v.charges ?? []).filter((c: Charge) => !replaced.has(c.label.toLowerCase()));
      const charges = [...kept, ...changes.monthlyCharges];
      const amount = Math.max(0, v.amount - chargesTotal(v.charges)) + chargesTotal(charges);
      await db`update fees set ${db(toDbRow(db, 'fees', { charges, amount }, 'update'))} where school_id = ${schoolId} and id = ${v.id}`;
    }
  }

  if (feeChanged || changes.monthlyCharges !== undefined) {
    // A lower fee may mean what was already paid now covers the month.
    await db`
      update fees set status = case
          when paid_tuition >= amount + coalesce(fine_charged, 0) then 'Paid'
          when paid_tuition + coalesce(paid_ac, 0) > 0 then 'Partially Paid'
          else 'Unpaid'
        end
      where ${unpaid} and paid_tuition is not null`;
  }
}

export async function DELETE(request: Request) {
  const session = await requireSession(ADMIN);
  if (session instanceof NextResponse) return session;
  const locked = await requireFeature(session, 'students');
  if (locked) return locked;
  const { schoolId } = session;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return jsonError('ID is required', 400);

  try {
    const student = await findById<Student>('students', schoolId, id);
    if (!student || !(await deleteRecord('students', schoolId, student.id))) return jsonError('Student not found', 404);

    // Vouchers with money on them carry the student's name and stay, so past income still adds up.
    const db = await getDb();
    const { count: removed } = await db`
      delete from fees where school_id = ${schoolId} and student_id = ${student.id} and ${nothingReceived(db)}`;
    await audit(session, 'student.delete', `Deleted student ${student.name} (#${student.id}) and ${removed} unpaid voucher(s)`);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`DELETE student failed for ${schoolId}:`, err);
    return jsonError('Failed to delete student', 500);
  }
}
