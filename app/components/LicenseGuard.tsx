"use client";
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { featureOfPath, featureOn } from '@/lib/features';

/**
 * Sends the user away from the app if the school's license is blocked, and away from a page whose
 * feature the Super Admin has switched off (the server refuses those features' actions as well).
 */
export default function LicenseGuard() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname === '/license-blocked' || pathname === '/login') return;

    const checkLicense = async () => {
      try {
        const res = await fetch('/api/admin/license');
        if (res.ok) {
          const data = await res.json();
          const feature = featureOfPath(pathname);
          if (data.status === 'blocked') {
            router.replace('/license-blocked');
          } else if (feature && !featureOn(data.features, feature)) {
            router.replace(`/feature-locked?feature=${feature}`);
          }
        }
      } catch {
        // network offline grace period
      }
    };

    checkLicense();
    const interval = setInterval(checkLicense, 60_000); // Check every minute
    return () => clearInterval(interval);
  }, [pathname, router]);

  return null;
}
