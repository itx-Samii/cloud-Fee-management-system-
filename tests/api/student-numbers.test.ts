import { beforeEach, describe, expect, it } from 'vitest';
import { GET as listStudents, POST as addStudent, PUT as editStudent, DELETE as deleteStudent } from '@/app/api/students/route';
import { POST as importStudents } from '@/app/api/students/import/route';
import { POST as addClass } from '@/app/api/classes/route';
import { POST as promote, DELETE as undo } from '@/app/api/promotion/route';
import { getDb, transaction } from '@/lib/db';
import { SCHEMA_SQL } from '@/lib/schema';
import { call, OTHER_SCHOOL, resetDatabase, SCHOOL, signInAs } from '../helpers';

beforeEach(async () => {
  await resetDatabase();
  await signInAs('admin');
});

const section = async (section: string) => {
  const response = await call(addClass, 'POST', '/api/classes', { name: '5th', section });
  expect(response.status).toBe(200);
  return Number(response.data.id);
};

const register = (name: string, classId?: number, admissionNumber?: string) =>
  call(addStudent, 'POST', '/api/students', { name, classId, admissionNumber });

const student = async (id: number) => (await call(listStudents, 'GET', `/api/students?id=${id}`)).data;

describe('student numbering', () => {
  it('issues admission numbers once per school and independent rolls per section, even on simultaneous saves', async () => {
    const a = await section('A');
    const b = await section('B');
    const results = await Promise.all([register('Ali', a, 'MANUAL'), register('Sara', a), register('Noor', b)]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(results.map((r) => r.data.admissionNumber).sort()).toEqual(['ADM-00001', 'ADM-00002', 'ADM-00003']);
    expect(results.slice(0, 2).map((r) => r.data.rollNumber).sort()).toEqual([1, 2]);
    expect(results[2].data.rollNumber).toBe(1);
    const list = await call(listStudents, 'GET', `/api/students?classId=${a}`);
    expect(list.data.students.map((s: { rollNumber: number }) => s.rollNumber)).toEqual([1, 2]);
    await signInAs('admin', OTHER_SCHOOL);
    const otherClass = await section('A');
    expect((await register('Other school', otherClass)).data).toMatchObject({ admissionNumber: 'ADM-00001', rollNumber: 1 });
  });

  it('keeps admission numbers through transfers and never reuses a deleted roll', async () => {
    const a = await section('A');
    const b = await section('B');
    const first = (await register('First', a)).data;
    const second = (await register('Second', a)).data;
    const waiting = (await register('Waiting')).data;
    expect(waiting.rollNumber).toBeUndefined();
    expect((await call(deleteStudent, 'DELETE', `/api/students?id=${second.id}`)).status).toBe(200);
    const assigned = await call(editStudent, 'PUT', '/api/students', { id: waiting.id, classId: a });
    expect(assigned.data).toMatchObject({ admissionNumber: waiting.admissionNumber, rollNumber: 3 });
    const moved = await call(editStudent, 'PUT', '/api/students', { id: first.id, classId: b, admissionNumber: 'CHANGED' });
    expect(moved.data).toMatchObject({ admissionNumber: first.admissionNumber, rollNumber: 1, classId: b });
    const edited = await call(editStudent, 'PUT', '/api/students', { id: first.id, classId: b, name: 'Renamed' });
    expect(edited.data.rollNumber).toBe(1);
  });

  it('preserves imported numbers and reserves them before numbering blank CSV rows', async () => {
    const a = await section('A');
    const response = await call(importStudents, 'POST', '/api/students/import', { rows: [
      { name: 'Blank admission', className: '5th', section: 'A' },
      { name: 'Existing admission', className: '5th', section: 'A', admissionNumber: 'ADM-00020' },
    ] });
    expect(response.status).toBe(200);
    const result = (await call(listStudents, 'GET', `/api/students?classId=${a}`)).data.students;
    expect(result).toMatchObject([
      { name: 'Blank admission', admissionNumber: 'ADM-00021', rollNumber: 1 },
      { name: 'Existing admission', admissionNumber: 'ADM-00020', rollNumber: 2 },
    ]);
    expect((await register('Next', a)).data).toMatchObject({ admissionNumber: 'ADM-00022', rollNumber: 3 });
  });

  it('keeps admission identity and assigns destination rolls on promotion and undo', async () => {
    const a = await section('A');
    const b = await section('B');
    const promoted = (await register('Promoted', a)).data;
    await register('Already in B', b);
    const result = await call(promote, 'POST', '/api/promotion', {
      token: 'none', steps: [{ fromClassId: a, to: b, fee: { mode: 'keep' } }],
    });
    expect(result.status).toBe(200);
    expect(await student(promoted.id)).toMatchObject({ admissionNumber: promoted.admissionNumber, classId: b, rollNumber: 2 });
    expect((await call(undo, 'DELETE', `/api/promotion?id=${result.data.id}`)).status).toBe(200);
    expect(await student(promoted.id)).toMatchObject({ admissionNumber: promoted.admissionNumber, classId: a, rollNumber: 2 });
  });

  it('fills missing numbers on upgrade and preserves existing numbers across subsequent starts', async () => {
    const a = await section('A');
    await transaction(async (tx) => {
      await tx`alter table students disable trigger students_assign_numbers`;
      await tx`insert into students (school_id, id, name, class_id, admission_number) values
        (${SCHOOL}, 10, 'Legacy', ${a}, 'ADM-00009'),
        (${SCHOOL}, 11, 'Missing', ${a}, null)`;
      await tx`alter table students enable trigger students_assign_numbers`;
    });
    const db = await getDb();
    await db.unsafe(SCHEMA_SQL).simple();
    expect(await student(10)).toMatchObject({ admissionNumber: 'ADM-00009', rollNumber: 1 });
    expect(await student(11)).toMatchObject({ admissionNumber: 'ADM-00010', rollNumber: 2 });
    await db.unsafe(SCHEMA_SQL).simple();
    expect((await register('New', a)).data).toMatchObject({ admissionNumber: 'ADM-00011', rollNumber: 3 });
  });
});
