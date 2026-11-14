import type { Metadata } from 'next';
import './globals.css';
import './glass-tokens.css';
import './components/welcome/welcome.css';
import './workspace.css';
import AppShell from './components/AppShell';

const themeScript = `(function(){try{var saved=localStorage.getItem('school-theme')||'light';document.documentElement.setAttribute('data-theme',saved);}catch(e){}})();`;

export const metadata: Metadata = {
  title: 'School Pay - Fee Management System',
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
      <body suppressHydrationWarning>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
