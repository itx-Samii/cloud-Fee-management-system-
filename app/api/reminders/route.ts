import { NextResponse } from 'next/server';
import { STAFF, requireFeature, requireSession } from '@/lib/auth';
import { parseReminders, recordReminders } from '@/lib/reminders';
import { jsonError, readBody } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** Records fee reminders opened in WhatsApp: { reminders: [{phone, studentIds, amount}] }. */
export async function POST(request: Request) {
  const session = await requireSession(STAFF);
  if (session instanceof NextResponse) return session;
  const locked = await requireFeature(session, 'whatsapp');
  if (locked) return locked;

  const body = await readBody(request);
  const list = parseReminders(body?.reminders);
  if (typeof list === 'string') return jsonError(list, 400);
  // The one-after-another queue is its own feature; a single reminder is plain WhatsApp.
  if (list.length > 1 || body?.bulk === true) {
    const bulkLocked = await requireFeature(session, 'reminders');
    if (bulkLocked) return bulkLocked;
  }

  try {
    return NextResponse.json({ recorded: await recordReminders(session, list) });
  } catch (err) {
    console.error(`Recording reminders failed for ${session.schoolId}:`, err);
    return jsonError('Failed to record the reminder', 500);
  }
}
