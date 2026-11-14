"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { chargesTotal, isLeft, periodLabel, periodOf } from '@/lib/fees';
import { useFeeSettings } from '@/lib/useFeeSettings';
import { useFeatures } from '@/lib/useFeatures';
import { familyReminderMessage, reminderMessage, whatsappLink, whatsappNumber } from '@/lib/whatsapp';
import { recordReminder } from '@/app/components/ReminderQueue';
import ParentPortalAccess from '@/app/components/ParentPortalAccess';
import type { FamilyMember, FeeVoucher, Payment, Student } from '@/lib/types';

interface Ledger {
  student: Student & { className?: string };
  vouchers: FeeVoucher[];
  receipts: Payment[];
  family: FamilyMember[];
}

const rupees = (amount: number) => `Rs. ${amount.toLocaleString('en-US')}`;

/** What this voucher alone still owes: its balance without arrears or annual charges. */
const ownBalance = (v: FeeVoucher) => Math.max(0, (v.balanceDue ?? 0) - (v.previousArrears ?? 0) - (v.remainingAnnualCharges ?? 0));

async function fetchLedger(studentId: string): Promise<Ledger> {
  const id = encodeURIComponent(studentId);
  const [studentRes, feesRes, receiptsRes, familyRes] = await Promise.all([
    fetch(`/api/students?id=${id}`, { cache: 'no-store' }),
    fetch(`/api/fees?studentId=${id}`, { cache: 'no-store' }),
    fetch(`/api/payments?studentId=${id}`, { cache: 'no-store' }),
    fetch(`/api/students/family?id=${id}`, { cache: 'no-store' }),
  ]);
  const student = await studentRes.json();
  if (!studentRes.ok) throw new Error(student?.error || 'Student not found');
  const vouchers: FeeVoucher[] = feesRes.ok ? await feesRes.json() : [];
  const receipts: Payment[] = receiptsRes.ok ? await receiptsRes.json() : [];
  const family: FamilyMember[] = familyRes.ok ? (await familyRes.json()).members : [];
  return { student, vouchers: vouchers.sort((a, b) => periodOf(a) - periodOf(b)), receipts, family };
}

