import Link from 'next/link';
import WelcomeShell from '../components/welcome/WelcomeShell';

export default async function LicenseBlockedPage({ searchParams }: { searchParams: Promise<{ reason?: string | string[] }> }) {
  const trialExpired = (await searchParams).reason === 'trial';
  return (
    <WelcomeShell>
      <main id="welcome-content" tabIndex={-1} className="welcome-login-wrap">
        <section className="welcome-login welcome-glass welcome-enter welcome-notice" aria-labelledby="license-title">
          <div className="welcome-login-heading">
            <h1 id="license-title">{trialExpired ? 'School trial expired' : 'School access suspended'}</h1>
            <p>{trialExpired ? 'Contact licensing support to extend the trial or activate a regular license.' : 'Contact licensing support to check your school’s subscription and restore access.'}</p>
          </div>
          <a href="mailto:sameerabdullah930@gmail.com" className="welcome-button welcome-button-primary">Email licensing support</a>
          <p className="welcome-login-footer"><span>Support line</span> <a href="tel:+923495999656">+92 349 5999656</a></p>
          <Link href="/login" className="welcome-back" prefetch={false}>Back to sign-in</Link>
        </section>
      </main>
    </WelcomeShell>
  );
}
