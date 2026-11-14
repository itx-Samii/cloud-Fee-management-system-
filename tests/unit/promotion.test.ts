import { describe, expect, it } from 'vitest';
import { gradeOf, parsePromotionSteps, promotedFee, suggestNextClass } from '@/lib/promotionPlan';
import type { SchoolClass } from '@/lib/types';

const cls = (id: number, name: string, section = ''): SchoolClass => ({ id, name, section }) as SchoolClass;

describe('class promotion rules', () => {
  it('reads how far up the school a class is from its name', () => {
    expect(gradeOf('5th')).toBe(5);
    expect(gradeOf('Class Two')).toBe(2);
    expect(gradeOf('Pre 9th ')).toBe(8.5);
    expect(gradeOf('Play Group')).toBe(-3);
    expect(gradeOf('Nursery')).toBe(-2);
    expect(gradeOf('Prep')).toBe(-1);
    expect(gradeOf('KG 2')).toBeCloseTo(-0.8);
    expect(gradeOf('1st Year')).toBe(11);
    expect(gradeOf('Blue')).toBeNull();
  });

  it('suggests the next class up in the same section, and nothing for the top class', () => {
    const classes = [
      cls(1, '5th', 'A'), cls(2, '5th ', 'B'), cls(3, '6th ', 'A'), cls(4, '6th ', 'B'),
      cls(7, 'Pre 9th ', 'A'), cls(5, '7th', 'A'), cls(12, '9th', 'A'), cls(13, '9th ', 'B'), cls(20, 'Blue'),
    ];
    const next = (id: number) => suggestNextClass(classes.find((c) => c.id === id) as SchoolClass, classes);
    expect(next(1)).toBe(3);
    expect(next(2)).toBe(4);
    expect(next(5)).toBe(7);
    expect(next(7)).toBe(12);
    expect(next(12)).toBeNull();
    expect(next(20)).toBeNull();
    // One class of the next grade takes everyone; two without a matching section is a guess not made.
    expect(suggestNextClass(cls(30, '8th', 'B'), [cls(31, '9th')])).toBe(31);
    expect(suggestNextClass(cls(30, '8th', 'C'), [cls(31, '9th', 'A'), cls(32, '9th', 'B')])).toBeNull();
  });

  it("works out the new fee: kept, raised by an amount or a percentage, or the new class's", () => {
    expect(promotedFee(3000, { mode: 'keep' }, undefined)).toBe(3000);
    expect(promotedFee(3000, { mode: 'add', amount: 250 }, undefined)).toBe(3250);
    expect(promotedFee(2750, { mode: 'percent', amount: 10 }, undefined)).toBe(3025);
    expect(promotedFee(2755, { mode: 'percent', amount: 10 }, undefined)).toBe(3031);
    expect(promotedFee(3000, { mode: 'class' }, { monthlyFee: 4200 })).toBe(4200);
  });

  it('checks a plan sent to the server', () => {
    expect(parsePromotionSteps([{ fromClassId: '5', to: '6', keepBack: ['9'] }])).toEqual([
      { fromClassId: 5, to: 6, fee: { mode: 'keep' }, addAnnualCharges: 0, keepBack: [9] },
    ]);
    expect(parsePromotionSteps([{ fromClassId: 5, to: 'left', fee: { mode: 'class' }, addAnnualCharges: 900 }])).toEqual([
      { fromClassId: 5, to: 'left', fee: { mode: 'keep' }, addAnnualCharges: 0, keepBack: [] },
    ]);
    expect(parsePromotionSteps([{ fromClassId: 5, to: 6 }, { fromClassId: 5, to: 7 }])).toBe('A class can only be promoted once at a time');
    expect(parsePromotionSteps([{ fromClassId: 5, to: 6, fee: { mode: 'add', amount: -5 } }])).toContain('between 0 and');
    expect(parsePromotionSteps([{ fromClassId: 5, to: 6, keepBack: ['x'] }])).toContain('ids');
    expect(parsePromotionSteps('everything')).toBe('Choose at least one class to promote');
  });
});
