import { NextResponse } from 'next/server';
import { requireFeature, requireSession } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { isUniqueViolation } from '@/lib/db';
import {
  MIN_PASSWORD_LENGTH,
  USERNAME_PATTERN,
  USERNAME_RULES,
  deleteRecord,
  findAll,
  findById,
  hashPassword,
  insertRecord,
  isUsernameTaken,
  updateRecord,
} from '@/lib/dbHandler';
import { jsonError, readBody, toText } from '@/lib/http';
import type { Role } from '@/lib/session';
import type { AppUser } from '@/lib/types';

const MANAGERS: Role[] = ['admin', 'superadmin'];
const PASSWORD_RULE = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;

function publicUser(u: AppUser) {
  return { id: u.id, username: u.username, displayName: u.displayName, role: u.role, status: u.status, createdAt: u.createdAt };
}

export async function GET() {
  const session = await requireSession(MANAGERS);
  if (session instanceof NextResponse) return session;

  try {
    const users = await findAll<AppUser>('users', session.schoolId);
    return NextResponse.json(users.map(publicUser));
  } catch (err) {
    console.error(`GET users failed for ${session.schoolId}:`, err);
    return jsonError('Failed to fetch users', 500);
  }
}

export async function POST(request: Request) {
  const session = await requireSession(MANAGERS);
  if (session instanceof NextResponse) return session;
  const locked = await requireFeature(session, 'users');
  if (locked) return locked;
  const { schoolId } = session;

  const body = await readBody(request);
  const username = toText(body?.username)?.toLowerCase();
  const password = toText(body?.password);
  const displayName = toText(body?.displayName);
  if (!username || !password || !displayName) return jsonError('All fields are required', 400);
  if (!USERNAME_PATTERN.test(username)) return jsonError(USERNAME_RULES, 400);
  if (password.length < MIN_PASSWORD_LENGTH) return jsonError(PASSWORD_RULE, 400);

  try {
    if (await isUsernameTaken(username)) return jsonError(`Username "${username}" is already taken`, 400);

    // Schools can only add accountants; principals are set up by the Super Admin.
    const user = await insertRecord('users', schoolId, {
      username,
      password: hashPassword(password),
      displayName,
      role: 'accountant',
      status: 'active',
      createdAt: new Date().toISOString(),
    });
    await audit(session, 'user.add', `Created accountant login "${username}" (${displayName})`);
    return NextResponse.json({ success: true, user: publicUser(user as AppUser) });
  } catch (err) {
    if (isUniqueViolation(err)) return jsonError(`Username "${username}" is already taken`, 400);
    console.error(`POST user failed for ${schoolId}:`, err);
    return jsonError('Failed to create user', 500);
  }
}

export async function PUT(request: Request) {
  const session = await requireSession(MANAGERS);
  if (session instanceof NextResponse) return session;
  const locked = await requireFeature(session, 'users');
  if (locked) return locked;
  const { schoolId } = session;

  const body = await readBody(request);
  const id = toText(body?.id);
  if (!body || !id) return jsonError('User ID is required', 400);

  try {
    const user = await findById<AppUser>('users', schoolId, id);
    if (!user) return jsonError('User not found', 404);

    const changes: Record<string, string> = {};
    const status = toText(body.status);
    if (status) {
      if (status !== 'active' && status !== 'blocked') return jsonError('Invalid status', 400);
      changes.status = status;
    }
    const displayName = toText(body.displayName);
    if (displayName) changes.displayName = displayName;

    const username = toText(body.username)?.toLowerCase();
    if (username && username !== user.username) {
      if (!USERNAME_PATTERN.test(username)) return jsonError(USERNAME_RULES, 400);
      if (await isUsernameTaken(username, { schoolId, id: user.id })) {
        return jsonError(`Username "${username}" is already taken`, 400);
      }
      changes.username = username;
    }

    const password = toText(body.password);
    if (password) {
      if (password.length < MIN_PASSWORD_LENGTH) return jsonError(PASSWORD_RULE, 400);
      changes.password = hashPassword(password);
    }

    await updateRecord('users', schoolId, user.id, changes);
    const what = [
      changes.status && (changes.status === 'blocked' ? 'blocked' : 'unblocked'),
      changes.username && `renamed to "${changes.username}"`,
      changes.displayName && `display name set to "${changes.displayName}"`,
      changes.password && 'password reset',
    ].filter(Boolean);
    if (what.length) await audit(session, 'user.edit', `Login "${user.username}": ${what.join(', ')}`);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`PUT user failed for ${schoolId}:`, err);
    return jsonError('Failed to update user', 500);
  }
}

export async function DELETE(request: Request) {
  const session = await requireSession(MANAGERS);
  if (session instanceof NextResponse) return session;
  const locked = await requireFeature(session, 'users');
  if (locked) return locked;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return jsonError('User ID is required', 400);

  try {
    const user = await findById<AppUser>('users', session.schoolId, id);
    if (!user || !(await deleteRecord('users', session.schoolId, user.id))) return jsonError('User not found', 404);
    await audit(session, 'user.delete', `Deleted login "${user.username}" (${user.displayName})`);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`DELETE user failed for ${session.schoolId}:`, err);
    return jsonError('Failed to delete user', 500);
  }
}
