import { useCallback, useSyncExternalStore } from 'react';

// Browser-only settings (theme, voucher branding, bank details) kept in localStorage.

const CHANGE_EVENT = 'stored-setting-change';

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange); // other tabs
  window.addEventListener(CHANGE_EVENT, onChange); // this tab
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * A setting saved in this browser. The server render and first client render show `fallback`
 * (so hydration matches); the saved value takes over straight after.
 * The setter returns false when the browser refused to store it (blocked or quota full).
 */
export function useStoredSetting(key: string, fallback: string): [string, (value: string) => boolean] {
  const value = useSyncExternalStore(subscribe, () => read(key) ?? fallback, () => fallback);

  const save = useCallback(
    (next: string) => {
      let saved = true;
      try {
        localStorage.setItem(key, next);
      } catch {
        saved = false;
      }
      window.dispatchEvent(new Event(CHANGE_EVENT));
      return saved;
    },
    [key]
  );

  return [value, save];
}

export function clearStoredSetting(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // storage blocked
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
