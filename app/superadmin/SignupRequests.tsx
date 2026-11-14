'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SignupDecision, SignupRequest } from '@/lib/signupDetails';

const statusLabels = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };
const dateFormat = new Intl.DateTimeFormat('en-PK', { dateStyle: 'medium' });
const endpoint = '/api/superadmin/signup-requests';

export default function SignupRequests({ onApproved }: { onApproved: () => void }) {
  const [requests, setRequests] = useState<SignupRequest[] | null>(null);
  const [selection, setSelection] = useState<{ id: string; decision: SignupDecision }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const timeout = AbortSignal.timeout(15000);
      const response = await fetch(endpoint, { cache: 'no-store', signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error ?? 'Could not load signup requests.');
      }
      setRequests(await response.json());
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error && err.name === 'Error' ? err.message : 'Could not load signup requests. Try refreshing.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) return refresh(controller.signal);
    });
    return () => controller.abort();
  }, [refresh]);

  async function saveDecision(school: SignupRequest, decision: SignupDecision) {
    if (saving) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: school.id, decision }), signal: AbortSignal.timeout(15000),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? 'Could not save the decision.');
      setSelection(undefined);
      setMessage(decision === 'approve' ? `${school.schoolName} was approved. The principal can now sign in.` : `Request from ${school.schoolName} was rejected.`);
      if (decision === 'approve') onApproved();
      await refresh();
    } catch (err) {
      setError(err instanceof Error && err.name === 'Error' ? err.message : 'Could not confirm the decision. Refresh and try again.');
    } finally {
      setSaving(false);
    }
  }

  const pending = requests?.filter(({ status }) => status === 'pending').length;
  return (
    <section className="signup-queue glass-panel" aria-labelledby="signup-queue-title" aria-busy={loading || saving}>
      <header className="signup-queue-heading">
        <div>
          <h2 id="signup-queue-title">Signup requests</h2>
          <p>{pending === undefined ? 'Review new school accounts.' : `${pending} pending ${pending === 1 ? 'request' : 'requests'}`}</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => { setLoading(true); setError(''); void refresh(); }} disabled={loading || saving}>Refresh requests</button>
      </header>
      {loading && requests === null && <p role="status">Loading requests…</p>}
      {error && <p className="signup-queue-error" role="alert">{error}</p>}
      <div role="status">{message}</div>
      {requests?.length === 0 && <p>No school signup requests yet.</p>}
      {requests?.map((school) => {
        const confirming = selection?.id === school.id ? selection.decision : undefined;
        return (
          <article key={school.id} className="signup-queue-request">
            <div className="signup-queue-heading">
              <div>
                <h3>{school.schoolName}</h3>
                <p>Received {dateFormat.format(new Date(school.createdAt))}{school.reviewedAt ? ` · Reviewed ${dateFormat.format(new Date(school.reviewedAt))}` : ''}</p>
              </div>
              <span className="signup-queue-status" data-status={school.status}>{statusLabels[school.status]}</span>
            </div>
            <dl>
              <div><dt>Principal</dt><dd>{school.principalName}</dd></div>
              <div><dt>Username</dt><dd>{school.username}</dd></div>
              <div><dt>Email</dt><dd>{school.email}</dd></div>
              <div><dt>Phone</dt><dd>{school.phone}</dd></div>
              <div><dt>School address</dt><dd>{school.schoolAddress}</dd></div>
            </dl>
            {school.status === 'pending' && (
              <div className="signup-queue-actions">
                {confirming ? <>
                  <p>{confirming === 'approve' ? 'Approval creates the school license and enables principal sign-in.' : 'Reject this request? The principal can submit a new request.'}</p>
                  <button type="button" className={`btn ${confirming === 'approve' ? 'btn-primary' : 'btn-danger'}`} disabled={saving} onClick={() => void saveDecision(school, confirming)}>
                    {saving ? 'Saving…' : confirming === 'approve' ? 'Confirm approval' : 'Confirm rejection'}
                  </button>
                  <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setSelection(undefined)}>Cancel</button>
                </> : <>
                  <button type="button" className="btn btn-primary" aria-label={`Approve ${school.schoolName}`} disabled={saving} onClick={() => { setError(''); setSelection({ id: school.id, decision: 'approve' }); }}>Approve</button>
                  <button type="button" className="btn btn-secondary" aria-label={`Reject ${school.schoolName}`} disabled={saving} onClick={() => { setError(''); setSelection({ id: school.id, decision: 'reject' }); }}>Reject</button>
                </>}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
