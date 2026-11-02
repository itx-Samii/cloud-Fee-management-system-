import { describe, expect, it } from 'vitest';
import {
  advanceDueDate,
  arrearsFor,
  cleanCharges,
  lateFineOf,
  monthOfPeriod,
  monthlyBill,
  newVoucher,
  parseCharges,
  periodOf,
  tuitionOf,
  tuitionOwed,
  voucherStatus,
  withBalances,
} from '@/lib/fees';
import { parseCsv, readStudentRows, toCsv } from '@/lib/csv';
import { DEFAULT_FEATURES, FEATURE_KEYS, featureOfPath, featureOn } from '@/lib/features';
import { reminderMessage, samePhone, whatsappLink, whatsappNumber } from '@/lib/whatsapp';
import type { FeeVoucher } from '@/lib/types';

const NOW = new Date('2026-10-20T12:00:00Z');
const voucher = (fields: Partial<FeeVoucher>): FeeVoucher => ({
  id: 1, studentId: 7, month: 'October', year: '2026', amount: 3000, status: 'Unpaid', paidTuition: 0, ...fields,
});

describe('fee arithmetic', () => {
  it('orders months across years', () => {
    expect(periodOf({ month: 'December', year: '2025' })).toBeLessThan(periodOf({ month: 'January', year: '2026' }));
    expect(periodOf({ month: 'March', year: '2026' })).toBeLessThan(periodOf({ month: 'April', year: 2026 }));
  });

  it('charges the late fine only on overdue, unpaid vouchers that have a due date', () => {
    const overdue = voucher({ dueDate: '2026-10-10T00:00:00Z' });
    expect(lateFineOf(overdue, 500, NOW)).toBe(500);
    expect(lateFineOf({ ...overdue, dueDate: '2026-10-25T00:00:00Z' }, 500, NOW)).toBe(0);
    expect(lateFineOf({ ...overdue, dueDate: undefined }, 500, NOW)).toBe(0);
    expect(lateFineOf({ ...overdue, paidTuition: 3000 }, 500, NOW)).toBe(0);
    expect(lateFineOf({ ...overdue, fineWaived: true }, 500, NOW)).toBe(0);
    expect(lateFineOf(overdue, 0, NOW)).toBe(0);
  });

  it('keeps a fine once charged, even if the setting changes later', () => {
    expect(lateFineOf(voucher({ fineCharged: 300 }), 1000, NOW)).toBe(300);
    expect(tuitionOwed(voucher({ fineCharged: 300, paidTuition: 3000 }), 1000, NOW)).toBe(300);
  });

  it('treats old vouchers marked Paid without amounts as settled', () => {
    expect(tuitionOwed(voucher({ status: 'Paid', paidTuition: undefined }), 500, NOW)).toBe(0);
  });

  it('judges status by tuition and fine; annual charges alone make it partly paid', () => {
    expect(voucherStatus(voucher({ paidTuition: 3000 }))).toBe('Paid');
    expect(voucherStatus(voucher({ paidTuition: 3000, fineCharged: 500 }))).toBe('Partially Paid');
    expect(voucherStatus(voucher({ paidTuition: 0, paidAC: 1000 }))).toBe('Partially Paid');
    expect(voucherStatus(voucher({}))).toBe('Unpaid');
  });

  it('adds up arrears from earlier months only, oldest first', () => {
    const all = [
      voucher({ id: 3, month: 'October' }),
      voucher({ id: 2, month: 'September', paidTuition: 1000 }),
      voucher({ id: 1, month: 'August' }),
      voucher({ id: 4, month: 'July', paidTuition: 3000, status: 'Paid' }),
      voucher({ id: 5, month: 'November' }),
    ];
    expect(arrearsFor(all[0], all, 0, NOW).map((l) => [l.month, l.amount])).toEqual([
      ['August', 3000],
      ['September', 2000],
    ]);

    const [october] = withBalances([all[0]], all, new Map([['7', { id: 7, name: 'A', annualCharges: 5000, paidAnnualCharges: 1500 }]]), { dueDays: 10, lateFine: 0 }, NOW);
    expect(october).toMatchObject({ previousArrears: 5000, remainingAnnualCharges: 3500, balanceDue: 3000 + 5000 + 3500 });
  });
});

