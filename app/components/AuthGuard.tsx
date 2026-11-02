"use client";
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const PUBLIC_PATHS = ['/login', '/license-blocked', '/unauthorized', '/superadmin'];

export default function AuthGuard() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // Skip check on public pages
    if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) return;

    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/login', { cache: 'no-store' });
        if (!res.ok) {
          router.replace('/login');
        }
      } catch {
        // Network error — allow grace period, don't force logout
        console.warn('AuthGuard: Network error during session check');
      }
    };

    checkAuth();
  }, [pathname, router]);

  return null;
}
