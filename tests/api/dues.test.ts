import { beforeAll, describe, expect, it } from 'vitest';
import { GET as listStudents, POST as addStudent, PUT as editStudent } from '@/app/api/students/route';
import { POST as importStudents } from '@/app/api/students/import/route';
import { GET as family } from '@/app/api/students/family/route';
import { DELETE as deleteVoucher, GET as listFees, PATCH as setCharges, POST as generate, PUT as pay } from '@/app/api/fees/route';
import { DELETE as reverseReceipt, GET as receipts } from '@/app/api/payments/route';
import { GET as getSettings, PUT as saveSettings } from '@/app/api/settings/route';
import { GET as defaulters } from '@/app/api/defaulters/route';
import { GET as listClasses, POST as addClass } from '@/app/api/classes/route';
import { GET as activityLog } from '@/app/api/admin/audit/route';
import { call, countRows, insertRaw, resetDatabase, signInAs } from '../helpers';

beforeAll(resetDatabase);

let nextName = 1;

/** A new student (fee 3000) with a voucher for each month given, in that order. */
async function studentBilledFor(months: string[], extra: Record<string, unknown> = {}) {
  await signInAs('admin');
  const student = (
    await call(addStudent, 'POST', '/api/students', { name: `Dues Student ${nextName++}`, classId: '900', monthlyFee: 3000, ...extra })
  ).data;
  for (const month of months) await call(generate, 'POST', '/api/fees', { month, year: '2026', studentIds: [student.id] });
  const vouchers = (await call(listFees, 'GET', `/api/fees?studentId=${student.id}`)).data;
  const byMonth = Object.fromEntries(vouchers.map((v: any) => [v.month, v]));
  return { student, byMonth };
}

const voucher = async (id: unknown) => (await call(listFees, 'GET', `/api/fees?id=${id}`)).data[0];

describe('arrears', () => {
  it('shows earlier unpaid months on the next voucher', async () => {
    const { byMonth } = await studentBilledFor(['September', 'October']);
    const october = await voucher(byMonth.October.id);
    expect(october.previousArrears).toBe(3000);
    expect(october.arrears).toEqual([{ voucherId: byMonth.September.id, month: 'September', year: '2026', amount: 3000 }]);
    expect(october.balanceDue).toBe(6000);
    expect((await voucher(byMonth.September.id)).previousArrears).toBe(0);
  });

  it('clears the oldest month first and records where the money went', async () => {
    const { byMonth } = await studentBilledFor(['August', 'September', 'October']);
    await signInAs('accountant');
    const paid = await call(pay, 'PUT', '/api/fees', { id: byMonth.October.id, paidTuition: 7000, paidAC: 0 });
    expect(paid.status).toBe(200);
    expect(paid.data.allocations.map((a: any) => [a.month, a.amount])).toEqual([
      ['August', 3000],
      ['September', 3000],
      ['October', 1000],
    ]);
    expect((await voucher(byMonth.August.id)).status).toBe('Paid');
    expect((await voucher(byMonth.September.id)).status).toBe('Paid');
    expect(paid.data).toMatchObject({ status: 'Partially Paid', previousArrears: 0, balanceDue: 2000 });

    await signInAs('admin');
    const log = await call(activityLog, 'GET', '/api/admin/audit?type=payment');
    expect(log.data[0].summary).toContain('incl. arrears August 2026 Rs. 3,000, September 2026 Rs. 3,000');
  });

  it('reversing a receipt undoes every month it paid', async () => {
    const { byMonth } = await studentBilledFor(['September', 'October']);
    await signInAs('accountant');
    const paid = await call(pay, 'PUT', '/api/fees', { id: byMonth.October.id, paidTuition: 6000, paidAC: 0 });

    expect((await call(reverseReceipt, 'DELETE', `/api/payments?id=${paid.data.receiptNo}`)).status).toBe(403);
    await signInAs('admin');
    expect((await call(reverseReceipt, 'DELETE', `/api/payments?id=${paid.data.receiptNo}`)).status).toBe(200);
    expect((await call(reverseReceipt, 'DELETE', `/api/payments?id=${paid.data.receiptNo}`)).status).toBe(404);

    expect((await voucher(byMonth.September.id)).status).toBe('Unpaid');
    expect((await voucher(byMonth.October.id))).toMatchObject({ status: 'Unpaid', balanceDue: 6000 });
  });

  it("reversing a voucher also undoes what its receipts paid on earlier months", async () => {
    const { byMonth } = await studentBilledFor(['September', 'October']);
    await call(pay, 'PUT', '/api/fees', { id: byMonth.October.id, paidTuition: 4500, paidAC: 0 });
    const res = await call(deleteVoucher, 'DELETE', `/api/fees?id=${byMonth.October.id}`);
    expect(res.data).toMatchObject({ success: true, takenBack: 4500, receipts: 1 });
    expect((await voucher(byMonth.September.id)).status).toBe('Unpaid');
  });

  it("lists a student's receipts for their ledger", async () => {
    const { student, byMonth } = await studentBilledFor(['October']);
    await call(pay, 'PUT', '/api/fees', { id: byMonth.October.id, paidTuition: 1000, paidAC: 0 });
    await call(pay, 'PUT', '/api/fees', { id: byMonth.October.id, paidTuition: 2000, paidAC: 0 });
    const list = (await call(receipts, 'GET', `/api/payments?studentId=${student.id}`)).data;
    expect(list.map((r: any) => r.amount)).toEqual([1000, 2000]);
  });
});

