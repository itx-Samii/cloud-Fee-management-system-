'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_FEATURES, featureOn, type FeatureKey } from '@/lib/features';
import { reloadTo } from '@/lib/reloadTo';
import SchoolPayMark from './welcome/SchoolPayMark';
import ThemeSwitch from './welcome/ThemeSwitch';
import ThemeSwitcher from './ThemeSwitcher';

type Role = 'admin' | 'accountant' | 'superadmin' | 'parent';
type Group = 'Overview' | 'Collections' | 'School' | 'Administration';
interface Staff { role: Role; displayName: string; schoolId?: string }
interface NavItem { href: string; label: string; group: Group; roles: Role[]; path: string; feature?: FeatureKey }

const office: Role[] = ['admin', 'accountant'];
const links: NavItem[] = [
  { href: '/', label: 'Dashboard', group: 'Overview', roles: ['admin'], path: 'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z' },
  { href: '/collection', label: 'Receive payment', group: 'Collections', roles: office, feature: 'collection', path: 'M4 6h16v12H4zm0 4h16m-12 4h3' },
  { href: '/cashbook', label: 'Daily cash book', group: 'Collections', roles: office, feature: 'cashbook', path: 'M5 3h14v18H5zM9 3v18m3-13h4m-4 4h4' },
  { href: '/generate', label: 'Generate vouchers', group: 'Collections', roles: office, feature: 'generate', path: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7m-7 4h7' },
  { href: '/tracking', label: 'Class-wise tracking', group: 'Collections', roles: office, feature: 'tracking', path: 'M3 3v18h18M7 16l4-5 4 2 5-7' },
  { href: '/defaulters', label: 'Defaulter list', group: 'Collections', roles: ['admin'], feature: 'defaulters', path: 'M12 3 2 20h20L12 3Zm0 6v4m0 3v.1' },
  { href: '/reports', label: 'Financial reports', group: 'Collections', roles: ['admin'], feature: 'reports', path: 'M4 20V4m0 16h16M9 16v-4m5 4V8m5 8V5' },
  { href: '/expenses', label: 'Expense manager', group: 'Collections', roles: office, feature: 'expenses', path: 'M5 3h14v18l-3-2-4 2-4-2-3 2V3Zm4 5h6m-6 4h6' },
  { href: '/ac-ledger', label: 'AC ledger', group: 'Collections', roles: ['admin'], feature: 'ledger', path: 'M5 3h14v18H5zM8 7h8m-8 4h8m-8 4h4' },
  { href: '/salaries', label: 'Salaries manager', group: 'School', roles: ['admin'], feature: 'salaries', path: 'M3 7h18v13H3zm6 0V4h6v3M3 12h18m-11 0v3h4v-3' },
  { href: '/classes', label: 'Classes management', group: 'School', roles: ['admin'], feature: 'classes', path: 'm2 9 10-5 10 5-10 5L2 9Zm4 2v6l6 3 6-3v-6' },
  { href: '/students', label: 'All students', group: 'School', roles: ['admin'], feature: 'students', path: 'M16 20v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m15 0v-2a4 4 0 0 0-2-3M14 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z' },
  { href: '/users', label: 'Users & roles', group: 'Administration', roles: ['admin'], feature: 'users', path: 'M12 22s7-3 7-10V5l-7-3-7 3v7c0 7 7 10 7 10Zm-3-11 2 2 4-4' },
  { href: '/activity', label: 'Activity log', group: 'Administration', roles: ['admin'], feature: 'activity', path: 'M12 8v5l3 2m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' },
  { href: '/superadmin', label: 'Client licenses', group: 'Administration', roles: ['superadmin'], path: 'M3 21h18M5 21V7l7-4 7 4v14m-9 0v-5h4v5M8 9h1m6 0h1M8 12h1m6 0h1' },
];
const groups: Group[] = ['Overview', 'Collections', 'School', 'Administration'];

function Icon({ path }: { path: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>;
}

export default function SidebarNav() {
  const pathname = usePathname();
  const [user, setUser] = useState<Staff>();
  const [features, setFeatures] = useState<Record<string, boolean>>(DEFAULT_FEATURES);
  const [open, setOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal, cache: 'no-store' as const };
    void fetch('/api/auth/login', options).then(async (response) => {
      if (response.ok) setUser((await response.json()).user);
    }).catch(() => {});
    void fetch('/api/admin/license', options).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json();
      if (data.features) setFeatures(data.features);
    }).catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 1024px)');
    function onResize() {
      if (!mobile.matches && dialog.current?.open) dialog.current.close();
    }
    function onScroll() { setCompact(window.scrollY > 24); }
    mobile.addEventListener('change', onResize);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      mobile.removeEventListener('change', onResize);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError('');
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (response.ok) { reloadTo('/login'); return; }
    } catch { /* Keep the workspace available for a retry. */ }
    setLoggingOut(false);
    setLogoutError('Could not sign out. Please try again.');
  }

  function toggleMenu() {
    if (dialog.current?.open) dialog.current.close();
    else { dialog.current?.showModal(); setOpen(true); }
  }

  const visible = user ? links.filter((link) => link.roles.includes(user.role)) : [];
  const school = user?.schoolId === 'master' ? 'School Pay administration' : user?.schoolId?.replace(/^school_/, '').replace(/[_-]/g, ' ');
  const role = user?.role === 'superadmin' ? 'Super admin' : user?.role === 'admin' ? 'Administrator' : 'Accountant';
  const brand = <><SchoolPayMark /><span>School Pay<small>Fee management</small></span></>;
  const renderMenu = () => (
    <>
      {user && <div className="workspace-profile">
        <span className="workspace-avatar" aria-hidden="true">{user.displayName.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()}</span>
        <div><strong>{user.displayName}</strong><small>{role}{school ? ' · ' + school : ''}</small></div>
      </div>}
      <nav className="workspace-links" aria-label="Workspace navigation">
        {groups.map((group) => {
          const items = visible.filter((link) => link.group === group);
          if (!items.length) return null;
          return <section key={group}><h2>{group}</h2>{items.map((link) => {
            const active = pathname === link.href || (link.href === '/classes' && pathname.startsWith('/classes/'));
            const locked = link.feature && !featureOn(features, link.feature);
            const href = locked ? '/feature-locked?feature=' + link.feature : link.href;
            return <Link key={link.href} href={href} className="workspace-link" prefetch={false} aria-current={active ? 'page' : undefined} onClick={() => dialog.current?.close()}>
              <Icon path={link.path} /><span>{link.label}</span>{locked && <small>Locked</small>}
            </Link>;
          })}</section>;
        })}
      </nav>
      <div className="workspace-sidebar-footer">
        <ThemeSwitcher />
        <button type="button" className="btn btn-secondary workspace-logout" onClick={logout} disabled={loggingOut}>
          <Icon path="M10 4H4v16h6m4-12 4 4-4 4m-6-4h10" />{loggingOut ? 'Signing out…' : 'Sign out'}
        </button>
        {logoutError && <p role="alert">{logoutError}</p>}
      </div>
    </>
  );

  return (
    <>
      <aside className="workspace-sidebar welcome-glass no-print">
        <div className="workspace-brand">{brand}</div>
        {renderMenu()}
      </aside>
      <header className="workspace-mobile welcome-glass no-print" data-compact={compact}>
        <div className="workspace-brand">{brand}</div>
        <div className="workspace-mobile-actions"><ThemeSwitch />
          <button ref={trigger} type="button" className="workspace-menu-button" aria-expanded={open} aria-controls="workspace-menu" aria-label="Open workspace menu" onClick={toggleMenu}><i /><i /></button>
        </div>
      </header>
      <dialog id="workspace-menu" className="workspace-menu no-print" ref={dialog} aria-label="Workspace menu" onClose={() => { setOpen(false); if (trigger.current?.getClientRects().length) trigger.current.focus(); }} onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
        <div className="workspace-menu-panel">
          <div className="workspace-menu-heading"><div className="workspace-brand">{brand}</div><button type="button" className="workspace-menu-button" aria-label="Close workspace menu" onClick={() => dialog.current?.close()}><i /><i /></button></div>
          {renderMenu()}
        </div>
      </dialog>
    </>
  );
}
