import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import ThemeSwitcher from './components/ThemeSwitcher';
import SidebarNav from './components/SidebarNav';
import AuthGuard from './components/AuthGuard';
import LicenseGuard from './components/LicenseGuard';
import ErrorBoundary from './components/ErrorBoundary';

const themeScript = `(function(){try{var saved=localStorage.getItem('school-theme')||'light';document.documentElement.setAttribute('data-theme',saved);}catch(e){}})();`;

export const metadata: Metadata = {
  title: 'School Pay ERP - Cloud Enterprise System',
  description: 'Enterprise fee billing, accounting ledger, and tracking system with RBAC security',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="dashboard-layout" suppressHydrationWarning>
        <AuthGuard />
        <LicenseGuard />
        <aside className="sidebar no-print">
          <div>
            <h2 style={{color: 'var(--primary)', marginBottom: '0.25rem'}}>School Pay</h2>
            <p style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>Fee Management System</p>
          </div>
          <SidebarNav />
          <ThemeSwitcher />
        </aside>
        <main className="main-content">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </body>
    </html>
  );
}
