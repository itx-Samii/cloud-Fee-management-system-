import React from 'react';
import { tuitionOf, type FeeSettings } from '@/lib/fees';
import type { FeeVoucher } from '@/lib/types';

/** The voucher fields a challan needs; the API fills in arrears, fine and balance on every read. */
export type ChallanVoucher = Pick<
  FeeVoucher,
  'amount' | 'baseAmount' | 'discount' | 'charges' | 'paidTuition' | 'previousArrears' | 'remainingAnnualCharges' | 'lateFine' | 'fineWaived' | 'balanceDue' | 'dueDate'
>;

const n = (value: unknown) => Number(value) || 0;

export function numberToWords(num: number): string {
  const ones = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
  const tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
  const convert = (n: number): string => {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' HUNDRED' + (n % 100 !== 0 ? ' AND ' + convert(n % 100) : '');
    if (n < 100000) return convert(Math.floor(n / 1000)) + ' THOUSAND' + (n % 1000 !== 0 ? ' ' + convert(n % 1000) : '');
    if (n < 10000000) return convert(Math.floor(n / 100000)) + ' LAKH' + (n % 100000 !== 0 ? ' ' + convert(n % 100000) : '');
    return n.toString();
  };
  if (num === 0) return 'ZERO';
  return convert(Math.floor(num)) + ' ONLY';
}

/** The amounts block of a printed challan: particulars, totals, amount in words and due date. */
export default function ChallanBill({ voucher: f, settings, savedDueDateOnly = false }: { voucher: ChallanVoucher; settings: FeeSettings; savedDueDateOnly?: boolean }) {
  const fine = n(f.lateFine);
  const paid = n(f.paidTuition);
  const total = f.balanceDue ?? Math.max(0, n(f.amount) + fine - paid) + n(f.previousArrears) + n(f.remainingAnnualCharges);
  // Not overdue yet: show what it becomes after the due date.
  const afterDue = (!savedDueDateOnly || Boolean(f.dueDate)) && fine === 0 && !f.fineWaived && settings.lateFine > 0 && n(f.amount) > paid ? total + settings.lateFine : null;
  // Vouchers from before due dates were saved: due a set number of days from printing, as before.
  const dueDate = f.dueDate ? new Date(f.dueDate) : new Date();
  if (!f.dueDate) dueDate.setDate(dueDate.getDate() + settings.dueDays);
  const right = { textAlign: 'right' } as const;

  return (
    <>
      <table className="challan-table">
        <thead>
          <tr><th>Particulars</th><th style={{width: '30%'}}>Amount</th></tr>
        </thead>
        <tbody>
          <tr><td>Monthly Tuition Fee</td><td style={right}>{tuitionOf(f)}</td></tr>
          {n(f.discount) > 0 && <tr><td>Less: Discount</td><td style={{...right, color: 'red'}}>- {f.discount}</td></tr>}
          {(f.charges ?? []).map((c, i) => <tr key={i}><td>{c.label}</td><td style={right}>{c.amount}</td></tr>)}
          {fine > 0 && <tr><td>Late Fine</td><td style={right}>{fine}</td></tr>}
          {paid > 0 && <tr><td>Less: Already Paid</td><td style={{...right, color: 'red'}}>- {paid}</td></tr>}
          {n(f.previousArrears) > 0 && <tr><td>Previous Arrears</td><td style={right}>{f.previousArrears}</td></tr>}
          {n(f.remainingAnnualCharges) > 0 && <tr><td>Annual Charges O/S</td><td style={right}>{f.remainingAnnualCharges}</td></tr>}
          <tr style={{fontWeight: 900, background: '#f8fafc'}}>
            <td><strong>{afterDue !== null ? 'Total (Within Due Date)' : 'Total Payable'}</strong></td>
            <td style={right}><strong>PKR {total.toLocaleString()}</strong></td>
          </tr>
          {afterDue !== null && (
            <tr style={{fontWeight: 900, background: '#fff1f2', color: '#e11d48'}}>
              <td><strong>Total (After Due Date)</strong></td>
              <td style={right}><strong>PKR {afterDue.toLocaleString()}</strong></td>
            </tr>
          )}
        </tbody>
      </table>

      <div style={{fontSize: '7.5pt', margin: '2mm 0'}}>
        <strong>Amount in Words (PKR)</strong>
        <div style={{textTransform: 'uppercase', marginTop: '1mm', borderBottom: '0.5px solid #ccc', paddingBottom: '1mm'}}>{numberToWords(total)}</div>
      </div>

      {(!savedDueDateOnly || f.dueDate) && <div style={{fontSize: '11pt', fontWeight: 900, margin: '3mm 0'}}>
        Due Date: {dueDate.toLocaleDateString('en-GB')}
      </div>}
    </>
  );
}
