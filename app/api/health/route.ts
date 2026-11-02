import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** For uptime monitors and the installer: is the app up, and can it reach the database? */
export async function GET() {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const db = await getDb();
    await db`select 1`;
    return NextResponse.json({ status: 'ok', database: 'ok', time: new Date().toISOString() }, { headers });
  } catch (err) {
    console.error('Health check: database unreachable:', err);
    return NextResponse.json({ status: 'error', database: 'unreachable' }, { status: 503, headers });
  }
}
