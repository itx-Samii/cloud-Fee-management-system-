import { getDb } from './db';
import { challanProfile, type ChallanProfile } from './challanProfile';
import { readConfig } from './dbHandler';
import { getLicense } from './license';

export async function loadChallanProfile(schoolId: string, schoolName?: string) {
  const db = await getDb();
  const [row] = await db<{ challanProfile?: ChallanProfile }[]>`
    select challan_profile from school_settings where school_id = ${schoolId}`;
  if (row?.challanProfile) return { profile: row.challanProfile, configured: true };
  if (schoolName === undefined) {
    const [config, license] = await Promise.all([readConfig(schoolId), getLicense(schoolId)]);
    schoolName = config.schoolName || license.clientName;
  }
  return { profile: challanProfile(undefined, schoolName), configured: false };
}
