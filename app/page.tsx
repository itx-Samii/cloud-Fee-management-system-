"use client";
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import DashboardCharts from './components/DashboardCharts';
import { useFeatures } from '@/lib/useFeatures';
import type { FeatureKey } from '@/lib/features';
import { reloadTo } from '@/lib/reloadTo';
import { isLeft } from '@/lib/fees';
import { dashboardCashFlow, dashboardExpenses, dashboardIncome, type DashboardPeriod } from '@/lib/dashboard';
import type { Expense, FeeVoucher, Payment, SalaryRecord, Student } from '@/lib/types';

interface DashboardData {
  fees: FeeVoucher[];
  students: Student[];
  expenses: Expense[];
  salaries: SalaryRecord[];
  payments: Payment[];
}

const SHORTCUTS: { label: string; href: string; feature: FeatureKey; icon: string }[] = [
  { label: 'Receive payment', href: '/collection', feature: 'collection', icon: 'M4 6h16v12H4zm0 4h16m-12 4h4' },
  { label: 'Generate vouchers', href: '/generate', feature: 'generate', icon: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7m-7 4h7' },
  { label: 'View reports', href: '/reports', feature: 'reports', icon: 'M4 20V4m0 16h16M9 16v-4m5 4V8m5 8V5' },
];

const currency = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 });
const money = (amount: number) => `Rs. ${currency.format(amount)}`;

function SummaryCard({ label, value, icon, tone }: { label: string; value: string; icon: string; tone?: 'negative' | 'positive' }) {
  return (
    <article className="workspace-metric glass-panel" data-tone={tone}>
      <div aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg></div>
      <h2>{label}</h2>
      <strong>{value}</strong>
    </article>
  );
}

async function fetchDashboardData(): Promise<DashboardData> {
  const currentMonth = new Date().toLocaleString('default', { month: 'long' });
  const currentYear = new Date().getFullYear().toString();

  // Opening the dashboard bills the current month for any student not billed yet.
  await fetch('/api/fees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month: currentMonth, year: currentYear })
  }).catch(err => console.error("Silent generate failed", err));

  const response = await fetch('/api/dashboard', { cache: 'no-store' });
  if (!response.ok) throw new Error((await response.json()).error || 'Dashboard is unavailable.');
  return response.json();
}

