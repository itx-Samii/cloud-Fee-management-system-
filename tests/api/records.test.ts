import { beforeAll, describe, expect, it } from 'vitest';
import { DELETE as removeStaff, POST as addStaff } from '@/app/api/staff/route';
import { DELETE as reverseSalary, GET as listSalaries, POST as paySalary } from '@/app/api/salaries/route';
import { DELETE as deleteExpense, POST as addExpense } from '@/app/api/expenses/route';
import { DELETE as deleteStudent, GET as listStudents, POST as addStudent } from '@/app/api/students/route';
import { DELETE as deleteVoucher } from '@/app/api/fees/route';
import { GET as backup } from '@/app/api/admin/backup/route';
import { POST as restore } from '@/app/api/admin/restore/route';
import { GET as activityLog } from '@/app/api/admin/audit/route';
import { GET as health } from '@/app/api/health/route';
import { OTHER_SCHOOL, SCHOOL, call, countRows, insertRaw, resetDatabase, signInAs } from '../helpers';

beforeAll(resetDatabase);

describe('payroll', () => {
  it('pays a salary once per month and shows it only in that month', async () => {
    signInAs('admin');
    const member = (await call(addStaff, 'POST', '/api/staff', { name: 'Sana Teacher', salary: 25000, deductionPerOff: 500 })).data;

    const pay = (month: string) => call(paySalary, 'POST', '/api/salaries', { staffId: member.id, month, year: '2026', amount: 25000 });
    expect((await pay('September')).status).toBe(200);
    expect((await pay('September')).status).toBe(400);
    expect((await pay('October')).status).toBe(200);

    const september = (await call(listSalaries, 'GET', '/api/salaries?month=September&year=2026')).data;
    expect(september.filter((s: any) => s.staffId === member.id)).toHaveLength(1);
  });

  it('keeps salaries already paid when a staff member is removed', async () => {
    signInAs('admin');
    const member = (await call(addStaff, 'POST', '/api/staff', { name: 'Leaving Teacher', salary: 20000 })).data;
    await call(paySalary, 'POST', '/api/salaries', { staffId: member.id, month: 'October', year: '2026', amount: 20000 });
    await call(addExpense, 'POST', '/api/expenses', { category: 'Salary', amount: 1500, description: 'Bonus for Leaving Teacher' });

    expect((await call(removeStaff, 'DELETE', `/api/staff?id=${member.id}`)).status).toBe(200);
    const history = (await call(listSalaries, 'GET', '/api/salaries')).data;
    expect(history.some((s: any) => s.staffName === 'Leaving Teacher')).toBe(true);
    expect(await countRows('expenses', { description: 'Bonus for Leaving Teacher' })).toBe(1);
  });

  it('logs salary reversals and expense deletions', async () => {
    signInAs('admin');
    const member = (await call(addStaff, 'POST', '/api/staff', { name: 'Audit Teacher', salary: 18000 })).data;
    const salary = (await call(paySalary, 'POST', '/api/salaries', { staffId: member.id, month: 'August', year: '2026', amount: 18000 })).data;
    const expense = (await call(addExpense, 'POST', '/api/expenses', { category: 'Internet', amount: 4000, description: 'October bill' })).data;

    signInAs('accountant');
    expect((await call(deleteExpense, 'DELETE', `/api/expenses?id=${expense.id}`)).status).toBe(200);
    signInAs('admin');
    expect((await call(reverseSalary, 'DELETE', `/api/salaries?id=${salary.id}`)).status).toBe(200);

    const log = (await call(activityLog, 'GET', '/api/admin/audit')).data;
    expect(log[0].summary).toBe('Reversed Rs. 18,000 salary of Audit Teacher for August 2026');
    expect(log[1]).toMatchObject({ username: 'cashier1', summary: expect.stringContaining('Deleted Internet expense of Rs. 4,000') });
  });
});

describe('school separation', () => {
  it("never lists or deletes another school's students", async () => {
    await insertRaw('students', { id: 777777, schoolId: OTHER_SCHOOL, name: 'Other School Kid' });
    signInAs('admin');
    const list = (await call(listStudents, 'GET', '/api/students?limit=1000')).data.students;
    expect(list.some((s: any) => s.name === 'Other School Kid')).toBe(false);
    expect((await call(deleteStudent, 'DELETE', '/api/students?id=777777')).status).toBe(404);
  });
});

