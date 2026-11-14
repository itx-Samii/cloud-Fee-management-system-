import { formatTrialExpiry, MAX_TRIAL_DAYS } from '@/lib/trials';

export type TrialAction = 'keep' | 'trial' | 'regular';

export default function TrialLicenseFields({ action, days, expiresAt, onAction, onDays }: {
  action: TrialAction;
  days: string;
  expiresAt?: string;
  onAction: (action: TrialAction) => void;
  onDays: (days: string) => void;
}) {
  return (
    <fieldset className="trial-license-fields">
      <legend>License period</legend>
      <label><input type="radio" name="license-period" checked={action === 'keep'} onChange={() => onAction('keep')} /> {expiresAt ? 'Keep current trial' : 'Regular license'}</label>
      <label><input type="radio" name="license-period" checked={action === 'trial'} onChange={() => onAction('trial')} /> {expiresAt ? 'Extend or restart trial' : 'Trial / Demo'}</label>
      {expiresAt && <label><input type="radio" name="license-period" checked={action === 'regular'} onChange={() => onAction('regular')} /> Switch to regular license</label>}
      {expiresAt && <p>Current trial expiry <time dateTime={expiresAt}>{formatTrialExpiry(expiresAt)}</time> PKT.</p>}
      {action === 'trial' && <>
        <label className="form-label" htmlFor="trial-license-days">Trial days</label>
        <input id="trial-license-days" className="form-input" type="number" min={1} max={MAX_TRIAL_DAYS} step={1} required value={days} aria-describedby="trial-license-help" onChange={(event) => onDays(event.target.value)} />
        <p id="trial-license-help">{expiresAt ? 'Adds days to an active trial or starts a new trial if it has expired.' : 'The trial starts when you save.'}</p>
      </>}
    </fieldset>
  );
}
