import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { DEFAULT_FEATURES, getLicense } from '@/lib/license';
import { jsonError } from '@/lib/http';

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError('Your session has expired. Please log in again.', 401);

  try {
    const license = await getLicense(session.schoolId);
    // Not cached by the browser, so a feature the Super Admin switches back on shows up at once.
    return NextResponse.json(license, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error(`License lookup failed for ${session.schoolId}:`, err);
    // Don't lock the school out of the UI just because the lookup failed; the APIs still enforce blocks.
    return NextResponse.json({ status: 'active', clientName: 'School System', maxStudents: 1000, features: DEFAULT_FEATURES });
  }
}