describe('late fines', () => {
  it('only the principal changes fee settings, within sensible limits', async () => {
    await signInAs('accountant');
    expect((await call(getSettings, 'GET', '/api/settings')).data).toEqual({ dueDays: 10, lateFine: 0, lateFineOn: true, schoolName: 'Brook Field School System' });
    expect((await call(saveSettings, 'PUT', '/api/settings', { lateFine: 100 })).status).toBe(403);
    await signInAs('admin');
    expect((await call(saveSettings, 'PUT', '/api/settings', { lateFine: -5 })).status).toBe(400);
    expect((await call(saveSettings, 'PUT', '/api/settings', { dueDays: 2.5 })).status).toBe(400);
  });

  it('adds the fine to an overdue voucher and fixes it once paid late', async () => {
    await signInAs('admin');
    await call(saveSettings, 'PUT', '/api/settings', { dueDays: 0, lateFine: 500 });
    const { byMonth } = await studentBilledFor(['October']);
    const due = await voucher(byMonth.October.id);
    expect(due).toMatchObject({ lateFine: 500, balanceDue: 3500 });

    const paid = await call(pay, 'PUT', '/api/fees', { id: due.id, paidTuition: 3500, paidAC: 0 });
    expect(paid.data).toMatchObject({ status: 'Paid', fineCharged: 500, balanceDue: 0 });
    expect(paid.data.allocations[0].fineCharged).toBe(500);
  });

  it('lets the cashier waive the fine, and logs it', async () => {
    const { byMonth } = await studentBilledFor(['October']);
    await signInAs('accountant');
    const paid = await call(pay, 'PUT', '/api/fees', { id: byMonth.October.id, paidTuition: 3000, paidAC: 0, waiveFine: true });
    expect(paid.data).toMatchObject({ status: 'Paid', fineWaived: true, lateFine: 0 });
    await signInAs('admin');
    const log = await call(activityLog, 'GET', '/api/admin/audit?type=payment');
    expect(log.data[0].summary).toContain('late fine Rs. 500 waived');
  });

  it('releases the fine when the late payment is reversed', async () => {
    const { byMonth } = await studentBilledFor(['October']);
    const paid = await call(pay, 'PUT', '/api/fees', { id: byMonth.October.id, paidTuition: 3500, paidAC: 0 });
    await call(reverseReceipt, 'DELETE', `/api/payments?id=${paid.data.receiptNo}`);
    const after = await voucher(byMonth.October.id);
    expect(after.fineCharged).toBeUndefined();
    expect(after).toMatchObject({ status: 'Unpaid', lateFine: 500, balanceDue: 3500 });
  });

  it('never fines vouchers from before due dates were recorded', async () => {
    const { student } = await studentBilledFor([]);
    await insertRaw('fees', {
      id: 555001, schoolId: 'school_brookfield', studentId: student.id, studentName: student.name,
      month: 'May', year: '2026', amount: 3000, status: 'Unpaid', issueDate: '2026-05-01T00:00:00.000Z',
    });
    expect(await voucher(555001)).toMatchObject({ lateFine: 0, balanceDue: 3000 });
    await signInAs('admin');
    await call(saveSettings, 'PUT', '/api/settings', { dueDays: 10, lateFine: 0 });
  });
});

