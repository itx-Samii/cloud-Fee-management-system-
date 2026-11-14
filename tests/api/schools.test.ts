import { beforeAll, describe, expect, it } from 'vitest';
import { DELETE as deleteClient, GET as listClients, POST as addClient, PUT as editClient } from '@/app/api/superadmin/clients/route';
import { POST as login } from '@/app/api/auth/login/route';
import { GET as listStudents, POST as addStudent, PUT as editStudent } from '@/app/api/students/route';
import { GET as license } from '@/app/api/admin/license/route';
import { GET as listFees, PATCH as setCharges, POST as generate, PUT as pay } from '@/app/api/fees/route';
import { GET as getSettings, PUT as saveSettings } from '@/app/api/settings/route';
import { GET as receipts } from '@/app/api/payments/route';
import { GET as defaulters } from '@/app/api/defaulters/route';
import { GET as activityLog } from '@/app/api/admin/audit/route';
import { GET as family } from '@/app/api/students/family/route';
import { POST as importStudents } from '@/app/api/students/import/route';
import { POST as addExpense } from '@/app/api/expenses/route';
import { call, resetDatabase, signInAs, signOut, todayRange } from '../helpers';

beforeAll(resetDatabase);

const superAdmin = () => signInAs('superadmin', 'master', 'superadmin');
const NEW_SCHOOL = { clientName: 'Green Valley School', licenseKey: 'GV-2026-0001', adminUsername: 'gvprincipal', adminPassword: 'Valley#2026', maxStudents: 2 };

