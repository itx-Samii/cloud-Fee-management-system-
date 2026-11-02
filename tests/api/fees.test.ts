import { beforeAll, describe, expect, it } from 'vitest';
import { DELETE as deleteStudent, PUT as editStudent, POST as addStudent } from '@/app/api/students/route';
import { DELETE as deleteVoucher, GET as listFees, POST as generate, PUT as pay } from '@/app/api/fees/route';
import { GET as cashBook } from '@/app/api/payments/route';
import { GET as activityLog } from '@/app/api/admin/audit/route';
import { findById } from '@/lib/dbHandler';
import type { Student } from '@/lib/types';
import { OTHER_SCHOOL, SCHOOL, call, insertRaw, resetDatabase, signInAs, todayRange } from '../helpers';

beforeAll(resetDatabase);

let nextName = 1;

/** A new student (fee 3000, annual charges 5000) billed for one month; returns both. */
async function billedStudent(month = 'October') {
  signInAs('admin');
  const student = (
    await call(addStudent, 'POST', '/api/students', {
      name: `Student ${nextName++}`,
      fatherName: 'Father',
      classId: '1',
      monthlyFee: 3000,
      annualCharges: 5000,
    })
  ).data;
  await call(generate, 'POST', '/api/fees', { month, year: '2026', studentIds: [student.id] });
  const vouchers = (await call(listFees, 'GET', `/api/fees?studentId=${student.id}&month=${month}`)).data;
  return { student, voucher: vouchers[0] };
}

const voucherById = async (id: unknown) => (await call(listFees, 'GET', `/api/fees?id=${id}`)).data[0];
const studentDoc = (id: number) => findById<Student>('students', SCHOOL, id);

describe('vouchers', () => {
  it('bills once even when two generate requests arrive together', async () => {
    signInAs('admin');
    const student = (await call(addStudent, 'POST', '/api/students', { name: `Student ${nextName++}`, classId: '1', monthlyFee: 3000 })).data;
    const both = await Promise.all(
      [1, 2].map(() => call(generate, 'POST', '/api/fees', { month: 'November', year: '2026', studentIds: [student.id] }))
    );
    expect(both.map((r) => r.status)).toEqual([200, 200]);
    expect(both.map((r) => r.data.count).sort()).toEqual([0, 1]);
    expect((await call(listFees, 'GET', `/api/fees?studentId=${student.id}`)).data).toHaveLength(1);
  });

  it('bills a student only once per month', async () => {
    const { student, voucher } = await billedStudent();
    expect(voucher).toMatchObject({ amount: 3000, status: 'Unpaid', remainingAnnualCharges: 5000 });
    const again = await call(generate, 'POST', '/api/fees', { month: 'October', year: '2026', studentIds: [student.id] });
    expect(again.data.count).toBe(0);
  });
});

describe('receiving payments', () => {
  it('issues a numbered receipt for every payment and settles the voucher', async () => {
    const { student, voucher } = await billedStudent();
    signInAs('accountant');

    const first = await call(pay, 'PUT', '/api/fees', { id: voucher.id, paidTuition: 1000, paidAC: 0 });
    expect(first.status).toBe(200);
    expect(first.data.status).toBe('Partially Paid');

    const second = await call(pay, 'PUT', '/api/fees', { id: voucher.id, paidTuition: 2000, paidAC: 5000 });
    expect(second.data).toMatchObject({ status: 'Paid', totalReceived: 8000, receivedBy: 'Test accountant' });
    expect(Number(second.data.receiptNo)).toBe(Number(first.data.receiptNo) + 1);
    expect((await studentDoc(student.id))?.paidAnnualCharges).toBe(5000);

    const receipts = (await call(cashBook, 'GET', `/api/payments?${todayRange()}`)).data.filter(
      (r: any) => r.voucherId === voucher.id
    );
    expect(receipts.map((r: any) => r.amount)).toEqual([1000, 7000]);
    expect(receipts.every((r: any) => r.receivedBy === 'cashier1')).toBe(true);
  });

  it('refuses zero and negative amounts', async () => {
    const { voucher } = await billedStudent();
    expect((await call(pay, 'PUT', '/api/fees', { id: voucher.id, paidTuition: 0, paidAC: 0 })).status).toBe(400);
    expect((await call(pay, 'PUT', '/api/fees', { id: voucher.id, paidTuition: -500, paidAC: 0 })).status).toBe(400);
  });

  it('counts every payment when several arrive at the same moment', async () => {
    const { voucher } = await billedStudent();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => call(pay, 'PUT', '/api/fees', { id: voucher.id, paidTuition: 100, paidAC: 0 }))
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(new Set(results.map((r) => r.data.receiptNo)).size).toBe(5);
    expect((await voucherById(voucher.id)).totalReceived).toBe(500);
  });

  it('logs each payment with its receipt number', async () => {
    const { voucher } = await billedStudent();
    const paid = await call(pay, 'PUT', '/api/fees', { id: voucher.id, paidTuition: 3000, paidAC: 0 });
    signInAs('admin');
    const log = await call(activityLog, 'GET', '/api/admin/audit?type=payment');
    expect(log.data[0].summary).toContain(`receipt #${paid.data.receiptNo}`);
    expect(log.data[0].summary).toContain('Rs. 3,000');
  });
});