describe('students who leave', () => {
  it('are no longer billed or counted in their class, but keep their history', async () => {
    await signInAs('admin');
    const cls = (await call(addClass, 'POST', '/api/classes', { name: 'Leavers', section: 'X', monthlyFee: 2000 })).data;
    const student = (await call(addStudent, 'POST', '/api/students', { name: 'Moving Away', classId: String(cls.id), monthlyFee: 2000 })).data;
    await call(generate, 'POST', '/api/fees', { month: 'September', year: '2026', studentIds: [student.id] });

    expect((await call(editStudent, 'PUT', '/api/students', { id: student.id, status: 'Gone' })).status).toBe(400);
    const left = await call(editStudent, 'PUT', '/api/students', { id: student.id, status: 'Left' });
    expect(left.data).toMatchObject({ status: 'Left' });
    expect(left.data.leftAt).toBeTruthy();

    const october = await call(generate, 'POST', '/api/fees', { month: 'October', year: '2026', classId: String(cls.id) });
    expect(october.data.count).toBe(0);
    expect((await call(listFees, 'GET', `/api/fees?studentId=${student.id}`)).data).toHaveLength(1);

    const classes = (await call(listClasses, 'GET', '/api/classes')).data;
    expect(classes.find((c: any) => c.id === cls.id).studentCount).toBe(0);
    const leftList = (await call(listStudents, 'GET', '/api/students?status=left&limit=100')).data.students;
    expect(leftList.map((s: any) => s.id)).toContain(student.id);
  });
});

describe('defaulter list', () => {
  it('lists who owes what, biggest first, with months and oldest unpaid month', async () => {
    await signInAs('admin');
    await call(saveSettings, 'PUT', '/api/settings', { dueDays: 0 });
    const cls = (await call(addClass, 'POST', '/api/classes', { name: 'Defaulters', section: 'D', monthlyFee: 1000 })).data;
    const add = async (name: string, months: string[]) => {
      const s = (await call(addStudent, 'POST', '/api/students', { name, classId: String(cls.id), monthlyFee: 1000, annualCharges: 500 })).data;
      for (const month of months) await call(generate, 'POST', '/api/fees', { month, year: '2026', studentIds: [s.id] });
      return s;
    };
    await add('Owes Three', ['August', 'September', 'October']);
    const one = await add('Owes One', ['October']);
    const settled = await add('All Clear', ['October']);
    const [v] = (await call(listFees, 'GET', `/api/fees?studentId=${settled.id}`)).data;
    await call(pay, 'PUT', '/api/fees', { id: v.id, paidTuition: 1000, paidAC: 500 });

    const list = (await call(defaulters, 'GET', `/api/defaulters?classId=${cls.id}`)).data;
    expect(list.map((d: any) => d.name)).toEqual(['Owes Three', 'Owes One']);
    expect(list[0]).toMatchObject({ months: 3, oldestUnpaid: 'August 2026', tuition: 3000, annualCharges: 500, total: 3500 });
    expect(list[1]).toMatchObject({ studentId: one.id, months: 1, total: 1500 });

    const chronic = (await call(defaulters, 'GET', `/api/defaulters?classId=${cls.id}&minMonths=2`)).data;
    expect(chronic.map((d: any) => d.name)).toEqual(['Owes Three']);
  });

  it('leaves out bills that are not due yet', async () => {
    await signInAs('admin');
    await call(saveSettings, 'PUT', '/api/settings', { dueDays: 10 });
    const cls = (await call(addClass, 'POST', '/api/classes', { name: 'Not Due', section: 'N', monthlyFee: 1000 })).data;
    const s = (await call(addStudent, 'POST', '/api/students', { name: 'Billed Today', classId: String(cls.id), monthlyFee: 1000 })).data;
    await call(generate, 'POST', '/api/fees', { month: 'December', year: '2026', studentIds: [s.id] });
    expect((await call(defaulters, 'GET', `/api/defaulters?classId=${cls.id}`)).data).toEqual([]);
  });
});

