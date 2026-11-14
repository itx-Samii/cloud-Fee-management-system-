'use client';

import { useRef, useState } from 'react';
import { useStoredSetting } from '@/lib/useStoredSetting';

export default function ThemeSwitch() {
  const [theme, saveTheme] = useStoredSetting('school-theme', 'light');
  const [temporaryTheme, setTemporaryTheme] = useState<string>();
  const dark = (temporaryTheme ?? theme) !== 'light';
  const transition = useRef<ViewTransition | null>(null);

  function toggleTheme() {
    if (transition.current) return;
    const next = dark ? 'light' : 'dark';
    const applyTheme = () => {
      document.documentElement.dataset.theme = next;
      setTemporaryTheme(saveTheme(next) ? undefined : next);
    };
    if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const pending = document.startViewTransition(applyTheme);
      transition.current = pending;
      void pending.finished.then(() => { transition.current = null; }, () => { transition.current = null; });
    } else {
      applyTheme();
    }
  }

  return (
    <button type="button" className="welcome-theme" role="switch" aria-checked={dark} aria-label="Dark theme" onClick={toggleTheme}>
      <span className="welcome-theme-sun" aria-hidden="true">☀</span>
      <span className="welcome-theme-moon" aria-hidden="true">☾</span>
      <span className="welcome-theme-knob" />
    </button>
  );
}
