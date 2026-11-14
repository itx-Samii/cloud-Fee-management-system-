import { beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as parentSignIn } from '@/app/api/portal/login/route';
import { POST as signIn } from '@/app/api/auth/login/route';
import { POST as addUser } from '@/app/api/users/route';
import { GET as portal } from '@/app/api/portal/route';
import { DELETE as closeLogin, GET as loginInfo, PATCH as showPin, POST as givePin } from '@/app/api/parents/route';
import { GET as listStudents, POST as addStudent, PUT as editStudent } from '@/app/api/students/route';
import { GET as listFees, POST as generate, PUT as pay } from '@/app/api/fees/route';
import { DELETE as reverseReceipt, GET as receipts } from '@/app/api/payments/route';
import { GET as defaulters } from '@/app/api/defaulters/route';
import { GET as listClasses } from '@/app/api/classes/route';
import { GET as backup } from '@/app/api/admin/backup/route';
import { GET as license } from '@/app/api/admin/license/route';
import { GET as activityLog } from '@/app/api/admin/audit/route';
import { POST as remind } from '@/app/api/reminders/route';
import { GET as promotion } from '@/app/api/promotion/route';
import { getDb } from '@/lib/db';
import { hashPassword } from '@/lib/dbHandler';
import { forgetLicenseStatus } from '@/lib/license';
import { encodeSession, SESSION_COOKIE } from '@/lib/session';
import { proxy } from '@/proxy';
import { OTHER_SCHOOL, SCHOOL, call, cookieStore, insertRaw, resetDatabase, setSessionCookie, signInAs, signOut } from '../helpers';

beforeAll(resetDatabase);

let n = 0;

/** Two children on one number (written two ways), a neighbour's child, and September billed to all. */
async function families() {
  await signInAs('admin');
  const tag = ++n;
  const phone = `0301-55500${String(tag).padStart(2, '0')}`;
  const add = async (name: string, parentPhone: string) =>
    (await call(addStudent, 'POST', '/api/students', { name: `${name} ${tag}`, fatherName: `Tariq ${tag}`, classId: '900', monthlyFee: 2500, parentPhone })).data;
  const kids = [await add('Hira', phone), await add('Umar', phone.replace('0301-', '+92 301 '))];
  const neighbour = await add('Neighbour', `0333-11100${String(tag).padStart(2, '0')}`);
  await call(generate, 'POST', '/api/fees', { month: 'September', year: '2026', studentIds: [...kids, neighbour].map((s) => s.id) });
  return { phone, kids, neighbour };
}

async function openLogin(phone: string, role: 'admin' | 'accountant' = 'admin') {
  await signInAs(role);
  const res = await call(givePin, 'POST', '/api/parents', { phone });
  expect(res.status).toBe(200);
  return res.data.pin as string;
}

const signInParent = (phone: string, pin: string, schoolId?: string) => {
  signOut();
  return call(parentSignIn, 'POST', '/api/portal/login', { phone, pin, schoolId });
};

async function setFeatures(features: Record<string, boolean>) {
  const db = await getDb();
  await db`
    insert into licenses (school_id, client_name, license_key, features) values (${SCHOOL}, 'Brook Field', 'TEST-PORTAL-KEY', ${db.json(features)})
    on conflict (school_id) do update set features = excluded.features`;
  forgetLicenseStatus(SCHOOL);
}