describe('families', () => {
  it('links brothers and sisters by parent phone, however it is written', async () => {
    await signInAs('admin');
    const add = async (name: string, parentPhone?: string) =>
      (await call(addStudent, 'POST', '/api/students', { name, classId: '900', monthlyFee: 2000, parentPhone })).data;
    const elder = await add('Elder Sibling', '0300-1234567');
    const younger = await add('Younger Sibling', '+92 300 1234567');
    await add('Other Family', '0311-7654321');
    for (const s of [elder, younger]) await call(generate, 'POST', '/api/fees', { month: 'October', year: '2026', studentIds: [s.id] });

    const res = (await call(family, 'GET', `/api/students/family?id=${younger.id}`)).data;
    expect(res.members.map((m: any) => m.name).sort()).toEqual(['Elder Sibling', 'Younger Sibling']);
    expect(res.total).toBe(4000);

    const alone = await add('No Phone');
    expect((await call(family, 'GET', `/api/students/family?id=${alone.id}`)).data.members).toHaveLength(1);
  });

  it('refuses something that is not a phone number', async () => {
    await signInAs('admin');
    const res = await call(addStudent, 'POST', '/api/students', { name: 'Bad Phone', classId: '900', parentPhone: 'call father' });
    expect(res.status).toBe(400);
  });
});

