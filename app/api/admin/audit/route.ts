import { NextResponse } from 'next/server';
import { ADMIN, requireFeature, requireSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { jsonError } from '@/lib/http';
import type { AuditEntry } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * The school's Activity Log, newest first. ?type=payment narrows it to one kind of action
 * (the part before the dot); ?before=<time of the last entry shown> fetches the next page.
 */
export async function GET(request: Request) {
  const session = await requireSession(ADMIN);
  if (session instanceof NextResponse) return session;
  const locked = await requireFeature(session, 'activity');
  if (locked) return locked;

  const params = new URL(request.url).searchParams;
  const limit = Math.min(500, Math.max(1, parseInt(params.get('limit') || '200') || 200));
  const type = params.get('type');
  const before = params.get('before');

  const beforeTime = before ? new Date(before) : null;

  try {
    const db = await getDb();
    const entries = await db`
      select at, username, display_name, role, action, summary from audit_log
      where school_id = ${session.schoolId}
        ${type && /^[a-z]+$/.test(type) ? db`and (action = ${type} or action like ${`${type}.%`})` : db``}
        ${beforeTime && !isNaN(beforeTime.getTime()) ? db`and at < ${beforeTime}` : db``}
      order by at desc, id desc
      limit ${limit}`;
    return NextResponse.json(entries as unknown as AuditEntry[], { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error(`GET audit log failed for ${session.schoolId}:`, err);
    return jsonError('Failed to load the activity log', 500);
  }
}