describe('parent portal', () => {
  it('signs parents in from the shared form, including phone-shaped staff usernames', async () => {
    const { phone } = await families();
    const pin = await openLogin(phone);
    const identifier = phone.replace(/\D/g, '');
    const password = 'Cashier#Shared26';
    expect((await call(addUser, 'POST', '/api/users', { username: identifier, password, displayName: 'Test Accountant' })).status).toBe(200);
    signOut();
    expect(await call(signIn, 'POST', '/api/auth/login', { identifier, password })).toMatchObject({ status: 200, data: { user: { role: 'accountant' } } });
    signOut();
    expect(await call(signIn, 'POST', '/api/auth/login', { identifier, password: pin })).toMatchObject({ status: 200, data: { user: { role: 'parent', schoolId: SCHOOL } } });
    expect((await call(portal, 'GET', '/api/portal')).status).toBe(200);
  });

  it('honors the existing PIN lockout across both login entry points and phone formats', async () => {
    const { phone } = await families();
    const pin = await openLogin(phone);
    const wrong = pin === '000000' ? '111111' : '000000';
    const intl = phone.replace('0301-', '+92 301 ');
    signOut();
    for (let i = 0; i < 10; i++) {
      expect((await call(signIn, 'POST', '/api/auth/login', { identifier: i % 2 ? phone : intl, password: wrong })).status).toBe(401);
    }
    expect((await call(signIn, 'POST', '/api/auth/login', { identifier: phone, password: pin })).status).toBe(429);
    expect((await signInParent(phone, pin)).status).toBe(429);
  });
  it('reveals the current PIN to local school staff without changing it or ending parent sessions', async () => {
    const { phone } = await families();
    const pin = await openLogin(phone);
    const info = await call(loginInfo, 'GET', `/api/parents?phone=${encodeURIComponent(phone)}`);
    expect(info.data.login).not.toHaveProperty('pin');
    expect(info.data.login).not.toHaveProperty('pinEncrypted');
    expect((await signInParent(phone, pin)).status).toBe(200);
    const cookie = cookieStore.get(SESSION_COOKIE)?.value;
    expect(cookie).toBeTruthy();
    expect((await call(showPin, 'PATCH', '/api/parents', { phone })).status).toBe(403);
    signOut();
    expect((await call(showPin, 'PATCH', '/api/parents', { phone })).status).toBe(401);
    await signInAs('admin', OTHER_SCHOOL, 'otherportal');
    expect((await call(showPin, 'PATCH', '/api/parents', { phone })).status).toBe(404);

    await signInAs('accountant');
    const response = await showPin(new Request('http://localhost/api/parents', { method: 'PATCH', body: JSON.stringify({ phone }) }));
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ pin });
    const db = await getDb();
    const [row] = await db`select pin, pin_encrypted, pin_set_at from parent_logins where school_id = ${SCHOOL} and phone = ${info.data.phone}`;
    expect(row.pinEncrypted).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(row.pin).not.toBe(pin);
    expect(row.pinSetAt).toBe(info.data.login.pinSetAt);
    const [entry] = await db`select username, summary from audit_log where school_id = ${SCHOOL} and action = 'parent.reveal'`;
    expect(entry.username).toBe('cashier1');
    expect(entry.summary).not.toContain(pin);
    setSessionCookie(cookie!);
    expect((await call(portal, 'GET', '/api/portal')).status).toBe(200);
  });

  it('preserves hash-only PIN sign-in and reveals the replacement once staff issues it', async () => {
    const { phone } = await families();
    const pin = await openLogin(phone);
    const db = await getDb();
    const { data } = await call(loginInfo, 'GET', `/api/parents?phone=${encodeURIComponent(phone)}`);
    await db`update parent_logins set pin_encrypted = null where school_id = ${SCHOOL} and phone = ${data.phone}`;
    expect((await call(showPin, 'PATCH', '/api/parents', { phone })).status).toBe(409);
    expect((await signInParent(phone, pin)).status).toBe(200);

    const replacement = await openLogin(phone);
    expect(await call(showPin, 'PATCH', '/api/parents', { phone })).toEqual({ status: 200, data: { pin: replacement } });
    expect((await call(closeLogin, 'DELETE', `/api/parents?phone=${encodeURIComponent(phone)}`)).status).toBe(200);
    expect((await call(showPin, 'PATCH', '/api/parents', { phone })).status).toBe(404);
  });

  it('shows a newly issued family voucher on refresh with its saved due date and current balance', async () => {
    const { phone, kids, neighbour } = await families();
    const pin = await openLogin(phone);
    await signInParent(phone, pin);
    const before = (await call(portal, 'GET', '/api/portal')).data;
    expect(before.children[0].vouchers.map((voucher: { month: string }) => voucher.month)).toEqual(['September']);

    await signInAs('admin');
    const generated = await call(generate, 'POST', '/api/fees', { month: 'October', year: '2026', studentIds: [kids[0].id, neighbour.id] });
    expect(generated.status).toBe(200);
    const vouchers = (await call(listFees, 'GET', '/api/fees?studentId=' + kids[0].id)).data;
    const issued = vouchers.find((voucher: { month: string }) => voucher.month === 'October');

    await signInParent(phone, pin);
    const refreshed = (await call(portal, 'GET', '/api/portal')).data;
    expect(refreshed.children.map((child: { id: number }) => child.id)).toEqual(kids.map((kid) => kid.id));
    expect(refreshed.children[0].vouchers[0]).toMatchObject({
      id: issued.id, month: 'October', dueDate: issued.dueDate, amount: 2500, previousArrears: 2500, balanceDue: 5000,
    });
    expect(refreshed.children[1].vouchers).toHaveLength(1);
  });

  it("shows a family its own children's vouchers and receipts, and nobody else's", async () => {
    const { phone, kids, neighbour } = await families();
    // Hira pays part of September, and a mistaken receipt is reversed.
    await signInAs('accountant');
    const [hiraSeptember] = (await call(listFees, 'GET', `/api/fees?studentId=${kids[0].id}`)).data;
    await call(pay, 'PUT', '/api/fees', { id: hiraSeptember.id, paidTuition: 1000, paidAC: 0 });
    const mistake = (await call(pay, 'PUT', '/api/fees', { id: hiraSeptember.id, paidTuition: 500, paidAC: 0 })).data;
    await signInAs('admin');
    expect(await call(reverseReceipt, 'DELETE', `/api/payments?id=${mistake.receiptNo}`)).toMatchObject({ status: 200 });

    const pin = await openLogin(phone, 'accountant');
    expect(pin).toMatch(/^\d{6}$/);

    const signedIn = await signInParent(phone.replace(/-/g, ' '), pin);
    expect(signedIn).toMatchObject({ status: 200, data: { user: { role: 'parent', displayName: `Tariq ${n}`, schoolId: SCHOOL } } });

    const { status, data } = await call(portal, 'GET', '/api/portal');
    expect(status).toBe(200);
    expect(data.children.map((c: any) => c.name)).toEqual(kids.map((k) => k.name));
    expect(data.children.some((c: any) => c.name === neighbour.name)).toBe(false);
    expect(data.total).toBe(4000);

    const hira = data.children[0];
    expect(hira).toMatchObject({ balance: 1500, className: expect.any(String) });
    expect(hira.vouchers).toHaveLength(1);
    expect(hira.vouchers[0]).toMatchObject({ month: 'September', year: '2026', amount: 2500, paidTuition: 1000, status: 'Partially Paid', balanceDue: 1500 });
    expect(hira.receipts.map((r: any) => r.amount)).toEqual([1000]);
    // Only what the page shows: no staff names, phone numbers or internal fields.
    expect(Object.keys(hira.receipts[0]).sort()).toEqual(['amount', 'id', 'months', 'paidAC', 'receivedAt']);
    expect(JSON.stringify(data)).not.toContain('cashier1');
  });

  it('keeps parents out of everything else', async () => {
    const { phone } = await families();
    const pin = await openLogin(phone);
    await signInParent(phone, pin);

    for (const [handler, path] of [
      [listStudents, '/api/students'],
      [listFees, '/api/fees'],
      [receipts, '/api/payments'],
      [defaulters, '/api/defaulters'],
      [listClasses, '/api/classes'],
      [backup, '/api/admin/backup'],
      [activityLog, '/api/admin/audit'],
      [loginInfo, `/api/parents?phone=${phone}`],
      [promotion, '/api/promotion'],
    ] as const) {
      expect((await call(handler, 'GET', path)).status, path).toBe(403);
    }
    expect((await call(givePin, 'POST', '/api/parents', { phone })).status).toBe(403);
    expect((await call(remind, 'POST', '/api/reminders', { reminders: [{ phone, studentIds: [1] }] })).status).toBe(403);
    expect((await call(pay, 'PUT', '/api/fees', { id: 1, paidTuition: 1 })).status).toBe(403);

    const lic = (await call(license, 'GET', '/api/admin/license')).data;
    expect(Object.keys(lic).sort()).toEqual(['features', 'status']);
  });

  it('refuses a wrong PIN and locks the number after ten', async () => {
    const { phone } = await families();
    const pin = await openLogin(phone);
    const wrong = pin === '000000' ? '111111' : '000000';

    expect((await signInParent(phone, wrong)).data.error).toBe('The phone number or PIN is not right.');
    expect((await signInParent('0399-0000000', pin)).status).toBe(401);
    for (let i = 0; i < 9; i++) await signInParent(phone, wrong);
    const locked = await signInParent(phone, pin);
    expect(locked).toMatchObject({ status: 429, data: { error: expect.stringContaining('Too many wrong PINs') } });

    const db = await getDb();
    await db`update parent_logins set locked_until = now() - interval '1 minute' where phone = ${'92' + phone.replace(/\D/g, '').slice(1)}`;
    expect((await signInParent(phone, pin)).status).toBe(200);
  });

  it('a new PIN or a closed login ends earlier sign-ins', async () => {
    const { phone } = await families();
    const first = await openLogin(phone);
    await signInParent(phone, first);
    expect((await call(portal, 'GET', '/api/portal')).status).toBe(200);
    const parentCookie = encodeSession({ username: '92' + phone.replace(/\D/g, '').slice(1), role: 'parent', displayName: 'x', schoolId: SCHOOL });

    // The PIN is replaced a little later.
    const db = await getDb();
    await signInAs('admin');
    const replaced = await call(givePin, 'POST', '/api/parents', { phone });
    expect(replaced.data.reset).toBe(true);
    await db`update parent_logins set pin_set_at = now() + interval '1 minute' where phone = ${replaced.data.phone}`;

    signOut();
    setSessionCookie(parentCookie);
    expect((await call(portal, 'GET', '/api/portal')).data.error).toContain('PIN has been changed');
    expect((await signInParent(phone, first)).status).toBe(401);
    await db`update parent_logins set pin_set_at = now() where phone = ${replaced.data.phone}`;
    expect((await signInParent(phone, replaced.data.pin)).status).toBe(200);

    await signInAs('admin');
    expect((await call(closeLogin, 'DELETE', `/api/parents?phone=${encodeURIComponent(phone)}`)).status).toBe(200);
    setSessionCookie(parentCookie);
    expect((await call(portal, 'GET', '/api/portal')).data.error).toContain('removed by the school');
    expect((await signInParent(phone, replaced.data.pin)).status).toBe(401);

    await signInAs('admin');
    const log = (await call(activityLog, 'GET', '/api/admin/audit?type=parent')).data;
    expect(log.map((e: any) => e.action).slice(0, 3)).toEqual(['parent.remove', 'parent.reset', 'parent.add']);
  });

  it('follows the phone number: a child moved to another number drops out', async () => {
    const { phone, kids } = await families();
    const pin = await openLogin(phone);
    await signInAs('admin');
    await call(editStudent, 'PUT', '/api/students', { id: kids[1].id, parentPhone: '0345-9998887' });
    await signInParent(phone, pin);
    const data = (await call(portal, 'GET', '/api/portal')).data;
    expect(data.children.map((c: any) => c.name)).toEqual([kids[0].name]);
  });

  it("keeps schools apart, and lets a parent pick when one number and PIN fit two schools", async () => {
    const { phone, kids } = await families();
    const pin = await openLogin(phone);
    const number = '92' + phone.replace(/\D/g, '').slice(1);
    await insertRaw('students', { id: 991001, schoolId: OTHER_SCHOOL, name: 'Other School Child', parentPhone: phone });
    const db = await getDb();
    await db`insert into parent_logins (school_id, phone, pin, pin_set_by) values (${OTHER_SCHOOL}, ${number}, ${hashPassword(pin)}, 'test')`;
    await db`
      insert into school_settings (school_id, school_name) values (${OTHER_SCHOOL}, 'Other School')
      on conflict (school_id) do update set school_name = excluded.school_name`;

    const choice = await signInParent(phone, pin);
    expect(choice.data.choose.map((c: any) => c.schoolId).sort()).toEqual([SCHOOL, OTHER_SCHOOL].sort());
    const sharedChoice = await call(signIn, 'POST', '/api/auth/login', { identifier: phone, password: pin });
    expect(sharedChoice).toEqual(choice);
    expect(cookieStore.has(SESSION_COOKIE)).toBe(false);
    expect((await call(signIn, 'POST', '/api/auth/login', { identifier: phone, password: 'not-the-pin', schoolId: SCHOOL })).status).toBe(401);
    expect((await call(signIn, 'POST', '/api/auth/login', { identifier: phone, password: pin, schoolId: SCHOOL })).status).toBe(200);
    const data = (await call(portal, 'GET', '/api/portal')).data;
    expect(data.children.map((c: any) => c.name)).toEqual(kids.map((k) => k.name));
  });

  it('can be switched off by the Super Admin', async () => {
    const { phone } = await families();
    const pin = await openLogin(phone);
    await signInParent(phone, pin);
    await setFeatures({ parentPortal: false });
    expect((await call(portal, 'GET', '/api/portal')).status).toBe(403);
    expect((await signInParent(phone, pin)).data.error).toContain('switched off');
    await signInAs('admin');
    expect((await call(givePin, 'POST', '/api/parents', { phone })).status).toBe(403);
    await setFeatures({});
  });

  it('checks phone numbers given by staff', async () => {
    await signInAs('admin');
    expect((await call(givePin, 'POST', '/api/parents', { phone: '12' })).status).toBe(400);
    expect((await call(givePin, 'POST', '/api/parents', { phone: '0300-0000001' })).data.error).toBe('No student has this parent phone number');
  });
});