describe('reversing vouchers', () => {
  it('lets only the principal reverse a voucher that has money on it', async () => {
    const { student, voucher } = await billedStudent();
    signInAs('accountant');
    await call(pay, 'PUT', '/api/fees', { id: voucher.id, paidTuition: 3000, paidAC: 2000 });

    const refused = await call(deleteVoucher, 'DELETE', `/api/fees?id=${voucher.id}`);
    expect(refused.status).toBe(403);
    expect(await voucherById(voucher.id)).toBeDefined();

    signInAs('admin');
    expect((await call(deleteVoucher, 'DELETE', `/api/fees?id=${voucher.id}`)).status).toBe(200);
    expect(await voucherById(voucher.id)).toBeUndefined();
    // Annual charges paid through it are owed again, and its receipt stays on file marked reversed.
    expect((await studentDoc(student.id))?.paidAnnualCharges).toBe(0);
    const receipt = (await call(cashBook, 'GET', `/api/payments?${todayRange()}`)).data.find((r: any) => r.voucherId === voucher.id);
    expect(receipt.reversedAt).toBeTruthy();
    expect(receipt.reversedBy).toBe('admin');

    const log = await call(activityLog, 'GET', '/api/admin/audit?type=voucher');
    expect(log.data[0].summary).toMatch(/^Reversed voucher #\d+ .*Rs\. 5,000 taken back$/);
  });

  it('lets accountants delete a voucher nothing was paid on', async () => {
    const { voucher } = await billedStudent();
    signInAs('accountant');
    expect((await call(deleteVoucher, 'DELETE', `/api/fees?id=${voucher.id}`)).status).toBe(200);
    expect(await voucherById(voucher.id)).toBeUndefined();
  });
});

describe('student changes', () => {
  it('keeps paid vouchers when a student is deleted, so past income still adds up', async () => {
    const { student, voucher: paid } = await billedStudent('September');
    await call(generate, 'POST', '/api/fees', { month: 'October', year: '2026', studentIds: [student.id] });
    const [unpaid] = (await call(listFees, 'GET', `/api/fees?studentId=${student.id}&month=October`)).data;
    await call(pay, 'PUT', '/api/fees', { id: paid.id, paidTuition: 3000, paidAC: 0 });

    expect((await call(deleteStudent, 'DELETE', `/api/students?id=${student.id}`)).status).toBe(200);
    expect((await voucherById(paid.id))?.totalReceived).toBe(3000);
    expect(await voucherById(unpaid.id)).toBeUndefined();
  });

  it('carries a fee change over to unpaid vouchers and logs old and new values', async () => {
    const { student, voucher } = await billedStudent();
    signInAs('accountant');
    await call(editStudent, 'PUT', '/api/students', { id: student.id, monthlyFee: 2500 });
    expect((await voucherById(voucher.id)).amount).toBe(2500);

    signInAs('admin');
    const log = await call(activityLog, 'GET', '/api/admin/audit?type=student');
    expect(log.data[0]).toMatchObject({ username: 'cashier1', action: 'student.edit' });
    expect(log.data[0].summary).toContain('monthly fee 3000 → 2500');
  });
});

describe('school separation', () => {
  it("never shows or touches another school's receipts and vouchers", async () => {
    await insertRaw('payments', {
      id: 999999, schoolId: OTHER_SCHOOL, voucherId: 1, amount: 50000, paidTuition: 50000, paidAC: 0,
      receivedAt: new Date().toISOString(), receivedBy: 'someone',
    });
    await insertRaw('fees', { id: 888888, schoolId: OTHER_SCHOOL, studentId: 1, month: 'October', year: '2026', amount: 100, status: 'Unpaid' });

    signInAs('admin');
    const receipts = (await call(cashBook, 'GET', `/api/payments?${todayRange()}`)).data;
    expect(receipts.some((r: any) => r.id === 999999)).toBe(false);
    expect((await call(pay, 'PUT', '/api/fees', { id: 888888, paidTuition: 100, paidAC: 0 })).status).toBe(404);
    expect((await call(deleteVoucher, 'DELETE', '/api/fees?id=888888')).status).toBe(404);
  });

  it('rejects a cash book request without a valid date range', async () => {
    signInAs('accountant');
    expect((await call(cashBook, 'GET', '/api/payments')).status).toBe(400);
    expect((await call(cashBook, 'GET', '/api/payments?from=2026-01-01&to=2028-01-01')).status).toBe(400);
  });
});
