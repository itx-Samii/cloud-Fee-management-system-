import { randomInt } from 'crypto';
import { getDb, transaction } from './db';
import { audit } from './audit';
import { decryptParentPin, encryptParentPin } from './parentPinEncryption';
import { findAll, hashPassword, readConfig, verifyPassword } from './dbHandler';
import { featureOn } from './features';
import { classLabel, isLeft, periodOf, studentDues, withBalances, withVoucherStudent } from './fees';
import { loadChallanProfile } from './challanSettings';
import { TRIAL_EXPIRED_MESSAGE } from './trials';
import { loadFeeSettings } from './ledger';
import { getFeatures, getLicense, getLicenseStatus } from './license';
import { whatsappNumber } from './whatsapp';
import type { Session } from './session';
import type { FeeVoucher, Payment, SchoolClass, Student } from './types';

// The parent portal. A family is everyone on one parent phone number, as everywhere else in the
// app; the school gives the family a PIN, and the parent signs in with the phone number and PIN to
// see (never change) their children's fees. Which children those are is worked out afresh on every
// request from the students' phone numbers, so a student moved to another number drops out at once.

export const PIN_LENGTH = 6;
const MAX_FAILED = 10;
const LOCK_MINUTES = 15;

export interface ParentLogin {
  phone: string;
  pinSetAt: string;
  pinSetBy: string;
  lastLoginAt?: string;
}

export const newPin = () => String(randomInt(0, 10 ** PIN_LENGTH)).padStart(PIN_LENGTH, '0');

/** The school's students on this family number (WhatsApp form, 923001234567). */
export async function familyOf(schoolId: string, phone: string): Promise<Student[]> {
  const students = await findAll<Student>('students', schoolId);
  return students.filter((s) => whatsappNumber(s.parentPhone) === phone).sort((a, b) => Number(a.id) - Number(b.id));
}

export async function getParentLogin(schoolId: string, phone: string): Promise<ParentLogin | null> {
  const db = await getDb();
  const [row] = await db`
    select phone, pin_set_at, pin_set_by, last_login_at from parent_logins where school_id = ${schoolId} and phone = ${phone}`;
  return (row as ParentLogin | undefined) ?? null;
}

/** Gives the family a new PIN (a first one, or a replacement that ends every earlier sign-in). */
export async function setParentPin(session: Session, phone: string): Promise<{ pin: string; reset: boolean }> {
  const pin = newPin();
  const db = await getDb();
  const [row] = await db`
    insert into parent_logins (school_id, phone, pin, pin_encrypted, pin_set_at, pin_set_by)
    values (${session.schoolId}, ${phone}, ${hashPassword(pin)}, ${encryptParentPin(pin, session.schoolId, phone)}, ${new Date().toISOString()}, ${session.username})
    on conflict (school_id, phone) do update set
      pin = excluded.pin, pin_encrypted = excluded.pin_encrypted, pin_set_at = excluded.pin_set_at,
      pin_set_by = excluded.pin_set_by, failed_logins = 0, locked_until = null
    returning (xmax = 0) as inserted`;
  return { pin, reset: !row.inserted };
}

/** Reads the current PIN without modifying credentials or sign-in state. */
export async function revealParentPin(session: Session, phone: string, names: string) {
  return transaction(async (tx) => {
    const [row] = await tx<{ pinEncrypted?: string }[]>`
      select pin_encrypted from parent_logins where school_id = ${session.schoolId} and phone = ${phone} for share`;
    if (!row) return { status: 'missing' } as const;
    const pin = row.pinEncrypted && decryptParentPin(row.pinEncrypted, session.schoolId, phone);
    if (!pin) return { status: 'unavailable' } as const;
    await audit(session, 'parent.reveal', `Viewed the parent portal PIN for ${names}`, tx);
    return { status: 'revealed', pin } as const;
  });
}

export async function removeParentLogin(schoolId: string, phone: string): Promise<boolean> {
  const db = await getDb();
  const { count } = await db`delete from parent_logins where school_id = ${schoolId} and phone = ${phone}`;
  return count > 0;
}

const nameOf = (family: Student[]) => {
  const father = family.find((s) => s.fatherName?.trim())?.fatherName?.trim();
  return father || `Parent of ${family.map((s) => s.name).join(', ')}`;
};

export type ParentSignIn =
  | { session: Session }
  | { choose: { schoolId: string; schoolName: string }[] }
  | { error: string; status: number };

async function schoolName(schoolId: string): Promise<string> {
  const [config, license] = await Promise.all([readConfig(schoolId), getLicense(schoolId)]);
  return config.schoolName || license.clientName;
}

/**
 * Checks a phone number and PIN. The same number may have logins at two schools on one
 * installation; if the PIN fits both, the parent picks the school (`schoolId`).
 */