describe('pages for parents', () => {
  const visit = (path: string, session?: Parameters<typeof encodeSession>[0]) => {
    const request = new NextRequest(`http://localhost${path}`);
    if (session) request.cookies.set(SESSION_COOKIE, encodeSession(session));
    return proxy(request);
  };
  const parent = { username: '923015550001', role: 'parent' as const, displayName: 'Parent', schoolId: SCHOOL };
  const where = (res: Response) => res.headers.get('location')?.replace('http://localhost', '') ?? null;

  it('opens the public landing page for guests while preserving signed-in destinations', () => {
    const admin = { ...parent, username: 'admin', role: 'admin' as const };
    expect(where(visit('/'))).toBe('/home');
    expect(where(visit('/home'))).toBeNull();
    expect(where(visit('/login'))).toBeNull();
    expect(where(visit('/', admin))).toBeNull();
    expect(where(visit('/', { ...admin, role: 'accountant' }))).toBe('/collection');
    expect(where(visit('/reports'))).toBe('/login');
  });

  it('keeps parents in the portal and staff out of it', () => {
    expect(where(visit('/students', parent))).toBe('/portal');
    expect(where(visit('/', parent))).toBe('/portal');
    expect(where(visit('/portal', parent))).toBeNull();
    expect(where(visit('/portal', { ...parent, username: 'admin', role: 'admin' }))).toBe('/');
    expect(where(visit('/portal'))).toBe('/login');
    expect(where(visit('/superadmin'))).toBe('/login');
    expect(where(visit('/portal/login'))).toBe('/login');
    expect(where(visit('/login/superadmin'))).toBe('/login');
    expect(where(visit('/students'))).toBe('/login');
  });
});
