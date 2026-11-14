import type { Metadata } from 'next';
import WelcomeShell from '@/app/components/welcome/WelcomeShell';
import SignupForm from './SignupForm';

export const metadata: Metadata = { title: 'School signup | School Pay' };

export default function SignupPage() {
  return <WelcomeShell><SignupForm /></WelcomeShell>;
}
