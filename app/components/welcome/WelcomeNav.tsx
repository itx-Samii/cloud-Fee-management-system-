'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import ThemeSwitch from './ThemeSwitch';
import SchoolPayMark from './SchoolPayMark';

const LINKS = [
  { label: 'Overview', href: '/home' },
  { label: 'Features', href: '/home#features' },
];

export default function WelcomeNav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const header = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 24); }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        menuButton.current?.focus();
      }
    }
    function onPointer(event: PointerEvent) {
      if (event.target instanceof Node && !header.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const links = LINKS.map(({ label, href }) => (
    <Link key={href} href={href} prefetch={false} aria-current={pathname === href ? 'page' : undefined} onClick={() => setOpen(false)}>{label}</Link>
  ));

  return (
    <header ref={header} className="welcome-nav welcome-glass" data-compact={scrolled} data-open={open}>
      <Link href="/home" className="welcome-brand" prefetch={false} onClick={() => setOpen(false)}>
        <SchoolPayMark /> <span>School Pay</span>
      </Link>
      <nav aria-label="Main navigation" className="welcome-nav-links">{links}</nav>
      <div className="welcome-nav-actions">
        <ThemeSwitch />
        <Link className="welcome-button welcome-button-primary welcome-nav-signin" href="/login" prefetch={false}>Sign in <span aria-hidden="true">↗</span></Link>
        <button ref={menuButton} type="button" className="welcome-menu-button" aria-expanded={open} aria-controls="welcome-mobile-nav" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen(!open)}>
          <i /><i />
        </button>
      </div>
      <nav className="welcome-mobile-nav" id="welcome-mobile-nav" aria-label="Mobile navigation" inert={!open}>
        <div>{links}<Link href="/login" className="welcome-button welcome-button-primary" prefetch={false} onClick={() => setOpen(false)}>Sign in <span aria-hidden="true">↗</span></Link></div>
      </nav>
    </header>
  );
}
