import { randomBytes } from 'node:crypto';
import type { Db } from './db';
import { DEFAULT_FEATURES } from './features';

/** Run inside a transaction so a school can only sign in once its license exists. */
export async function provisionSchool(db: Db, options: {
  clientName: string; adminUsername: string; passwordHash: string; licenseKey: string; maxStudents: number; trialExpiresAt?: string;
}) {
  const { clientName, adminUsername, passwordHash, licenseKey, maxStudents, trialExpiresAt } = options;
  const slug = clientName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const schoolId = `school_${slug}_${randomBytes(3).toString('hex')}`;
  const [license] = await db`
    insert into licenses (school_id, client_name, admin_username, license_key, max_students, features, trial_expires_at)
    values (${schoolId}, ${clientName}, ${adminUsername}, ${licenseKey}, ${maxStudents}, ${db.json(DEFAULT_FEATURES)}, ${trialExpiresAt ?? null})
    returning *`;
  await db`
    insert into school_settings (school_id, admin_username, admin_password, school_name)
    values (${schoolId}, ${adminUsername}, ${passwordHash}, ${clientName})`;
  return { ...license, schoolId, id: schoolId };
}
