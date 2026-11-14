export const TRIAL_DAY_MS = 86_400_000;
export const MAX_TRIAL_DAYS = 365;
export const TRIAL_EXPIRED_MESSAGE = 'Your school’s trial has expired. Contact licensing support to restore access.';

export function trialDaysLeft(expiresAt: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / TRIAL_DAY_MS));
}

export function trialReminder(daysLeft: number): 7 | 3 | 1 | null {
  if (daysLeft <= 0 || daysLeft > 7) return null;
  if (daysLeft === 1) return 1;
  return daysLeft <= 3 ? 3 : 7;
}

export function formatTrialExpiry(expiresAt: string): string {
  return new Intl.DateTimeFormat('en-PK', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Karachi' }).format(new Date(expiresAt));
}
