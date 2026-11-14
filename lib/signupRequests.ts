import { randomBytes, randomUUID } from 'node:crypto';
import { getDb, transaction } from './db';
import { hashPassword, isUsernameTaken } from './dbHandler';
import { DEFAULT_MAX_STUDENTS } from './license';
import { provisionSchool } from './schoolProvisioning';
import type { SignupDecision, SignupDetails, SignupRequest } from './signupDetails';

export async function submitSignup(details: SignupDetails) {
  const db = await getDb();
  if (await isUsernameTaken(details.username)) return false;

  const { schoolName, schoolAddress, principalName, email, phone, username, password } = details;
  const [pending] = await db`select id from school_signup_requests where username = ${username} and status = 'pending'`;
  if (pending) return false;
  const passwordHash = hashPassword(password);
  const [created] = await db`
    insert into school_signup_requests (id, school_name, school_address, principal_name, email, phone, username, password_hash)
    values (${randomUUID()}, ${schoolName}, ${schoolAddress}, ${principalName}, ${email}, ${phone}, ${username}, ${passwordHash})
    on conflict (username) where status = 'pending' do nothing returning id`;
  return Boolean(created);
}

export async function listSignupRequests() {
  const db = await getDb();
  // Select only reviewable details. The pending password hash never leaves the server.
  return db<SignupRequest[]>`
    select id, school_name, school_address, principal_name, email, phone, username, status, created_at, reviewed_at, school_id
    from school_signup_requests
    order by (status = 'pending') desc, created_at desc, id`;
}

export async function reviewSignup(id: string, decision: SignupDecision) {
  return transaction(async (tx) => {
    const [signup] = await tx<(Pick<SignupRequest, 'schoolName' | 'username' | 'status'> & { passwordHash?: string })[]>`
      select school_name, username, status, password_hash from school_signup_requests where id = ${id} for update`;
    if (!signup) return 'missing';
    const status = decision === 'approve' ? 'approved' : 'rejected';
    if (signup.status === status) return status;
    if (signup.status !== 'pending') return 'reviewed';

    let schoolId: string | null = null;
    if (decision === 'approve') {
      if (!signup.passwordHash) throw new Error('Pending signup is missing its credential hash.');
      if (await isUsernameTaken(signup.username, undefined, tx)) return 'username-taken';
      const school = await provisionSchool(tx, {
        clientName: signup.schoolName,
        adminUsername: signup.username,
        passwordHash: signup.passwordHash,
        licenseKey: `SP-${randomBytes(16).toString('hex').toUpperCase()}`,
        maxStudents: DEFAULT_MAX_STUDENTS,
      });
      schoolId = school.schoolId;
    }

    await tx`
      update school_signup_requests set status = ${status}, password_hash = null, reviewed_at = now(), school_id = ${schoolId}
      where id = ${id}`;
    return status;
  });
}
