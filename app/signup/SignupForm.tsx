'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import SchoolPayMark from '@/app/components/welcome/SchoolPayMark';
import { MIN_PASSWORD_LENGTH } from '@/lib/credentials';
import { signupFields, signupLabels, signupMaxLength, validateSignup, type SignupField } from '@/lib/signupDetails';

const inputOptions = {
  schoolName: { autoComplete: 'organization' },
  schoolAddress: { autoComplete: 'street-address' },
  principalName: { autoComplete: 'name' },
  email: { type: 'email', autoComplete: 'email' },
  phone: { type: 'tel', autoComplete: 'tel' },
  username: { autoComplete: 'username', autoCapitalize: 'none', spellCheck: false },
  password: { autoComplete: 'new-password', spellCheck: false },
} satisfies Record<SignupField, React.InputHTMLAttributes<HTMLInputElement>>;

export default function SignupForm() {
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<{ field?: SignupField; message: string }>();
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const inFlight = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = event.currentTarget;
    const validation = validateSignup(Object.fromEntries(new FormData(form)));

    function showError(message: string, field?: SignupField) {
      setError({ field, message });
      if (field) form.querySelector<HTMLInputElement>(`#signup-${field}`)?.focus();
    }

    if (!validation.details) {
      showError(validation.error, validation.field);
      return;
    }

    setError(undefined);
    setBusy(true);
    inFlight.current = true;
    try {
      const response = await fetch('/api/signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validation.details), signal: AbortSignal.timeout(15000),
      });
      const result = await response.json().catch(() => null);
      if (response.ok && result?.success) {
        form.reset();
        setSubmitted(true);
      } else {
        showError(result?.error ?? 'Could not send your request. Try again.', signupFields.find((field) => field === result?.field));
      }
    } catch {
      showError('Could not reach School Pay. Check that the launcher is running, then try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <main id="welcome-content" tabIndex={-1} className="welcome-login-wrap">
      <section className="welcome-login welcome-signup welcome-glass welcome-enter" aria-labelledby="signup-title">
        <Link href="/login" className="welcome-back" prefetch={false}><span aria-hidden="true">←</span> Back to sign in</Link>
        <div className="welcome-login-heading">
          <SchoolPayMark />
          <h1 id="signup-title">{submitted ? 'Request submitted' : 'Request a school account'}</h1>
          <p role={submitted ? 'status' : undefined}>{submitted ? 'Your request is pending review. You can sign in once the Super Admin approves it.' : 'Enter your school and principal details for Super Admin approval.'}</p>
        </div>
        {!submitted && (
          <form method="post" noValidate className="welcome-form" aria-busy={busy} onSubmit={submit}>
            <div className="welcome-signup-fields">
              {signupFields.map((field) => (
                <div key={field} className={`welcome-field${field === 'password' ? ' welcome-field-password' : ''}${field === 'schoolAddress' ? ' welcome-signup-wide' : ''}`}>
                  <input id={`signup-${field}`} name={field} placeholder=" " {...inputOptions[field]}
                    {...(field === 'password' ? { type: visible ? 'text' : 'password' } : {})}
                    required readOnly={busy} maxLength={signupMaxLength[field]} aria-invalid={error?.field === field || undefined}
                    aria-describedby={error?.field === field ? 'signup-error' : field === 'password' ? 'signup-password-help' : undefined} />
                  <label htmlFor={`signup-${field}`}>{signupLabels[field]}</label>
                  {field === 'password' && <button type="button" className="welcome-password-toggle" aria-controls="signup-password" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(!visible)}>{visible ? 'Hide' : 'Show'}</button>}
                </div>
              ))}
            </div>
            <p id="signup-password-help" className="welcome-signup-help">Choose a password with at least {MIN_PASSWORD_LENGTH} characters.</p>
            <p id="signup-error" className="welcome-form-message" role="alert">{error?.message}</p>
            <button type="submit" className="welcome-button welcome-button-primary welcome-login-submit" disabled={busy}>
              {busy ? <><span className="welcome-spinner" aria-hidden="true" /> Sending request…</> : 'Send signup request'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