describe('charges on top of the fee', () => {
  it('checks charges typed into a form', () => {
    expect(parseCharges(undefined)).toEqual([]);
    expect(parseCharges([{ label: ' Exam Fee ', amount: '500' }])).toEqual([{ label: 'Exam Fee', amount: 500 }]);
    expect(parseCharges([{ label: '', amount: 500 }])).toMatch(/needs a name/);
    expect(parseCharges([{ label: 'Exam Fee', amount: 0 }])).toMatch(/above zero/);
    expect(parseCharges([{ label: 'Exam Fee', amount: 'abc' }])).toMatch(/above zero/);
    expect(parseCharges('Exam Fee')).toMatch(/list/);
    expect(parseCharges([{ label: 'x'.repeat(41), amount: 1 }])).toMatch(/too long/);
  });

  it('drops malformed charges coming from old data instead of failing', () => {
    expect(cleanCharges([{ label: 'Transport', amount: 2000.456 }, { label: 'Bad' }, null, 'x'])).toEqual([{ label: 'Transport', amount: 2000.46 }]);
    expect(cleanCharges({ label: 'Transport' })).toEqual([]);
  });

  it('bills the fee less the discount plus the monthly charges', () => {
    const student = { id: 7, name: 'A', classId: '3', monthlyFee: 3000, discount: 500, monthlyCharges: [{ label: 'Transport', amount: 2000 }] };
    expect(monthlyBill(student)).toBe(4500);
    expect(monthlyBill({ monthlyFee: 1000, discount: 1500 })).toBe(0);
    const v = newVoucher(student, 'Class 3', 'November', '2026', NOW, NOW);
    expect(v).toMatchObject({ amount: 4500, baseAmount: 3000, discount: 500, charges: [{ label: 'Transport', amount: 2000 }], status: 'Unpaid' });
    expect(tuitionOf(v)).toBe(3000);
    // Older vouchers have no baseAmount: the tuition is what's left after the charges.
    expect(tuitionOf({ amount: 3500, charges: [{ label: 'Exam Fee', amount: 500 }] })).toBe(3000);
  });

  it('counts charges as part of what the month owes', () => {
    const v = voucher({ amount: 3500, charges: [{ label: 'Exam Fee', amount: 500 }], paidTuition: 3000 });
    expect(tuitionOwed(v, 0, NOW)).toBe(500);
    expect(voucherStatus(v)).toBe('Partially Paid');
    expect(voucherStatus({ ...v, paidTuition: 3500 })).toBe('Paid');
  });

  it('keeps old vouchers marked Paid without amounts as Paid', () => {
    expect(voucherStatus(voucher({ status: 'Paid', paidTuition: undefined, paidAC: 500 }))).toBe('Paid');
  });
});

describe('advance months', () => {
  it('turns period numbers back into months', () => {
    expect(monthOfPeriod(periodOf({ month: 'December', year: '2026' }) + 1)).toEqual({ month: 'January', year: '2027' });
    expect(monthOfPeriod(periodOf({ month: 'March', year: '2027' }))).toEqual({ month: 'March', year: '2027' });
  });

  it("makes a month paid ahead due in that month, never before today", () => {
    const january = periodOf({ month: 'January', year: '2027' });
    expect(advanceDueDate(january, 10, NOW).getTime()).toBe(new Date(2027, 0, 1).getTime() + 10 * 24 * 60 * 60 * 1000);
    const october = periodOf({ month: 'October', year: '2026' });
    expect(advanceDueDate(october, 10, NOW).getTime()).toBe(NOW.getTime() + 10 * 24 * 60 * 60 * 1000);
  });
});

