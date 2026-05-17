"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface UserInfo {
  username: string;
  role: string;
  displayName: string;
  schoolId?: string;
}

export default function SidebarNav() {
  const pathname = usePathname();
  const [user, setUser] = useState<UserInfo>({ username: 'admin', role: 'admin', displayName: 'Administrator', schoolId: 'school_brookfield' });
  const [features, setFeatures] = useState({
    collection: true,
    generate: true,
    tracking: true,
    reports: true,
    expenses: true,
    ledger: true,
    salaries: true,
    classes: true,
    students: true,
    users: true
  });

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/login');
        if (res.ok) {
          const data = await res.json();
          if (data.user) setUser(data.user);
        }
        const licRes = await fetch('/api/admin/license');
        if (licRes.ok) {
          const licData = await licRes.json();
          if (licData.features) setFeatures(licData.features);
        }
      } catch (e) {
        // ignore
      }
    }
    checkAuth();
  }, []);

  const allLinks = [
    { href: '/superadmin', label: 'Client Licenses (SaaS)', roles: ['superadmin'], icon: '🌍' },
    { href: '/', label: 'Dashboard', roles: ['admin'], icon: '📊' },
    { href: '/collection', label: 'Receive Payment', roles: ['admin', 'accountant'], icon: '💰', featureKey: 'collection' },
    { href: '/generate', label: 'Generate Vouchers', roles: ['admin', 'accountant'], icon: '⚡', featureKey: 'generate' },
    { href: '/tracking', label: 'Class-wise Tracking', roles: ['admin', 'accountant'], icon: '📈', featureKey: 'tracking' },
    { href: '/reports', label: 'Financial Reports', roles: ['admin'], icon: '📑', featureKey: 'reports' },
    { href: '/expenses', label: 'Expense Manager', roles: ['admin', 'accountant'], icon: '🧾', featureKey: 'expenses' },
    { href: '/ac-ledger', label: 'AC Ledger', roles: ['admin'], icon: '🏛️', featureKey: 'ledger' },
    { href: '/salaries', label: 'Salaries Manager', roles: ['admin'], icon: '💵', featureKey: 'salaries' },
    { href: '/classes', label: 'Classes Management', roles: ['admin'], icon: '🏫', featureKey: 'classes' },
    { href: '/students', label: 'All Students', roles: ['admin'], icon: '🎓', featureKey: 'students' },
    { href: '/users', label: 'Users & Roles', roles: ['admin'], icon: '🛡️', featureKey: 'users' },
  ];

  const filteredLinks = allLinks.filter(link => link.roles.includes(user.role));

  const getRoleColor = (r: string) => {
    if (r === 'superadmin') return 'linear-gradient(135deg, #f59e0b, #d97706)';
    if (r === 'admin') return 'linear-gradient(135deg, #6366f1, #a855f7)';
    return 'linear-gradient(135deg, #3b82f6, #2dd4bf)';
  };

  const getRoleIcon = (r: string) => {
    if (r === 'superadmin') return '⚡';
    if (r === 'admin') return '👑';
    return '👤';
  };

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      {/* Mobile Toggle Button (Visible only <= 1024px) */}
      <div className="mobile-menu-toggle-btn" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
        <span>{mobileMenuOpen ? '✕ Close' : '☰ Menu'}</span>
      </div>

      {/* Desktop Sidebar Elements (Hidden on mobile) */}
      <div className="sidebar-nav-wrapper desktop-nav-elements">
        <div>
          {/* User Badge */}
          <div className="sidebar-user-card">
            <div style={{
              width: '40px',
              height: '40px',
              background: getRoleColor(user.role),
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
              color: 'white',
              fontWeight: 'bold',
              boxShadow: '0 4px 10px rgba(0, 0, 0, 0.2)'
            }}>
              {getRoleIcon(user.role)}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                {user.displayName}
              </div>
              <div style={{ fontSize: '0.75rem', color: user.role === 'superadmin' ? '#f59e0b' : user.role === 'admin' ? '#c084fc' : '#38bdf8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
                {user.role} • <span style={{ color: 'var(--text-muted)' }}>{(user.schoolId === 'master' ? 'SaaS Master' : (user.schoolId || 'Brook Field')).replace('school_', '').toUpperCase()}</span>
              </div>
            </div>
          </div>

          <nav className="sidebar-nav-menu">
            {filteredLinks.map((link) => {
              const isActive = pathname === link.href;
              const isLocked = link.featureKey ? !(features as any)[link.featureKey] : false;
              return (
                <Link 
                  key={link.href}
                  href={isLocked ? '#' : link.href} 
                  onClick={(e) => {
                    if (isLocked) {
                      e.preventDefault();
                      alert(`🔒 Feature Locked: "${link.label}" has been restricted by Super Admin.\n\n📞 Support Line: +92 349 5999656\n✉️ Email: sameerabdullah930@gmail.com`);
                    }
                  }}
                  className={`sidebar-link ${isActive ? 'active' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    borderRadius: '12px',
                    fontWeight: isActive ? 700 : 500,
                    opacity: isLocked ? 0.6 : 1,
                    transition: 'all 0.2s',
                    background: isActive ? 'var(--primary-light)' : 'transparent',
                    borderLeft: isActive ? '4px solid var(--primary)' : '4px solid transparent',
                    color: isActive ? 'var(--primary)' : 'var(--text-muted)'
                  }}
                >
                  <span style={{ fontSize: '1.15rem' }}>{link.icon}</span>
                  <span style={{ flex: 1 }}>{link.label}</span>
                  {isLocked && <span style={{ fontSize: '0.85rem' }} title="Restricted by Super Admin">🔒</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="sidebar-logout-box">
          <button 
            onClick={async () => {
              const res = await fetch('/api/auth/logout', { method: 'POST' });
              if (res.ok) window.location.href = '/login';
            }}
            style={{
              width: '100%',
              padding: '0.85rem',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '12px',
              color: '#f87171',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.1)'
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)')}
            onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)')}
          >
            <span>🔒</span> Secure Logout
          </button>
        </div>
      </div>

      {/* Glassmorphism Full-Screen Mobile Menu Modal */}
      {mobileMenuOpen && (
        <div style={{
          position: 'fixed',
          top: '72px',
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          zIndex: 2000,
          padding: '2rem 1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
          overflowY: 'auto',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          {/* Mobile Menu Header / User Info */}
          <div style={{ background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.15)', padding: '1.25rem', borderRadius: '18px', display: 'flex', alignItems: 'center', gap: '1rem', color: 'white', boxShadow: '0 10px 25px rgba(0,0,0,0.3)' }}>
            <div style={{ width: '52px', height: '52px', background: getRoleColor(user.role), borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 'bold', boxShadow: '0 4px 15px rgba(0,0,0,0.3)' }}>
              {getRoleIcon(user.role)}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.15rem' }}>{user.displayName}</div>
              <div style={{ fontSize: '0.8rem', color: '#38bdf8', textTransform: 'uppercase', fontWeight: 700, marginTop: '0.2rem', letterSpacing: '0.05em' }}>
                {user.role} • {user.schoolId?.replace('school_', '').toUpperCase()}
              </div>
            </div>
          </div>

          {/* Navigation Links Column */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {filteredLinks.map(link => {
              const isActive = pathname === link.href;
              const isLocked = link.featureKey ? !(features as any)[link.featureKey] : false;
              return (
                <Link
                  key={link.href}
                  href={isLocked ? '#' : link.href}
                  onClick={(e) => {
                    if (isLocked) {
                      e.preventDefault();
                      alert(`🔒 Feature Locked: "${link.label}" has been restricted by Super Admin.\n\n📞 Support Line: +92 349 5999656\n✉️ Email: sameerabdullah930@gmail.com`);
                    } else {
                      setMobileMenuOpen(false);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1.1rem',
                    padding: '1rem 1.25rem',
                    borderRadius: '16px',
                    fontSize: '1.1rem',
                    fontWeight: isActive ? 700 : 600,
                    color: isActive ? 'white' : 'rgba(255, 255, 255, 0.85)',
                    background: isActive ? 'var(--primary)' : 'rgba(255, 255, 255, 0.06)',
                    border: isActive ? '1px solid var(--primary-hover)' : '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: isActive ? '0 8px 20px rgba(37, 99, 235, 0.3)' : 'none',
                    opacity: isLocked ? 0.5 : 1,
                    textDecoration: 'none'
                  }}
                >
                  <span style={{ fontSize: '1.4rem' }}>{link.icon}</span>
                  <span style={{ flex: 1 }}>{link.label}</span>
                  {isLocked && <span style={{ fontSize: '1rem' }}>🔒</span>}
                  {isActive && <span style={{ fontSize: '0.85rem', background: 'rgba(255,255,255,0.2)', padding: '0.2rem 0.6rem', borderRadius: '8px' }}>Active</span>}
                </Link>
              );
            })}
          </nav>

          {/* Logout Button */}
          <div style={{ marginTop: 'auto', paddingTop: '1.5rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <button
              onClick={async () => {
                const res = await fetch('/api/auth/logout', { method: 'POST' });
                if (res.ok) window.location.href = '/login';
              }}
              style={{ width: '100%', padding: '1rem', background: '#ef4444', color: 'white', fontWeight: 700, borderRadius: '16px', border: 'none', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', boxShadow: '0 8px 20px rgba(239, 68, 68, 0.4)', cursor: 'pointer' }}
            >
              <span>🔒</span> Secure Logout
            </button>
          </div>
        </div>
      )}
    </>
  );
}
