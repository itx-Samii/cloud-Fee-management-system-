'use client';

import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { CHALLAN_FIELDS, CHALLAN_LOGO_TYPES, MAX_CHALLAN_LOGO_BYTES, isChallanLogo, validateChallanProfile, type ChallanProfile } from '@/lib/challanProfile';
import type { useChallanBranding } from './useChallanBranding';

export default function ChallanBranding({ ready, error, reload, ...props }: ReturnType<typeof useChallanBranding> & { canEdit: boolean }) {
  if (!ready) return error
    ? <div><p role="alert">{error}</p><button type="button" className="btn btn-secondary" onClick={() => void reload()}>Retry</button></div>
    : <p role="status">Loading challan settings…</p>;
  return <ChallanBrandingForm {...props} />;
}

function ChallanBrandingForm({ profile, configured, canEdit, save }: Pick<ReturnType<typeof useChallanBranding>, 'profile' | 'configured' | 'save'> & { canEdit: boolean }) {
  const [draft, setDraft] = useState<ChallanProfile | null>(null);
  const [error, setError] = useState<{ message: string; field?: keyof ChallanProfile }>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const inFlight = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const values = draft ?? profile;

  function edit(key: keyof ChallanProfile, value: string) {
    setDraft((current) => ({ ...(current ?? profile), [key]: value }));
    setMessage('');
  }

  function importBrowserSettings() {
    try {
      const imported = { ...values };
      let found = false;
      for (const { key, storage } of CHALLAN_FIELDS) {
        const value = localStorage.getItem(storage);
        if (value !== null) { imported[key] = value; found = true; }
      }
      const logo = localStorage.getItem('fms-school-logo');
      if (logo) { imported.logo = logo; found = true; }
      setError(undefined);
      if (found) setDraft(imported);
      setMessage(found ? 'Browser settings loaded. Review the payment details before saving.' : 'No earlier challan settings were found in this browser.');
    } catch {
      setError({ message: 'Could not read this browser’s saved settings.' });
    }
  }

  async function readLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(undefined);
    if (file.size > MAX_CHALLAN_LOGO_BYTES || !CHALLAN_LOGO_TYPES.includes(file.type)) {
      setError({ field: 'logo', message: 'Choose a PNG, JPEG, WebP or GIF logo up to 1 MB.' });
      event.target.value = '';
      return;
    }
    setReading(true);
    const reader = new FileReader();
    reader.onload = () => edit('logo', String(reader.result));
    reader.onerror = () => setError({ field: 'logo', message: 'Could not read this logo. Try another file.' });
    reader.onloadend = () => setReading(false);
    reader.readAsDataURL(file);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || reading || inFlight.current) return;
    const form = event.currentTarget;
    function showError(message: string, field?: keyof ChallanProfile) {
      setError({ message, field });
      if (field) form.querySelector<HTMLElement>(`#challan-${field}`)?.focus();
    }
    const validation = validateChallanProfile(values);
    if (!validation.profile) return showError(validation.error, validation.field);
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    setError(undefined);
    try {
      const result = await save(validation.profile);
      if (result.error) return showError(result.error, result.field);
      setDraft(null);
      setMessage('Saved. Staff and parents will see these details on their challans.');
    } catch {
      showError('Could not save challan settings. Try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <form noValidate className="challan-branding" aria-busy={busy} onSubmit={submit}>
      <div>
        <h2>Challan branding and payment details</h2>
        <p>{canEdit ? 'Save the details that should appear on both staff and parent challans.' : 'The principal manages these details for staff and parent challans.'}</p>
      </div>
      {canEdit && !configured && <div><button type="button" className="btn btn-secondary" disabled={busy || reading} onClick={importBrowserSettings}>Load previous browser settings</button></div>}
      <div className="challan-config-fields">
        {CHALLAN_FIELDS.map((field) => {
          const { key, label, limit } = field;
          const multiline = 'multiline' in field;
          const input = {
            id: `challan-${key}`, className: 'form-input', maxLength: limit, value: values[key], readOnly: !canEdit || busy,
            'aria-invalid': error?.field === key || undefined, 'aria-describedby': error?.field === key ? 'challan-config-error' : undefined,
          };
          return <div key={key} className={multiline ? 'challan-config-wide' : undefined}>
            <label className="form-label" htmlFor={input.id}>{label}</label>
            {multiline
              ? <textarea {...input} rows={3} style={{ resize: 'none' }} onChange={(event) => edit(key, event.target.value)} />
              : <input {...input} required={key === 'schoolName'} onChange={(event) => edit(key, event.target.value)} />}
          </div>;
        })}
        <div className="challan-config-wide">
          {canEdit && <><label className="form-label" htmlFor="challan-logo">School logo</label>
            <input id="challan-logo" ref={fileInput} type="file" accept={CHALLAN_LOGO_TYPES.join(',')} disabled={busy || reading} aria-invalid={error?.field === 'logo' || undefined} aria-describedby={error?.field === 'logo' ? 'challan-logo-help challan-config-error' : 'challan-logo-help'} onChange={(event) => void readLogo(event)} />
            <p id="challan-logo-help">PNG, JPEG, WebP or GIF, up to 1 MB.</p></>}
          {values.logo && <div className="challan-config-logo">
            {/* eslint-disable-next-line @next/next/no-img-element -- local school logo is a data URL */}
            {isChallanLogo(values.logo) ? <img src={values.logo} alt="School logo preview" /> : <p>Replace or remove the older logo before saving.</p>}
            {canEdit && <button type="button" className="btn btn-secondary" disabled={busy || reading} onClick={() => { edit('logo', ''); if (fileInput.current) fileInput.current.value = ''; }}>Remove logo</button>}
          </div>}
        </div>
      </div>
      {error && <p id="challan-config-error" role="alert">{error.message}</p>}
      {message && <p role="status">{message}</p>}
      {canEdit && <div><button type="submit" className="btn btn-primary" disabled={busy || reading}>{busy ? 'Saving…' : 'Save shared challan settings'}</button></div>}
    </form>
  );
}
