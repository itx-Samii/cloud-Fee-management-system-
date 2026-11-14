'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { reloadTo } from '@/lib/reloadTo';
import ThemeSwitch from '@/app/components/welcome/ThemeSwitch';
import SchoolPayMark from '@/app/components/welcome/SchoolPayMark';
import type { FeeSettings } from '@/lib/fees';
import type { ChallanProfile } from '@/lib/challanProfile';
import type { RecordId } from '@/lib/types';
import ParentChallan, { type ParentVoucher } from './ParentChallan';
import './portal.css';

interface PortalReceipt { id: number; receivedAt: string; amount: number; paidAC?: number; months: string }
interface Child {
  id: RecordId;
  name: string;
  fatherName?: string;
  admissionNumber?: string;
  className: string;
  left: boolean;
  balance: number;
  annualCharges: number;
  overdueMonths: number;
  vouchers: ParentVoucher[];
  receipts: PortalReceipt[];
}
interface Portal {
  school: { name: string };
  parent: { name: string };
  settings: FeeSettings;
  challanProfile: ChallanProfile;
  total: number;
  children: Child[];
}
interface Problem { message: string; status?: number }

const currency = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 });
const rupees = (amount: number) => 'Rs. ' + currency.format(amount);
const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const period = (voucher: ParentVoucher) => [voucher.month, voucher.year].filter(Boolean).join(' ');
const payable = (voucher: ParentVoucher) => Number(voucher.balanceDue) > 0;

function PrintButton({ onClick, primary = false }: { onClick: () => void; primary?: boolean }) {
  return (
    <button type="button" className={'btn ' + (primary ? 'btn-primary' : 'btn-secondary')} onClick={onClick}>
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 8V3h10v5m-10 9H4V9h16v8h-3M7 14h10v7H7zm10-2h.01" /></svg>
      Print challan
    </button>
  );
}

