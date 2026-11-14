import { beforeAll, describe, expect, it } from 'vitest';
import { POST as remind } from '@/app/api/reminders/route';
import { GET as defaulters } from '@/app/api/defaulters/route';
import { POST as addStudent } from '@/app/api/students/route';
import { POST as generate } from '@/app/api/fees/route';
import { PUT as saveSettings } from '@/app/api/settings/route';
import { getDb } from '@/lib/db';
import { forgetLicenseStatus } from '@/lib/license';
import { OTHER_SCHOOL, SCHOOL, call, insertRaw, resetDatabase, signInAs } from '../helpers';

beforeAll(resetDatabase);

async function setFeatures(features: Record<string, boolean>) {
  const db = await getDb();
  await db`
    insert into licenses (school_id, client_name, license_key, features) values (${SCHOOL}, 'Brook Field', 'TEST-REMIND-KEY', ${db.json(features)})
    on conflict (school_id) do update set features = excluded.features`;
  forgetLicenseStatus(SCHOOL);
}

/** Two sisters on one phone (written two ways) and a boy with no phone, all owing September. */
async function family() {
  await signInAs('admin');
  await call(saveSettings, 'PUT', '/api/settings', { dueDays: 0 });
  const add = async (name: string, parentPhone?: string) =>
    (await call(addStudent, 'POST', '/api/students', { name, classId: '900', monthlyFee: 2000, parentPhone })).data;
  const sisters = [await add('Ayesha Reminder', '0300-1234567'), await add('Fatima Reminder', '+92 300 1234567')];
  const noPhone = await add('Bilal Reminder');
  await call(generate, 'POST', '/api/fees', { month: 'September', year: '2026', studentIds: [...sisters, noPhone].map((s) => s.id) });
  return { sisters, noPhone };
}

const row = async (id: unknown) => (await call(defaulters, 'GET', '/api/defaulters?minMonths=0')).data.find((d: any) => d.studentId === id);

describe('fee reminders', () => {
  it('records a reminder and shows it on the Defaulter List', async () => {
    const { sisters, noPhone } = await family();
    expect((await row(sisters[0].id)).lastReminder).toBeNull();

    await signInAs('accountant');
    const res = await call(remind, 'POST', '/api/reminders', {
      reminders: [{ phone: '0300 1234567', studentIds: sisters.map((s) => s.id), amount: 4000 }],
    });
    expect(res).toMatchObject({ status: 200, data: { recorded: 1 } });

    for (const sister of sisters) expect((await row(sister.id)).lastReminder).toMatchObject({ at: expect.any(String), by: 'Test accountant' });
    expect((await row(noPhone.id)).lastReminder).toBeNull();

    const db = await getDb();
    const [saved] = await db`select phone, student_ids, amount, sent_by from reminders where school_id = ${SCHOOL} order by id desc limit 1`;
    expect(saved).toMatchObject({ phone: '923001234567', studentIds: sisters.map((s) => s.id), amount: 4000, sentBy: 'cashier1' });
  });

  it('checks what it is sent', async () => {
    await signInAs('accountant');
    const send = (reminders: unknown) => call(remind, 'POST', '/api/reminders', { reminders });
    expect((await send([])).data.error).toBe('No reminders given');
    expect((await send([{ phone: '12', studentIds: [1] }])).data.error).toContain('is not a phone number');
    expect((await send([{ phone: '03001234567', studentIds: [] }])).data.error).toContain('needs the students');
    expect((await send([{ phone: '03001234567', studentIds: [1], amount: -5 }])).status).toBe(400);
  });

  it("never records reminders about another school's students", async () => {
    await insertRaw('students', { id: 990001, schoolId: OTHER_SCHOOL, name: 'Elsewhere Kid' });
    await signInAs('admin');
    const res = await call(remind, 'POST', '/api/reminders', { reminders: [{ phone: '03001112223', studentIds: [990001], amount: 100 }] });
    expect(res.data.recorded).toBe(0);
  });

  it('needs Bulk Reminders for the one-after-another queue, and WhatsApp for any reminder', async () => {
    const { sisters } = await family();
    await signInAs('accountant');
    const one = { phone: '03001234567', studentIds: [sisters[0].id], amount: 2000 };
    const two = [one, { phone: '03007654321', studentIds: [sisters[1].id], amount: 2000 }];

    await setFeatures({ reminders: false });
    expect((await call(remind, 'POST', '/api/reminders', { reminders: two })).data.error).toContain('"Bulk Reminders" is switched off');
    expect((await call(remind, 'POST', '/api/reminders', { bulk: true, reminders: [one] })).status).toBe(403);
    expect((await call(remind, 'POST', '/api/reminders', { reminders: [one] })).status).toBe(200);

    await setFeatures({ whatsapp: false });
    expect((await call(remind, 'POST', '/api/reminders', { reminders: [one] })).data.error).toContain('"WhatsApp Messages" is switched off');

    await setFeatures({});
    expect((await call(remind, 'POST', '/api/reminders', { reminders: two })).data.recorded).toBe(2);
  });
});
