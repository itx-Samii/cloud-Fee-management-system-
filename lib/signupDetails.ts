import { MIN_PASSWORD_LENGTH, USERNAME_PATTERN, USERNAME_RULES } from './credentials';

export const signupFields = ['schoolName', 'schoolAddress', 'principalName', 'email', 'phone', 'username', 'password'] as const;
export type SignupField = typeof signupFields[number];
export type SignupDetails = Record<SignupField, string>;

export const signupLabels: Record<SignupField, string> = {
  schoolName: 'School name',
  schoolAddress: 'School address',
  principalName: 'Principal name',
  email: 'Contact email',
  phone: 'Contact phone',
  username: 'Username',
  password: 'Password',
};

export const signupMaxLength: Record<SignupField, number> = {
  schoolName: 120, schoolAddress: 240, principalName: 120, email: 254, phone: 32, username: 32, password: 128,
};

export function validateSignup(input: Partial<Record<SignupField, unknown>>) {
  const details = {} as SignupDetails;
  for (const field of signupFields) {
    const value = input[field];
    const text = typeof value === 'string' ? value.trim() : '';
    const label = signupLabels[field];
    if (!text) return { field, error: `Enter ${label.toLowerCase()}.` } as const;
    if (text.length > signupMaxLength[field] || text.includes('\0')) return { field, error: `Check the ${label.toLowerCase()} and try again.` } as const;
    details[field] = text;
  }

  details.username = details.username.toLowerCase();
  if (!/^\S+@[^\s@]+\.[^\s@]+$/.test(details.email) || details.email.split('@').length !== 2) {
    return { field: 'email', error: 'Enter a valid contact email.' } as const;
  }
  if (!/^\+?[0-9 ().-]+$/.test(details.phone) || !/^\d{7,15}$/.test(details.phone.replace(/\D/g, ''))) {
    return { field: 'phone', error: 'Enter a phone number with 7 to 15 digits.' } as const;
  }
  if (!USERNAME_PATTERN.test(details.username)) return { field: 'username', error: USERNAME_RULES } as const;
  if (details.password.length < MIN_PASSWORD_LENGTH) {
    return { field: 'password', error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` } as const;
  }
  return { details } as const;
}

export type SignupDecision = 'approve' | 'reject';
export type SignupRequest = Omit<SignupDetails, 'password'> & {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  reviewedAt?: string;
  schoolId?: string;
};