export default function StudentLedger() {
  const { studentId } = useParams<{ studentId: string }>();
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [error, setError] = useState('');
  const { settings } = useFeeSettings();
  const { has } = useFeatures();

  useEffect(() => {
    fetchLedger(studentId)
      .then(setLedger)
      .catch((err: Error) => setError(err.message));
  }, [studentId]);

  if (error) return <div className="badge badge-danger" style={{padding: '1rem', display: 'block', fontSize: '1rem'}}>{error}</div>;
  if (!ledger) return <p>Loading ledger...</p>;

  const { student, vouchers, receipts, family } = ledger;
  const billed = vouchers.reduce((sum, v) => sum + (v.amount || 0) + (v.lateFine || 0), 0);
  const valid = receipts.filter((r) => !r.reversedAt);
  const paidTuition = vouchers.reduce((sum, v) => sum + (v.paidTuition || 0), 0);
  const annualOwed = Math.max(0, (student.annualCharges || 0) - (student.paidAnnualCharges || 0));
  const tuitionOwed = vouchers.reduce((sum, v) => sum + ownBalance(v), 0);
  const siblings = family.filter((m) => String(m.studentId) !== String(student.id));
  const familyTotal = family.reduce((sum, m) => sum + m.balance, 0);
  const school = settings.schoolName || 'the school';
  const forFamily = siblings.length > 0 && familyTotal > tuitionOwed + annualOwed;
  const reminder = whatsappLink(
    student.parentPhone,
    forFamily
      ? familyReminderMessage({ school, members: family })
      : reminderMessage({ school, student: student.name, className: student.className ?? '', total: tuitionOwed + annualOwed, months: 0, since: '' })
  );

  return (
    <div style={{animation: 'fadeIn 0.5s ease-out'}}>
      <div className="no-print" style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem'}}>
        <Link href="/defaulters" style={{color: 'var(--text-muted)'}}>← Defaulter list</Link>
        <div style={{display: 'flex', gap: '0.5rem'}}>
          {reminder && has('whatsapp') && tuitionOwed + annualOwed + familyTotal > 0 && (
            <a href={reminder} target="_blank" rel="noopener noreferrer" className="btn" style={{background: '#25D366', color: 'white', border: 'none'}}
              onClick={() => recordReminder({
                number: whatsappNumber(student.parentPhone) as string,
                studentIds: forFamily ? family.filter((m) => m.balance > 0).map((m) => m.studentId) : [student.id],
                total: forFamily ? familyTotal : tuitionOwed + annualOwed,
              }, false)}>
              Remind on WhatsApp
            </a>
          )}
          <button className="btn btn-primary" onClick={() => window.print()}>Print Statement</button>
        </div>
      </div>

      <h1>
        {student.name}
        {isLeft(student) && <span className="badge badge-neutral" style={{marginLeft: '0.75rem', fontSize: '0.9rem', verticalAlign: 'middle'}}>Left</span>}
      </h1>
      <p style={{marginBottom: '2rem'}}>
        S/O {student.fatherName || 'N/A'}{student.parentPhone ? ` (${student.parentPhone})` : ''} · Adm No {student.admissionNumber || 'N/A'} · {student.className} · Monthly fee {rupees(student.monthlyFee || 0)}
        {(student.discount || 0) > 0 && ` (discount ${rupees(student.discount || 0)})`}
        {chargesTotal(student.monthlyCharges) > 0 && ` + ${(student.monthlyCharges ?? []).map((c) => `${c.label} ${rupees(c.amount)}`).join(', ')}`}
      </p>

      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '1.5rem', marginBottom: '2rem'}}>
        <div className="glass-panel" style={{padding: '1.5rem', borderLeft: '4px solid var(--primary)'}}>
          <div className="form-label">Billed (incl. fines)</div>
          <div style={{fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)'}}>{rupees(billed)}</div>
          <div style={{color: 'var(--text-muted)', fontSize: '0.85rem'}}>{vouchers.length} month(s)</div>
        </div>
        <div className="glass-panel" style={{padding: '1.5rem', borderLeft: '4px solid var(--success)'}}>
          <div className="form-label">Paid</div>
          <div style={{fontSize: '1.5rem', fontWeight: 800, color: 'var(--success)'}}>{rupees(paidTuition + (student.paidAnnualCharges || 0))}</div>
          <div style={{color: 'var(--text-muted)', fontSize: '0.85rem'}}>tuition {rupees(paidTuition)} + annual {rupees(student.paidAnnualCharges || 0)}</div>
        </div>
        <div className="glass-panel" style={{padding: '1.5rem', borderLeft: '4px solid var(--danger)'}}>
          <div className="form-label">Balance Due Now</div>
          <div style={{fontSize: '1.5rem', fontWeight: 800, color: 'var(--danger)'}}>{rupees(tuitionOwed + annualOwed)}</div>
          <div style={{color: 'var(--text-muted)', fontSize: '0.85rem'}}>tuition {rupees(tuitionOwed)} + annual {rupees(annualOwed)}</div>
        </div>
      </div>

      {has('parentPortal') && whatsappNumber(student.parentPhone) && (
        <ParentPortalAccess key={whatsappNumber(student.parentPhone)} phone={student.parentPhone as string} school={school} canWhatsApp={has('whatsapp')} />
      )}

      {siblings.length > 0 && (
        <>
          <h3 style={{marginBottom: '1rem'}}>Family (same parent phone)</h3>
          <div className="glass-panel table-container" style={{marginBottom: '2rem'}}>
            <table className="table">
              <thead>
                <tr><th>Student</th><th>Class</th><th>Balance Due Now</th></tr>
              </thead>
              <tbody>
                {family.map((m) => (
                  <tr key={String(m.studentId)}>
                    <td style={{fontWeight: 600}}>
                      {String(m.studentId) === String(student.id) ? m.name : <Link href={`/ledger/${m.studentId}`}>{m.name}</Link>}
                      {m.left && <span className="badge badge-neutral" style={{marginLeft: '0.5rem'}}>Left</span>}
                    </td>
                    <td>{m.className}</td>
                    <td style={{fontWeight: 700, color: m.balance > 0 ? 'var(--danger)' : 'var(--success)'}}>{rupees(m.balance)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={2} style={{fontWeight: 800}}>Family total</td>
                  <td style={{fontWeight: 800, color: familyTotal > 0 ? 'var(--danger)' : 'var(--success)'}}>{rupees(familyTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3 style={{marginBottom: '1rem'}}>Monthly Vouchers</h3>
      <div className="glass-panel table-container" style={{marginBottom: '2rem'}}>
        <table className="table">
          <thead>
            <tr><th>Month</th><th>Voucher</th><th>Fee</th><th>Late Fine</th><th>Paid</th><th>Balance</th><th>Status</th></tr>
          </thead>
          <tbody>
            {vouchers.length === 0 ? (
              <tr><td colSpan={7} style={{textAlign: 'center', padding: '2rem', color: 'var(--text-muted)'}}>No vouchers yet.</td></tr>
            ) : (
              vouchers.map((v) => (
                <tr key={String(v.id)}>
                  <td style={{fontWeight: 600}}>{periodLabel(v)}</td>
                  <td>#{v.id}</td>
                  <td>
                    {rupees(v.amount || 0)}
                    {(v.charges ?? []).length > 0 && (
                      <div style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>incl. {(v.charges ?? []).map((c) => `${c.label} ${rupees(c.amount)}`).join(', ')}</div>
                    )}
                  </td>
                  <td>{v.fineWaived ? 'waived' : v.lateFine ? rupees(v.lateFine) : '-'}</td>
                  <td>{rupees(v.paidTuition || 0)}</td>
                  <td style={{fontWeight: 700, color: ownBalance(v) > 0 ? 'var(--danger)' : 'var(--success)'}}>{rupees(ownBalance(v))}</td>
                  <td>
                    <span className={`badge ${v.status === 'Paid' ? 'badge-success' : v.status === 'Partially Paid' ? 'badge-warning' : 'badge-danger'}`}>{v.status}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h3 style={{marginBottom: '1rem'}}>Receipts</h3>
      <div className="glass-panel table-container">
        <table className="table">
          <thead>
            <tr><th>Receipt</th><th>Date</th><th>Amount</th><th>Applied To</th><th>Received By</th></tr>
          </thead>
          <tbody>
            {receipts.length === 0 ? (
              <tr><td colSpan={5} style={{textAlign: 'center', padding: '2rem', color: 'var(--text-muted)'}}>No receipts yet.</td></tr>
            ) : (
              receipts.map((r) => (
                <tr key={String(r.id)} style={r.reversedAt ? {opacity: 0.55, textDecoration: 'line-through'} : undefined}>
                  <td style={{fontWeight: 700}}>#{r.id}</td>
                  <td>{new Date(r.receivedAt).toLocaleDateString('en-GB')}</td>
                  <td style={{fontWeight: 700}}>
                    {rupees(r.amount)}
                    {r.reversedAt && <span className="badge badge-danger" style={{marginLeft: '0.5rem', textDecoration: 'none', display: 'inline-block'}}>Reversed</span>}
                  </td>
                  <td style={{fontSize: '0.85rem'}}>
                    {(r.allocations ?? [{ voucherId: r.voucherId, month: r.month, year: r.year, amount: r.paidTuition }])
                      .filter((a) => a.amount > 0)
                      .map((a) => `${periodLabel(a)} ${rupees(a.amount)}${a.created ? ' (advance)' : ''}`)
                      .join(' · ')}
                    {r.paidAC > 0 && `${r.paidTuition > 0 ? ' · ' : ''}annual charges ${rupees(r.paidAC)}`}
                  </td>
                  <td>{r.receivedByName || r.receivedBy}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p style={{marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem'}}>
        {valid.length} receipt(s). Payments taken before receipts were introduced appear in the vouchers but not here.
      </p>
    </div>
  );
}
