'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { reloadTo } from '@/lib/reloadTo';
import type { Role } from '@/lib/session';
import SchoolPayMark from '../components/welcome/SchoolPayMark';

const DESTINATIONS = { admin: '/', accountant: '/collection', superadmin: '/superadmin', parent: '/portal' } satisfies Record<Role, string>;

type Credentials = { identifier: string; password: string };
type School = { schoolId: string; schoolName: string };

export default function SignInForm() {
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<{ schools: School[]; credentials: Credentials }>();
  const inFlight = useRef(false);
  const schoolHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => { if (selection) schoolHeading.current?.focus(); }, [selection]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const identifier = String(fields.get('identifier') ?? '').trim();
    const password = String(fields.get('password') ?? '');
    if (!identifier || !password.trim()) {
      setError('Enter your username or phone number and your password or School PIN.');
      form.querySelector<HTMLInputElement>(identifier ? '#login-password' : '#login-identifier')?.focus();
      return;
    }
    void signIn({ identifier, password });
  }

  async function signIn(credentials: Credentials, schoolId?: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setError('');
    setBusy(true);
    let navigating = false;
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credentials, schoolId }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json().catch(() => null);
      if (response.ok && Array.isArray(data?.choose) && data.choose.length > 0) {
        setVisible(false);
        setSelection({ schools: data.choose, credentials });
        return;
      }
      if (response.ok && data?.success) {
        const role: unknown = data.user?.role;
        if (role === 'admin' || role === 'accountant' || role === 'superadmin' || role === 'parent') {
          reloadTo(DESTINATIONS[role]);
          navigating = true;
          return;
        }
      }
      const unavailable = 'Sign-in is unavailable. Check that the School Pay launcher is running, then try again.';
      setError(response.status < 500 && typeof data?.error === 'string' ? data.error : unavailable);
    } catch {
      setError('Could not reach School Pay. Check that the launcher is running, then try again.');
    } finally {
      if (!navigating) {
        setBusy(false);
        inFlight.current = false;
      }
    }
  }

  return (
    <main id="welcome-content" tabIndex={-1} className="welcome-login-wrap">
      <section className="welcome-login welcome-glass welcome-enter" aria-labelledby="login-title">
        <Link href="/home" className="welcome-back" prefetch={false}><span aria-hidden="true">←</span> Back to Home</Link>
        <div className="welcome-login-heading">
          <SchoolPayMark />
          <h1 id="login-title">Sign in to School Pay</h1>
          <p>Parents use their phone number and School PIN.</p>
        </div>
        {selection ? (
          <div className="welcome-form" aria-busy={busy}>
            <h2 ref={schoolHeading} tabIndex={-1}>Choose your school</h2>
            {selection.schools.map(({ schoolId, schoolName }) => (
              <button type="button" key={schoolId} className="welcome-button welcome-button-secondary" disabled={busy} onClick={() => void signIn(selection.credentials, schoolId)}>{schoolName}</button>
            ))}
            {busy && <p role="status">Signing in…</p>}
            <p className="welcome-form-message" role="alert">{error}</p>
            <button type="button" className="welcome-button welcome-button-secondary" disabled={busy} onClick={() => { setSelection(undefined); setError(''); }}>Use another account</button>
          </div>
        ) : <form method="post" noValidate onSubmit={submit} className="welcome-form" aria-busy={busy}>
          <div className="welcome-field">
            <input id="login-identifier" name="identifier" type="text" placeholder=" " autoComplete="username" autoCapitalize="none" spellCheck={false} required readOnly={busy} />
            <label htmlFor="login-identifier">Username or phone number</label>
          </div>
          <div className="welcome-field welcome-field-password">
            <input id="login-password" name="password" type={visible ? 'text' : 'password'} placeholder=" " autoComplete="current-password" spellCheck={false} required readOnly={busy} />
            <label htmlFor="login-password">Password or School PIN</label>
            <button type="button" className="welcome-password-toggle" aria-controls="login-password" aria-label={visible ? 'Hide password or PIN' : 'Show password or PIN'} onClick={() => setVisible(!visible)}>{visible ? 'Hide' : 'Show'}</button>
          </div>
          <p className="welcome-form-message" role="alert">{error}</p>
          <button className="welcome-button welcome-button-primary welcome-login-submit" type="submit" disabled={busy}>
            {busy ? <><span className="welcome-spinner" aria-hidden="true" /> Signing in…</> : <>Sign in <span aria-hidden="true">↗</span></>}
          </button>
        </form>}
        <p className="welcome-login-footer">New school? <Link href="/signup" prefetch={false}>Sign up</Link></p>
      </section>
    </main>
  );
}
