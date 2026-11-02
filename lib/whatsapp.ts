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
