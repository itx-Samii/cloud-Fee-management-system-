import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { jsonError, readBody } from '@/lib/http';
import { listSignupRequests, reviewSignup } from '@/lib/signupRequests';

export async function GET() {
  const session = await requireSession(['superadmin']);
  if (session instanceof NextResponse) return session;
  try {
    return NextResponse.json(await listSignupRequests(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return jsonError('Could not load signup requests.', 500);
  }
}

export async function PATCH(request: Request) {
  const session = await requireSession(['superadmin']);
  if (session instanceof NextResponse) return session;
  const { id, decision } = await readBody(request) ?? {};
  if (typeof id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) || (decision !== 'approve' && decision !== 'reject')) {
    return jsonError('Provide a request ID and a valid decision.', 400);
  }

  try {
    const result = await reviewSignup(id, decision);
    if (result === 'missing') return jsonError('Signup request not found.', 404);
    if (result === 'reviewed') return jsonError('This request has already been reviewed. Refresh to see the decision.', 409);
    if (result === 'username-taken') return jsonError('This username is now in use. Reject this request and ask the applicant to choose another username.', 409);
    return NextResponse.json({ status: result });
  } catch (error) {
    const constraint = (error as { constraint_name?: string })?.constraint_name;
    if (constraint === 'school_settings_admin_username' || constraint === 'staff_login_name_unique') {
      return jsonError('This username is now in use. Reject this request and ask the applicant to choose another username.', 409);
    }
    return jsonError('Could not save the decision. Try again.', 500);
  }
}