export default function Dashboard() {
  const [viewMode, setViewMode] = useState<DashboardPeriod>('monthly');
  const { has } = useFeatures();
  const [loadError, setLoadError] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData>({
    fees: [],
    students: [],
    expenses: [],
    salaries: [],
    payments: []
  });

  const loadDashboard = useCallback(() => fetchDashboardData()
    .then((result) => {
      setData(result);
      setHasLoaded(true);
      setLoadError('');
    })
    .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : 'Could not load dashboard. Please retry.'))
    .finally(() => setLoading(false)), []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const now = new Date();
  const metrics = {
    ...dashboardIncome(data.fees, data.students, data.payments, viewMode, now),
    students: data.students.filter((student) => !isLeft(student)).length,
    expenses: dashboardExpenses(data.expenses, data.salaries, viewMode, now),
  };
  const cashFlow = dashboardCashFlow(data.payments, data.expenses, data.salaries, viewMode, now);
  const shortcuts = SHORTCUTS.filter((shortcut) => has(shortcut.feature));

  const unifiedLogs = [
    ...data.payments.filter((p) => !p.reversedAt).map((p) => ({
      id: `receipt-${p.id}`,
      type: 'INCOME',
      category: `Receipt #${p.id}`,
      title: p.studentName || 'Student Payment',
      amount: p.amount,
      date: p.receivedAt,
    })),
    ...data.expenses.map((e) => ({
      id: `exp-${e.id}`,
      type: 'EXPENSE',
      category: e.category || 'General',
      title: e.description || 'Expense',
      amount: e.amount,
      date: e.date || new Date().toISOString(),
    })),
    ...data.salaries.map((s) => ({
      id: `sal-${s.id}`,
      type: 'EXPENSE',
      category: 'Salary',
      title: s.staffName || `Staff ID: ${s.staffId}`,
      amount: s.amount,
      date: s.paymentDate || s.date || new Date().toISOString(),
    }))
  ].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
   .slice(0, 10);

  if (!hasLoaded) return (
    <div className="glass-panel" style={{ padding: '2rem' }}>
      <h1>School Pay Dashboard</h1>
      {loading ? <p role="status">Loading school accounts...</p> : <>
        <p role="alert">{loadError}</p>
        <button className="btn btn-primary" onClick={() => { setLoading(true); void loadDashboard(); }}>Retry</button>
      </>}
    </div>
  );

  return (
    <div className="workspace-dashboard">
      <header className="workspace-dashboard-hero glass-panel">
        <div>
          <p className="workspace-eyebrow">Accounts overview</p>
          <h1>School Pay Dashboard</h1>
          <p>{viewMode === 'monthly' ? 'Your school’s finances this month.' : 'Your school’s finances across all sessions.'}</p>
        </div>
        <div className="workspace-period" role="group" aria-label="Reporting period">
          <button type="button" onClick={() => setViewMode('monthly')} aria-pressed={viewMode === 'monthly'} className={`btn ${viewMode === 'monthly' ? 'btn-primary' : 'btn-secondary'}`}>Monthly view</button>
          <button type="button" onClick={() => setViewMode('all-time')} aria-pressed={viewMode === 'all-time'} className={`btn ${viewMode === 'all-time' ? 'btn-primary' : 'btn-secondary'}`}>Lifetime audit</button>
        </div>
      </header>

      {loadError && <div role="alert" className="glass-panel" style={{ padding: '1rem', marginBottom: '1rem' }}>
        {loadError} Showing previously loaded figures. <button className="btn btn-secondary" onClick={() => { setLoading(true); void loadDashboard(); }} disabled={loading}>Retry</button>
      </div>}
      {metrics.legacyUnallocated > 0 && <p>Historical collections without receipts: Rs. {metrics.legacyUnallocated.toLocaleString('en-US')}. Included in lifetime totals; excluded from monthly collections because their payment dates cannot be reliably allocated.</p>}
      <div className="workspace-metrics" aria-label="Financial summary">
        <SummaryCard label="Total enrollment" value={metrics.students.toLocaleString('en-PK')} icon="M16 20v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m15-2v-2a3 3 0 0 0-2-3M14 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />
        <SummaryCard label={viewMode === 'monthly' ? 'Monthly gross collected' : 'Total gross collected'} value={money(metrics.gross)} icon="M4 6h16v12H4zm0 4h16m-12 4h4" />
        <SummaryCard label={viewMode === 'monthly' ? 'Monthly expenses' : 'Total expenses'} value={money(metrics.expenses)} tone="negative" icon="M5 3h14v18l-3-2-4 2-4-2-3 2V3Zm4 5h6m-6 4h6" />
        <SummaryCard label={viewMode === 'monthly' ? 'Net profit (month)' : 'Net profit (total)'} value={money(metrics.gross - metrics.expenses)} tone={metrics.gross < metrics.expenses ? 'negative' : 'positive'} icon="M4 19h16M5 15l4-4 4 2 6-7m-5 0h5v5" />
      </div>

      <DashboardCharts points={cashFlow} period={viewMode} tuition={metrics.tuition} annualCharges={metrics.annualCharges} />

      {shortcuts.length > 0 && (
        <nav className="dashboard-shortcuts no-print" aria-label="Quick actions">
          {shortcuts.map(({ label, href, icon }) => (
            <Link key={href} className="glass-panel dashboard-shortcut" href={href} prefetch={false}>
              <span className="dashboard-shortcut-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg></span>
              <span>{label}</span><span className="dashboard-shortcut-arrow" aria-hidden="true">↗</span>
            </Link>
          ))}
        </nav>
      )}

      <section className="workspace-sections" aria-labelledby="recent-activity">
        <h2 id="recent-activity">Recent activity</h2>
        <p>Latest income and expenses recorded in School Pay.</p>
        <div className="glass-panel table-container" tabIndex={0} role="region" aria-labelledby="recent-activity">
        <table className="table">
          <thead>
            <tr>
              <th>S.No</th>
              <th>Description / Title</th>
              <th>Category</th>
              <th>Date</th>
              <th>Amount</th>
              <th className="no-print">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
               <tr>
                 <td colSpan={6} style={{textAlign: 'center', padding: '3rem'}}>
                   <span style={{color: 'var(--text-muted)'}}>Calculating metrics...</span>
                 </td>
               </tr>
            ) : unifiedLogs.length === 0 ? (
              <tr>
                <td colSpan={6} style={{textAlign: 'center', padding: '3rem'}}>
                  <span style={{color: 'var(--text-muted)'}}>No recent activity found.</span>
                </td>
              </tr>
            ) : (
               unifiedLogs.map((log, idx) => (
                 <tr key={`log_${log.id}_${idx}_${log.type}`}>
                   <td style={{color: 'var(--text-muted)', fontSize: '0.9rem'}}>{idx + 1}.</td>
                   <td style={{fontWeight: 'bold'}}>
                      {log.title}
                      {log.type === 'INCOME' ? (
                        <span style={{fontSize: '0.7rem', marginLeft: '8px', padding: '2px 6px', background: 'var(--success-bg)', color: 'var(--success)', borderRadius: '4px'}}>IN</span>
                      ) : (
                        <span style={{fontSize: '0.7rem', marginLeft: '8px', padding: '2px 6px', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: '4px'}}>OUT</span>
                      )}
                   </td>
                   <td style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>{log.category}</td>
                   <td style={{fontSize: '0.9rem'}}>{new Date(log.date || new Date()).toLocaleDateString('en-GB')}</td>
                   <td className="workspace-numeric" style={{fontWeight: 700, color: log.type === 'INCOME' ? 'var(--success)' : 'var(--danger)'}}>
                      {log.type === 'INCOME' ? '+' : '-'} {money(log.amount)}
                   </td>
                   <td className="no-print">
                      {log.type === 'INCOME' && (
                        <button 
                          className="btn" 
                          style={{padding: '0.2rem 0.5rem', fontSize: '0.7rem', background: '#e11d48', color: 'white', border: 'none'}}
                          onClick={async () => {
                            if(confirm(`Are you sure you want to REVERSE this payment of Rs. ${log.amount}?`)) {
                              const rawId = log.id.replace('receipt-', '');
                              const res = await fetch(`/api/payments?id=${rawId}`, { method: 'DELETE' });
                              if(res.ok) loadDashboard();
                              else alert((await res.json().catch(() => null))?.error || "Failed to reverse.");
                            }
                          }}
                        >
                          Reverse
                        </button>
                      )}
                    </td>
                 </tr>
               ))
            )}
          </tbody>
        </table>
      </div>
      </section>

      <div style={{marginTop: '3rem'}}>
         <h2>System Security & Maintenance</h2>
         <p style={{marginBottom: '1.5rem'}}>Protect your 3+ years of data with regular offline backups.</p>
         
         <div className="glass-panel" style={{padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem', border: '1px solid var(--primary-light)'}}>
            <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center'}}>
              <div>
                 <h3 style={{marginBottom: '0.5rem'}}>Full System Backup & Restore</h3>
                 <p style={{color: 'var(--text-muted)', maxWidth: '500px', fontSize: '0.9rem'}}>
                   Manage your database backups. <strong>Recommendation:</strong> Save your data to a USB drive once a week.
                 </p>
              </div>
              <div style={{display: 'flex', gap: '1rem'}}>
                <button 
                  className="btn btn-primary" 
                  style={{padding: '1rem 2rem'}}
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/admin/backup');
                      const data = await res.json();
                      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      const date = new Date().toISOString().split('T')[0];
                      a.download = `School_ERP_Backup_${date}.json`;
                      document.body.appendChild(a);
                      a.click();
                      window.URL.revokeObjectURL(url);
                      alert("Backup Downloaded Successfully!");
                    } catch {
                      alert("Backup failed. Check system connection.");
                    }
                  }}
                >
                  Download Backup
                </button>
                
                <div style={{position: 'relative'}}>
                  <button 
                    className="btn btn-secondary" 
                    style={{padding: '1rem 2rem', border: '1px solid var(--primary)', color: 'var(--primary)'}}
                    onClick={() => document.getElementById('restore-input')?.click()}
                  >
                    📤 Restore from Backup
                  </button>
                  <input 
                    id="restore-input" 
                    type="file" 
                    accept=".json" 
                    style={{display: 'none'}} 
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      
                      if (!confirm("WARNING: This will delete ALL current data and replace it with the backup. Continue?")) return;

                      const reader = new FileReader();
                      reader.onload = async (event) => {
                        try {
                          const backup = JSON.parse(event.target?.result as string);
                          const res = await fetch('/api/admin/restore', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(backup)
                          });
                          
                          if (res.ok) {
                            alert("SUCCESS! System data has been restored. Refreshing...");
                            window.location.reload();
                          } else {
                            const err = await res.json();
                            alert("ERROR: " + err.error);
                          }
                        } catch {
                          alert("Invalid backup file.");
                        }
                      };
                      reader.readAsText(file);
                    }}
                  />
                </div>
              </div>
            </div>

            <div style={{borderTop: '1px dashed var(--border)', paddingTop: '2rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center'}}>
               <div>
                  <h3 style={{marginBottom: '0.5rem'}}>Security Credentials</h3>
                  <p style={{color: 'var(--text-muted)', fontSize: '0.9rem'}}>Update your administrator login password.</p>
               </div>
               <button 
                 className="btn btn-secondary" 
                 style={{padding: '0.75rem 1.5rem', color: 'var(--danger)', borderColor: 'var(--danger)'}}
                 onClick={() => {
                   const oldPass = prompt("Enter Current Password:");
                   if (!oldPass) return;
                   const newPass = prompt("Enter New Password (min 8 chars):");
                   if (!newPass) return;
                   const confirmPass = prompt("Confirm New Password:");
                   if (newPass !== confirmPass) {
                     alert("Passwords do not match!");
                     return;
                   }

                   fetch('/api/auth/change-password', {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({ oldPassword: oldPass, newPassword: newPass })
                   }).then(async res => {
                     if (res.ok) {
                       alert("Password changed successfully! Please login again.");
                       await fetch('/api/auth/logout', { method: 'POST' });
                       reloadTo('/login');
                     } else {
                       const err = await res.json();
                       alert("Error: " + err.error);
                     }
                   });
                 }}
               >
                 🔒 Change Admin Password
               </button>
            </div>
         </div>
      </div>
    </div>
  );
}