describe('features the Super Admin switches', () => {
  it('are all on unless switched off, and off when something they need is off', () => {
    expect(FEATURE_KEYS.every((key) => DEFAULT_FEATURES[key])).toBe(true);
    expect(featureOn(undefined, 'charges')).toBe(true);
    expect(featureOn({ charges: false }, 'charges')).toBe(false);
    expect(featureOn({ collection: false }, 'cashbook')).toBe(false);
    expect(featureOn({ collection: false }, 'advance')).toBe(false);
    expect(featureOn({ students: false }, 'importStudents')).toBe(false);
    expect(featureOn({ collection: false }, 'charges')).toBe(true);
  });

  it('know which page belongs to which feature', () => {
    expect(featureOfPath('/ledger/42')).toBe('studentLedger');
    expect(featureOfPath('/classes/3')).toBe('classes');
    expect(featureOfPath('/cashbook')).toBe('cashbook');
    expect(featureOfPath('/ac-ledger')).toBe('ledger');
    expect(featureOfPath('/')).toBeNull();
    expect(featureOfPath('/feature-locked')).toBeNull();
  });
});

describe('WhatsApp links', () => {
  it('turns Pakistani numbers written any common way into the international form', () => {
    expect(whatsappNumber('0300-1234567')).toBe('923001234567');
    expect(whatsappNumber('+92 300 1234567')).toBe('923001234567');
    expect(whatsappNumber('0092 300 1234567')).toBe('923001234567');
    expect(whatsappNumber('300 1234567')).toBe('923001234567');
    expect(whatsappNumber('051-123')).toBeNull();
    expect(whatsappNumber(undefined)).toBeNull();
  });

  it('builds a link with the message filled in', () => {
    expect(whatsappLink('0300-1234567', 'Fee due: Rs. 500')).toBe('https://wa.me/923001234567?text=Fee%20due%3A%20Rs.%20500');
    expect(whatsappLink('', 'x')).toBeNull();
  });

  it('treats differently written copies of a number as the same family', () => {
    expect(samePhone('0300-1234567', '+923001234567')).toBe(true);
    expect(samePhone('0300-1234567', '0300-1234568')).toBe(false);
    expect(samePhone(undefined, undefined)).toBe(false);
  });

  it('writes a reminder with the amount and how long it has been owed', () => {
    const text = reminderMessage({ school: 'Brook Field', student: 'Ali', className: '5th - A', total: 8900, months: 3, since: 'April 2026' });
    expect(text).toContain('Rs. 8,900 for Ali (5th - A)');
    expect(text).toContain('for 3 month(s), since April 2026');
  });
});

describe('CSV files', () => {
  it('reads quotes, embedded commas and line breaks, BOM and Windows line endings', () => {
    const text = '﻿Name,Note\r\n"Khan, Ali","said ""hi""\nthere"\r\n\r\nSara,\r\n';
    expect(parseCsv(text)).toEqual([
      ['Name', 'Note'],
      ['Khan, Ali', 'said "hi"\nthere'],
      ['Sara', ''],
    ]);
  });

  it('writes what it reads', () => {
    const rows = [['a,b', 'say "x"'], ['1', '2']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it('recognises common column headings and reports missing required ones', () => {
    const { rows, missing } = readStudentRows(parseCsv("Student Name,Father's Name,Mobile No,GR No,Class,Section,Fee,Remarks\nAli,Imran,0300-1234567,12,5th,A,3000,x"));
    expect(missing).toEqual([]);
    expect(rows).toEqual([
      { name: 'Ali', fatherName: 'Imran', parentPhone: '0300-1234567', admissionNumber: '12', className: '5th', section: 'A', monthlyFee: '3000' },
    ]);
    expect(readStudentRows(parseCsv('Name,Fee\nAli,3000')).missing).toEqual(['Class']);
  });
});
