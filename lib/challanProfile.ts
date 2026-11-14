export const CHALLAN_FIELDS = [
  { key: 'schoolName', label: 'School name', limit: 120, storage: 'fms-school-name' },
  { key: 'schoolAddress', label: 'School address / contact', limit: 220, storage: 'fms-school-address' },
  { key: 'bankName', label: 'Bank name', limit: 100, storage: 'fms-bank-name' },
  { key: 'bankBranch', label: 'Bank branch / address', limit: 160, storage: 'fms-bank-branch' },
  { key: 'bankAccountTitle', label: 'Account title', limit: 100, storage: 'fms-bank-title' },
  { key: 'bankAccountNo', label: 'Account number', limit: 64, storage: 'fms-bank-no' },
  { key: 'instituteId', label: 'Institute ID', limit: 40, storage: 'fms-inst-id' },
  { key: 'paymentMethods', label: 'Payment instructions', limit: 800, storage: 'fms-pay-methods', multiline: true },
  { key: 'challanNote', label: 'Challan footer note', limit: 480, storage: 'fms-note', multiline: true },
] as const;

export type ChallanProfile = Record<typeof CHALLAN_FIELDS[number]['key'] | 'logo', string>;
export const MAX_CHALLAN_LOGO_BYTES = 1024 * 1024;
export const CHALLAN_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export function isChallanLogo(value: unknown): value is string {
  return typeof value === 'string' && value.length <= Math.ceil(MAX_CHALLAN_LOGO_BYTES / 3) * 4 + 30
    && /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/]+={0,2}$/i.test(value);
}

export function challanProfile(stored: Partial<ChallanProfile> | undefined, schoolName: string): ChallanProfile {
  return {
    schoolName, schoolAddress: '', bankName: '', bankBranch: '', bankAccountTitle: '', bankAccountNo: '',
    instituteId: '', paymentMethods: '', challanNote: '', logo: '', ...stored,
  };
}

export function validateChallanProfile(body: Record<string, unknown>) {
  const profile = challanProfile(undefined, '');
  for (const { key, label, limit } of CHALLAN_FIELDS) {
    const value = body[key];
    if (typeof value !== 'string' || value.length > limit || value.includes('\0')) {
      return { field: key, error: `Enter ${label.toLowerCase()} using at most ${limit} characters.` } as const;
    }
    profile[key] = value.trim();
  }
  if (!profile.schoolName) return { field: 'schoolName', error: 'Enter the school name.' } as const;
  if (body.logo !== '' && !isChallanLogo(body.logo)) return { field: 'logo', error: 'Choose a PNG, JPEG, WebP or GIF logo up to 1 MB.' } as const;
  profile.logo = body.logo;
  return { profile } as const;
}
