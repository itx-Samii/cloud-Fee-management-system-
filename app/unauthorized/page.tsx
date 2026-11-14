import Link from 'next/link';
import WelcomeShell from '../components/welcome/WelcomeShell';

export default function UnauthorizedPage() {
  return (
    <WelcomeShell>
      <main id="welcome-content" tabIndex={-1} className="welcome-login-wrap">
        <section className="welcome-login welcome-glass welcome-enter welcome-notice" aria-labelledby="access-title">
          <div className="welcome-login-heading">
            <h1 id="access-title">Access restricted</h1>
            <p>Your account does not have permission to open this page. Ask your school administrator if you need access.</p>
          </div>
          <Link href="/collection" className="welcome-button welcome-button-primary" prefetch={false}>Return to fee collection</Link>
        </section>
      </main>
    </WelcomeShell>
  );
}
