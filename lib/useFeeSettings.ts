import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_DUE_DAYS, type FeeSettings } from './fees';

/**
 * The school's due-days and late-fine settings (plus its name, for messages to parents, and whether
 * the Super Admin has left Late Fine on), and whether this user may change them (principals only).
 */
export function useFeeSettings() {
  const [settings, setSettings] = useState<FeeSettings & { schoolName?: string; lateFineOn?: boolean }>({ dueDays: DEFAULT_DUE_DAYS, lateFine: 0 });
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    fetch('/api/settings', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setSettings(data);
      })
      .catch(() => {});
    fetch('/api/auth/login')
      .then((res) => res.json())
      .then((data) => setCanEdit(data?.user?.role === 'admin'))
      .catch(() => {});
  }, []);

  /** Saves for the whole school; returns false (after telling the user why) if it was refused. */
  const save = useCallback(async (changes: Partial<FeeSettings>) => {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      alert(data?.error || 'Could not save the setting.');
      return false;
    }
    setSettings((current) => ({ ...current, ...data }));
    return true;
  }, []);

  return { settings, save, canEdit };
}
