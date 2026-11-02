// Reading and writing the CSV files Excel saves ("CSV (Comma delimited)"). Shared by the
// Students import screen and the server, so both read a file the same way.

/** Splits CSV text into rows of cells: handles quotes, commas and line breaks inside quotes, "" escapes, BOM and CRLF. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (src[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((value) => value.trim() !== ''));
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

// --- Student import ---

export type StudentImportField =
  | 'name'
  | 'fatherName'
  | 'parentPhone'
  | 'admissionNumber'
  | 'className'
  | 'section'
  | 'monthlyFee'
  | 'discount'
  | 'annualCharges';

export type StudentImportRow = Partial<Record<StudentImportField, string>>;

/** Column headings we recognise, compared ignoring case, spaces and punctuation. */
const COLUMN_NAMES: Record<StudentImportField, string[]> = {
  name: ['name', 'student name', 'student', 'full name'],
  fatherName: ['father name', "father's name", 'father', 'guardian', 'guardian name', 'parent name'],
  parentPhone: ['parent phone', 'phone', 'phone no', 'mobile', 'mobile no', 'contact', 'contact no', 'cell', 'whatsapp', 'father phone', 'father mobile'],
  admissionNumber: ['admission no', 'admission number', 'adm no', 'admission', 'reg no', 'registration no', 'gr no'],
  className: ['class', 'class name', 'grade'],
  section: ['section'],
  monthlyFee: ['monthly fee', 'fee', 'tuition fee', 'monthly tuition'],
  discount: ['discount', 'concession', 'scholarship'],
  annualCharges: ['annual charges', 'annual fund', 'annual fee', 'ac'],
};

const squash = (heading: string) => heading.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The headings of the downloadable template, in order. */
export const TEMPLATE_HEADINGS = ['Name', 'Father Name', 'Parent Phone', 'Admission No', 'Class', 'Section', 'Monthly Fee', 'Discount', 'Annual Charges'];

/**
 * Turns a parsed CSV (first row = headings) into import rows. Unrecognised columns are ignored;
 * `missing` lists required columns the file doesn't have.
 */
export function readStudentRows(table: string[][]): { rows: StudentImportRow[]; missing: string[] } {
  const [headings = [], ...body] = table;
  const columns = headings.map((heading) => {
    const key = squash(heading);
    return (Object.keys(COLUMN_NAMES) as StudentImportField[]).find((field) => COLUMN_NAMES[field].some((name) => squash(name) === key));
  });

  const rows = body.map((cells) => {
    const row: StudentImportRow = {};
    columns.forEach((field, i) => {
      if (field && cells[i]?.trim()) row[field] = cells[i].trim();
    });
    return row;
  });
  const missing = (['name', 'className'] as const).filter((field) => !columns.includes(field)).map((field) => (field === 'name' ? 'Name' : 'Class'));
  return { rows, missing };
}
