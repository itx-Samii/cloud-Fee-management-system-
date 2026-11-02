"use client";
import React, { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { exportToCSV } from '@/lib/exportUtils';
import { periodLabel } from '@/lib/fees';
import type { Payment } from '@/lib/types';

/** "2026-10-31" for the given date in this computer's timezone. */
const dayString = (date: Date) => date.toLocaleDateString('en-CA');

const rupees = (amount: number) => `Rs. ${amount.toLocaleString('en-US')}`;

const noSubscription = () => () => {};

/** Today on this computer. Empty during the server render, which may run in another timezone. */
const useToday = () => useSyncExternalStore(noSubscription, () => dayString(new Date()), () => '');

/** Receipts issued on `day` (YYYY-MM-DD), counted from this computer's midnight to the next. */
async function fetchReceipts(day: string): Promise<Payment[]> {
  const start = new Date(`${day}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const res = await fetch(`/api/payments?from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(end.toISOString())}`, {
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Failed to load receipts');
  return data;
}

export default function CashBook() {
  const today = useToday();
  const [pickedDay, setPickedDay] = useState('');
  const day = pickedDay || today;
  const [receipts, setReceipts] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isPrincipal, setIsPrincipal] = useState(false);

  useEffect(() => {
    fetch('/api/auth/login')
      .then((res) => res.json())
      .then((data) => setIsPrincipal(data?.user?.role === 'admin'))
      .catch(() => {});
  }, []);

  const loadReceipts = useCallback(
    () =>
      fetchReceipts(day)
        .then((rows) => {
          setReceipts(rows);
          setError('');
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setLoading(false)),
    [day]
  );

  useEffect(() => {
    if (day) loadReceipts();
  }, [day, loadReceipts]);

  const handleReverse = async (receipt: Payment) => {
    if (!confirm(`Reverse receipt #${receipt.id} for ${rupees(receipt.amount)}? Every month it paid becomes unpaid again.`)) return;
    const res = await fetch(`/api/payments?id=${receipt.id}`, { method: 'DELETE' });
    if (!res.ok) alert((await res.json().catch(() => null))?.error || 'Could not reverse the receipt.');
    loadReceipts();
  };

  const changeDay = (next: string) => {
    if (!next || next === day) return;
    setLoading(true);
    setPickedDay(next);
  };

  const shiftDay = (days: number) => {
    const d = new Date(`${day}T00:00:00`);
    d.setDate(d.getDate() + days);
    changeDay(dayString(d));
  };

  const valid = receipts.filter((r) => !r.reversedAt);
  const reversed = receipts.filter((r) => r.reversedAt);
  const total = valid.reduce((sum, r) => sum + r.amount, 0);
  const tuition = valid.reduce((sum, r) => sum + r.paidTuition, 0);
  const annual = valid.reduce((sum, r) => sum + r.paidAC, 0);

  // What each cashier should have in hand at the end of the day.
  const byCashier = new Map<string, { name: string; count: number; amount: number }>();
  valid.forEach((r) => {
    const entry = byCashier.get(r.receivedBy) ?? { name: r.receivedByName || r.receivedBy, count: 0, amount: 0 };
    entry.count++;
    entry.amount += r.amount;
    byCashier.set(r.receivedBy, entry);
  });

  const handleExport = () => {
    exportToCSV(
      receipts.map((r) => ({
        ...r,
        time: new Date(r.receivedAt).toLocaleTimeString(),
        period: `${r.month ?? ''} ${r.year ?? ''}`.trim(),
        state: r.reversedAt ? `Reversed by ${r.reversedBy}` : 'Valid',
      })),
      `cash_book_${day}`,
      {
        id: 'Receipt No.',
        time: 'Time',
        studentName: 'Student',
        className: 'Class',
        period: 'Fee For',
        paidTuition: 'Tuition',
        paidAC: 'Annual Charges',
        amount: 'Total',
        receivedByName: 'Received By',
        state: 'Status',
      }
    );
  };

  const isToday = day === today;

  return (
    <div style={{animation: 'fadeIn 0.5s ease-out'}}>
      <h1>Daily Cash Book</h1>
      <p className="no-print" style={{marginBottom: '2rem'}}>
        Every receipt issued on the chosen day, and how much cash each cashier should hand over.
      </p>

      <div className="glass-panel no-print" style={{padding: '1.5rem', marginBottom: '2rem', display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem'}}>
        <div style={{minWidth: '180px'}}>
          <label className="form-label">Date</label>
          <input type="date" className="form-input" value={day} onChange={(e) => changeDay(e.target.value)} />
        </div>
        <button className="btn btn-secondary" onClick={() => shiftDay(-1)}>← Previous day</button>
        <button className="btn btn-secondary" onClick={() => shiftDay(1)} disabled={isToday}>Next day →</button>
        {!isToday && <button className="btn btn-secondary" onClick={() => changeDay(today)}>Today</button>}
        <div style={{flex: 1}} />
        <button className="btn btn-secondary" onClick={handleExport}>Export CSV</button>
        <button className="btn btn-primary" onClick={() => window.print()}>Print</button>
      </div>

      {day && <p className="print-only" style={{marginBottom: '1rem'}}>Date: {new Date(`${day}T00:00:00`).toLocaleDateString('en-GB')}</p>}

      {error && (
        <div className="badge badge-danger" style={{padding: '1rem', display: 'block', fontSize: '1rem', marginBottom: '2rem'}}>{error}</div>
      )}

      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem'}}>
        <div className="glass-panel" style={{padding: '1.5rem', borderLeft: '4px solid var(--success)'}}>
          <div className="form-label">Total Collected</div>
          <div style={{fontSize: '1.8rem', fontWeight: 800, color: 'var(--success)'}}>{rupees(total)}</div>
          <div style={{color: 'var(--text-muted)', fontSize: '0.85rem'}}>{valid.length} receipt(s)</div>
        </div>
        <div className="glass-panel" style={{padding: '1.5rem', borderLeft: '4px solid var(--primary)'}}>
          <div className="form-label">Tuition / Annual Charges</div>
          <div style={{fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-main)'}}>{rupees(tuition)}</div>
          <div style={{color: 'var(--text-muted)', fontSize: '0.85rem'}}>+ {rupees(annual)} annual charges</div>
        </div>
        <div className="glass-panel" style={{padding: '1.5rem', borderLeft: '4px solid var(--danger)'}}>
          <div className="form-label">Reversed</div>
          <div style={{fontSize: '1.3rem', fontWeight: 700, color: 'var(--danger)'}}>{rupees(reversed.reduce((sum, r) => sum + r.amount, 0))}</div>
          <div style={{color: 'var(--text-muted)', fontSize: '0.85rem'}}>{reversed.length} receipt(s), not counted</div>
        </div>
      </div>

      {byCashier.size > 0 && (
        <div className="glass-panel table-container" style={{marginBottom: '2rem'}}>
          <table className="table">
            <thead>
              <tr><th>Cashier</th><th>Receipts</th><th>Cash to hand over</th></tr>
            </thead>
            <tbody>
              {[...byCashier.values()].map((c) => (
                <tr key={c.name}>
                  <td style={{fontWeight: 600}}>{c.name}</td>
                  <td>{c.count}</td>
                  <td style={{fontWeight: 700}}>{rupees(c.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="glass-panel table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Receipt</th>
              <th>Time</th>
              <th>Student</th>
              <th>Fee For</th>
              <th>Tuition</th>
              <th>Annual</th>
              <th>Total</th>
              <th>Received By</th>
              {isPrincipal && <th className="no-print"></th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{textAlign: 'center', padding: '2rem'}}>Loading receipts...</td></tr>
            ) : receipts.length === 0 ? (
              <tr><td colSpan={9} style={{textAlign: 'center', padding: '2rem', color: 'var(--text-muted)'}}>No payments were received on this day.</td></tr>
            ) : (
              receipts.map((r) => (
                <tr key={String(r.id)} style={r.reversedAt ? {opacity: 0.55, textDecoration: 'line-through'} : undefined}>
                  <td style={{fontWeight: 700}}>#{r.id}</td>
                  <td>{new Date(r.receivedAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</td>
                  <td>
                    <div style={{fontWeight: 600}}>{r.studentName}</div>
                    <div style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>{r.className} · voucher #{r.voucherId}</div>
                  </td>
                  <td>
                    {(r.allocations ?? []).filter((a) => a.amount > 0).length > 1
                      ? (r.allocations ?? []).filter((a) => a.amount > 0).map((a) => (
                          <div key={String(a.voucherId)} style={{fontSize: '0.85rem'}}>{periodLabel(a)}: {rupees(a.amount)}{a.created ? ' (advance)' : ''}</div>
                        ))
                      : periodLabel(r)}
                    {(r.allocations ?? []).some((a) => a.fineCharged) && <div style={{fontSize: '0.75rem', color: 'var(--danger)'}}>incl. late fine</div>}
                    {(r.allocations ?? []).some((a) => a.fineWaived) && <div style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>late fine waived</div>}
                  </td>
                  <td>{rupees(r.paidTuition)}</td>
                  <td>{rupees(r.paidAC)}</td>
                  <td style={{fontWeight: 700}}>
                    {rupees(r.amount)}
                    {r.reversedAt && (
                      <span className="badge badge-danger" style={{marginLeft: '0.5rem', textDecoration: 'none', display: 'inline-block'}}>Reversed</span>
                    )}
                  </td>
                  <td>{r.receivedByName || r.receivedBy}</td>
                  {isPrincipal && (
                    <td className="no-print" style={{textDecoration: 'none'}}>
                      {!r.reversedAt && (
                        <button className="btn" style={{padding: '0.25rem 0.6rem', fontSize: '0.75rem', background: '#e11d48', color: 'white', border: 'none'}} onClick={() => handleReverse(r)}>
                          Reverse
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
