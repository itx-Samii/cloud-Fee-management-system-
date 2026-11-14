import type { Metadata } from 'next';
import Link from 'next/link';
import WelcomeShell from '../components/welcome/WelcomeShell';
import SchoolPayMark from '../components/welcome/SchoolPayMark';

export const metadata: Metadata = {
  title: 'School Pay | School fees, in order',
  description: 'Manage student accounts, track fee collections, and issue numbered receipts with School Pay.',
};

const FEATURES = [
  { title: 'Fee collection', description: 'Take full or partial payments, track outstanding fees, and issue a numbered receipt.', icon: 'M5 3h14v18l-3-2-4 2-4-2-3 2V3Zm4 5h6m-6 4h6m-6 4h3' },
  { title: 'Student records', description: 'Register students with automatic admission numbers and a roll sequence for each class.', icon: 'M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2m15-16a4 4 0 0 1 0 8m4 8v-2a4 4 0 0 0-3-4M14 9a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z' },
  { title: 'Accounts and reports', description: 'Review daily collections, outstanding balances, expenses, and salaries in one workspace.', icon: 'M4 20V4m0 16h16M9 16v-4m5 4V8m5 8V5' },
  { title: 'Local operation', description: 'Keep daily collections running without internet when you use the Windows offline launcher.', icon: 'M4 5h16v11H4zM2 20h20m-12-9 1.5 1.5L15 9' },
];

function LedgerPreview() {
  return (
    <figure className="welcome-preview welcome-enter" aria-label="Illustrative School Pay cash book and numbered receipt">
      <div className="welcome-preview-grid" aria-hidden="true" />
      <div className="welcome-ledger welcome-glass">
        <div className="welcome-ledger-header"><span><SchoolPayMark /> Cash book</span><span className="welcome-sample">Sample</span></div>
        <div className="welcome-ledger-total"><span>Today’s collections</span><strong><small>Rs.</small> 42,500</strong></div>
        <div className="welcome-chart" aria-hidden="true">
          <div className="welcome-chart-grid" />
          <svg viewBox="0 0 340 90" preserveAspectRatio="none" focusable="false">
            <defs><linearGradient id="welcome-chart-area" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox"><stop stopColor="currentColor" stopOpacity=".36" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
            <path fill="url(#welcome-chart-area)" d="M0 77C20 79 34 55 57 60S94 69 115 49 148 30 175 42 216 50 240 27 273 26 295 18 322 8 340 4V90H0Z" />
            <path fill="none" stroke="currentColor" strokeWidth="2.5" vectorEffect="non-scaling-stroke" d="M0 77C20 79 34 55 57 60S94 69 115 49 148 30 175 42 216 50 240 27 273 26 295 18 322 8 340 4" />
          </svg>
        </div>
        <div className="welcome-chart-labels" aria-hidden="true"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span></div>
        <div className="welcome-ledger-entry"><span className="welcome-entry-mark" aria-hidden="true">↙</span><span><strong>Tuition payment</strong><small>Class 7 · Section A</small></span><strong>Rs. 4,500</strong></div>
      </div>
      <div className="welcome-receipt welcome-glass">
        <div className="welcome-receipt-head"><span className="welcome-paid" aria-hidden="true">✓</span><span>Fee receipt<small>No. 00482</small></span></div>
        <div className="welcome-receipt-value"><span>Amount paid</span><strong>Rs. 4,500</strong></div>
        <div className="welcome-receipt-code" aria-hidden="true" />
      </div>
    </figure>
  );
}

export default function HomePage() {
  return (
    <WelcomeShell>
      <main id="welcome-content" tabIndex={-1} className="welcome-content">
        <section className="welcome-hero" aria-labelledby="welcome-hero-title">
          <div className="welcome-hero-copy">
            <p className="welcome-kicker welcome-enter"><span /> School finance workspace</p>
            <h1 id="welcome-hero-title" className="welcome-enter">School fees,<br />in order.</h1>
            <p className="welcome-hero-description welcome-enter">Manage student accounts, collect fees, and issue numbered receipts from one workspace.</p>
            <div className="welcome-hero-actions welcome-enter">
              <Link href="/login" className="welcome-button welcome-button-primary" prefetch={false}>Sign in to School Pay <span aria-hidden="true">↗</span></Link>
              <Link href="#features" className="welcome-button welcome-button-secondary">Explore features <span aria-hidden="true">↓</span></Link>
            </div>
            <p className="welcome-offline welcome-enter"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4" /></svg> Works offline with the Windows launcher</p>
          </div>
          <LedgerPreview />
        </section>
        <section id="features" className="welcome-features" aria-labelledby="welcome-features-title">
          <div className="welcome-section-heading">
            <h2 id="welcome-features-title">The school office,<br />in one place.</h2>
            <p>From registering a student to closing the day’s cash book.</p>
          </div>
          <div className="welcome-feature-grid">
            {FEATURES.map(({ title, description, icon }) => (
              <article key={title} className="welcome-feature welcome-glass">
                <svg className="welcome-feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icon} /></svg>
                <h3>{title}</h3><p>{description}</p>
              </article>
            ))}
          </div>
        </section>
        <footer className="welcome-footer">
          <Link href="/home" className="welcome-brand" prefetch={false}><SchoolPayMark /> <span>School Pay</span></Link>
          <Link href="/login" prefetch={false}>Sign in <span aria-hidden="true">↗</span></Link>
        </footer>
      </main>
    </WelcomeShell>
  );
}
