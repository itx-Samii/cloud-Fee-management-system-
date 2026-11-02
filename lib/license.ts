import { getDb } from './db';
import { LEGACY_SCHOOL_ID } from './dbHandler';
import { DEFAULT_FEATURES, FEATURE_KEYS, type Features } from './features';

export { DEFAULT_FEATURES, type Features };
export type LicenseStatus = 'active' | 'blocked';

/** A license's stored features with every known key filled in (new features start on). */
export function featuresOf(stored: unknown): Features {
  const input = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {};
  return Object.fromEntries(FEATURE_KEYS.map((key) => [key, input[key] !== false])) as Features;
}

export interface LicenseInfo {
  status: LicenseStatus;
  clientName: string;
  key?: string;
  maxStudents: number;
  features: Features;
  lastChecked: string;
}

export const DEFAULT_MAX_STUDENTS = 1000;

export function isLegacySchool(schoolId: string): boolean {
  return schoolId === LEGACY_SCHOOL_ID || schoolId === 'client_1';
}

export async function getLicense(schoolId: string): Promise<LicenseInfo> {
  const lastChecked = new Date().toISOString();
  if (schoolId === 'master') {
    return { status: 'active', clientName: 'Master Controller', key: 'MASTER-KEY', maxStudents: 100000, features: DEFAULT_FEATURES, lastChecked };
  }

  const db = await getDb();
  const [license] = await db`select * from licenses where school_id = ${schoolId}`;
  if (license) {
    return {
      status: license.status === 'blocked' ? 'blocked' : 'active',
      clientName: license.clientName || 'School System',
      key: license.licenseKey,
      maxStudents: license.maxStudents || DEFAULT_MAX_STUDENTS,
      features: featuresOf(license.features),
      lastChecked,
    };
  }

  // No license record yet (a fresh install, until the Super Admin page creates Brook Field's).
  return {
    status: 'active',
    clientName: isLegacySchool(schoolId) ? 'Brook Field School System' : 'School System',
    maxStudents: DEFAULT_MAX_STUDENTS,
    features: DEFAULT_FEATURES,
    lastChecked,
  };
}

// Every API call checks the license, so remember each school's status and features briefly.
// Changes from the Super Admin page take effect at once (forgetLicenseStatus); anything else
// within STATUS_TTL_MS.
const STATUS_TTL_MS = 30_000;
const statusCache = new Map<string, { status: LicenseStatus; features: Features; at: number }>();

async function cachedLicense(schoolId: string) {
  const cached = statusCache.get(schoolId);
  if (cached && Date.now() - cached.at < STATUS_TTL_MS) return cached;
  const { status, features } = await getLicense(schoolId);
  const entry = { status, features, at: Date.now() };
  statusCache.set(schoolId, entry);
  return entry;
}

export async function getLicenseStatus(schoolId: string): Promise<LicenseStatus> {
  return (await cachedLicense(schoolId)).status;
}

/** Which features the Super Admin has left on for this school. */
export async function getFeatures(schoolId: string): Promise<Features> {
  return (await cachedLicense(schoolId)).features;
}

export function forgetLicenseStatus(schoolId: string) {
  statusCache.delete(schoolId);
}
