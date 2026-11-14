"use client";
import { useStoredSetting } from '@/lib/useStoredSetting';

export default function ThemeSwitcher() {
  // layout.tsx applies the saved theme before first paint; this keeps the picker in step with it.
  const [theme, saveTheme] = useStoredSetting('school-theme', 'light');

  const themes = [
    { id: 'light', name: 'Light Mode', icon: '☀️' },
    { id: 'dark', name: 'Dark Mode', icon: '🌙' },
    { id: 'ocean', name: 'Ocean Depth', icon: '🌊' },
    { id: 'forest', name: 'Forest Green', icon: '🌲' },
    { id: 'sunset', name: 'Warm Sunset', icon: '🌇' }
  ];

  const changeTheme = (newTheme: string) => {
    saveTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  return (
    <div className="theme-switcher-box">
      <span>Theme</span>
      <select
        aria-label="Workspace theme"
        value={theme}
        onChange={(e) => changeTheme(e.target.value)}
        className="form-input"
      >
        {themes.map(t => (
          <option key={t.id} value={t.id}>{t.icon} {t.name}</option>
        ))}
      </select>
    </div>
  );
}
