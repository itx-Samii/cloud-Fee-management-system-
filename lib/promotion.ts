import { getDb, transaction, type Db } from './db';
import { lockStudentNumbering } from './dbHandler';
import { classLabel, isLeft } from './fees';
import { Refused } from './ledger';
import { rupees } from './audit';
import { promotedFee, type FeeRule, type PromotionStep } from './promotionPlan';
import type { SchoolClass } from './types';
import type { Session } from './session';

// Class promotion: moving whole classes up for the new session in one go. Every student's class,
// fee, annual charges and status before and after are kept on the promotion, so the latest one can
// be undone. Vouchers are not touched: those already made stay billed to the class and fee of
// their month.

interface StudentState {
  classId: number | null;
  monthlyFee: number;
  annualCharges: number;
  status: string;
  leftAt: string | null;
}

export interface PromotionMove {
  studentId: number;
  name: string;
  from: StudentState;
  to: StudentState;
}

export interface PromotionSummary {
  id: number;
  doneAt: string;
  doneBy: string;
  doneByName?: string;
  summary: string;
  students: number;
  undoneAt?: string;
  undoneBy?: string;
}

export interface PromotionResult {
  id: number;
  moved: number;
  passedOut: number;
  keptBack: number;
  summary: string;
}

export interface UndoResult {
  restored: number;
  /** Students edited after the promotion, whose newer class or fee was left alone. */
  changedSince: string[];
  /** Students deleted since. */
  missing: number;
  doneAt: string;
}

/** One promotion or undo at a time per school. */
const lockPromotions = (tx: Db, schoolId: string) => tx`select pg_advisory_xact_lock(hashtext(${`${schoolId}:promotion`}))`;

type Row = Record<string, unknown>;

const stateOf = (s: Row): StudentState => ({
  classId: s.classId == null ? null : Number(s.classId),
  monthlyFee: Number(s.monthlyFee) || 0,
  annualCharges: Number(s.annualCharges) || 0,
  status: String(s.status ?? 'Active'),
  leftAt: s.leftAt == null ? null : String(s.leftAt),
});

const sameAmount = (a: number, b: number) => Math.abs(a - b) < 0.005;
const sameTime = (a: string | null, b: string | null) => (a && b ? new Date(a).getTime() === new Date(b).getTime() : a === b);

/**
 * Names the latest promotion and whether it was undone. The page sends back the token it was shown,
 * so a second click, or a page opened before someone else promoted, can't promote twice.
 */
export const stateToken = (latest: Pick<PromotionSummary, 'id' | 'undoneAt'> | undefined) =>
  latest ? `${latest.id}${latest.undoneAt ? '-undone' : ''}` : 'none';

/** The school's promotions, newest first. */
export async function listPromotions(schoolId: string, limit = 10): Promise<PromotionSummary[]> {
  const db = await getDb();
  const rows = await db`
    select id, done_at, done_by, done_by_name, summary, jsonb_array_length(moves) as students, undone_at, undone_by
    from promotions where school_id = ${schoolId} order by id desc limit ${limit}`;
  return rows.map((r) => ({ ...r, id: Number(r.id), students: Number(r.students) })) as unknown as PromotionSummary[];
}

async function latestPromotion(tx: Db, schoolId: string) {
  const [row] = await tx`select * from promotions where school_id = ${schoolId} order by id desc limit 1`;
  return row as (Row & { id: number; doneAt: string; undoneAt?: string; moves: PromotionMove[] }) | undefined;
}

/** Saves each student's new class, fee, annual charges and status, in one statement. */
async function saveStates(tx: Db, schoolId: string, rows: [number, StudentState][]) {
  if (rows.length === 0) return;
  const values = rows.map(([id, s]) => [id, s.classId, s.monthlyFee, s.annualCharges, s.status, s.leftAt]);
  await tx`
    update students s set
      class_id = v.class_id::int, monthly_fee = v.monthly_fee::numeric, annual_charges = v.annual_charges::numeric,
      status = v.status, left_at = v.left_at::timestamptz, updated_at = now()
    from (values ${tx(values as unknown as string[][])}) as v (id, class_id, monthly_fee, annual_charges, status, left_at)
    where s.school_id = ${schoolId} and s.id = v.id::int`;
}

function describeFee(rule: FeeRule, target: SchoolClass | undefined): string {
  switch (rule.mode) {
    case 'keep':
      return '';
    case 'add':
      return rule.amount ? `, fee +${rupees(rule.amount)}` : '';
    case 'percent':
      return rule.amount ? `, fee +${rule.amount}%` : '';
    case 'class':
      return `, fee set to ${rupees(target?.monthlyFee)}`;
  }
}