function FeeCard({ child, preview }: { child: Child; preview: (voucher: ParentVoucher) => void }) {
  // The API returns newest billing periods first. A paid month can still carry arrears or annual charges.
  const latest = child.vouchers.find(payable);
  const history = child.vouchers.filter((voucher) => voucher !== latest);

  return (
    <section className="glass-panel parent-child" aria-labelledby={'parent-child-' + child.id}>
      <header className="parent-child-header">
        <div>
          <h2 id={'parent-child-' + child.id}>{child.name} {child.left && <span className="badge badge-neutral">Left school</span>}</h2>
          <p>{[child.className, child.admissionNumber && 'Admission ' + child.admissionNumber].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="parent-child-total">
          <span>Student balance</span>
          <strong>{rupees(child.balance)}</strong>
        </div>
      </header>
      {latest ? (
        <div className="parent-current-fee">
          <div>
            <p className="parent-current-label">Latest fee with a balance</p>
            <h3>{period(latest)}</h3>
            <p>
              <span>Voucher #{latest.id}</span>
              {latest.dueDate && <span> · Due {date(latest.dueDate)}</span>}
            </p>
          </div>
          <div className="parent-current-action">
            <div><span>Challan payable</span><strong>{rupees(Number(latest.balanceDue))}</strong></div>
            <PrintButton primary onClick={() => preview(latest)} />
          </div>
        </div>
      ) : (
        <p className="parent-fee-empty">
          {child.vouchers.length === 0 ? 'No fee voucher has been issued yet. Refresh after the school issues one.' : 'No challan with a balance is available.'}
        </p>
      )}
      {child.balance > 0 && (child.overdueMonths > 0 || child.annualCharges > 0) && (
        <p className="parent-account-note">
          {[
            child.overdueMonths > 0 ? child.overdueMonths + (child.overdueMonths === 1 ? ' overdue month' : ' overdue months') : '',
            child.annualCharges > 0 ? 'Includes annual charges of ' + rupees(child.annualCharges) : '',
          ].filter(Boolean).join(' · ')}
        </p>
      )}
      {history.length > 0 && (
        <details className="parent-history">
          <summary>{latest ? 'Other fee vouchers' : 'Fee vouchers'} ({history.length})</summary>
          <ul>
            {history.map((voucher) => (
              <li key={voucher.id} className="parent-history-row">
                <div>
                  <strong>{period(voucher)}</strong>
                  <p>Voucher #{voucher.id}{voucher.dueDate ? ' · Due ' + date(voucher.dueDate) : ''}</p>
                </div>
                <div className="parent-actions">
                  <span className={'badge ' + (payable(voucher) ? 'badge-warning' : 'badge-success')}>
                    {payable(voucher) ? rupees(Number(voucher.balanceDue)) + ' due' : voucher.status}
                  </span>
                  {payable(voucher) && <PrintButton onClick={() => preview(voucher)} />}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
      {child.receipts.length > 0 && (
        <details className="parent-history">
          <summary>Payment receipts ({child.receipts.length})</summary>
          <ul>
            {child.receipts.map((receipt) => (
              <li key={receipt.id} className="parent-history-row">
                <div>
                  <strong>Receipt #{receipt.id} · {date(receipt.receivedAt)}</strong>
                  <p>{[receipt.months, receipt.paidAC ? 'Annual charges ' + rupees(receipt.paidAC) : ''].filter(Boolean).join(' · ')}</p>
                </div>
                <strong>{rupees(receipt.amount)}</strong>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export default function ParentPortal() {
  const [data, setData] = useState<Portal | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [selection, setSelection] = useState<ParentVoucher | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const latestRequest = useRef<AbortController | null>(null);
  const printTrigger = useRef<HTMLElement | null>(null);

  const refresh = useCallback(async () => {
    latestRequest.current?.abort();
    const controller = new AbortController();
    latestRequest.current = controller;
    setLoading(true);
    setProblem(null);
    try {
      const response = await fetch('/api/portal', {
        cache: 'no-store',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      });
      const result = await response.json().catch(() => null);
      if (controller.signal.aborted) return;
      if (!response.ok || !Array.isArray(result?.children)) {
        if (response.status === 401 || response.status === 403) {
          setData(null);
          setUpdatedAt(null);
        }
        setProblem({
          message: typeof result?.error === 'string' ? result.error : 'Could not load your fee details. Try again.',
          status: response.status,
        });
        return;
      }
      setData(result);
      setUpdatedAt(new Date());
    } catch {
      if (!controller.signal.aborted) setProblem({ message: 'Could not reach School Pay. Check your connection and try again.' });
    } finally {
      if (latestRequest.current === controller && !controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Let the initial loading state render, and cancel outstanding work when leaving.
    const start = window.setTimeout(() => { void refresh(); }, 0);
    return () => { clearTimeout(start); latestRequest.current?.abort(); };
  }, [refresh]);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError('');
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', signal: AbortSignal.timeout(15000) });
      if (response.ok) { reloadTo('/login'); return; }
    } catch { /* Leave the sign-out action available for a retry. */ }
    setSignOutError('Could not sign out. Please try again.');
    setSigningOut(false);
  }

  function openChallan(voucher: ParentVoucher) {
    printTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelection(voucher);
  }

  const signedOut = problem?.status === 401;
  return (
    <main className="portal-page">
      <div className={'parent-portal-content' + (selection ? ' no-print' : '')}>
        <header className="workspace-portal-header welcome-glass">
          <div className="parent-brand">
            <SchoolPayMark />
            <div><p className="portal-label">Parent portal</p><h1>{data?.school.name ?? 'School Pay'}</h1></div>
          </div>
          <div className="workspace-portal-actions">
            <ThemeSwitch />
            <button type="button" className="btn btn-secondary" onClick={() => void signOut()} disabled={signingOut}>{signingOut ? 'Signing out…' : 'Sign out'}</button>
          </div>
        </header>
        {signOutError && <p role="alert" className="parent-portal-message">{signOutError}</p>}

        {data && (
          <section className="glass-panel parent-overview" aria-labelledby="parent-balance-title">
            <div>
              <h2 id="parent-balance-title">Family balance</h2>
              <strong>{rupees(data.total)}</strong>
              <p>{data.children.length === 1 ? '1 student' : data.children.length + ' students'}{data.parent.name ? ' · ' + data.parent.name : ''}</p>
            </div>
            <div className="parent-refresh">
              <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => void refresh()}>{loading ? 'Refreshing…' : 'Refresh fees'}</button>
              {updatedAt && <p role="status">Updated {updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}
            </div>
          </section>
        )}

        {problem && (
          <div className="glass-panel parent-portal-message">
            <p role="alert">{problem.message}{data && ' Showing the last loaded fees.'}</p>
            {signedOut ? (
              <button type="button" className="btn btn-primary" onClick={() => void signOut()} disabled={signingOut}>Sign in again</button>
            ) : (
              <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => void refresh()}>Try again</button>
            )}
          </div>
        )}
        {!data && !problem && <p className="glass-panel parent-portal-message" role="status">Loading your fee details…</p>}
        {data?.children.length === 0 && <p className="glass-panel parent-portal-message">No students are linked to this number. Ask the school office to check your details.</p>}
        {data?.children.map((child) => <FeeCard key={child.id} child={child} preview={openChallan} />)}
      </div>

      {selection && data && <ParentChallan profile={data.challanProfile} voucher={selection} settings={data.settings} onClose={() => {
        setSelection(null);
        printTrigger.current?.focus();
      }} />}
    </main>
  );
}
