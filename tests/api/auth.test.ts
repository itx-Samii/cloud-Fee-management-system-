import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GET as whoAmI, POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { POST as changePassword } from '@/app/api/auth/change-password/route';
import { POST as addStudent } from '@/app/api/students/route';
import { GET as activityLog } from '@/app/api/admin/audit/route';
import { GET as backup } from '@/app/api/admin/backup/route';
import { GET as listUsers, POST as addUser } from '@/app/api/users/route';
import { GET as clients } from '@/app/api/superadmin/clients/route';
import { call, encodeForeignSession, resetDatabase, setSessionCookie, signInAs, signOut } from '../helpers';

beforeAll(resetDatabase);
beforeEach(signOut);

describe('signing in', () => {
  it('lets the principal of a fresh install in with the default password', async () => {
    const res = await call(login, 'POST', '/api/auth/login', { username: 'admin', password: 'brookfield' });
    expect(res.status).toBe(200);
    const me = await call(whoAmI, 'GET', '/api/auth/login');
    expect(me.data.user).toMatchObject({ username: 'admin', role: 'admin' });
  });

  it('refuses a wrong password without saying which part was wrong', async () => {
    const res = await call(login, 'POST', '/api/auth/login', { username: 'admin', password: 'Brookfield' });
    expect(res.status).toBe(401);
    expect(res.data.error).toBe('Incorrect username or password');
  });

  it('records each sign-in in the activity log', async () => {
    await call(login, 'POST', '/api/auth/login', { username: 'admin', password: 'brookfield' });
    const log = await call(activityLog, 'GET', '/api/admin/audit?type=login');
    expect(log.data.length).toBeGreaterThan(0);
    expect(log.data[0]).toMatchObject({ action: 'login', username: 'admin' });
  });

  it('lets an accountant in with their own password, whatever the username case', async () => {
    signInAs('admin');
    await call(addUser, 'POST', '/api/users', { username: 'cashier9', password: 'Cashier#2026', displayName: 'Front Desk' });
    signOut();
    const ok = await call(login, 'POST', '/api/auth/login', { username: 'CASHIER9', password: 'Cashier#2026' });
    expect(ok.status).toBe(200);
    expect(ok.data.user.role).toBe('accountant');
  });

  it('locks a username after 10 wrong passwords', async () => {
    for (let i = 0; i < 10; i++) {
      await call(login, 'POST', '/api/auth/login', { username: 'guessme', password: `wrong-${i}` });
    }
    const res = await call(login, 'POST', '/api/auth/login', { username: 'guessme', password: 'anything' });
    expect(res.status).toBe(429);
  });

  it('ends the session on logout', async () => {
    await call(login, 'POST', '/api/auth/login', { username: 'admin', password: 'brookfield' });
    await call(logout, 'POST', '/api/auth/logout');
    expect((await call(whoAmI, 'GET', '/api/auth/login')).status).toBe(401);
  });
});

describe('sessions', () => {
  it('turns away requests that carry no session', async () => {
    expect((await call(addStudent, 'POST', '/api/students', { name: 'X' })).status).toBe(401);
  });

  it('turns away a session cookie signed with another key', async () => {
    setSessionCookie(encodeForeignSession({ username: 'admin', role: 'admin', displayName: 'x', schoolId: 'school_brookfield' }));
    expect((await call(addStudent, 'POST', '/api/students', { name: 'X' })).status).toBe(401);
  });
});

describe('roles', () => {
  it('keeps accountants out of principal-only actions', async () => {
    signInAs('accountant');
    expect((await call(addStudent, 'POST', '/api/students', { name: 'X' })).status).toBe(403);
    expect((await call(activityLog, 'GET', '/api/admin/audit')).status).toBe(403);
    expect((await call(listUsers, 'GET', '/api/users')).status).toBe(403);
    expect((await call(backup, 'GET', '/api/admin/backup')).status).toBe(403);
  });

  it('keeps school principals out of the Super Admin area', async () => {
    signInAs('admin');
    expect((await call(clients, 'GET', '/api/superadmin/clients')).status).toBe(403);
  });

  it('requires the current password to set a new one, and enforces the minimum length', async () => {
    signInAs('admin');
    const wrong = await call(changePassword, 'POST', '/api/auth/change-password', { oldPassword: 'nope', newPassword: 'NewPass#2026' });
    expect(wrong.status).toBe(400);
    const short = await call(changePassword, 'POST', '/api/auth/change-password', { oldPassword: 'brookfield', newPassword: 'short' });
    expect(short.status).toBe(400);
  });
});
