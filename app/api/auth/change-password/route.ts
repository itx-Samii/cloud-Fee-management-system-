import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { MIN_PASSWORD_LENGTH, findAll, hashPassword, readConfig, updateConfig, updateRecord, verifyPassword } from '@/lib/dbHandler';
import { jsonError, readBody, toText } from '@/lib/http';
import type { AppUser } from '@/lib/types';

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError('Your session has expired. Please log in again.', 401);

  const body = await readBody(request);
  const oldPassword = toText(body?.oldPassword);
  const newPassword = toText(body?.newPassword);
  if (!oldPassword || !newPassword) return jsonError('Both old and new passwords are required', 400);
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return jsonError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters`, 400);
  }

  try {
    if (session.role === 'superadmin') {
      const master = await readConfig('master');
      if (!verifyPassword(oldPassword, master.superAdminPassword)) {
        return jsonError('Incorrect current Super Admin password', 400);
      }
      await updateConfig('master', { superAdminPassword: hashPassword(newPassword) });
      return NextResponse.json({ success: true, message: 'Super Admin password changed successfully' });
    }

    // Accountants (and any admin added through Users & Roles) have their own user record.
    const [user] = await findAll<AppUser>('users', session.schoolId, { username: session.username });
    if (user) {
      if (!verifyPassword(oldPassword, user.password)) return jsonError('Incorrect current password', 400);
      await updateRecord('users', session.schoolId, user.id, { password: hashPassword(newPassword) });
      await audit(session, 'password.change', 'Changed own password');
      return NextResponse.json({ success: true, message: 'Password changed successfully' });
    }

    if (session.role !== 'admin') return jsonError('User account not found', 404);

    // The school principal's password is kept in the school's settings.
    const config = await readConfig(session.schoolId);
    if (!verifyPassword(oldPassword, config.adminPassword)) return jsonError('Incorrect current password', 400);
    await updateConfig(session.schoolId, { adminPassword: hashPassword(newPassword) });
    await audit(session, 'password.change', 'Changed own password');
    return NextResponse.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password failed:', err);
    return jsonError('Failed to change password', 500);
  }
}
