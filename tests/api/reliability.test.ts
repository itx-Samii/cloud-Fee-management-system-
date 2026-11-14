import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { POST as login, GET as whoAmI } from '@/app/api/auth/login/route';
import { POST as changePassword } from '@/app/api/auth/change-password/route';
import { POST as addUser, PUT as editUser, DELETE as deleteUser } from '@/app/api/users/route';
import { POST as addStudent, PUT as editStudent } from '@/app/api/students/route';
import { POST as generate, GET as fees, PUT as pay } from '@/app/api/fees/route';
import { GET as dashboard } from '@/app/api/dashboard/route';
import { DELETE as reversePayment } from '@/app/api/payments/route';
import { getDb } from '@/lib/db';
import { findById } from '@/lib/dbHandler';
import { SESSION_COOKIE } from '@/lib/session';
import type { FeeVoucher, Student } from '@/lib/types';
import { call, cookieStore, resetDatabase, SCHOOL, setSessionCookie, signInAs } from '../helpers';

beforeAll(resetDatabase);

async function billedStudent() {
  await signInAs('admin');
  const { data: student } = await call(addStudent, 'POST', '/api/students', { name: 'Reliability test', monthlyFee: 3000, annualCharges: 5000 });
  await call(generate, 'POST', '/api/fees', { month: 'October', year: '2026', studentIds: [student.id] });
  const { data } = await call(fees, 'GET', `/api/fees?studentId=${student.id}`);
  return { student, voucher: data[0] };
}

describe('staff session revocation', () => {
  it.each(['block', 'password', 'delete', 'rename'])('ends an existing staff session after %s', async (action) => {
    await signInAs('admin');
    const username = `cashier_${action}`;
    const user = (await call(addUser, 'POST', '/api/users', { username, password: 'Secret#123', displayName: 'Cashier' })).data.user;
    expect((await call(login, 'POST', '/api/auth/login', { username, password: 'Secret#123' })).status).toBe(200);
    const oldCookie = cookieStore.get(SESSION_COOKIE)!.value;
    await signInAs('admin');
    const result = action === 'delete'
      ? await call(deleteUser, 'DELETE', `/api/users?id=${user.id}`)
      : await call(editUser, 'PUT', '/api/users', { id: user.id, ...(action === 'block' ? { status: 'blocked' } : action === 'password' ? { password: 'Changed#123' } : { username: `${username}_new` }) });
    expect(result.status).toBe(200);
    setSessionCookie(oldCookie);
    expect((await call(whoAmI, 'GET', '/api/auth/login')).status).toBe(401);
    expect((await call(fees, 'GET', '/api/fees')).status).toBe(401);
  });

  it('ends other principal sessions after a password change', async () => {
    expect((await call(login, 'POST', '/api/auth/login', { username: 'admin', password: 'brookfield' })).status).toBe(200);
    const oldCookie = cookieStore.get(SESSION_COOKIE)!.value;
    expect((await call(changePassword, 'POST', '/api/auth/change-password', { oldPassword: 'brookfield', newPassword: 'Principal#456' })).status).toBe(200);
    setSessionCookie(oldCookie);
    expect((await call(whoAmI, 'GET', '/api/auth/login')).status).toBe(401);
    expect((await call(login, 'POST', '/api/auth/login', { username: 'admin', password: 'Principal#456' })).status).toBe(200);
  });
});

