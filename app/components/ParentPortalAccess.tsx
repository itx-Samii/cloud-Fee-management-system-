"use client";
import React, { useState, useEffect, useCallback, useId, useRef } from 'react';
import { whatsappLink } from '@/lib/whatsapp';

interface LoginInfo { phone: string; pinSetAt: string; pinSetBy: string; lastLoginAt?: string }

const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

async function fetchLogin(phone: string): Promise<LoginInfo | null | string> {
  const res = await fetch(`/api/parents?phone=${encodeURIComponent(phone)}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  const data = await res.json().catch(() => null);
  return res.ok ? data.login : data?.error || 'Could not load the portal login.';
}

/** Staff controls for a family's parent portal sign-in. */
export default function ParentPortalAccess({ phone, school, canWhatsApp }: { phone: string; school: string; canWhatsApp: boolean }) {
  const [login, setLogin] = useState<LoginInfo | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState<'show' | 'issue' | 'close' | null>(null);
  const inFlight = useRef(false);
  const pinPanelId = useId();

  const load = useCallback(
    () => fetchLogin(phone)
      .then((result) => (typeof result === 'string' ? setError(result) : setLogin(result)))
      .catch(() => setError('Could not load the portal login. Refresh the ledger to try again.')),
    [phone]
  );

  useEffect(() => {
    load();
  }, [load]);

  async function updateLogin(action: 'show' | 'issue' | 'close') {
    if (inFlight.current) return;
    setError('');
    if (action === 'show' && pin) {
      setPin('');
      return;
    }
    if (action === 'issue' && login && !confirm('Give this family a new PIN? The old PIN stops working and anyone signed in with it is signed out.')) return;
    if (action === 'close' && !confirm('Close this family\'s parent portal login? They will be signed out and can no longer sign in.')) return;

    inFlight.current = true;
    setBusy(action);
    setPin('');
    const fallback = { show: 'Could not show the PIN.', issue: 'Could not set the PIN.', close: 'Could not close the login.' }[action];
    try {
      const signal = AbortSignal.timeout(15000);
      const response = action === 'close'
        ? await fetch(`/api/parents?phone=${encodeURIComponent(phone)}`, { method: 'DELETE', signal })
        : await fetch('/api/parents', {
          method: action === 'show' ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone }), cache: 'no-store', signal,
        });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setError(result?.error || fallback);
        if (action === 'show' && response.status === 404) setLogin(null);
        return;
      }
      if (action !== 'close' && typeof result?.pin === 'string') setPin(result.pin);
      if (action === 'close') setLogin(null);
      if (action === 'issue') await load();
    } catch {
      setError(`${fallback} Try again.`);
    } finally {
      setBusy(null);
      inFlight.current = false;
    }
  }

  const portalUrl = typeof window === 'undefined' ? '/login' : `${window.location.origin}/login`;
  const message = `Assalam-o-Alaikum. You can now see your children's fees, vouchers and receipts online at ${portalUrl}\nPhone: ${phone}\nPIN: ${pin}\nPlease keep the PIN private. ${school}`;
  const sendLink = pin && canWhatsApp ? whatsappLink(phone, message) : null;

  return (
    <div className="glass-panel no-print" style={{padding: '1.25rem', marginBottom: '2rem'}} aria-busy={busy !== null}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap'}}>
        <div>
          <h3 style={{margin: 0}}>👪 Parent portal</h3>
          <div style={{fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem'}}>
            {login === undefined && !error && 'Loading...'}
            {login === null && 'This family can\'t sign in yet. Give them a PIN to see their children\'s fees online.'}
            {login && `Open since ${date(login.pinSetAt)} · ${login.lastLoginAt ? `last signed in ${date(login.lastLoginAt)}` : 'not signed in yet'}`}
          </div>
        </div>
        {login !== undefined && (
          <div style={{display: 'flex', gap: '0.5rem', flexWrap: 'wrap'}}>
            {login && <button type="button" className="btn btn-secondary" disabled={busy !== null} aria-expanded={Boolean(pin)} aria-controls={pinPanelId} onClick={() => void updateLogin('show')}>{busy === 'show' ? 'Loading PIN…' : pin ? 'Hide PIN' : 'Show PIN'}</button>}
            <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => void updateLogin('issue')}>{login ? 'New PIN' : 'Give portal PIN'}</button>
            {login && <button type="button" className="btn" style={{background: 'var(--danger)', color: 'white', border: 'none'}} disabled={busy !== null} onClick={() => void updateLogin('close')}>Close login</button>}
          </div>
        )}
      </div>
      {error && <div role="alert" style={{color: 'var(--danger)', fontSize: '0.85rem', marginTop: '0.75rem'}}>{error}</div>}
      <div id={pinPanelId} hidden={!pin} style={{marginTop: '1rem', padding: '1rem', border: '2px dashed var(--primary)', borderRadius: '12px'}}>
        {pin && <>
          <div style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>Current PIN for {phone}</div>
          <div style={{fontSize: '2rem', fontWeight: 800, letterSpacing: '0.3em', margin: '0.25rem 0'}}>{pin}</div>
          <div style={{fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem', overflowWrap: 'anywhere'}}>The parent signs in at {portalUrl} with this phone number and PIN.</div>
          {sendLink && (
            <a href={sendLink} target="_blank" rel="noopener noreferrer" className="btn" style={{background: '#25D366', color: 'white', border: 'none', textDecoration: 'none'}}>
              Send sign-in details on WhatsApp
            </a>
          )}
        </>}
      </div>
    </div>
  );
}
