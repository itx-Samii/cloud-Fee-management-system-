import { NextResponse } from 'next/server';
import { ADMIN, requireFeature, requireSession } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { transaction } from '@/lib/db';
import { countCurrentStudents, findAll, insertRecords, lockStudentNumbering } from '@/lib/dbHandler';
import { getLicense } from '@/lib/license';
import { jsonError, readBody, toNumber } from '@/lib/http';
import type { StudentImportRow } from '@/lib/csv';
import { PHONE_PATTERN } from '@/lib/whatsapp';
import type { SchoolClass, Student } from '@/lib/types';

const MAX_ROWS = 3000;

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
const classLabel = (c: SchoolClass) => `${c.name}${c.section ? ` - ${c.section}` : ''}`;

/** "5th" + "A", "5th - A", "5th A" or a class id, matched against the school's classes. */
function findClass(classes: SchoolClass[], row: StudentImportRow): SchoolClass | undefined {
  const wanted = squash(`${row.className ?? ''}${row.section ?? ''}`);
  const exact = classes.find((c) => squash(`${c.name}${c.section ?? ''}`) === wanted || String(c.id) === row.className);
  if (exact) return exact;
  // "5th" alone is fine when the school has a single class of that name.
  const byName = classes.filter((c) => squash(c.name) === squash(row.className ?? ''));
  return byName.length === 1 && !row.section ? byName[0] : undefined;
}

function amount(value: string | undefined, fallback: number): number | null {
  if (value === undefined || value.trim() === '') return fallback;
  const n = toNumber(value.replace(/,/g, ''), NaN);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Adds many students at once from a spreadsheet. Every row is checked first and nothing is saved
 * unless all of them are fine, so a corrected file can simply be imported again.
 */
export async function POST(request: Request) {
  const session = await requireSession(ADMIN);
  if (session instanceof NextResponse) return session;
  const locked = await requireFeature(session, 'importStudents');
  if (locked) return locked;
  const { schoolId } = session;

  const body = await readBody(request);
  const rows = body?.rows;
  if (!Array.isArray(rows) || rows.length === 0) return jsonError('The file has no student rows', 400);
  if (rows.length > MAX_ROWS) return jsonError(`Import at most ${MAX_ROWS} students at a time`, 400);

  try {
    const { maxStudents } = await getLicense(schoolId);
    return await transaction(async (tx) => {
      await lockStudentNumbering(tx, schoolId);
      const [classes, existing, current] = await Promise.all([
        findAll<SchoolClass>('classes', schoolId, {}, tx),
        findAll<Student>('students', schoolId, {}, tx),
        countCurrentStudents(schoolId, tx),
      ]);
      if (current + rows.length > maxStudents) {
        return jsonError(
          `This would take the school to ${current + rows.length} students, over its limit of ${maxStudents}. Contact Super Admin to upgrade.`,
          403
        );
      }

      const takenAdmission = new Set(existing.map((s) => squash(String(s.admissionNumber ?? ''))).filter(Boolean));
      const errors: { row: number; message: string }[] = [];
      const now = new Date().toISOString();

      const students = (rows as StudentImportRow[]).map((raw, i) => {
        const row: StudentImportRow = raw && typeof raw === 'object' ? raw : {};
        const line = i + 2; // the file's line number: line 1 holds the headings
        const fail = (message: string) => errors.push({ row: line, message });

        const name = String(row.name ?? '').trim();
        if (!name) fail('Name is missing');

        const cls = findClass(classes, row);
        if (!row.className) fail('Class is missing');
        else if (!cls) fail(`No class called "${[row.className, row.section].filter(Boolean).join(' - ')}". Add it under Classes first.`);

        const monthlyFee = amount(row.monthlyFee, cls?.monthlyFee ?? 0);
        const discount = amount(row.discount, 0);
        const annualCharges = amount(row.annualCharges, cls?.annualCharges ?? 0);
        if (monthlyFee === null) fail(`Monthly fee "${row.monthlyFee}" is not a number`);
        if (discount === null) fail(`Discount "${row.discount}" is not a number`);
        if (annualCharges === null) fail(`Annual charges "${row.annualCharges}" is not a number`);

        const parentPhone = String(row.parentPhone ?? '').trim();
        if (parentPhone && !PHONE_PATTERN.test(parentPhone)) fail(`Phone "${parentPhone}" is not a phone number`);

        const admissionNumber = String(row.admissionNumber ?? '').trim();
        if (admissionNumber) {
          if (takenAdmission.has(squash(admissionNumber))) fail(`Admission no. ${admissionNumber} is already used`);
          takenAdmission.add(squash(admissionNumber));
        }

        return {
          name,
          fatherName: String(row.fatherName ?? '').trim(),
          ...(parentPhone && { parentPhone }),
          ...(admissionNumber && { admissionNumber }),
          classId: cls?.id,
          monthlyFee: monthlyFee ?? 0,
          discount: discount ?? 0,
          annualCharges: annualCharges ?? 0,
          paidAnnualCharges: 0,
          status: 'Active',
          createdAt: now,
        };
      });

      if (errors.length > 0) {
        return NextResponse.json(
          { error: `Nothing was imported: ${errors.length} problem(s) in the file.`, errors, classes: classes.map(classLabel) },
          { status: 400 }
        );
      }

      await insertRecords('students', schoolId, students, tx);
      await audit(session, 'student.import', `Imported ${students.length} student(s) from a spreadsheet`, tx);
      return NextResponse.json({ success: true, created: students.length });
    });
  } catch (err) {
    console.error(`Student import failed for ${schoolId}:`, err);
    return jsonError('Import failed', 500);
  }
}
