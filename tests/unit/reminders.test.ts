import { describe, expect, it } from 'vitest';
import { reminderBatches } from '@/lib/whatsapp';

const owing = (studentId: number, name: string, total: number, parentPhone?: string, lastReminder?: string) => ({
  studentId,
  name,
  className: '5th - A',
  parentPhone,
  total,
  months: 2,
  oldestUnpaid: 'August 2026',
  lastReminder: lastReminder ? { at: lastReminder, by: 'admin' } : null,
});

describe('reminders to send', () => {
  it('sends one message per family, biggest balance first, and lists who has no phone', () => {
    const rows = [
      owing(1, 'Ayesha', 3000, '0300-1234567', '2026-10-20T09:00:00.000Z'),
      owing(2, 'Bilal', 9000, '0321 7654321'),
      owing(3, 'Fatima', 2000, '+92 300 1234567', '2026-10-28T09:00:00.000Z'),
      owing(4, 'Hamza', 1500),
      owing(5, 'Zain', 1000, '12'),
    ];
    const { batches, noPhone } = reminderBatches(rows, 'Brook Field');

    expect(batches.map((b) => [b.number, b.members.map((m) => m.name), b.total])).toEqual([
      ['923217654321', ['Bilal'], 9000],
      ['923001234567', ['Ayesha', 'Fatima'], 5000],
    ]);
    expect(noPhone.map((s) => s.name)).toEqual(['Hamza', 'Zain']);

    const [single, family] = batches;
    expect(single.message).toContain('fee of Rs. 9,000 for Bilal (5th - A) is outstanding for 2 month(s), since August 2026');
    expect(family.message).toContain('fees of Rs. 5,000 are outstanding for your children: Ayesha (5th - A) Rs. 3,000, Fatima (5th - A) Rs. 2,000');
    expect(family.link).toBe(`https://wa.me/923001234567?text=${encodeURIComponent(family.message)}`);
    expect(family.lastReminded).toBe('2026-10-28T09:00:00.000Z');
    expect(single.lastReminded).toBeNull();
  });
});