describe('payment retries', () => {
  it('issues an annual-charge-only receipt that can be reversed', async () => {
    const { student, voucher } = await billedStudent();
    const result = await call(pay, 'PUT', '/api/fees', { id: voucher.id, paidTuition: 0, paidAC: 500 });
    expect(result.status).toBe(200);
    expect((await findById<Student>('students', SCHOOL, student.id))?.paidAnnualCharges).toBe(500);
    expect((await findById<FeeVoucher>('fees', SCHOOL, voucher.id))?.paidTuition ?? 0).toBe(0);
    expect((await call(reversePayment, 'DELETE', `/api/payments?id=${result.data.receiptNo}`)).status).toBe(200);
    expect((await findById<Student>('students', SCHOOL, student.id))?.paidAnnualCharges).toBe(0);
  });

  it('returns one receipt for concurrent duplicates and a later retry', async () => {
    const { voucher } = await billedStudent();
    const body = { id: voucher.id, paidTuition: 500, paidAC: 200, requestId: randomUUID() };
    const [a, b] = await Promise.all([call(pay, 'PUT', '/api/fees', body), call(pay, 'PUT', '/api/fees', body)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.data.receiptNo).toBe(b.data.receiptNo);
    await signInAs('admin'); // A new session after a lost response must still find the original receipt.
    const again = await call(pay, 'PUT', '/api/fees', body);
    expect(again.data.receiptNo).toBe(a.data.receiptNo);
    expect(again.data.paidTuition).toBe(500);
    const db = await getDb();
    const [{ count }] = await db`select count(*) from payments where request_id = ${body.requestId}`;
    expect(count).toBe(1);
    expect((await call(pay, 'PUT', '/api/fees', { ...body, paidTuition: 600 })).status).toBe(400);
    expect((await call(reversePayment, 'DELETE', `/api/payments?id=${a.data.receiptNo}`)).status).toBe(200);
    expect((await call(pay, 'PUT', '/api/fees', body)).status).toBe(400);
  });

  it('requires a request ID for external payment callers', async () => {
    const { voucher } = await billedStudent();
    const result = await pay(new Request('http://localhost/api/fees', { method: 'PUT', body: JSON.stringify({ id: voucher.id, paidTuition: 100 }) }));
    expect(result.status).toBe(400);
  });
});

describe('transactional student edits and auditing', () => {
  it('rolls back fee reductions below money already received', async () => {
    const { student, voucher } = await billedStudent();
    await call(pay, 'PUT', '/api/fees', { id: voucher.id, paidTuition: 1000 });
    const result = await call(editStudent, 'PUT', '/api/students', { id: student.id, monthlyFee: 500 });
    expect(result.status).toBe(400);
    expect((await findById<Student>('students', SCHOOL, student.id))?.monthlyFee).toBe(3000);
    expect((await findById<FeeVoucher>('fees', SCHOOL, voucher.id))?.amount).toBe(3000);
  });

  it('rejects direct paid-balance changes and stale edits from another device', async () => {
    const { student } = await billedStudent();
    expect((await call(editStudent, 'PUT', '/api/students', { id: student.id, paidAnnualCharges: 5000 })).status).toBe(400);
    const request = { id: student.id, monthlyFee: 3100, expectedUpdatedAt: null };
    const results = await Promise.all([call(editStudent, 'PUT', '/api/students', request), call(editStudent, 'PUT', '/api/students', { ...request, monthlyFee: 3200 })]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });

  it('rolls back a payment and a student edit if their audit insert fails', async () => {
    const { student, voucher } = await billedStudent();
    const db = await getDb();
    await db.unsafe(`create function reject_test_audit() returns trigger language plpgsql as $$ begin raise exception 'test audit unavailable'; end; $$;
      create trigger reject_test_audit before insert on audit_log for each row execute function reject_test_audit();`).simple();
    try {
      expect((await call(pay, 'PUT', '/api/fees', { id: voucher.id, paidTuition: 200 })).status).toBe(500);
      expect((await findById<FeeVoucher>('fees', SCHOOL, voucher.id))?.paidTuition ?? 0).toBe(0);
      expect((await call(editStudent, 'PUT', '/api/students', { id: student.id, monthlyFee: 3500 })).status).toBe(500);
      expect((await findById<Student>('students', SCHOOL, student.id))?.monthlyFee).toBe(3000);
      expect((await findById<FeeVoucher>('fees', SCHOOL, voucher.id))?.amount).toBe(3000);
    } finally {
      await db.unsafe('drop trigger reject_test_audit on audit_log; drop function reject_test_audit();').simple();
    }
  });

  it('limits dashboard data to principals and the current school', async () => {
    await signInAs('accountant');
    expect((await call(dashboard, 'GET', '/api/dashboard')).status).toBe(403);
    await signInAs('admin', 'school_empty');
    const result = await call(dashboard, 'GET', '/api/dashboard');
    expect(result.status).toBe(200);
    expect(result.data.students).toEqual([]);
    expect(result.data.payments).toEqual([]);
  });
});
