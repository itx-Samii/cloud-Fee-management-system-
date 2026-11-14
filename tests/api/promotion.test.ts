import { beforeAll, describe, expect, it } from 'vitest';
import { DELETE as undo, GET as overview, POST as promote } from '@/app/api/promotion/route';
import { GET as listStudents, POST as addStudent, PUT as editStudent } from '@/app/api/students/route';
import { GET as listClasses, POST as addClass } from '@/app/api/classes/route';
import { GET as listFees, POST as generate } from '@/app/api/fees/route';
import { GET as activityLog } from '@/app/api/admin/audit/route';
import { getDb } from '@/lib/db';
import { forgetLicenseStatus } from '@/lib/license';
import { OTHER_SCHOOL, SCHOOL, call, insertRaw, resetDatabase, signInAs } from '../helpers';

beforeAll(resetDatabase);

let classNo = 0;

/** A fresh set of classes (so tests don't share students): 5th A, 5th B, 6th A, 7th A. */
async function school() {
  await signInAs('admin');
  const tag = `T${++classNo}`;
  const add = async (name: string, section: string, monthlyFee = 0) =>
    (await call(addClass, 'POST', '/api/classes', { name: `${name} ${tag}`, section, monthlyFee })).data;
  const classes = {
    fiveA: await add('5th', 'A'),
    fiveB: await add('5th', 'B'),
    sixA: await add('6th', 'A', 4500),
    sevenA: await add('7th', 'A'),
  };
  const enrol = async (name: string, cls: { id: number }, monthlyFee = 3000, extra: Record<string, unknown> = {}) =>
    (await call(addStudent, 'POST', '/api/students', { name: `${name} ${tag}`, classId: String(cls.id), monthlyFee, ...extra })).data;
  return { classes, enrol };
}

const student = async (id: unknown) => (await call(listStudents, 'GET', `/api/students?id=${id}`)).data;
const token = async () => (await call(overview, 'GET', '/api/promotion')).data.token;

