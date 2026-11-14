import { beforeAll, describe, expect, it } from 'vitest';
import { GET as listClients, POST as createClient, PUT as editClient } from '@/app/api/superadmin/clients/route';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as changePassword } from '@/app/api/auth/change-password/route';
import { GET as license } from '@/app/api/admin/license/route';
import { GET as listStudents, POST as addStudent } from '@/app/api/students/route';
import { POST as addUser } from '@/app/api/users/route';
import { POST as issuePin } from '@/app/api/parents/route';
import { GET as portal } from '@/app/api/portal/route';
import { getDb } from '@/lib/db';
import { TRIAL_DAY_MS, trialDaysLeft, trialReminder } from '@/lib/trials';
import { call, cookieStore, resetDatabase, setSessionCookie, signInAs, signOut } from '../helpers';
import { SESSION_COOKIE } from '@/lib/session';

beforeAll(resetDatabase);

const clientsUrl = '/api/superadmin/clients';
const demo = { clientName: 'Demo School', licenseKey: 'TRIAL-2026', adminUsername: 'demoprincipal', adminPassword: 'DemoSchool#26' };
const superAdmin = () => signInAs('superadmin', 'master', 'superadmin');
const edit = (body: Record<string, unknown>) => call(editClient, 'PUT', clientsUrl, body);
const signIn = (identifier: string, password: string) => call(login, 'POST', '/api/auth/login', { identifier, password });

describe('school trials', () => {
  it('validates duration and limits trial management to Super Admin', async () => {
    await signInAs('admin');
    expect((await call(createClient, 'POST', clientsUrl, { ...demo, trialDays: 7 })).status).toBe(403);
    expect((await edit({ id: 'school_brookfield', trialDays: 7, expectedTrialExpiry: null })).status).toBe(403);
    await superAdmin();
    for (const trialDays of [0, -1, 2.5, 366, '7']) {
      expect((await call(createClient, 'POST', clientsUrl, { ...demo, trialDays })).status).toBe(400);
    }
  });

  it('blocks new and existing sessions at expiry, preserves records, and restores access after extension or conversion', async () => {
    await superAdmin();
    const start = Date.now();
    const created = await call(createClient, 'POST', clientsUrl, { ...demo, trialDays: 7 });
    expect(created.status).toBe(200);
    const { schoolId, trialExpiresAt } = created.data.client;
    expect(Date.parse(trialExpiresAt)).toBeGreaterThanOrEqual(start + 7 * TRIAL_DAY_MS);
    expect(Date.parse(trialExpiresAt)).toBeLessThanOrEqual(Date.now() + 7 * TRIAL_DAY_MS);
    expect((await call(listClients, 'GET', clientsUrl)).data).toEqual(expect.arrayContaining([
      expect.objectContaining({ schoolId, status: 'active', trialExpiresAt, trialDaysRemaining: 7 }),
    ]));

    signOut();
    expect((await signIn(demo.adminUsername, demo.adminPassword)).status).toBe(200);
    const staffCookie = cookieStore.get(SESSION_COOKIE)!.value;
    expect((await call(license, 'GET', '/api/admin/license')).data).toMatchObject({ status: 'active', trialExpiresAt });
    const phone = '03000001234';
    expect((await call(addStudent, 'POST', '/api/students', { name: 'Demo Student', parentPhone: phone, monthlyFee: 500 })).status).toBe(200);
    expect((await call(addUser, 'POST', '/api/users', { username: 'democashier', password: 'DemoCashier#26', displayName: 'Demo Cashier' })).status).toBe(200);
    const pin = (await call(issuePin, 'POST', '/api/parents', { phone })).data.pin;
    signOut();
    expect((await signIn(phone, pin)).status).toBe(200);
    const parentCookie = cookieStore.get(SESSION_COOKIE)!.value;

    const expiredAt = new Date(Date.now() - 1_000).toISOString();
    const db = await getDb();
    await db`update licenses set trial_expires_at = ${expiredAt} where school_id = ${schoolId}`;
    expect((await call(portal, 'GET', '/api/portal')).status).toBe(403);
    expect((await call(license, 'GET', '/api/admin/license')).data.status).toBe('expired');
    setSessionCookie(staffCookie);
    expect((await call(listStudents, 'GET', '/api/students')).data.error).toContain('trial has expired');
    expect((await call(changePassword, 'POST', '/api/auth/change-password')).status).toBe(403);
    signOut();
    for (const [identifier, password] of [[demo.adminUsername, demo.adminPassword], ['democashier', 'DemoCashier#26'], [phone, pin]]) {
      expect((await signIn(identifier, password)).data.error).toContain('trial has expired');
      expect(cookieStore.has(SESSION_COOKIE)).toBe(false);
    }

    await superAdmin();
    expect((await call(listClients, 'GET', clientsUrl)).data).toEqual(expect.arrayContaining([
      expect.objectContaining({ schoolId, status: 'expired', trialDaysRemaining: 0 }),
    ]));
    expect((await edit({ id: schoolId, status: 'active' })).data.client.status).toBe('expired');
    const started = await edit({ id: schoolId, trialDays: 3, expectedTrialExpiry: expiredAt });
    expect(started.status).toBe(200);
    const newExpiry = started.data.client.trialExpiresAt;
    const action = { id: schoolId, trialDays: 2, expectedTrialExpiry: newExpiry };
    const concurrent = await Promise.all([edit(action), edit(action)]);
    expect(concurrent.map(({ status }) => status).sort()).toEqual([200, 409]);
    const extended = concurrent.find((result) => result.status === 200)!.data.client;
    expect(Date.parse(extended.trialExpiresAt)).toBe(Date.parse(newExpiry) + 2 * TRIAL_DAY_MS);

    setSessionCookie(parentCookie);
    expect((await call(portal, 'GET', '/api/portal')).status).toBe(200);
    setSessionCookie(staffCookie);
    expect((await call(listStudents, 'GET', '/api/students')).data.students).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Demo Student' })]));
    await superAdmin();
    expect((await edit({ id: schoolId, trialDays: null, expectedTrialExpiry: extended.trialExpiresAt })).data.client).toMatchObject({ status: 'active' });
    const regular = (await call(listClients, 'GET', clientsUrl)).data.find((row: { schoolId: string }) => row.schoolId === schoolId);
    expect(regular).not.toHaveProperty('trialExpiresAt');
    signOut();
    expect((await signIn(demo.adminUsername, demo.adminPassword)).status).toBe(200);
  });

  it('uses 7-, 3- and 1-day reminders and stops counting at the exact deadline', () => {
    const now = Date.parse('2026-11-14T00:00:00Z');
    for (const [days, reminder] of [[8, null], [7, 7], [4, 7], [3, 3], [2, 3], [1, 1], [0, null]]) {
      const remaining = trialDaysLeft(new Date(now + Number(days) * TRIAL_DAY_MS).toISOString(), now);
      expect(remaining).toBe(days);
      expect(trialReminder(remaining)).toBe(reminder);
    }
    expect(trialDaysLeft(new Date(now + 1).toISOString(), now)).toBe(1);
  });
});