describe('importing students', () => {
  it('adds every row, using the class fee when the file has none', async () => {
    await signInAs('admin');
    const cls = (await call(addClass, 'POST', '/api/classes', { name: 'Import', section: 'B', monthlyFee: 2500, annualCharges: 4000 })).data;
    const res = await call(importStudents, 'POST', '/api/students/import', {
      rows: [
        { name: 'Imported One', fatherName: 'F1', admissionNumber: 'IMP-1', className: 'Import', section: 'B', parentPhone: '0333 5551234' },
        { name: 'Imported Two', className: 'Import - B', monthlyFee: '1,800', discount: '200' },
      ],
    });
    expect(res).toMatchObject({ status: 200, data: { created: 2 } });
    const imported = (await call(listStudents, 'GET', `/api/students?classId=${cls.id}&limit=100`)).data.students;
    expect(imported.map((s: any) => [s.name, s.monthlyFee, s.discount, s.annualCharges, s.parentPhone])).toEqual([
      ['Imported One', 2500, 0, 4000, '0333 5551234'],
      ['Imported Two', 1800, 200, 4000, undefined],
    ]);
  });

  it('imports nothing if any row is wrong, and says which rows', async () => {
    await signInAs('admin');
    const before = await countRows('students');
    const res = await call(importStudents, 'POST', '/api/students/import', {
      rows: [
        { name: 'Fine Row', className: 'Import', section: 'B' },
        { name: '', className: 'Import', section: 'B' },
        { name: 'Bad Class', className: 'Nowhere' },
        { name: 'Duplicate', className: 'Import', section: 'B', admissionNumber: 'IMP-1' },
        { name: 'Bad Fee', className: 'Import', section: 'B', monthlyFee: 'abc' },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.data.errors.map((e: any) => e.row)).toEqual([3, 4, 5, 6]);
    expect(res.data.errors[1].message).toContain('No class called "Nowhere"');
    expect(await countRows('students')).toBe(before);
  });

  it('is for principals only', async () => {
    await signInAs('accountant');
    expect((await call(importStudents, 'POST', '/api/students/import', { rows: [{ name: 'X', className: 'Import' }] })).status).toBe(403);
  });
});

describe('charges on vouchers', () => {
  it('adds to what the month owes, carries into arrears, and is logged', async () => {
    const { byMonth } = await studentBilledFor(['September', 'October']);
    await signInAs('accountant');
    const res = await call(setCharges, 'PATCH', '/api/fees', { id: byMonth.September.id, charges: [{ label: 'Exam Fee', amount: 500 }] });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ amount: 3500, charges: [{ label: 'Exam Fee', amount: 500 }], balanceDue: 3500 });
    expect(await voucher(byMonth.October.id)).toMatchObject({ previousArrears: 3500, balanceDue: 6500 });

    await call(pay, 'PUT', '/api/fees', { id: byMonth.October.id, paidTuition: 6500, paidAC: 0 });
    expect((await voucher(byMonth.September.id)).status).toBe('Paid');
    // Taking the charge off now would bill less than was paid.
    const refused = await call(setCharges, 'PATCH', '/api/fees', { id: byMonth.September.id, charges: [] });
    expect(refused.status).toBe(400);
    expect(refused.data.error).toContain('already been paid');

    await signInAs('admin');
    const log = await call(activityLog, 'GET', '/api/admin/audit?type=voucher');
    expect(log.data[0].summary).toContain('none → Exam Fee Rs. 500');
  });

  it('refuses charges without a name or amount', async () => {
    const { byMonth } = await studentBilledFor(['October']);
    expect((await call(setCharges, 'PATCH', '/api/fees', { id: byMonth.October.id, charges: [{ label: '', amount: 100 }] })).status).toBe(400);
    expect((await call(setCharges, 'PATCH', '/api/fees', { id: byMonth.October.id, charges: [{ label: 'Exam', amount: -1 }] })).status).toBe(400);
    expect((await call(setCharges, 'PATCH', '/api/fees', { id: 999999, charges: [] })).status).toBe(404);
  });

  it("adds one charge to a whole class's vouchers, once", async () => {
    await signInAs('admin');
    const cls = (await call(addClass, 'POST', '/api/classes', { name: 'Exam Class', section: 'E', monthlyFee: 2000 })).data;
    for (const name of ['Exam One', 'Exam Two']) {
      await call(addStudent, 'POST', '/api/students', { name, classId: String(cls.id), monthlyFee: 2000 });
    }
    await call(generate, 'POST', '/api/fees', { month: 'October', year: '2026', classId: String(cls.id) });
    const ids = (await call(listFees, 'GET', `/api/fees?classId=${cls.id}&month=October&year=2026`)).data.map((v: any) => v.id);
    expect(ids).toHaveLength(2);

    await signInAs('accountant');
    const charge = { label: 'Examination Fee', amount: 700 };
    expect((await call(setCharges, 'PATCH', '/api/fees', { ids, charge })).data).toMatchObject({ added: 2, skipped: 0 });
    expect((await call(setCharges, 'PATCH', '/api/fees', { ids, charge: { ...charge, label: 'examination fee' } })).data).toMatchObject({ added: 0, skipped: 2 });
    for (const id of ids) expect(await voucher(id)).toMatchObject({ amount: 2700, balanceDue: 2700 });
    expect((await call(setCharges, 'PATCH', '/api/fees', { ids, charge: { label: 'Exam', amount: 0 } })).status).toBe(400);
  });

  it('a settled month that owes again gets time to pay before any fine', async () => {
    await signInAs('admin');
    await call(saveSettings, 'PUT', '/api/settings', { dueDays: 0, lateFine: 0 });
    const { byMonth } = await studentBilledFor(['October']);
    await call(pay, 'PUT', '/api/fees', { id: byMonth.October.id, paidTuition: 3000, paidAC: 0 });
    await call(saveSettings, 'PUT', '/api/settings', { dueDays: 10, lateFine: 300 });

    await call(setCharges, 'PATCH', '/api/fees', { ids: [byMonth.October.id], charge: { label: 'Sports', amount: 400 } });
    const after = await voucher(byMonth.October.id);
    expect(after).toMatchObject({ status: 'Partially Paid', lateFine: 0, balanceDue: 400 });
    expect(new Date(after.dueDate).getTime()).toBeGreaterThan(Date.now() + 9 * 24 * 60 * 60 * 1000);
    await call(saveSettings, 'PUT', '/api/settings', { dueDays: 10, lateFine: 0 });
  });

  it("puts a student's monthly charges on every new voucher and keeps unpaid ones in step", async () => {
    await signInAs('admin');
    expect((await call(addStudent, 'POST', '/api/students', { name: 'Bad Charge', classId: '900', monthlyCharges: [{ label: 'Transport' }] })).status).toBe(400);
    const { student, byMonth } = await studentBilledFor(['October'], { monthlyCharges: [{ label: 'Transport', amount: 1500 }] });
    expect(byMonth.October).toMatchObject({ amount: 4500, charges: [{ label: 'Transport', amount: 1500 }] });
    await call(setCharges, 'PATCH', '/api/fees', { ids: [byMonth.October.id], charge: { label: 'Exam Fee', amount: 500 } });

    await call(editStudent, 'PUT', '/api/students', { id: student.id, monthlyCharges: [{ label: 'Transport', amount: 1800 }] });
    expect(await voucher(byMonth.October.id)).toMatchObject({
      amount: 5300,
      charges: [{ label: 'Exam Fee', amount: 500 }, { label: 'Transport', amount: 1800 }],
    });
    await call(editStudent, 'PUT', '/api/students', { id: student.id, monthlyFee: 3500 });
    expect((await voucher(byMonth.October.id)).amount).toBe(5800);

    const log = await call(activityLog, 'GET', '/api/admin/audit?type=student');
    expect(log.data.map((e: any) => e.summary)).toContainEqual(expect.stringContaining('monthly charges Transport Rs. 1,500 → Transport Rs. 1,800'));
  });
});