export async function signInParent(phoneInput: string, pin: string, schoolId?: string): Promise<ParentSignIn> {
  const wrong = { error: 'The phone number or PIN is not right.', status: 401 };
  const phone = whatsappNumber(phoneInput);
  if (!phone || !/^\d{4,12}$/.test(pin)) return wrong;

  const db = await getDb();
  const rows = await db`
    select school_id, pin, locked_until from parent_logins
    where phone = ${phone} ${schoolId ? db`and school_id = ${schoolId}` : db``}`;
  if (rows.length === 0) return wrong;

  const now = Date.now();
  const open = rows.filter((r) => !r.lockedUntil || new Date(r.lockedUntil).getTime() <= now);
  if (open.length === 0) return { error: `Too many wrong PINs. Please wait ${LOCK_MINUTES} minutes and try again.`, status: 429 };

  const matched = open.filter((r) => verifyPassword(pin, r.pin));
  if (matched.length === 0) {
    // Every ${MAX_FAILED}th wrong PIN in a row locks the number for a while.
    await db`
      update parent_logins set
        failed_logins = case when failed_logins + 1 >= ${MAX_FAILED} then 0 else failed_logins + 1 end,
        locked_until = case when failed_logins + 1 >= ${MAX_FAILED} then now() + ${`${LOCK_MINUTES} minutes`}::interval else locked_until end
      where phone = ${phone} and school_id in ${db(open.map((r) => String(r.schoolId)))}`;
    return wrong;
  }
  if (matched.length > 1) {
    const choose = await Promise.all(matched.map(async (r) => ({ schoolId: String(r.schoolId), schoolName: await schoolName(String(r.schoolId)) })));
    return { choose };
  }

  const school = String(matched[0].schoolId);
  const status = await getLicenseStatus(school);
  if (status === 'blocked') return { error: "The school's account is blocked. Please contact the school.", status: 403 };
  if (status === 'expired') return { error: TRIAL_EXPIRED_MESSAGE, status: 403 };
  if (!featureOn(await getFeatures(school), 'parentPortal')) {
    return { error: 'The parent portal is switched off for this school. Please contact the school.', status: 403 };
  }
  const family = await familyOf(school, phone);
  if (family.length === 0) return { error: 'No student at the school has this phone number now. Please contact the school.', status: 403 };

  await db`update parent_logins set failed_logins = 0, locked_until = null, last_login_at = now() where school_id = ${school} and phone = ${phone}`;
  return { session: { username: phone, role: 'parent', displayName: nameOf(family), schoolId: school } };
}

/**
 * Why a signed-in parent may no longer look, or null if they may: the school removed the login,
 * or gave a new PIN after they signed in.
 */
export async function parentSessionProblem(session: Session): Promise<string | null> {
  const login = await getParentLogin(session.schoolId, session.username);
  if (!login) return 'Your portal login has been removed by the school.';
  // Sessions record their start to the second; a PIN set more than a second later ends them.
  if (session.issuedAt !== undefined && new Date(login.pinSetAt).getTime() > session.issuedAt + 1000) {
    return 'Your PIN has been changed. Please sign in with the new PIN.';
  }
  return null;
}

const VOUCHER_FIELDS = [
  'id', 'month', 'year', 'amount', 'baseAmount', 'discount', 'charges', 'status', 'issueDate', 'dueDate', 'paymentDate',
  'paidTuition', 'fineWaived', 'lateFine', 'previousArrears', 'remainingAnnualCharges', 'balanceDue',
  'studentName', 'fatherName', 'admissionNumber', 'className',
] as const;

const pick = <T extends object>(record: T, fields: readonly string[]) =>
  Object.fromEntries(fields.filter((f) => f in record).map((f) => [f, (record as Record<string, unknown>)[f]]));

/** Everything the portal shows the family: each child's vouchers (newest first), receipts and balance. */
export async function portalData(session: Session) {
  const { schoolId, username: phone } = session;
  const family = await familyOf(schoolId, phone);
  const ids = family.map((s) => s.id);
  const [fees, payments, classes, settings, name] = await Promise.all([
    ids.length ? findAll<FeeVoucher>('fees', schoolId, { studentId: ids }) : [],
    ids.length ? findAll<Payment>('payments', schoolId, { studentId: ids }) : [],
    findAll<SchoolClass>('classes', schoolId),
    loadFeeSettings(schoolId),
    schoolName(schoolId),
  ]);
  const classById = new Map(classes.map((c) => [String(c.id), c]));
  const students = new Map(family.map((s) => [String(s.id), s]));
  const vouchers = withBalances(fees, fees, students, settings);
  const { profile } = await loadChallanProfile(schoolId, name);

  const children = family.map((s) => {
    const own = vouchers.filter((v) => String(v.studentId) === String(s.id));
    const dues = studentDues(s, own, settings.lateFine);
    return {
      id: s.id,
      name: s.name,
      fatherName: s.fatherName,
      admissionNumber: s.admissionNumber,
      className: classLabel(classById.get(String(s.classId)), s.classId).replace(/\s+/g, ' ').trim(),
      left: isLeft(s),
      balance: dues.totalNow,
      annualCharges: dues.annualCharges,
      overdueMonths: dues.overdue.months,
      vouchers: own.sort((a, b) => periodOf(b) - periodOf(a)).map((v) => pick(withVoucherStudent(v, s, classById), VOUCHER_FIELDS)),
      receipts: payments
        .filter((p) => String(p.studentId) === String(s.id) && !p.reversedAt)
        .sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)))
        .map((p) => ({
          id: p.id,
          receivedAt: p.receivedAt,
          amount: p.amount,
          paidAC: p.paidAC,
          months: (p.allocations ?? []).map((a) => `${a.month ?? ''} ${a.year ?? ''}`.trim()).filter(Boolean).join(', ') || `${p.month ?? ''} ${p.year ?? ''}`.trim(),
        })),
    };
  });

  return {
    school: { name },
    parent: { name: session.displayName, phone },
    settings: { dueDays: settings.dueDays, lateFine: settings.lateFine },
    challanProfile: profile,
    total: children.reduce((sum, c) => sum + c.balance, 0),
    children,
  };
}
