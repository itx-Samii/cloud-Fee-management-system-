'use client';

import { usePathname } from 'next/navigation';
import SidebarNav from './SidebarNav';
import AuthGuard from './AuthGuard';
import LicenseGuard from './LicenseGuard';
import ErrorBoundary from './ErrorBoundary';
import GlassAtmosphere from './welcome/GlassAtmosphere';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (['/home', '/login', '/signup', '/license-blocked', '/unauthorized'].includes(pathname)) {
    return <ErrorBoundary>{children}</ErrorBoundary>;
  }
  if (pathname === '/portal') {
    return <div className="workspace workspace-portal"><AuthGuard /><LicenseGuard /><GlassAtmosphere /><ErrorBoundary>{children}</ErrorBoundary></div>;
  }

  return (
    <div className="dashboard-layout workspace">
      <GlassAtmosphere />
      <a className="welcome-skip no-print" href="#workspace-content">Skip to content</a>
      <AuthGuard />
      <SidebarNav />
      <main id="workspace-content" tabIndex={-1} className="main-content"><LicenseGuard /><ErrorBoundary>{children}</ErrorBoundary></main>
    </div>
  );
}
