import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeSession, encodeSession, type Session } from '@/lib/session';
import { optionalNumber, readBody, toNumber, toText, withoutUndefined } from '@/lib/http';
import { hashPassword, toId, toRow, verifyPassword } from '@/lib/dbHandler';
import { connectionOptions, parseTimestamp, toColumn, toField } from '@/lib/db';
import { describeChanges, rupees } from '@/lib/audit';

const principal: Session = { username: 'admin', role: 'admin', displayName: 'Principal', schoolId: 'school_brookfield' };

describe('session cookie', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads back what it signed, with when it was signed', () => {
    const session = decodeSession(encodeSession(principal));
    expect(session).toEqual({ ...principal, issuedAt: expect.any(Number) });
    expect(Math.abs((session?.issuedAt ?? 0) - Date.now())).toBeLessThan(2000);
  });

  it('rejects a cookie whose contents were changed', () => {
    const [payload, signature] = encodeSession(principal).split('.');
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const forged = Buffer.from(JSON.stringify({ ...data, role: 'superadmin' })).toString('base64url');
    expect(decodeSession(`${forged}.${signature}`)).toBeNull();
  });

  it('rejects empty, unsigned and garbage cookies', () => {
    expect(decodeSession(undefined)).toBeNull();
    expect(decodeSession('')).toBeNull();
    expect(decodeSession(Buffer.from(JSON.stringify(principal)).toString('base64url'))).toBeNull();
    expect(decodeSession('not.a-cookie')).toBeNull();
  });

  it('expires after 12 hours', () => {
    vi.useFakeTimers();
    const token = encodeSession(principal);
    vi.advanceTimersByTime(11 * 60 * 60 * 1000);
    expect(decodeSession(token)).not.toBeNull();
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    expect(decodeSession(token)).toBeNull();
  });
});

describe('passwords', () => {
  it('verifies the right password against its hash and nothing else', () => {
    const stored = hashPassword('Correct#Horse1');
    expect(stored).not.toContain('Correct#Horse1');
    expect(verifyPassword('Correct#Horse1', stored)).toBe(true);
    expect(verifyPassword('correct#horse1', stored)).toBe(false);
  });

  it('salts every hash differently', () => {
    expect(hashPassword('same-password')).not.toBe(hashPassword('same-password'));
  });

  it('still accepts plain-text passwords from old installs', () => {
    expect(verifyPassword('brookfield', 'brookfield')).toBe(true);
    expect(verifyPassword('wrong', 'brookfield')).toBe(false);
  });

  it('fails closed on missing or damaged hashes', () => {
    expect(verifyPassword('x', undefined)).toBe(false);
    expect(verifyPassword('x', '')).toBe(false);
    expect(verifyPassword('x', 'salt:not-hex')).toBe(false);
  });
});

describe('request parsing', () => {
  it('turns numbers and numeric text into numbers, anything else into the fallback', () => {
    expect(toNumber(5)).toBe(5);
    expect(toNumber('2500')).toBe(2500);
    expect(toNumber('abc')).toBe(0);
    expect(toNumber(undefined, 7)).toBe(7);
    expect(toNumber(Infinity)).toBe(0);
  });

  it('keeps "not sent" apart from zero', () => {
    expect(optionalNumber(undefined)).toBeUndefined();
    expect(optionalNumber('')).toBeUndefined();
    expect(optionalNumber('0')).toBe(0);
  });

  it('trims text and refuses objects', () => {
    expect(toText('  Ali  ')).toBe('Ali');
    expect(toText(12)).toBe('12');
    expect(toText({ name: 'x' })).toBeUndefined();
  });

  it('accepts only JSON objects as a body', async () => {
    const body = (text: string) => new Request('http://localhost', { method: 'POST', body: text });
    expect(await readBody(body('{"a":1}'))).toEqual({ a: 1 });
    expect(await readBody(body('[1,2]'))).toBeNull();
    expect(await readBody(body('not json'))).toBeNull();
  });

  it('drops undefined fields only', () => {
    expect(withoutUndefined({ a: 1, b: undefined, c: 0, d: '' })).toEqual({ a: 1, c: 0, d: '' });
  });
});

describe('activity log wording', () => {
  it('formats rupees with thousands separators', () => {
    expect(rupees(12500)).toBe('Rs. 12,500');
    expect(rupees('300')).toBe('Rs. 300');
  });

  it('lists only the fields that changed', () => {
    const labels = { monthlyFee: 'monthly fee', discount: 'discount', name: 'name' };
    expect(describeChanges({ monthlyFee: 3000, discount: 0, name: 'Ali' }, { monthlyFee: 2500, name: 'Ali' }, labels)).toBe(
      'monthly fee 3000 → 2500'
    );
    expect(describeChanges({ monthlyFee: 3000 }, { monthlyFee: '3000' }, labels)).toBe('');
  });
});

describe('database', () => {
  it('connects to both Supabase poolers, and to a local server without SSL', () => {
    const transaction = connectionOptions('postgresql://postgres.abc:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true');
    expect(transaction.url).not.toContain('pgbouncer');
    expect(transaction.options).toMatchObject({ prepare: false, ssl: 'require' });

    const session = connectionOptions('postgresql://postgres.abc:pw@aws-0-ap-south-1.pooler.supabase.com:5432/postgres');
    expect(session.options).toMatchObject({ prepare: true, ssl: 'require' });

    expect(connectionOptions('postgres://postgres:pw@127.0.0.1:5432/fees').options).toMatchObject({ ssl: false });
    expect(connectionOptions('postgres://u:p@db.example.com/x?sslmode=disable').options).not.toHaveProperty('ssl');
  });

  it('reads timestamps the same whatever timezone the server is in', () => {
    expect(parseTimestamp('2026-11-01 07:35:03.406-08')).toBe('2026-11-01T15:35:03.406Z');
    expect(parseTimestamp('2026-11-01 07:35:03.406123+00')).toBe('2026-11-01T07:35:03.406Z');
    expect(parseTimestamp('2026-11-01 07:35:03+05:30')).toBe('2026-11-01T02:05:03.000Z');
  });

  it('names columns in snake_case and fields in camelCase, both ways', () => {
    for (const [field, column] of [['parentPhone', 'parent_phone'], ['paidAC', 'paid_ac'], ['isACOnly', 'is_ac_only'], ['schoolId', 'school_id']]) {
      expect(toColumn(field)).toBe(column);
      expect(toField(column)).toBe(field);
    }
  });

  it('keeps only known fields, coerced to their column types', () => {
    const row = toRow('fees', { studentId: '12', amount: '2,500', status: 'Cleared', fineWaived: 'true', paidTuition: 'abc', junk: 1 }, 'insert');
    expect(row).toMatchObject({ studentId: 12, amount: 2500, status: 'Unpaid', fineWaived: true, paidTuition: null, month: '' });
    expect(row).not.toHaveProperty('junk');

    const update = toRow('students', { name: 'Ali', createdAt: 'not a date', leftAt: '' }, 'update');
    expect(Object.keys(update).sort()).toEqual(['createdAt', 'leftAt', 'name']);
    expect(new Date(update.createdAt as string).getTime()).not.toBeNaN();
    expect(update.leftAt).toBeNull();

    expect([toId(7), toId('7'), toId(' 7 '), toId('7a'), toId(0), toId(-3), toId(2 ** 40), toId(null)]).toEqual([7, 7, 7, null, null, null, null, null]);
  });
});

describe('database settings', () => {
  it('explains a connection string it cannot read', () => {
    expect(() => connectionOptions('not a url')).toThrow(/DATABASE_URL is not a valid connection string/);
  });
});
