import { NextResponse } from 'next/server';
import { ADMIN, requireFeature, requireSession } from '@/lib/auth';
import { audit, describeChanges, rupees } from '@/lib/audit';
import { deleteRecord, findAll, findById, insertRecord, updateRecord } from '@/lib/dbHandler';
import { jsonError, optionalNumber, readBody, toNumber, toText, withoutUndefined } from '@/lib/http';
import type { StaffMember } from '@/lib/types';

export async function GET() {
  const session = await requireSession(ADMIN);
  if (session instanceof NextResponse) return session;

  try {
    return NextResponse.json(await findAll<StaffMember>('staff', session.schoolId));
  } catch (err) {
    console.error(`GET staff failed for ${session.schoolId}:`, err);
    return jsonError('Failed to fetch staff', 500);
  }
}

export async function POST(request: Request) {
  const session = await requireSession(ADMIN);
  if (session instanceof NextResponse) return session;
  const locked = await requireFeature(session, 'salaries');
  if (locked) return locked;

  const body = await readBody(request);
  const name = toText(body?.name);
  if (!body || !name) return jsonError('Staff name is required', 400);

  try {
    const member = await insertRecord('staff', session.schoolId, {
      name,
      designation: toText(body.designation) ?? '',
      salary: toNumber(body.salary),
      deductionPerOff: toNumber(body.deductionPerOff),
      joinedDate: toText(body.joinedDate) || new Date().toISOString(),
      status: 'Active',
    });
    await audit(session, 'staff.add', `Added staff member ${name}, salary ${rupees(member.salary)}`);
    return NextResponse.json(member);
  } catch (err) {
    console.error(`POST staff failed for ${session.schoolId}:`, err);
    return jsonError('Failed to add staff', 500);
  }
}

export async function PUT(request: Request) {
  const session = await requireSession(ADMIN);
  if (session instanceof NextResponse) return session;
  const locked = await requireFeature(session, 'salaries');
  if (locked) return locked;

  const body = await readBody(request);
  const id = toText(body?.id);
  if (!body || !id) return jsonError('ID is required', 400);

  const changes = withoutUndefined({
    name: toText(body.name) || undefined,
    designation: toText(body.designation),
    salary: optionalNumber(body.salary),
    deductionPerOff: optionalNumber(body.deductionPerOff),
    joinedDate: toText(body.joinedDate) || undefined,
    status: toText(body.status) || undefined,
  });

  try {
    const before = await findById<StaffMember>('staff', session.schoolId, id);
    const member = before && (await updateRecord<StaffMember>('staff', session.schoolId, before.id, changes));
    if (!before || !member) return jsonError('Staff not found', 404);

    const changed = describeChanges(before, changes, {
      name: 'name',
      designation: 'designation',
      salary: 'salary',
      deductionPerOff: 'deduction per off',
      status: 'status',
    });
    if (changed) await audit(session, 'staff.edit', `Edited ${before.name}: ${changed}`);
    return NextResponse.json(member);
  } catch (err) {
    console.error(`PUT staff failed for ${session.schoolId}:`, err);
    return jsonError('Failed to update staff', 500);
  }
}

export async function DELETE(request: Request) {
  const session = await requireSession(ADMIN);
  if (session instanceof NextResponse) return session;
  const locked = await requireFeature(session, 'salaries');
  if (locked) return locked;
  const { schoolId } = session;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return jsonError('ID is required', 400);

  try {
    const member = await findById<StaffMember>('staff', schoolId, id);
    if (!member || !(await deleteRecord('staff', schoolId, member.id))) return jsonError('Staff not found', 404);

    // Salaries already paid stay in the books (each record keeps the name), so past expenses don't change.
    await audit(session, 'staff.delete', `Removed staff member ${member.name}`);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`DELETE staff failed for ${schoolId}:`, err);
    return jsonError('Failed to delete staff', 500);
  }
}
