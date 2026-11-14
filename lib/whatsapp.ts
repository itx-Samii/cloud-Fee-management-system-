// WhatsApp "click to chat" links: the message opens ready to send in WhatsApp (app or web) on the
// staff member's phone or computer. Nothing is sent automatically and no paid service is needed.

/** Phone numbers people type: digits, spaces, dashes, brackets and a leading +. */
export const PHONE_PATTERN = /^\+?[0-9][0-9\s()-]{6,19}$/;

/**
 * The international form WhatsApp expects, without "+": Pakistani mobiles written the local way
 * (0300-1234567 or 300 1234567) become 923001234567. Returns null if it can't be a phone number.
 */
export function whatsappNumber(phone: string | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = `92${digits.slice(1)}`;
  else if (digits.length === 10 && digits.startsWith('3')) digits = `92${digits}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

export function whatsappLink(phone: string | undefined, message: string): string | null {
  const number = whatsappNumber(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : null;
}

/** Two numbers are the same family's if they reach the same WhatsApp number. */
export function samePhone(a: string | undefined, b: string | undefined): boolean {
  const x = whatsappNumber(a);
  return x !== null && x === whatsappNumber(b);
}

const rupees = (amount: number) => `Rs. ${amount.toLocaleString('en-US')}`;

export function reminderMessage(input: { school: string; student: string; className: string; total: number; months: number; since: string }): string {
  const overdue = input.months > 0 ? ` for ${input.months} month(s), since ${input.since}` : '';
  return (
    `Assalam-o-Alaikum. This is a reminder from ${input.school}: fee of ${rupees(input.total)} for ${input.student} (${input.className}) ` +
    `is outstanding${overdue}. Kindly pay at the school office or bank at your earliest. If already paid, please ignore this message. Thank you.`
  );
}

export function receiptMessage(input: { school: string; student: string; amount: number; receiptNo: string | number; months: string; balance: number }): string {
  const balance = input.balance > 0 ? ` Remaining balance: ${rupees(input.balance)}.` : ' No balance is outstanding.';
  return (
    `Assalam-o-Alaikum. ${input.school} has received ${rupees(input.amount)} for ${input.student}` +
    `${input.months ? ` (${input.months})` : ''}. Receipt no. ${input.receiptNo}.${balance} Thank you.`
  );
}

/** One reminder for brothers and sisters together, listing what each owes. */
export function familyReminderMessage(input: { school: string; members: { name: string; className: string; balance: number }[] }): string {
  const owing = input.members.filter((m) => m.balance > 0);
  const total = owing.reduce((sum, m) => sum + m.balance, 0);
  const lines = owing.map((m) => `${m.name} (${m.className}) ${rupees(m.balance)}`).join(', ');
  return (
    `Assalam-o-Alaikum. This is a reminder from ${input.school}: fees of ${rupees(total)} are outstanding for your children: ${lines}. ` +
    `Kindly pay at the school office or bank at your earliest. If already paid, please ignore this message. Thank you.`
  );
}

interface Owing {
  studentId: string | number;
  name: string;
  className: string;
  parentPhone?: string;
  total: number;
  months: number;
  oldestUnpaid: string;
  lastReminder?: { at: string; by: string } | null;
}

/** One WhatsApp message to send: a family (everyone on the same number) and what they owe. */
export interface ReminderBatch<T extends Owing> {
  number: string;
  members: T[];
  total: number;
  message: string;
  link: string;
  /** The family's latest reminder, if any. */
  lastReminded: string | null;
}

/**
 * Defaulters as reminders to send, one message per family (brothers and sisters together), biggest
 * balance first; plus the students with no usable phone number, who can't be messaged.
 */
export function reminderBatches<T extends Owing>(rows: T[], school: string): { batches: ReminderBatch<T>[]; noPhone: T[] } {
  const families = new Map<string, T[]>();
  const noPhone: T[] = [];
  for (const row of rows) {
    const number = whatsappNumber(row.parentPhone);
    if (number) families.set(number, [...(families.get(number) ?? []), row]);
    else noPhone.push(row);
  }
  const batches = [...families].map(([number, members]) => {
    const [first] = members;
    const message =
      members.length === 1
        ? reminderMessage({ school, student: first.name, className: first.className, total: first.total, months: first.months, since: first.oldestUnpaid })
        : familyReminderMessage({ school, members: members.map((m) => ({ name: m.name, className: m.className, balance: m.total })) });
    const lastReminded = members.map((m) => m.lastReminder?.at).filter((at): at is string => !!at).sort().pop() ?? null;
    return {
      number,
      members,
      total: members.reduce((sum, m) => sum + m.total, 0),
      message,
      link: `https://wa.me/${number}?text=${encodeURIComponent(message)}`,
      lastReminded,
    };
  });
  return { batches: batches.sort((a, b) => b.total - a.total), noPhone };
}
