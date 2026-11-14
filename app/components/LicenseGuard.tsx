"use client";
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { featureOfPath, featureOn } from '@/lib/features';
import { formatTrialExpiry, trialDaysLeft, trialReminder } from '@/lib/trials';

/**
 * Sends the user away from the app if the school's license is blocked, and away from a page whose
 * feature the Super Admin has switched off (the server refuses those features' actions as well).
 */
export default function LicenseGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const [trial, setTrial] = useState<{ expiresAt: string; daysLeft: number } | null>(null);

  useEffect(() => {
    if (pathname === '/license-blocked' || pathname === '/login') return;

    const controller = new AbortController();
    let expiryCheck: ReturnType<typeof setTimeout> | undefined;
    let checking = false;
    const checkLicense = async () => {
      if (checking || controller.signal.aborted) return;
      checking = true;
      try {
        const res = await fetch('/api/admin/license', {
          cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        });
        if (res.ok) {
          const data = await res.json();
          if (controller.signal.aborted) return;
          const feature = featureOfPath(pathname);
          clearTimeout(expiryCheck);
          if (data.status === 'expired') {
            router.replace('/license-blocked?reason=trial');
          } else if (data.status === 'blocked') {
            router.replace('/license-blocked');
          } else if (feature && !featureOn(data.features, feature)) {
            router.replace(`/feature-locked?feature=${feature}`);
          } else if (data.trialExpiresAt) {
            const now = Date.parse(data.lastChecked);
            const remaining = Date.parse(data.trialExpiresAt) - now;
            setTrial({ expiresAt: data.trialExpiresAt, daysLeft: trialDaysLeft(data.trialExpiresAt, now) });
            if (remaining <= 60_000) expiryCheck = setTimeout(checkLicense, Math.max(250, remaining));
          } else {
            setTrial(null);
          }
        }
      } catch {
        // network offline grace period
      } finally {
        checking = false;
      }
    };

    checkLicense();
    const interval = setInterval(checkLicense, 60_000); // Check every minute
    window.addEventListener('focus', checkLicense);
    return () => {
      controller.abort();
      clearTimeout(expiryCheck);
      clearInterval(interval);
      window.removeEventListener('focus', checkLicense);
    };
  }, [pathname, router]);

  if (!trial || pathname === '/portal' || pathname === '/superadmin') return null;
  const { expiresAt, daysLeft } = trial;
  const reminder = trialReminder(daysLeft);
  const days = `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`;
  return (
    <aside className="trial-notice glass-panel no-print" data-reminder={reminder ?? undefined} aria-label="School trial">
      <span className="trial-badge">Trial</span>
      <div role="status" aria-atomic="true">
        <strong>{reminder ? `Trial ends in ${days}` : `${days} remaining`}</strong>
        <p>Expires <time dateTime={expiresAt}>{formatTrialExpiry(expiresAt)}</time> PKT.</p>
        {reminder && <p>Contact your service provider to keep school access after the trial.</p>}
      </div>
    </aside>
  );
}
