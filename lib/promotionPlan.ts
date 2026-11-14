import type { SchoolClass } from './types';

// Class promotion rules shared by the Promotion page and the API: which class follows which, and
// what a student's fee becomes. No database code, so the browser can use it too.

export type FeeRule =
  | { mode: 'keep' }
  | { mode: 'add'; amount: number }
  | { mode: 'percent'; amount: number }
  | { mode: 'class' };

/** One class's part of a promotion. */
export interface PromotionStep {
  fromClassId: number;
  /** The class its students move to, or 'left' for a final class whose students pass out. */
  to: number | 'left';
  fee: FeeRule;
  /** Added to each student's annual charges for the new session. */
  addAnnualCharges: number;
  /** Students who stay where they are (not promoted). */
  keepBack: number[];
}

const MAX_AMOUNT = 1_000_000;
const MAX_PERCENT = 200;

/** A student's monthly fee in the new class. A percentage rise is rounded to whole rupees. */
export function promotedFee(fee: number, rule: FeeRule, target: Pick<SchoolClass, 'monthlyFee'> | undefined): number {
  switch (rule.mode) {
    case 'keep':
      return fee;
    case 'add':
      return fee + rule.amount;
    case 'percent':
      return Math.round(fee * (1 + rule.amount / 100));
    case 'class':
      return Number(target?.monthlyFee) || 0;
  }
}

const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const EARLY_YEARS: [RegExp, number][] = [
  [/\bplay/, -3],
  [/\bnursery\b|\bnur\b/, -2],
  [/\bprep\b|\bkg\b|\bkindergarten\b|\bk\.g\b/, -1],
];

/**
 * How far up the school a class is, from its name: "5th" 5, "Class Two" 2, "Pre 9th" 8.5,
 * "Nursery" -2, "KG 2" -0.8, "1st Year" 11. null when the name doesn't say ("Blue", "O Level").
 */
export function gradeOf(name: string): number | null {
  const text = name.toLowerCase().trim();
  const digits = /(\d+)/.exec(text);
  const word = NUMBER_WORDS.findIndex((w) => new RegExp(`\\b${w}\\b`).test(text));
  const n = digits ? parseInt(digits[1]) : word >= 0 ? word + 1 : null;
  const early = EARLY_YEARS.find(([pattern]) => pattern.test(text))?.[1];
  if (early !== undefined) return early + (n ?? 0) / 10;
  if (n === null) return null;
  if (/\byears?\b/.test(text)) return 10 + n;
  return /\bpre\b|\bpre-/.test(text) ? n - 0.5 : n;
}

const sectionOf = (c: SchoolClass) => String(c.section ?? '').trim().toLowerCase();

/**
 * The class a class's students most likely move up to: the next grade up in the same section
 * (5th A → 6th A), or the only class of the next grade if that has no such section. null when it
 * can't tell, or when this is the top class, so nothing is suggested that the school didn't mean.
 */
export function suggestNextClass(from: SchoolClass, classes: SchoolClass[]): number | null {
  const grade = gradeOf(from.name);
  if (grade === null) return null;
  const higher = classes
    .map((c) => ({ c, grade: gradeOf(c.name) }))
    .filter((x): x is { c: SchoolClass; grade: number } => x.c.id !== from.id && x.grade !== null && x.grade > grade);
  if (higher.length === 0) return null;
  const next = Math.min(...higher.map((x) => x.grade));
  const atNext = higher.filter((x) => x.grade === next).map((x) => x.c);
  const sameSection = atNext.find((c) => sectionOf(c) === sectionOf(from));
  if (sameSection) return Number(sameSection.id);
  return atNext.length === 1 ? Number(atNext[0].id) : null;
}

const wholeId = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
};

const amountIn = (value: unknown, max: number): number | null => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : value == null ? 0 : NaN;
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : null;
};

function parseFeeRule(value: unknown): FeeRule | string {
  const rule = (value ?? { mode: 'keep' }) as { mode?: unknown; amount?: unknown };
  switch (rule.mode) {
    case 'keep':
    case 'class':
      return { mode: rule.mode };
    case 'add': {
      const amount = amountIn(rule.amount, MAX_AMOUNT);
      return amount === null ? 'The fee increase must be an amount between 0 and 1,000,000' : { mode: 'add', amount };
    }
    case 'percent': {
      const amount = amountIn(rule.amount, MAX_PERCENT);
      return amount === null ? `The fee increase must be between 0% and ${MAX_PERCENT}%` : { mode: 'percent', amount };
    }
    default:
      return 'Unknown fee rule';
  }
}

/** The promotion steps in a request body, checked; or what is wrong with them. */
export function parsePromotionSteps(value: unknown): PromotionStep[] | string {
  if (!Array.isArray(value) || value.length === 0) return 'Choose at least one class to promote';
  const steps: PromotionStep[] = [];
  for (const raw of value as Record<string, unknown>[]) {
    const fromClassId = wholeId(raw?.fromClassId);
    if (fromClassId === null) return 'Each step needs the class to promote from';
    if (steps.some((s) => s.fromClassId === fromClassId)) return 'A class can only be promoted once at a time';

    const to = raw.to === 'left' ? 'left' : wholeId(raw.to);
    if (to === null) return 'Choose the class each class moves to';
    if (to === fromClassId) return 'A class cannot be promoted into itself';

    const fee = to === 'left' ? { mode: 'keep' as const } : parseFeeRule(raw.fee);
    if (typeof fee === 'string') return fee;
    const addAnnualCharges = to === 'left' ? 0 : amountIn(raw.addAnnualCharges, MAX_AMOUNT);
    if (addAnnualCharges === null) return 'Annual charges must be an amount between 0 and 1,000,000';

    const keepBack = Array.isArray(raw.keepBack) ? raw.keepBack.map(wholeId) : [];
    if (keepBack.some((id) => id === null)) return 'Kept-back students must be given by their ids';
    steps.push({ fromClassId, to, fee, addAnnualCharges, keepBack: keepBack as number[] });
  }
  return steps;
}
