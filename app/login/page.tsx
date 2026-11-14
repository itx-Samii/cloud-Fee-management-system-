import type { Metadata } from 'next';
import WelcomeShell from '../components/welcome/WelcomeShell';
import SignInForm from './SignInForm';

export const metadata: Metadata = {
  title: 'Sign in | School Pay',
  description: 'Sign in to School Pay with a staff account or your parent phone number and School PIN.',
};

export default function LoginPage() {
  return <WelcomeShell><SignInForm /></WelcomeShell>;
}