/** Promotes every active student in each step's class, except those kept back, in one transaction. */
export async function promote(session: Session, steps: PromotionStep[], token: string): Promise<PromotionResult> {
  const { schoolId } = session;
  return transaction(async (tx) => {
    await lockPromotions(tx, schoolId);
    await lockStudentNumbering(tx, schoolId);
    const latest = await latestPromotion(tx, schoolId);
    if (stateToken(latest) !== token) {
      throw new Refused('Students were promoted, or a promotion undone, after this page was opened. Reload the page and check again.');
    }

    const classes = (await tx`select * from classes where school_id = ${schoolId}`) as unknown as SchoolClass[];
    const classById = new Map(classes.map((c) => [Number(c.id), c]));
    for (const step of steps) {
      if (!classById.has(step.fromClassId) || (step.to !== 'left' && !classById.has(step.to))) {
        throw new Refused('One of the chosen classes no longer exists. Reload the page and check again.');
      }
      if (step.fee.mode === 'class' && step.to === 'left') throw new Refused('Passed-out students have no new class fee');
    }

    const stepOf = new Map(steps.map((s) => [s.fromClassId, s]));
    const students = await tx`
      select id, name, class_id, monthly_fee, annual_charges, status, left_at from students
      where school_id = ${schoolId} and class_id in ${tx(steps.map((s) => s.fromClassId))}
      order by id for update`;

    const now = new Date().toISOString();
    const moves: PromotionMove[] = [];
    const counts = new Map<number, { moved: number; keptBack: number }>();
    for (const s of students) {
      if (isLeft(s)) continue;
      const step = stepOf.get(Number(s.classId)) as PromotionStep;
      const count = counts.get(step.fromClassId) ?? { moved: 0, keptBack: 0 };
      counts.set(step.fromClassId, count);
      if (step.keepBack.includes(Number(s.id))) {
        count.keptBack++;
        continue;
      }
      const from = stateOf(s);
      const to: StudentState =
        step.to === 'left'
          ? { ...from, status: 'Left', leftAt: now }
          : {
              ...from,
              classId: step.to,
              monthlyFee: promotedFee(from.monthlyFee, step.fee, classById.get(step.to)),
              annualCharges: Math.round((from.annualCharges + step.addAnnualCharges) * 100) / 100,
            };
      moves.push({ studentId: Number(s.id), name: String(s.name), from, to });
      count.moved++;
    }
    if (moves.length === 0) throw new Refused('Nobody to promote: the chosen classes have no students to move.');

    await saveStates(tx, schoolId, moves.map((m) => [m.studentId, m.to]));

    const label = (id: number) => classLabel(classById.get(id), id).replace(/\s+/g, ' ').trim();
    const lines = steps
      .filter((step) => counts.get(step.fromClassId)?.moved)
      .map((step) => {
        const { moved, keptBack } = counts.get(step.fromClassId) as { moved: number; keptBack: number };
        const target = step.to === 'left' ? 'passed out' : label(step.to);
        const extras = [
          keptBack ? `${keptBack} kept back` : '',
          step.to !== 'left' && step.addAnnualCharges ? `annual charges +${rupees(step.addAnnualCharges)}` : '',
        ].filter(Boolean);
        const fee = step.to === 'left' ? '' : describeFee(step.fee, classById.get(step.to));
        return `${label(step.fromClassId)} → ${target}: ${moved}${fee}${extras.length ? ` (${extras.join(', ')})` : ''}`;
      });
    const passedOut = moves.filter((m) => m.to.status === 'Left').length;
    const keptBack = [...counts.values()].reduce((sum, c) => sum + c.keptBack, 0);
    const summary = `Promoted ${moves.length} student(s). ${lines.join('; ')}`;

    const [{ id }] = await tx`
      insert into promotions (school_id, done_at, done_by, done_by_name, summary, moves)
      values (${schoolId}, ${now}, ${session.username}, ${session.displayName}, ${summary}, ${tx.json(moves as never)})
      returning id`;
    return { id: Number(id), moved: moves.length, passedOut, keptBack, summary };
  });
}

/**
 * Undoes the latest promotion: each student's class, fee, annual charges and status go back to
 * what they were, except a field that has been changed again since (that newer edit stays).
 */
export async function undoPromotion(session: Session, id: number): Promise<UndoResult> {
  const { schoolId } = session;
  return transaction(async (tx) => {
    await lockPromotions(tx, schoolId);
    await lockStudentNumbering(tx, schoolId);
    const latest = await latestPromotion(tx, schoolId);
    if (!latest || Number(latest.id) !== id) throw new Refused('Only the latest promotion can be undone.');
    if (latest.undoneAt) throw new Refused('This promotion has already been undone.');

    const moves = latest.moves;
    const current = await tx`
      select id, name, class_id, monthly_fee, annual_charges, status, left_at from students
      where school_id = ${schoolId} and id in ${tx(moves.map((m) => m.studentId))}
      order by id for update`;
    const now = new Map(current.map((s) => [Number(s.id), stateOf(s)]));

    const rows: [number, StudentState][] = [];
    const changedSince: string[] = [];
    let missing = 0;
    for (const m of moves) {
      const state = now.get(m.studentId);
      if (!state) {
        missing++;
        continue;
      }
      const back = { ...state };
      let changed = false;
      if (m.to.classId !== m.from.classId) {
        if (state.classId === m.to.classId) back.classId = m.from.classId;
        else changed = true;
      }
      for (const field of ['monthlyFee', 'annualCharges'] as const) {
        if (sameAmount(m.to[field], m.from[field])) continue;
        if (sameAmount(state[field], m.to[field])) back[field] = m.from[field];
        else changed = true;
      }
      if (m.to.status !== m.from.status) {
        if (state.status === m.to.status && sameTime(state.leftAt, m.to.leftAt)) {
          back.status = m.from.status;
          back.leftAt = m.from.leftAt;
        } else changed = true;
      }
      if (changed) changedSince.push(m.name);
      rows.push([m.studentId, back]);
    }

    await saveStates(tx, schoolId, rows);
    await tx`
      update promotions set undone_at = now(), undone_by = ${session.username}
      where school_id = ${schoolId} and id = ${id}`;
    return { restored: rows.length - changedSince.length, changedSince, missing, doneAt: latest.doneAt };
  });
}