describe('advance fee', () => {
  // Months well ahead of today, so they are still "to come" when a receipt is reversed.
  async function studentBilledAhead(months: string[], extra: Record<string, unknown> = {}) {
    await signInAs('admin');
    const student = (
      await call(addStudent, 'POST', '/api/students', { name: `Advance Student ${nextName++}`, classId: '900', monthlyFee: 2000, ...extra })
    ).data;
    for (const month of months) await call(generate, 'POST', '/api/fees', { month, year: '2030', studentIds: [student.id] });
    const vouchers = async () => (await call(listFees, 'GET', `/api/fees?studentId=${student.id}`)).data;
    const byMonth = Object.fromEntries((await vouchers()).map((v: any) => [v.month, v]));
    return { student, byMonth, vouchers };
  }

  it('refuses more than is owed unless the cashier marks it as advance', async () => {
    const { student, byMonth, vouchers } = await studentBilledAhead(['March'], { monthlyCharges: [{ label: 'Transport', amount: 1000 }] });
    await signInAs('accountant');
    const refused = await call(pay, 'PUT', '/api/fees', { id: byMonth.March.id, paidTuition: 12000, paidAC: 0 });
    expect(refused.status).toBe(400);
    expect(refused.data.error).toContain('more than everything owed');
    expect((await voucher(byMonth.March.id)).status).toBe('Unpaid');
    expect((await call(receipts, 'GET', `/api/payments?studentId=${student.id}`)).data).toHaveLength(0);

    const paid = await call(pay, 'PUT', '/api/fees', { id: byMonth.March.id, paidTuition: 12000, paidAC: 0, advance: true });
    expect(paid.status).toBe(200);
    expect(paid.data.allocations.map((a: any) => [a.month, a.year, a.amount, a.created ?? false])).toEqual([
      ['March', '2030', 3000, false],
      ['April', '2030', 3000, true],
      ['May', '2030', 3000, true],
      ['June', '2030', 3000, true],
    ]);
    const all = await vouchers();
    expect(all.map((v: any) => [v.month, v.status, v.amount])).toEqual([
      ['March', 'Paid', 3000],
      ['April', 'Paid', 3000],
      ['May', 'Paid', 3000],
      ['June', 'Paid', 3000],
    ]);
    expect(all[3].charges).toEqual([{ label: 'Transport', amount: 1000 }]);
    expect(new Date(all[3].dueDate).getMonth()).toBe(5);

    // Generating May later leaves the paid-ahead voucher alone.
    await signInAs('admin');
    expect((await call(generate, 'POST', '/api/fees', { month: 'May', year: '2030', studentIds: [student.id] })).data.count).toBe(0);
    const log = await call(activityLog, 'GET', '/api/admin/audit?type=payment');
    expect(log.data[0].summary).toContain('advance fee April 2030 Rs. 3,000, May 2030 Rs. 3,000, June 2030 Rs. 3,000');
  });

  it('can be taken on a month already paid, leaving the last month part-paid', async () => {
    const { byMonth, vouchers } = await studentBilledAhead(['January']);
    await call(pay, 'PUT', '/api/fees', { id: byMonth.January.id, paidTuition: 2000, paidAC: 0 });
    const paid = await call(pay, 'PUT', '/api/fees', { id: byMonth.January.id, paidTuition: 3000, paidAC: 0, advance: true });
    expect(paid.data.allocations.map((a: any) => [a.month, a.amount])).toEqual([['February', 2000], ['March', 1000]]);
    expect((await vouchers()).map((v: any) => v.status)).toEqual(['Paid', 'Paid', 'Partially Paid']);
  });

  it('goes to later months already billed before making new ones', async () => {
    const { byMonth } = await studentBilledAhead(['January', 'February']);
    const paid = await call(pay, 'PUT', '/api/fees', { id: byMonth.January.id, paidTuition: 4000, paidAC: 0 });
    expect(paid.status).toBe(200);
    expect(paid.data.allocations.map((a: any) => [a.month, a.amount, a.created ?? false])).toEqual([
      ['January', 2000, false],
      ['February', 2000, false],
    ]);
  });

  it('reversing the receipt removes the months paid ahead', async () => {
    const { byMonth, vouchers } = await studentBilledAhead(['January']);
    const paid = await call(pay, 'PUT', '/api/fees', { id: byMonth.January.id, paidTuition: 6000, paidAC: 0, advance: true });
    expect((await vouchers()).length).toBe(3);
    await signInAs('admin');
    expect((await call(reverseReceipt, 'DELETE', `/api/payments?id=${paid.data.receiptNo}`)).status).toBe(200);
    expect((await vouchers()).map((v: any) => [v.month, v.status])).toEqual([['January', 'Unpaid']]);
  });

  it('keeps a month paid ahead if something else was paid on it', async () => {
    const { byMonth, vouchers } = await studentBilledAhead(['January']);
    const first = await call(pay, 'PUT', '/api/fees', { id: byMonth.January.id, paidTuition: 3000, paidAC: 0, advance: true });
    const february = (await vouchers())[1];
    await call(pay, 'PUT', '/api/fees', { id: february.id, paidTuition: 1000, paidAC: 0 });
    await signInAs('admin');
    await call(reverseReceipt, 'DELETE', `/api/payments?id=${first.data.receiptNo}`);
    expect((await vouchers()).map((v: any) => [v.month, v.status, v.paidTuition])).toEqual([
      ['January', 'Unpaid', 0],
      ['February', 'Partially Paid', 1000],
    ]);
  });

  it('reversing the voucher takes the advance back too', async () => {
    const { byMonth, vouchers } = await studentBilledAhead(['January']);
    await call(pay, 'PUT', '/api/fees', { id: byMonth.January.id, paidTuition: 4000, paidAC: 0, advance: true });
    await signInAs('admin');
    const res = await call(deleteVoucher, 'DELETE', `/api/fees?id=${byMonth.January.id}`);
    expect(res.data).toMatchObject({ success: true, takenBack: 4000, receipts: 1 });
    expect(await vouchers()).toEqual([]);
  });

  it('is refused for students who left, and beyond twelve months', async () => {
    const { student, byMonth } = await studentBilledAhead(['January']);
    const tooMuch = await call(pay, 'PUT', '/api/fees', { id: byMonth.January.id, paidTuition: 2000 * 14, paidAC: 0, advance: true });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.data.error).toContain('12 months');

    await call(editStudent, 'PUT', '/api/students', { id: student.id, status: 'Left' });
    const left = await call(pay, 'PUT', '/api/fees', { id: byMonth.January.id, paidTuition: 4000, paidAC: 0, advance: true });
    expect(left.status).toBe(400);
    expect(left.data.error).toContain('has left');
    expect((await voucher(byMonth.January.id)).status).toBe('Unpaid');
  });
});
