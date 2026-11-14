import { beforeAll, describe, expect, it } from 'vitest';
import { POST as submit } from '@/app/api/signup/route';
import { GET as list, PATCH as review } from '@/app/api/superadmin/signup-requests/route';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as createClient } from '@/app/api/superadmin/clients/route';
import { POST as createUser } from '@/app/api/users/route';
import { getDb } from '@/lib/db';
import { isPlaintextPassword, verifyPassword } from '@/lib/dbHandler';
import { call, resetDatabase, signInAs, signOut } from '../helpers';

const signupUrl = '/api/signup';
const reviewUrl = '/api/superadmin/signup-requests';
const details = {
  schoolName: 'Hill View Academy', schoolAddress: '12 College Road, Lahore', principalName: 'Test Principal',
  email: 'contact@example.test', phone: '+92 300 1234567', username: 'hill.principal', password: 'Test#Principal26',
};

const submitRequest = (overrides = {}) => call(submit, 'POST', signupUrl, { ...details, ...overrides });
const decision = (id: string, action: 'approve' | 'reject') => call(review, 'PATCH', reviewUrl, { id, decision: action });
const loginAs = (username: string, password = details.password) => call(login, 'POST', '/api/auth/login', { username, password });
const listRequests = () => call(list, 'GET', reviewUrl);
const superAdmin = () => signInAs('superadmin', 'master', 'superadmin');

beforeAll(resetDatabase);

describe('school signup', () => {
  it('validates the request, reserves a pending username, and does not allow login before approval', async () => {
    signOut();
    expect(await submitRequest({ email: 'invalid' })).toMatchObject({ status: 400, data: { field: 'email' } });
    expect(await submitRequest({ phone: 'invalid' })).toMatchObject({ status: 400, data: { field: 'phone' } });
    expect(await submitRequest({ password: 'short' })).toMatchObject({ status: 400, data: { field: 'password' } });
    expect((await submitRequest({ username: 'SUPERADMIN' })).status).toBe(409);

    const submissions = await Promise.all([submitRequest({ username: 'Hill.Principal', role: 'superadmin' }), submitRequest()]);
    expect(submissions.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect((await loginAs(details.username)).status).toBe(401);

    const db = await getDb();
    const [{ passwordHash }] = await db`select password_hash from school_signup_requests where username = ${details.username}`;
    expect(isPlaintextPassword(passwordHash)).toBe(false);
    expect(verifyPassword(details.password, passwordHash)).toBe(true);
  });

  it('keeps submitted details and review actions exclusive to Super Admin', async () => {
    const db = await getDb();
    const [{ id }] = await db`select id from school_signup_requests where username = ${details.username}`;
    signOut();
    expect((await listRequests()).status).toBe(401);
    expect((await decision(id, 'approve')).status).toBe(401);
    await signInAs('admin');
    expect((await listRequests()).status).toBe(403);
    expect((await decision(id, 'approve')).status).toBe(403);

    await superAdmin();
    const { password, ...publicDetails } = details;
    const { data } = await listRequests();
    expect(data).toEqual([{ ...publicDetails, id, status: 'pending', createdAt: expect.any(String) }]);
    expect(JSON.stringify(data)).not.toContain(password);
  });

  it('approves once under simultaneous review and creates a working principal and license', async () => {
    await superAdmin();
    const [{ id }] = (await listRequests()).data;
    const decisions = await Promise.all([decision(id, 'approve'), decision(id, 'approve')]);
    expect(decisions).toEqual(Array(2).fill({ status: 200, data: { status: 'approved' } }));
    expect((await decision(id, 'reject')).status).toBe(409);

    const [approved] = (await listRequests()).data;
    const db = await getDb();
    const licenses = await db`select school_id, status from licenses where admin_username = ${details.username}`;
    expect(licenses).toEqual([{ schoolId: approved.schoolId, status: 'active' }]);
    const [stored] = await db`select password_hash from school_signup_requests where id = ${id}`;
    expect(stored.passwordHash).toBeUndefined();

    signOut();
    expect(await loginAs(details.username)).toMatchObject({
      status: 200, data: { user: { role: 'admin', schoolId: approved.schoolId, username: details.username } },
    });
  });

  it('rejects a request without creating an account and permits a new submission', async () => {
    const username = 'denied.principal';
    expect((await submitRequest({ username })).status).toBe(201);
    await superAdmin();
    const denied = (await listRequests()).data.find((request: { username: string }) => request.username === username);
    expect((await decision(denied.id, 'reject')).data).toEqual({ status: 'rejected' });
    expect((await decision(denied.id, 'approve')).status).toBe(409);
    signOut();
    expect((await loginAs(username)).status).toBe(401);
    expect((await submitRequest({ username })).status).toBe(201);
  });

  it('leaves a request pending when a login has since taken that username', async () => {
    const username = 'existing.principal';
    expect((await submitRequest({ username })).status).toBe(201);
    await superAdmin();
    const request = (await listRequests()).data.find((item: { username: string }) => item.username === username);
    expect((await call(createClient, 'POST', '/api/superadmin/clients', {
      clientName: 'Existing school', licenseKey: 'EXISTING', adminUsername: username, adminPassword: 'Existing#2026',
    })).status).toBe(200);
    expect((await decision(request.id, 'approve')).status).toBe(409);
    const current = (await listRequests()).data.find((item: { id: string }) => item.id === request.id);
    expect(current.status).toBe('pending');
  });

  it('never issues the same login to a principal and accountant in a race', async () => {
    const username = 'contested.login';
    expect((await submitRequest({ username })).status).toBe(201);
    await superAdmin();
    const request = (await listRequests()).data.find((item: { username: string }) => item.username === username);
    const results = await Promise.all([decision(request.id, 'approve'), call(createUser, 'POST', '/api/users', {
      displayName: 'Competing accountant', username, password: 'Accountant#26',
    })]);
    expect(results.filter(({ status }) => status === 200)).toHaveLength(1);
    const db = await getDb();
    const accounts = await db`select username from users where username = ${username}
      union all select admin_username from school_settings where admin_username = ${username}`;
    expect(accounts).toHaveLength(1);
  });
});