describe('class promotion', () => {
  it('moves every class up at once, without carrying anyone two classes', async () => {
    const { classes, enrol } = await school();
    const ali = await enrol('Ali', classes.fiveA, 3000);
    const kept = await enrol('Kept Back', classes.fiveA, 3000);
    const sara = await enrol('Sara', classes.sixA, 4000, { annualCharges: 2000 });
    const gone = await enrol('Already Left', classes.fiveA, 3000);
    await call(editStudent, 'PUT', '/api/students', { id: gone.id, status: 'Left' });

    // Last month's voucher stays billed to the old class and fee.
    await call(generate, 'POST', '/api/fees', { month: 'March', year: '2026', studentIds: [ali.id] });
    const [march] = (await call(listFees, 'GET', `/api/fees?studentId=${ali.id}`)).data;

    const res = await call(promote, 'POST', '/api/promotion', {
      token: await token(),
      steps: [
        { fromClassId: classes.fiveA.id, to: classes.sixA.id, fee: { mode: 'percent', amount: 10 }, keepBack: [kept.id] },
        { fromClassId: classes.sixA.id, to: classes.sevenA.id, fee: { mode: 'add', amount: 500 }, addAnnualCharges: 1500 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ moved: 2, passedOut: 0, keptBack: 1 });

    expect(await student(ali.id)).toMatchObject({ classId: classes.sixA.id, monthlyFee: 3300 });
    expect(await student(sara.id)).toMatchObject({ classId: classes.sevenA.id, monthlyFee: 4500, annualCharges: 3500 });
    expect(await student(kept.id)).toMatchObject({ classId: classes.fiveA.id, monthlyFee: 3000 });
    expect(await student(gone.id)).toMatchObject({ classId: classes.fiveA.id, status: 'Left' });

    const [after] = (await call(listFees, 'GET', `/api/fees?studentId=${ali.id}`)).data;
    expect(after).toMatchObject({ classId: march.classId, className: march.className, amount: 3000 });

    const log = (await call(activityLog, 'GET', '/api/admin/audit?type=student')).data;
    expect(log[0]).toMatchObject({ action: 'student.promote', summary: expect.stringContaining('Promoted 2 student(s).') });
    expect(log[0].summary).toContain('→ 6th');
    expect(log[0].summary).toContain('fee +10% (1 kept back)');
  });

  it("marks the top class's students as passed out and can set the new class's fee", async () => {
    const { classes, enrol } = await school();
    const senior = await enrol('Senior', classes.sevenA);
    const junior = await enrol('Junior', classes.fiveB, 2500);
    const res = await call(promote, 'POST', '/api/promotion', {
      token: await token(),
      steps: [
        { fromClassId: classes.sevenA.id, to: 'left' },
        { fromClassId: classes.fiveB.id, to: classes.sixA.id, fee: { mode: 'class' } },
      ],
    });
    expect(res.data).toMatchObject({ moved: 2, passedOut: 1 });
    expect(await student(senior.id)).toMatchObject({ status: 'Left', leftAt: expect.any(String), classId: classes.sevenA.id });
    expect(await student(junior.id)).toMatchObject({ classId: classes.sixA.id, monthlyFee: 4500 });

    const counts = (await call(listClasses, 'GET', '/api/classes')).data;
    expect(counts.find((c: any) => c.id === classes.sevenA.id).studentCount).toBe(0);
  });

  it('refuses a second click or a page opened before the last promotion', async () => {
    const { classes, enrol } = await school();
    const kid = await enrol('Double Click', classes.fiveA);
    const seen = await token();
    // Both 5th → 6th and 6th → 7th: a second run would carry the student on to 7th.
    const steps = [
      { fromClassId: classes.fiveA.id, to: classes.sixA.id },
      { fromClassId: classes.sixA.id, to: classes.sevenA.id },
    ];
    const [first, second] = await Promise.all([
      call(promote, 'POST', '/api/promotion', { token: seen, steps }),
      call(promote, 'POST', '/api/promotion', { token: seen, steps }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 400]);
    const refused = first.status === 400 ? first : second;
    expect(refused.data.error).toContain('Reload the page');
    expect((await student(kid.id)).classId).toBe(classes.sixA.id);

    // A page still open from before is refused the same way.
    expect((await call(promote, 'POST', '/api/promotion', { token: seen, steps })).data.error).toContain('Reload the page');
    expect((await student(kid.id)).classId).toBe(classes.sixA.id);
  });

  it('undoes the latest promotion, leaving anything edited since', async () => {
    const { classes, enrol } = await school();
    const a = await enrol('Undo A', classes.fiveA, 3000);
    const b = await enrol('Undo B', classes.fiveA, 3000);
    const top = await enrol('Undo Top', classes.sevenA, 5000);
    const done = await call(promote, 'POST', '/api/promotion', {
      token: await token(),
      steps: [
        { fromClassId: classes.fiveA.id, to: classes.sixA.id, fee: { mode: 'add', amount: 200 } },
        { fromClassId: classes.sevenA.id, to: 'left' },
      ],
    });
    expect(done.status).toBe(200);
    // The principal corrects one student's fee after promoting.
    await call(editStudent, 'PUT', '/api/students', { id: b.id, monthlyFee: 2800 });

    const res = await call(undo, 'DELETE', `/api/promotion?id=${done.data.id}`);
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ restored: 2, changedSince: [b.name], missing: 0 });
    expect(await student(a.id)).toMatchObject({ classId: classes.fiveA.id, monthlyFee: 3000 });
    expect(await student(b.id)).toMatchObject({ classId: classes.fiveA.id, monthlyFee: 2800 });
    const back = await student(top.id);
    expect(back.status).toBe('Active');
    expect(back.leftAt).toBeUndefined();

    expect((await call(undo, 'DELETE', `/api/promotion?id=${done.data.id}`)).data.error).toContain('already been undone');
    const history = (await call(overview, 'GET', '/api/promotion')).data.history;
    expect(history[0]).toMatchObject({ id: done.data.id, students: 3, undoneAt: expect.any(String), undoneBy: 'admin' });
    const log = (await call(activityLog, 'GET', '/api/admin/audit?type=student')).data;
    expect(log[0].summary).toMatch(/^Undid the class promotion of \d{4}-\d{2}-\d{2}: 2 student\(s\) put back; 1 kept their newer class or fee/);
  });

  it('only undoes the latest promotion', async () => {
    const { classes, enrol } = await school();
    await enrol('Twice', classes.fiveA);
    const first = await call(promote, 'POST', '/api/promotion', { token: await token(), steps: [{ fromClassId: classes.fiveA.id, to: classes.sixA.id }] });
    await call(promote, 'POST', '/api/promotion', { token: await token(), steps: [{ fromClassId: classes.sixA.id, to: classes.sevenA.id }] });
    const res = await call(undo, 'DELETE', `/api/promotion?id=${first.data.id}`);
    expect(res).toMatchObject({ status: 400, data: { error: 'Only the latest promotion can be undone.' } });
  });

  it('checks the plan before changing anything', async () => {
    const { classes, enrol } = await school();
    const kid = await enrol('Checked', classes.fiveA);
    const t = await token();
    const tryPlan = (steps: unknown) => call(promote, 'POST', '/api/promotion', { token: t, steps });
    expect((await tryPlan([])).data.error).toBe('Choose at least one class to promote');
    expect((await tryPlan([{ fromClassId: classes.fiveA.id, to: classes.fiveA.id }])).data.error).toBe('A class cannot be promoted into itself');
    expect((await tryPlan([{ fromClassId: classes.fiveA.id, to: classes.sixA.id, fee: { mode: 'percent', amount: 500 } }])).status).toBe(400);
    expect((await tryPlan([{ fromClassId: classes.fiveA.id, to: 999999 }])).data.error).toContain('no longer exists');
    expect((await tryPlan([{ fromClassId: classes.fiveB.id, to: classes.sixA.id }])).data.error).toContain('Nobody to promote');
    expect((await call(promote, 'POST', '/api/promotion', { steps: [{ fromClassId: classes.fiveA.id, to: classes.sixA.id }] })).status).toBe(400);
    expect((await student(kid.id)).classId).toBe(classes.fiveA.id);
  });

  it("is for principals only, never touches another school's students, and can be switched off", async () => {
    const { classes, enrol } = await school();
    await enrol('Ours', classes.fiveA);
    await insertRaw('students', { id: 880001, schoolId: OTHER_SCHOOL, name: 'Their Kid', classId: classes.fiveA.id, monthlyFee: 1000 });

    await signInAs('accountant');
    expect((await call(overview, 'GET', '/api/promotion')).status).toBe(403);
    expect((await call(promote, 'POST', '/api/promotion', { token: 'none', steps: [{ fromClassId: classes.fiveA.id, to: classes.sixA.id }] })).status).toBe(403);

    await signInAs('admin');
    const res = await call(promote, 'POST', '/api/promotion', { token: await token(), steps: [{ fromClassId: classes.fiveA.id, to: classes.sixA.id }] });
    expect(res.data.moved).toBe(1);
    const db = await getDb();
    const [theirs] = await db`select class_id from students where school_id = ${OTHER_SCHOOL} and id = 880001`;
    expect(theirs.classId).toBe(classes.fiveA.id);

    await db`
      insert into licenses (school_id, client_name, license_key, features) values (${SCHOOL}, 'Brook Field', 'TEST-PROMO-KEY', ${db.json({ promotion: false })})
      on conflict (school_id) do update set features = excluded.features`;
    forgetLicenseStatus(SCHOOL);
    const off = await call(overview, 'GET', '/api/promotion');
    expect(off).toMatchObject({ status: 403, data: { error: expect.stringContaining('"Class Promotion" is switched off') } });
    await db`update licenses set features = '{}' where school_id = ${SCHOOL}`;
    forgetLicenseStatus(SCHOOL);
  });
});
