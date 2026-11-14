import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decodeSession, SESSION_COOKIE, type Role, type Session } from './session';
import { DEFAULT_FEATURES, getFeatures, getLicenseStatus } from './license';
import { FEATURES, featureOn, type FeatureKey } from './features';
import { jsonError } from './http';
import { staffSessionRevision } from './staffSessions';
import { TRIAL_EXPIRED_MESSAGE } from './trials';

export const ADMIN: Role[] = ['admin'];
export const STAFF: Role[] = ['admin', 'accountant'];

export async function getSession(): Promise<Session | null> {
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session || session.role === 'parent') return session;
  if (!session.revision) return null;
  try {
    return session.revision === await staffSessionRevision(session.username) ? session : null;
  } catch {
    return null;
  }
}

/**
 * Every API route starts here. Returns the caller's session, or a ready-made error response
 * (not logged in, wrong role, school license blocked) to send back as-is.
 */
export async function requireSession(roles: Role[]): Promise<Session | NextResponse> {
  const session = await getSession();
  if (!session) return jsonError('Your session has expired. Please log in again.', 401);
  if (!roles.includes(session.role)) return jsonError('Access denied: your role cannot perform this action.', 403);

  if (session.role !== 'superadmin') {
    const status = await getLicenseStatus(session.schoolId).catch(() => 'unavailable');
    if (status === 'unavailable') return jsonError('Unable to verify school access. Please retry.', 503);
    if (status === 'blocked') return jsonError('This school license is blocked. Please contact your service provider.', 403);
    if (status === 'expired') return jsonError(TRIAL_EXPIRED_MESSAGE, 403);
  }
  return session;
}

/** Whether the Super Admin has left this feature on for the session's school. */
export async function hasFeature(session: Session, key: FeatureKey): Promise<boolean> {
  // As with blocks, a failed lookup doesn't lock the school out.
  return featureOn(await getFeatures(session.schoolId).catch(() => DEFAULT_FEATURES), key);
}

/** null if the feature is on; otherwise the 403 response to send back. */
export async function requireFeature(session: Session, key: FeatureKey): Promise<NextResponse | null> {
  if (await hasFeature(session, key)) return null;
  return jsonError(`"${FEATURES[key].label}" is switched off for this school. Please contact your service provider.`, 403);
}