describe('schools (Super Admin)', () => {
  it('signs the Super Admin in with the password from the environment the first time', async () => {
    signOut();
    const res = await call(login, 'POST', '/api/auth/login', { username: 'superadmin', password: 'Super#Secret2026' });
    expect(res).toMatchObject({ status: 200, data: { user: { role: 'superadmin', schoolId: 'master' } } });
  });

  it('lists Brook Field on a fresh install', async () => {
    await superAdmin();
    const clients = (await call(listClients, 'GET', '/api/superadmin/clients')).data;
    expect(clients).toEqual([expect.objectContaining({ schoolId: 'school_brookfield', status: 'active', maxStudents: 1000, currentStudents: 0 })]);
    expect(clients[0].features).toMatchObject({ collection: true, reports: true });
  });

  it('creates a school whose principal can sign in to it', async () => {
    await superAdmin();
    const created = await call(addClient, 'POST', '/api/superadmin/clients', NEW_SCHOOL);
    expect(created.status).toBe(200);
    const schoolId = created.data.client.schoolId;
    expect(schoolId).toMatch(/^school_green_valley_school_[0-9a-f]{6}$/);

    expect((await call(addClient, 'POST', '/api/superadmin/clients', { ...NEW_SCHOOL, adminUsername: 'other.name' })).data.error).toBe('License key already exists');
    expect((await call(addClient, 'POST', '/api/superadmin/clients', { ...NEW_SCHOOL, licenseKey: 'GV-2' })).data.error).toBe('Principal Login Username is already taken');

    signOut();
    const res = await call(login, 'POST', '/api/auth/login', { username: 'gvprincipal', password: 'Valley#2026' });
    expect(res).toMatchObject({ status: 200, data: { user: { role: 'admin', schoolId, displayName: 'Green Valley School' } } });
  });

  it('enforces the student limit and switched-off features, and blocks a school', async () => {
    await superAdmin();
    const school = (await call(listClients, 'GET', '/api/superadmin/clients')).data.find((c: any) => c.licenseKey === NEW_SCHOOL.licenseKey);

    await signInAs('admin', school.schoolId, 'gvprincipal');
    for (const name of ['First', 'Second']) {
      expect((await call(addStudent, 'POST', '/api/students', { name, monthlyFee: 1000 })).status).toBe(200);
    }
    expect((await call(addStudent, 'POST', '/api/students', { name: 'Third', monthlyFee: 1000 })).status).toBe(403);

    await superAdmin();
    const edited = await call(editClient, 'PUT', '/api/superadmin/clients', { id: school.schoolId, status: 'blocked', features: { reports: false } });
    expect(edited.status).toBe(200);
    const after = (await call(listClients, 'GET', '/api/superadmin/clients')).data.find((c: any) => c.schoolId === school.schoolId);
    expect(after).toMatchObject({ status: 'blocked', currentStudents: 2, features: { reports: false, collection: true } });

    await signInAs('admin', school.schoolId, 'gvprincipal');
    expect((await call(license, 'GET', '/api/admin/license')).data).toMatchObject({ status: 'blocked', features: { reports: false } });
    expect((await call(listStudents, 'GET', '/api/students')).status).toBe(403);
  });

  it('switches features off for one school, in the APIs and not just the menu', async () => {
    await superAdmin();
    const school = (await call(listClients, 'GET', '/api/superadmin/clients')).data.find((c: any) => c.licenseKey === NEW_SCHOOL.licenseKey);
    expect(school.features).toMatchObject({ charges: true, advance: true, lateFine: true, cashbook: true, defaulters: true, studentLedger: true, activity: true, whatsapp: true, importStudents: true });
    await call(editClient, 'PUT', '/api/superadmin/clients', { id: school.schoolId, status: 'active', features: {} });

    // Set up while everything is on: a late fine, due at once, and a monthly transport charge.
    const principal = () => signInAs('admin', school.schoolId, 'gvprincipal');
    await principal();
    await call(saveSettings, 'PUT', '/api/settings', { dueDays: 0, lateFine: 300 });
    const [first] = (await call(listStudents, 'GET', '/api/students?limit=10')).data.students;
    expect((await call(editStudent, 'PUT', '/api/students', { id: first.id, monthlyCharges: [{ label: 'Transport', amount: 500 }] })).status).toBe(200);

    await superAdmin();
    const off = { charges: false, advance: false, lateFine: false, cashbook: false, defaulters: false, studentLedger: false, activity: false, importStudents: false, expenses: false };
    await call(editClient, 'PUT', '/api/superadmin/clients', { id: school.schoolId, features: off });
    expect((await call(listClients, 'GET', '/api/superadmin/clients')).data.find((c: any) => c.schoolId === school.schoolId).features).toMatchObject({ ...off, collection: true, generate: true });

    await principal();
    // Extra Charges: new vouchers bill the fee alone, and charges can't be added or set.
    await call(generate, 'POST', '/api/fees', { month: 'October', year: '2026' });
    const [voucher] = (await call(listFees, 'GET', `/api/fees?studentId=${first.id}`)).data;
    expect(voucher).toMatchObject({ amount: 1000, charges: [] });
    const refused = await call(setCharges, 'PATCH', '/api/fees', { id: voucher.id, charges: [{ label: 'Exam', amount: 100 }] });
    expect(refused).toMatchObject({ status: 403, data: { error: expect.stringContaining('"Extra Charges" is switched off') } });
    expect((await call(editStudent, 'PUT', '/api/students', { id: first.id, monthlyCharges: [{ label: 'Transport', amount: 600 }] })).status).toBe(403);
    // A form that sends an empty list leaves the stored charges alone and still saves the rest.
    expect((await call(editStudent, 'PUT', '/api/students', { id: first.id, monthlyCharges: [], fatherName: 'Still Editable' })).data).toMatchObject({
      fatherName: 'Still Editable',
      monthlyCharges: [{ label: 'Transport', amount: 500 }],
    });

    // Late Fine: the overdue voucher carries none, and the fine can't be set.
    expect(voucher).toMatchObject({ lateFine: 0, balanceDue: 1000 });
    expect((await call(getSettings, 'GET', '/api/settings')).data).toMatchObject({ lateFine: 0, lateFineOn: false });
    expect((await call(saveSettings, 'PUT', '/api/settings', { lateFine: 500 })).status).toBe(403);
    expect((await call(saveSettings, 'PUT', '/api/settings', { dueDays: 5 })).status).toBe(200);

    // Advance Fee is refused; an ordinary payment still goes through.
    expect((await call(pay, 'PUT', '/api/fees', { id: voucher.id, paidTuition: 3000, paidAC: 0, advance: true })).status).toBe(403);
    expect((await call(pay, 'PUT', '/api/fees', { id: voucher.id, paidTuition: 400, paidAC: 0 })).status).toBe(200);

    // The data behind switched-off pages.
    expect((await call(receipts, 'GET', `/api/payments?${todayRange()}`)).status).toBe(403);
    expect((await call(receipts, 'GET', `/api/payments?studentId=${first.id}`)).status).toBe(403);
    expect((await call(family, 'GET', `/api/students/family?id=${first.id}`)).status).toBe(403);
    expect((await call(defaulters, 'GET', '/api/defaulters')).status).toBe(403);
    expect((await call(activityLog, 'GET', '/api/admin/audit')).status).toBe(403);
    expect((await call(importStudents, 'POST', '/api/students/import', { rows: [{ name: 'X' }] })).status).toBe(403);
    expect((await call(addExpense, 'POST', '/api/expenses', { category: 'Bills', amount: 100 })).status).toBe(403);

    // A feature is off whenever one it needs is off: no Receive Payment, no advance fee either.
    await superAdmin();
    await call(editClient, 'PUT', '/api/superadmin/clients', { id: school.schoolId, features: { collection: false } });
    await principal();
    expect((await call(license, 'GET', '/api/admin/license')).data.features).toMatchObject({ collection: false, advance: true, charges: true });
    expect((await call(pay, 'PUT', '/api/fees', { id: voucher.id, paidTuition: 100, paidAC: 0 })).data.error).toContain('"Receive Payment" is switched off');
    expect((await call(setCharges, 'PATCH', '/api/fees', { id: voucher.id, charges: [{ label: 'Exam', amount: 100 }] })).status).toBe(200);
  });

  it('deletes a school with its logins but never Brook Field', async () => {
    await superAdmin();
    const school = (await call(listClients, 'GET', '/api/superadmin/clients')).data.find((c: any) => c.licenseKey === NEW_SCHOOL.licenseKey);
    expect((await call(deleteClient, 'DELETE', `/api/superadmin/clients?id=${school.schoolId}`)).status).toBe(200);
    expect((await call(deleteClient, 'DELETE', '/api/superadmin/clients?id=school_brookfield')).status).toBe(400);
    expect((await call(deleteClient, 'DELETE', `/api/superadmin/clients?id=${school.schoolId}`)).status).toBe(404);

    signOut();
    expect((await call(login, 'POST', '/api/auth/login', { username: 'gvprincipal', password: 'Valley#2026' })).status).toBe(401);
  });
});
