import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import ThemeSwitcher from './components/ThemeSwitcher';
import SidebarNav from './components/SidebarNav';
import AuthGuard from './components/AuthGuard';
import ErrorBoundary from './components/ErrorBoundary';

const themeScript = `(function(){try{var saved=localStorage.getItem('school-theme')||'light';document.documentElement.setAttribute('data-theme',saved);}catch(e){}})();`;

export const metadata: Metadata = {
  title: 'Fee Management System',
  description: 'Independent offline fee billing and tracking system',
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
        <aside className="sidebar no-print" style={{position: 'fixed', left: 0, top: 0, bottom: 0}}>
          <div>
            <h2 style={{color: 'var(--primary)', marginBottom: '0.25rem'}}>School Pay</h2>
            <p style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>Fee Management System</p>
          </div>
          <SidebarNav />
          <ThemeSwitcher />
        </aside>
        <main className="main-content" style={{marginLeft: '260px', width: 'calc(100% - 260px)'}}>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </body>
    </html>
  );
}
