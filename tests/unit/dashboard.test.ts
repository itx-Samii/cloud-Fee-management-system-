import { describe, expect, it } from 'vitest';
import { dashboardCashFlow, dashboardExpenses, dashboardIncome } from '@/lib/dashboard';
import type { Expense, FeeVoucher, Payment, SalaryRecord } from '@/lib/types';

const receipt = (id: number, month: number, tuition: number, ac = 0): Payment => ({
  id, voucherId: 1, paidTuition: tuition, paidAC: ac, amount: tuition + ac,
  receivedAt: new Date(2026, month - 1, 10, 12).toISOString(), receivedBy: 'cashier',
});

describe('dashboard chart periods', () => {
  const expenses: Expense[] = [
    { id: 1, amount: 600, date: '2026-11-10', category: 'Supplies' },
    { id: 2, amount: 900, date: '2026-11-11', category: 'Salary' },
    { id: 3, amount: 250, date: '2026-09-10', category: 'Supplies' },
  ];
  const salaries: SalaryRecord[] = [
    { id: 1, staffId: 1, staffName: 'Test staff', amount: 900, paymentDate: '2026-11-11' },
  ];
  const payments = [receipt(1, 11, 2000, 300), { ...receipt(2, 11, 500), reversedAt: '2026-11-12' }];
  const now = new Date(2026, 10, 13);

  it('uses local days and matches the summary without counting reversals or salary duplicates', () => {
    const days = dashboardCashFlow(payments, expenses, salaries, 'monthly', now);
    expect(days).toHaveLength(30);
    expect(days[9]).toMatchObject({ date: new Date(2026, 10, 10), collections: 2300, expenses: 600 });
    expect(days[10]).toMatchObject({ collections: 0, expenses: 900 });
    expect(days.reduce((sum, day) => sum + day.expenses, 0)).toBe(dashboardExpenses(expenses, salaries, 'monthly', now));
    expect(days.reduce((sum, day) => sum + day.collections, 0)).toBe(dashboardIncome([], [], payments, 'monthly', now).gross);
  });

  it('keeps quiet months and excludes undated legacy collections from the timeline', () => {
    const months = dashboardCashFlow(payments, expenses, salaries, 'all-time', now);
    expect(months.map((point) => point.date.getMonth())).toEqual([8, 9, 10]);
    expect(months[1]).toMatchObject({ collections: 0, expenses: 0 });
    expect(months[2]).toMatchObject({ collections: 2300, expenses: 1500 });
    expect(dashboardCashFlow([], [], [], 'all-time', now)).toEqual([]);
  });
});
const fees: FeeVoucher[] = [{ id: 1, studentId: 1, month: 'October', year: '2026', amount: 3000, paidTuition: 3000, status: 'Paid' }];

describe('dashboard receipt accounting', () => {
  it('splits instalments by receipt month and excludes reversals', () => {
    const payments = [receipt(1, 10, 1000, 200), receipt(2, 11, 2000, 300), { ...receipt(3, 11, 100, 50), reversedAt: '2026-11-12' }];
    const now = new Date(2026, 10, 13);
    expect(dashboardIncome(fees, [{ id: 1, name: 'Student', paidAnnualCharges: 500 }], payments, 'monthly', now))
      .toEqual({ tuition: 2000, annualCharges: 300, gross: 2300, legacyUnallocated: 0 });
  });

  it('includes undated legacy money only in lifetime totals without counting receipts twice', () => {
    const students = [{ id: 1, name: 'Student', paidAnnualCharges: 500 }];
    const payments = [receipt(1, 11, 1000, 200)];
    expect(dashboardIncome(fees, students, payments, 'monthly', new Date(2026, 10, 13)).gross).toBe(1200);
    expect(dashboardIncome(fees, students, payments, 'all-time')).toEqual({ tuition: 3000, annualCharges: 500, gross: 3500, legacyUnallocated: 2300 });
  });
});
