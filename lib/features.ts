// What the Super Admin can switch on or off for each school. Shared by the browser (Super Admin
// page, sidebar, locked pages, hidden buttons) and the server (APIs refuse switched-off features),
// so it holds no database code. Every feature is on unless the school's license says false.

export type FeatureKey =
  | 'collection'
  | 'cashbook'
  | 'generate'
  | 'tracking'
  | 'defaulters'
  | 'studentLedger'
  | 'reports'
  | 'expenses'
  | 'ledger'
  | 'salaries'
  | 'classes'
  | 'students'
  | 'users'
  | 'activity'
  | 'charges'
  | 'advance'
  | 'lateFine'
  | 'whatsapp'
  | 'importStudents';

export type Features = Record<FeatureKey, boolean>;

export interface FeatureInfo {
  label: string;
  icon: string;
  description: string;
  group: 'Modules' | 'Fee options' | 'Tools';
  /** Off whenever this one is off too (the Cash Book needs Receive Payment, say). */
  needs?: FeatureKey;
  /** The pages it opens; a switched-off feature's pages show the "locked" screen. */
  pages?: string[];
}

export const FEATURES: Record<FeatureKey, FeatureInfo> = {
  collection: { label: 'Receive Payment', icon: '💰', group: 'Modules', description: 'Taking fees at the counter and printing receipts', pages: ['/collection'] },
  cashbook: { label: 'Daily Cash Book', icon: '📒', group: 'Modules', description: "Each day's receipts, cashier hand-over and receipt reversal", needs: 'collection', pages: ['/cashbook'] },
  generate: { label: 'Generate Vouchers', icon: '⚡', group: 'Modules', description: 'Monthly fee vouchers (challans) and printing them', pages: ['/generate'] },
  tracking: { label: 'Class-wise Tracking', icon: '📈', group: 'Modules', description: 'Paid and unpaid students class by class', pages: ['/tracking'] },
  defaulters: { label: 'Defaulter List', icon: '⏰', group: 'Modules', description: 'Who owes what, biggest balance first, with months unpaid', pages: ['/defaulters'] },
  studentLedger: { label: 'Student Ledger', icon: '📘', group: 'Modules', description: "One student's vouchers, receipts and family balance; printable statement", pages: ['/ledger'] },
  reports: { label: 'Financial Reports', icon: '📑', group: 'Modules', description: 'Billed, collected and pending, with income logs', pages: ['/reports'] },
  expenses: { label: 'Expense Manager', icon: '🧾', group: 'Modules', description: 'Utility bills, maintenance and other expenses', pages: ['/expenses'] },
  ledger: { label: 'AC Ledger', icon: '🏛️', group: 'Modules', description: 'Annual charges billed and received per student', pages: ['/ac-ledger'] },
  salaries: { label: 'Salaries Manager', icon: '💵', group: 'Modules', description: 'Staff, monthly salaries and salary slips', pages: ['/salaries'] },
  classes: { label: 'Classes Management', icon: '🏫', group: 'Modules', description: 'Classes, sections and their fees', pages: ['/classes'] },
  students: { label: 'All Students', icon: '🎓', group: 'Modules', description: 'Student directory, admissions and students who left', pages: ['/students'] },
  users: { label: 'Users & Roles', icon: '🛡️', group: 'Modules', description: 'Accountant logins', pages: ['/users'] },
  activity: { label: 'Activity Log', icon: '🕵️', group: 'Modules', description: 'Who did what and when (always recorded; this only hides the page)', pages: ['/activity'] },
  charges: { label: 'Extra Charges', icon: '➕', group: 'Fee options', description: 'Admission, exam, transport and other charges on top of the monthly fee' },
  advance: { label: 'Advance Fee', icon: '⏩', group: 'Fee options', description: 'Taking fees for the coming months in advance', needs: 'collection' },
  lateFine: { label: 'Late Fine', icon: '⏳', group: 'Fee options', description: 'A fine on vouchers paid after their due date' },
  whatsapp: { label: 'WhatsApp Messages', icon: '💬', group: 'Tools', description: 'Fee reminders and receipts to parents on WhatsApp' },
  importStudents: { label: 'Import from Excel', icon: '📥', group: 'Tools', description: 'Adding many students at once from a CSV file', needs: 'students' },
};

export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];

export const DEFAULT_FEATURES = Object.fromEntries(FEATURE_KEYS.map((key) => [key, true])) as Features;

/** Whether `key` is on for a school with these settings: it and everything it needs. */
export function featureOn(features: Partial<Record<string, boolean>> | null | undefined, key: FeatureKey): boolean {
  if (features?.[key] === false) return false;
  const needs = FEATURES[key].needs;
  return needs ? featureOn(features, needs) : true;
}

/** The feature a page belongs to, if any. */
export function featureOfPath(pathname: string): FeatureKey | null {
  return FEATURE_KEYS.find((key) => FEATURES[key].pages?.some((page) => pathname === page || pathname.startsWith(`${page}/`))) ?? null;
}
