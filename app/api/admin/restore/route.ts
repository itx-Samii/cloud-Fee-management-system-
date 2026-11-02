import { NextResponse } from 'next/server';
import { ADMIN, requireSession } from '@/lib/auth';
import { audit } from '@/lib/audit';
import {
  BACKUP_COLLECTIONS,
  checkRestoreSection,
  replaceAll,
  updateConfig,
  usernamesTakenElsewhere,
  type CollectionName,
} from '@/lib/dbHandler';
import { jsonError, readBody, toText } from '@/lib/http';

type Doc = Record<string, unknown>;

function isRecordList(value: unknown): value is Doc[] {
  return Array.isArray(value) && value.every((item) => item && typeof item === 'object' && !Array.isArray(item));
}

/** Replaces the caller's own school data with a backup file. Other schools are never touched. */
export async function POST(request: Request) {
  const session = await requireSession(ADMIN);
  if (session instanceof NextResponse) return session;
  const { schoolId } = session;

  const backup = await readBody(request);
  const data = backup?.data;
  if (!backup || backup.system !== 'School Pay ERP' || !data || typeof data !== 'object' || Array.isArray(data)) {
    return jsonError('Invalid backup file format', 400);
  }
  if (typeof backup.schoolId === 'string' && backup.schoolId !== schoolId) {
    return jsonError('This backup belongs to a different school and cannot be restored here.', 400);
  }

  // Check everything before writing anything.
  const sections = Object.entries(data as Record<string, unknown>);
  for (const [name, records] of sections) {
    if (!BACKUP_COLLECTIONS.includes(name as CollectionName)) return jsonError(`Unknown section "${name}" in backup file`, 400);
    if (!isRecordList(records)) return jsonError(`Section "${name}" in backup file is damaged`, 400);
    const problem = checkRestoreSection(name as CollectionName, records);
    if (problem) return jsonError(problem, 400);
  }

  const users = (data as Record<string, unknown>).users;
  if (isRecordList(users)) {
    const taken = await usernamesTakenElsewhere(users.map((u) => String(u.username ?? '')), schoolId);
    if (taken.length > 0) return jsonError(`These usernames already belong to another school: ${taken.join(', ')}`, 400);
  }

  try {
    // All sections in one go: if any of it fails, the school's data stays exactly as it was.
    await replaceAll(schoolId, sections as [CollectionName, Doc[]][]);

    const config = backup.config as Record<string, unknown> | undefined;
    const schoolName = toText(config?.schoolName);
    if (schoolName) await updateConfig(schoolId, { schoolName });

    const counts = sections.map(([name, records]) => `${(records as Doc[]).length} ${name}`).join(', ');
    const taken = typeof backup.timestamp === 'string' ? ` taken ${backup.timestamp.slice(0, 10)}` : '';
    await audit(session, 'backup.restore', `Restored a backup${taken}: ${counts}`);

    return NextResponse.json({ success: true, message: 'System restored successfully' });
  } catch (err) {
    console.error(`Restore failed for ${schoolId}:`, err);
    return jsonError('Restoration failed', 500);
  }
}
