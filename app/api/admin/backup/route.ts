import { NextResponse } from 'next/server';
import { ADMIN, requireSession } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { BACKUP_COLLECTIONS, findAll, readConfig } from '@/lib/dbHandler';
import { jsonError } from '@/lib/http';

export async function GET() {
  const session = await requireSession(ADMIN);
  if (session instanceof NextResponse) return session;
  const { schoolId } = session;

  try {
    const data: Record<string, unknown[]> = {};
    for (const name of BACKUP_COLLECTIONS) {
      data[name] = await findAll(name, schoolId);
    }
    const { schoolName } = await readConfig(schoolId);
    await audit(session, 'backup.download', 'Downloaded a full backup');

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      system: 'School Pay ERP',
      schoolId,
      data,
      // Login credentials are deliberately left out; restore never changes them.
      config: { schoolName },
    });
  } catch (err) {
    console.error(`Backup failed for ${schoolId}:`, err);
    return jsonError('Failed to generate backup', 500);
  }
}
