'use client';

import { useCallback, useEffect, useState } from 'react';
import { challanProfile, type ChallanProfile } from '@/lib/challanProfile';

interface SavedBranding { profile: ChallanProfile; configured: boolean }

export function useChallanBranding() {
  const [saved, setSaved] = useState<SavedBranding | null>(null);
  const [error, setError] = useState('');

  const reload = useCallback(async (signal?: AbortSignal) => {
    try {
      const timeout = AbortSignal.timeout(15000);
      const response = await fetch('/api/challan-settings', { cache: 'no-store', signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!signal?.aborted) {
        setSaved(data);
        setError('');
      }
    } catch {
      if (!signal?.aborted) setError('Could not load the shared challan settings.');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) return reload(controller.signal);
    });
    return () => controller.abort();
  }, [reload]);

  const save = useCallback(async (profile: ChallanProfile) => {
    const response = await fetch('/api/challan-settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile), signal: AbortSignal.timeout(15000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) return { error: result?.error ?? 'Could not save challan settings. Try again.', field: result?.field as keyof ChallanProfile | undefined };
    setSaved(result);
    return {};
  }, []);

  return { profile: saved?.profile ?? challanProfile(undefined, ''), configured: saved?.configured ?? false, error, ready: saved !== null, reload, save };
}
