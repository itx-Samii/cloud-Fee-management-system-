"use client";
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function SidebarNav() {
  const pathname = usePathname();

  const links = [
    { href: '/', label: 'Dashboard' },
    { href: '/collection', label: 'Receive Payment' },
    { href: '/ac-ledger', label: 'AC Ledger' },
    { href: '/salaries', label: 'Salaries Manager' },
    { href: '/classes', label: 'Classes Management' },
    { href: '/students', label: 'All Students' },
    { href: '/tracking', label: 'Class-wise Tracking' },
    { href: '/generate', label: 'Generate Vouchers' },
    { href: '/expenses', label: 'Expense Manager' },
    { href: '/reports', label: 'Financial Reports' },
  ];

  return (
    <nav style={{display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '1rem'}}>
      {links.map((link) => {
        const isActive = pathname === link.href;
        return (
          <Link 
            key={link.href}
            href={link.href} 
            className={`sidebar-link ${isActive ? 'active' : ''}`}
          >
            {link.label}
          </Link>
        );
      })}
      
      <div style={{marginTop: '2rem', borderTop: '1px solid var(--border)', paddingTop: '1rem'}}>
        <button 
          onClick={async () => {
            const res = await fetch('/api/auth/logout', { method: 'POST' });
            if (res.ok) window.location.href = '/login';
          }}
          className="sidebar-link"
          style={{width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--danger)', fontWeight: 600}}
        >
          Logout & Lock
        </button>
      </div>
    </nav>
  );
}
