import { NextResponse } from 'next/server';
import { ADMIN, requireSession } from '@/lib/auth';
import { findAll } from '@/lib/dbHandler';
import { jsonError } from '@/lib/http';

export async function GET() {
  const session = await requireSession(ADMIN);
  if (session instanceof NextResponse) return session;
  try {
    const [fees, students, expenses, salaries, payments] = await Promise.all(
      (['fees', 'students', 'expenses', 'salaries_history', 'payments'] as const)
        .map((table) => findAll(table, session.schoolId))
    );
    return NextResponse.json({ fees, students, expenses, salaries, payments }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return jsonError('Could not load the dashboard. Check the local database and retry.', 503);
  }
}