describe('backup and restore', () => {
  it('restores a backup of the same school, receipts included', async () => {
    signInAs('admin');
    const file = (await call(backup, 'GET', '/api/admin/backup')).data;
    expect(file).toMatchObject({ system: 'School Pay ERP', schoolId: SCHOOL });
    expect(Object.keys(file.data)).toContain('payments');
    expect(file.config).not.toHaveProperty('adminPassword');

    const res = await call(restore, 'POST', '/api/admin/restore', file);
    expect(res.status).toBe(200);
  });

  it("refuses a backup that belongs to a different school", async () => {
    signInAs('admin');
    const res = await call(restore, 'POST', '/api/admin/restore', { system: 'School Pay ERP', schoolId: OTHER_SCHOOL, data: { students: [] } });
    expect(res.status).toBe(400);
  });

  it('refuses unknown or damaged sections before changing anything', async () => {
    signInAs('admin');
    const unknown = await call(restore, 'POST', '/api/admin/restore', { system: 'School Pay ERP', data: { licenses: [] } });
    expect(unknown.status).toBe(400);
    const damaged = await call(restore, 'POST', '/api/admin/restore', { system: 'School Pay ERP', data: { students: 'oops' } });
    expect(damaged.status).toBe(400);
    const twice = await call(restore, 'POST', '/api/admin/restore', {
      system: 'School Pay ERP',
      data: { students: [{ id: 5, name: 'A' }, { id: '5', name: 'B' }] },
    });
    expect(twice).toMatchObject({ status: 400, data: { error: 'Section "students" has two records with id 5' } });
  });

  it('reads a backup made by the MongoDB version: text ids, Mongo _id and leftover fields', async () => {
    signInAs('admin');
    const res = await call(restore, 'POST', '/api/admin/restore', {
      system: 'School Pay ERP',
      schoolId: SCHOOL,
      data: {
        students: [{ _id: '6720f1c2a1b2c3d4e5f60718', id: '41', name: 'Old Kid', classId: '3', monthlyFee: '2,500', status: 'Active', paidAnnualCharges: 0 }],
        fees: [{
          id: 90, studentId: '41', studentName: 'Old Kid', month: 'May', year: 2026, amount: '2500', status: 'Paid',
          paidTuition: 2500, paidAC: 0, totalReceived: 2500, remainingAnnualCharges: 0, previousArrears: 0,
        }, {
          id: 91, studentId: '41', studentName: 'Old Kid', month: 'June', year: '2026', amount: 2500, status: 'Unpaid', paidTuition: 0,
        }],
        // Taken against June but spent on May's arrears: only its allocations mention voucher 90.
        payments: [{
          id: 7, voucherId: '91', studentId: '41', amount: 2500, paidTuition: 2500, paidAC: 0,
          receivedAt: '2026-06-03T10:00:00.000Z', receivedBy: 'admin',
          allocations: [{ voucherId: '90', month: 'May', year: '2026', amount: 2500 }, { voucherId: '91', month: 'June', year: '2026', amount: 0 }],
        }],
      },
    });
    expect(res.status).toBe(200);

    const student = (await call(listStudents, 'GET', '/api/students?id=41')).data;
    expect(student).toMatchObject({ id: 41, name: 'Old Kid', classId: 3, monthlyFee: 2500 });
    expect(student).not.toHaveProperty('_id');
    // New records carry on after the restored ids.
    const next = (await call(addStudent, 'POST', '/api/students', { name: 'New Kid', classId: '3', monthlyFee: 1000 })).data;
    expect(next.id).toBe(42);
    // The old receipt is still found through its allocations, so the voucher reverses cleanly.
    expect((await call(deleteVoucher, 'DELETE', '/api/fees?id=90')).data).toMatchObject({ success: true, takenBack: 2500, receipts: 1 });
  });

  it('leaves the data exactly as it was when a restore fails part-way', async () => {
    signInAs('admin');
    const before = (await call(listStudents, 'GET', '/api/students?limit=1000')).data.total;
    const res = await call(restore, 'POST', '/api/admin/restore', {
      system: 'School Pay ERP',
      data: {
        students: [{ id: 1, name: 'Only Student' }],
        // Two logins with one username: the database refuses the second, after students went in.
        users: [
          { id: 1, username: 'twin.login', password: 'x:y', displayName: 'One' },
          { id: 2, username: 'twin.login', password: 'x:y', displayName: 'Two' },
        ],
      },
    });
    expect(res.status).toBe(500);
    expect((await call(listStudents, 'GET', '/api/students?limit=1000')).data.total).toBe(before);
  });
});

describe('health check', () => {
  it('reports that the database is reachable', async () => {
    const res = await call(health, 'GET', '/api/health');
    expect(res).toMatchObject({ status: 200, data: { status: 'ok', database: 'ok' } });
  });
});
