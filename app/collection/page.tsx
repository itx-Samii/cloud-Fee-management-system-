"use client";
import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import './collection.css';
import { useStoredSetting } from '@/lib/useStoredSetting';
import { periodLabel, periodOf, tuitionOf } from '@/lib/fees';
import { useFeeSettings } from '@/lib/useFeeSettings';
import { useFeatures } from '@/lib/useFeatures';
import { receiptMessage, whatsappLink } from '@/lib/whatsapp';
import { VoucherCharges } from '../components/ChargesEditor';
import type { Allocation, FeeVoucher, RecordId } from '@/lib/types';

/** A voucher as shown here; right after a payment it also carries that payment's receipt. */
type ShownVoucher = FeeVoucher & {
  receiptNo?: RecordId;
  receivedBy?: string;
  receivedNow?: number;
  allocations?: Allocation[];
  /** Tuition already paid on this voucher before the payment being taken now. */
  paidEarlier?: number;
};

/** Tuition owed now, arrears and late fines included (annual charges are taken separately). */
const tuitionDue = (v: FeeVoucher) => Math.max(0, (v.balanceDue ?? 0) - (v.remainingAnnualCharges ?? 0));

/** Late fines a payment today would charge (or could waive) on this voucher and its arrears. */
const pendingFine = (v: FeeVoucher) =>
  (v.fineCharged ? 0 : v.lateFine ?? 0) + (v.arrears ?? []).reduce((sum, line) => sum + (line.fine ?? 0), 0);

const rs = (amount: number) => `Rs. ${amount.toLocaleString('en-US')}`;

/** "November 2026 Rs. 3,000 · December 2026 Rs. 3,000 (advance)" */
const appliedTo = (allocations: Allocation[]) =>
  allocations.filter((a) => a.amount > 0).map((a) => `${periodLabel(a)} ${rs(a.amount)}${a.created ? ' (advance)' : ''}`).join(' · ');

export default function FeeCollection() {
  const [search, setSearch] = useState('');
  const [feeData, setFeeData] = useState<ShownVoucher | null>(null);
  const [suggestions, setSuggestions] = useState<FeeVoucher[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const paymentInFlight = useRef(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [paidTuition, setPaidTuition] = useState<string>('');
  const [paidAC, setPaidAC] = useState<string>('0');
  const [waiveFine, setWaiveFine] = useState(false);
  // Tuition beyond what is owed is kept as advance fee only when the cashier says so.
  const [advance, setAdvance] = useState(false);
  const [takingAdvance, setTakingAdvance] = useState(false);
  const [editingCharges, setEditingCharges] = useState(false);
  const { settings: feeSettings } = useFeeSettings();
  const { has } = useFeatures();

  const [schoolName, saveSchoolName] = useStoredSetting('fms-school-name', 'TRUST SCHOOL SYSTEM');
  const [schoolAddress, saveSchoolAddress] = useStoredSetting('fms-school-address', 'Campus Address / Contact No');
  const [logo] = useStoredSetting('fms-school-logo', '');

  // Pre-fetch all fees for rapid typeahead searching
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    // Inject dynamic @page style for A4 portrait
    const styleEl = document.createElement('style');
    styleEl.id = 'print-page-style';
    styleEl.innerHTML = `@media print { @page { size: A4 portrait !important; margin: 8mm !important; } }`;
    document.head.appendChild(styleEl);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      const el = document.getElementById('print-page-style');
      if (el) el.remove();
    };
  }, []);

  const handleSaveName = (e: React.FocusEvent<HTMLHeadingElement>) => {
    saveSchoolName(e.currentTarget.textContent || 'TRUST SCHOOL SYSTEM');
  };

  const handleSaveAddress = (e: React.FocusEvent<HTMLParagraphElement>) => {
    saveSchoolAddress(e.currentTarget.textContent || 'Campus Address / Contact No');
  };

  const handleSearchChange = async (val: string) => {
    setSearch(val);
    setFeeData(null);
    setErrorMsg('');

    if (val.trim().length > 1) {
      try {
        const res = await fetch(`/api/fees?search=${encodeURIComponent(val)}&limit=8`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(Array.isArray(data) ? data : []);
          setShowDropdown(true);
        }
      } catch (err) {
        console.error("Suggestion error:", err);
      }
    } else {
      setShowDropdown(false);
    }
  };

  /** Shows a voucher with the full amount owed filled in, ready to take. */
  const openVoucher = (voucher: FeeVoucher) => {
    setFeeData({ ...voucher, paidEarlier: voucher.paidTuition || 0 });
    setPaidTuition(String(tuitionDue(voucher)));
    setPaidAC(String(voucher.remainingAnnualCharges || 0));
    setWaiveFine(false);
    setAdvance(false);
    setTakingAdvance(false);
    setEditingCharges(false);
  };

  const toggleWaiveFine = (waive: boolean) => {
    if (!feeData) return;
    setWaiveFine(waive);
    setPaidTuition(String(Math.max(0, tuitionDue(feeData) - (waive ? pendingFine(feeData) : 0))));
  };

  const selectStudent = (studentFee: FeeVoucher) => {
    setSearch(studentFee.id.toString());
    openVoucher(studentFee);
    setShowDropdown(false);
    setErrorMsg('');
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!search) return;
    setLoading(true);
    setErrorMsg('');
    setFeeData(null);
    try {
      // 1. Search by ID first (Direct API call)
      if (!isNaN(Number(search))) {
        const res = await fetch(`/api/fees?id=${search}`);
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : (data.id ? [data] : []);
          if (list.length > 0) {
             openVoucher(list[0]);
             setLoading(false);
             return;
          }
        }
      }

      // 2. Search by Name (API call with search param)
      const res = await fetch(`/api/fees?search=${encodeURIComponent(search)}`);
      if (res.ok) {
        const data = await res.json();
        const results = Array.isArray(data) ? data : [];
        if (results.length > 0) {
          openVoucher(results[0]);
        } else {
          setErrorMsg("No active billing voucher found.");
        }
      } else {
        setErrorMsg("Search failed. Please check connection.");
      }
    } catch (error) {
      console.error("Search error:", error);
      setErrorMsg(`Search failed: ${(error instanceof Error && error.message) || 'Check your internet or server'}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePay = async () => {
    if (!feeData || paymentInFlight.current) return;
    paymentInFlight.current = true;
    setProcessing(true);
    try {
      const payment = {
        id: feeData.id,
        paidTuition: parseFloat(paidTuition) || 0,
        paidAC: parseFloat(paidAC) || 0,
        waiveFine,
        advance,
      };
      // Keep the same request ID through a lost response or page reload. If storage is
      // unavailable, stop before sending money rather than lose the ability to retry safely.
      const pendingKey = `school-payment:${JSON.stringify(payment)}`;
      const requestId = sessionStorage.getItem(pendingKey) || crypto.randomUUID();
      sessionStorage.setItem(pendingKey, requestId);
      const res = await fetch('/api/fees', {
        method: 'PUT',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payment, requestId })
      });
      const updated = await res.json();
      if (res.ok) {
        sessionStorage.removeItem(pendingKey);
        // The server sends the voucher back with fresh balances and the receipt. The printed receipt
        // still lists the arrears and annual charges as they stood, since this payment covered them.
        const waivedArrearsFines = waiveFine ? (feeData.arrears ?? []).reduce((sum, line) => sum + (line.fine ?? 0), 0) : 0;
        setFeeData({
          ...updated,
          previousArrears: (feeData.previousArrears ?? 0) - waivedArrearsFines,
          arrears: feeData.arrears,
          remainingAnnualCharges: feeData.remainingAnnualCharges,
          paidEarlier: feeData.paidEarlier,
          receivedNow: (parseFloat(paidTuition) || 0) + (parseFloat(paidAC) || 0)
        });
        setTakingAdvance(false);
        setAdvance(false);

        // trigger print wrapper
        setTimeout(() => window.print(), 300);
      } else {
        if (res.status < 500) sessionStorage.removeItem(pendingKey);
        alert(updated.error);
      }
    } catch {
      alert('Payment confirmation is unavailable. Check the Cash Book, or retry with the same details; a retry will not collect twice.');
    } finally {
      paymentInFlight.current = false;
      setProcessing(false);
    }
  };

  return (
    <div style={{animation: 'fadeIn 0.5s ease-out'}}>
      <h1 className="no-print">Fee Collection Portal</h1>
      <p className="no-print" style={{marginBottom: '2rem'}}>Scan or enter voucher number / student roll number to receive cash.</p>

      <form onSubmit={handleSearch} className="glass-panel no-print workspace-collection-search" style={{padding: '2rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end', marginBottom: '2rem', position: 'relative'}}>
        <div style={{flex: 1, position: 'relative'}} ref={dropdownRef}>
          <label className="form-label">Search by Name, Father&apos;s Name, or Voucher ID</label>
          <input
            type="text"
            className="form-input"
            placeholder="Start typing name or father's name..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => { if(suggestions.length > 0) setShowDropdown(true); }}
            style={{fontSize: '1.2rem', padding: '1rem'}}
            autoFocus
            autoComplete="off"
          />

          {showDropdown && suggestions.length > 0 && (
            <ul style={{
              position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '0.25rem',
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: '8px', boxShadow: 'var(--shadow-card)',
              maxHeight: '300px', overflowY: 'auto', zIndex: 100, listStyle: 'none', margin: '0.25rem 0 0 0', padding: 0
            }}>
              {suggestions.map(s => (
                <li
                  key={s.id}
                  onClick={() => selectStudent(s)}
                  className="dropdown-item"
                  style={{padding: '0.8rem 1rem', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}
                >
                  <div>
                    <strong style={{color: 'var(--text-main)', fontSize: '1.05rem'}}>{s.studentName}</strong>
                    <div style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>S/O: {s.fatherName}</div>
                    <div style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>Cycle: {s.month} {s.year}</div>
                  </div>
                  <div style={{textAlign: 'right'}}>
                    <span className={`badge ${s.status === 'Paid' ? 'badge-success' : 'badge-warning'}`}>{s.status}</span>
                    <div style={{fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)'}}>Class: {s.className}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <button type="submit" className="btn btn-primary" style={{height: '52px', padding: '0 2.5rem'}}>
            {loading ? 'Searching...' : 'Find Record'}
          </button>
        </div>
      </form>

      {errorMsg && (
        <div className="badge badge-danger no-print" style={{padding: '1rem', display: 'block', fontSize: '1rem', marginBottom: '2rem'}}>
          {errorMsg}
        </div>
      )}

      {feeData && (
        <div className="receipt-container" style={{maxWidth: '800px', margin: '0 auto'}}>
          <div className="physical-receipt">
            {/* eslint-disable-next-line @next/next/no-img-element -- logo is a data URL saved in this browser; next/image can't optimise it */}
            {logo && <img src={logo} alt="Watermark" style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '70%',
                opacity: 0.08,
                zIndex: 0,
                pointerEvents: 'none'
            }} />}
            {/* Header Section */}
            <div className="receipt-header-main" contentEditable suppressContentEditableWarning onBlur={handleSaveName}>
              {schoolName === 'TRUST SCHOOL SYSTEM' ? "THE BROOK FIELD SCHOOL'S SYSTEM" : schoolName}
            </div>

            <div className="campus-grid">
              <div className="campus-item" contentEditable suppressContentEditableWarning>
                BOYS CAMPUS<br/>Allama Iqbal Colony
              </div>
              <div className="campus-item" contentEditable suppressContentEditableWarning>
                BENCHMARK CAMPUS<br/>DHOKE MANGTAL
              </div>
            </div>

            <div className="contact-header-bar" contentEditable suppressContentEditableWarning onBlur={handleSaveAddress}>
              {schoolAddress === 'Campus Address / Contact No' ? "Dhoke Hassu, Rawalpindi. Mob: 0333-5435678, 0345-5904708" : schoolAddress}
            </div>

            {/* Sub Header (Official Receipt + ID) */}
            <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px'}}>
               <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                  <span style={{fontWeight: 800}}>Dated:</span>
                  <span style={{borderBottom: '1px solid #1e3a8a', minWidth: '150px', fontWeight: 600}} contentEditable suppressContentEditableWarning>{new Date().toLocaleDateString()}</span>
               </div>
               <div style={{textAlign: 'center'}}>
                  <span style={{background: '#3730a3', color: 'white', padding: '2px 15px', borderRadius: '4px', fontWeight: 900, fontSize: '0.8rem'}}>OFFICIAL RECEIPT</span>
               </div>
               <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                  <span style={{fontWeight: 800}}>{feeData.receiptNo ? 'Receipt No.' : 'Voucher No.'}</span>
                  <span style={{fontSize: '1.5rem', fontWeight: 900, letterSpacing: '2px'}}>{feeData.receiptNo ?? feeData.id}</span>
               </div>
            </div>

            {/* Student Info Lines */}
            <div className="info-row">
              <span className="info-label">Name</span>
              <span className="info-value" contentEditable suppressContentEditableWarning>{feeData.studentName}</span>
            </div>
            <div style={{display: 'flex', gap: '20px'}}>
              <div className="info-row" style={{flex: 2}}>
                <span className="info-label">S/O</span>
                <span className="info-value" contentEditable suppressContentEditableWarning>{feeData.fatherName}</span>
              </div>
              <div className="info-row" style={{flex: 1}}>
                <span className="info-label">Class</span>
                <span className="info-value" contentEditable suppressContentEditableWarning>{feeData.className}</span>
              </div>
            </div>

            {/* Particulars Table */}
            <table className="particulars-table">
              <thead>
                <tr>
                  <th style={{width: '70%'}}>PARTICULAR</th>
                  <th>AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Numbered as printed; the cashier can still retype a cell before printing.
                  const success = {color: 'var(--success)', fontWeight: 'bold'} as const;
                  const lines: { label: React.ReactNode; amount: React.ReactNode; style?: React.CSSProperties; amountStyle?: React.CSSProperties; numbered?: false }[] = [
                    { label: `Tuition Fee (Month: ${feeData.month})`, amount: tuitionOf(feeData) },
                    ...((feeData.discount ?? 0) > 0 ? [{ label: 'Scholarship / Discount', amount: `- ${feeData.discount}`, style: success }] : []),
                    ...(feeData.charges ?? []).map((c) => ({ label: c.label, amount: c.amount })),
                    ...((feeData.paidEarlier ?? 0) > 0
                      ? [{ label: 'Less: Paid Earlier on This Voucher', amount: `- ${feeData.paidEarlier}`, style: {color: 'var(--success)'}, numbered: false as const }]
                      : []),
                    {
                      label: (
                        <>
                          Previous Balance / Arrears
                          {(feeData.arrears ?? []).length > 0 && (
                            <span style={{fontSize: '0.8em', color: '#64748b'}}> ({(feeData.arrears ?? []).map((line) => periodLabel(line)).join(', ')})</span>
                          )}
                        </>
                      ),
                      amount: feeData.previousArrears || 0,
                    },
                    {
                      label: 'Annual Charges (AC) Pending',
                      amount: feeData.remainingAnnualCharges || 0,
                      amountStyle: {color: (feeData.remainingAnnualCharges ?? 0) > 0 ? 'var(--danger)' : 'inherit'},
                    },
                    { label: `Late Fine${feeData.fineWaived ? ' (waived)' : ''}`, amount: feeData.lateFine || 0 },
                  ];
                  let no = 0;
                  return lines.map((line, i) =>
                    line.numbered === false ? (
                      <tr key={i}>
                        <td style={line.style}>{line.label}</td>
                        <td style={{textAlign: 'right', ...line.style}}>{line.amount}</td>
                      </tr>
                    ) : (
                      <tr key={i}>
                        <td style={line.style} contentEditable suppressContentEditableWarning>{++no}. {line.label}</td>
                        <td style={{textAlign: 'right', ...line.style, ...line.amountStyle}} contentEditable suppressContentEditableWarning>{line.amount}</td>
                      </tr>
                    )
                  );
                })()}
              </tbody>
            </table>



            {/* Calculation & Signatures */}
            <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start'}}>
              <div style={{flex: 1}}>
                 <div className="signature-section" style={{marginTop: '20px'}}>
                    <div className="sig-item" contentEditable suppressContentEditableWarning>Accountant</div>
                    <div className="sig-item" contentEditable suppressContentEditableWarning>Sig./Stamp</div>
                 </div>
                 <div className="no-print" style={{marginTop: '30px', textAlign: 'center'}}>
                    {feeData.status === 'Paid' || feeData.status === 'Partially Paid' || feeData.receiptNo ? (
                       <p style={{color: 'var(--success)', fontWeight: 'bold'}}>
                         {feeData.receiptNo
                           ? `✓ Receipt #${feeData.receiptNo} issued by ${feeData.receivedBy} (voucher #${feeData.id})`
                           : `✓ Payment recorded${feeData.paymentDate ? ` on ${new Date(feeData.paymentDate).toLocaleDateString()}` : ''}`}
                       </p>
                    ) : null}
                    <button className="btn btn-secondary" onClick={() => window.print()} style={{marginTop: '10px'}}>Print Receipt</button>
                    {feeData.studentId != null && has('studentLedger') && (
                      <Link href={`/ledger/${feeData.studentId}`} className="btn btn-secondary" style={{marginTop: '10px', marginLeft: '0.5rem'}}>Student Ledger</Link>
                    )}
                    {(() => {
                      if (!feeData.receiptNo || !has('whatsapp')) return null;
                      const months = (feeData.allocations ?? []).filter((a) => a.amount > 0).map((a) => periodLabel(a)).join(', ');
                      const link = whatsappLink(feeData.parentPhone, receiptMessage({
                        school: feeSettings.schoolName || 'the school',
                        student: feeData.studentName ?? 'your child',
                        amount: feeData.receivedNow ?? 0,
                        receiptNo: feeData.receiptNo,
                        months,
                        balance: feeData.balanceDue ?? 0
                      }));
                      return link ? (
                        <a href={link} target="_blank" rel="noopener noreferrer" className="btn" style={{marginTop: '10px', marginLeft: '0.5rem', background: '#25D366', color: 'white', border: 'none'}}>Send on WhatsApp</a>
                      ) : null;
                    })()}
                 </div>
              </div>

              {(() => {
                // Before saving, "received" previews the amounts typed in; afterwards it is the receipt.
                // Money for months after this one (advance fee) is shown apart from what was owed.
                const received = feeData.receivedNow ?? ((parseFloat(paidTuition) || 0) + (parseFloat(paidAC) || 0));
                const owedNow = (feeData.balanceDue ?? 0) - (waiveFine && !feeData.receiptNo ? pendingFine(feeData) : 0);
                const ahead = feeData.receiptNo
                  ? (feeData.allocations ?? []).filter((a) => periodOf(a) > periodOf(feeData)).reduce((sum, a) => sum + a.amount, 0)
                  : Math.max(0, received - owedNow);
                const payable = feeData.receiptNo ? owedNow + received - ahead : owedNow;
                return (
                  <div className="calculation-box">
                    <div className="calc-row">
                      <div className="calc-label">Total Payable</div>
                      <div className="calc-value">{payable}</div>
                    </div>
                    <div className="calc-row">
                      <div className="calc-label">{feeData.receiptNo ? 'Received' : 'Receiving'}</div>
                      <div className="calc-value">{received}</div>
                    </div>
                    {ahead > 0 && (
                      <div className="calc-row">
                        <div className="calc-label">Advance (coming months)</div>
                        <div className="calc-value">{ahead}</div>
                      </div>
                    )}
                    <div className="calc-row balance-row">
                      <div className="calc-label">Pending / Bal.</div>
                      <div className="calc-value">{Math.max(0, payable - received + ahead)}</div>
                    </div>
                  </div>
                );
              })()}



            </div>

            {(feeData.allocations ?? []).length > 0 && (
              <p style={{fontSize: '0.85rem', marginTop: '1rem'}}>
                <strong>Applied to: </strong>
                {appliedTo(feeData.allocations ?? [])}
                {(feeData.allocations ?? []).some((a) => a.fineWaived) ? ' · late fine waived' : ''}
              </p>
            )}

            {/* Charges on this voucher (No Print): admission fee, exam fee... */}
            {!feeData.receiptNo && has('charges') && (
              <div className="no-print" style={{marginTop: '1.5rem'}}>
                {editingCharges ? (
                  <div style={{border: '1px solid #ccc', borderRadius: '8px', padding: '1rem'}}>
                    <p style={{fontWeight: 700, marginBottom: '0.75rem'}}>Charges on this voucher (on top of the monthly fee)</p>
                    <VoucherCharges voucher={feeData} onSaved={openVoucher} onCancel={() => setEditingCharges(false)} />
                  </div>
                ) : (
                  <button className="btn btn-secondary" onClick={() => setEditingCharges(true)}>
                    {(feeData.charges ?? []).length > 0 ? 'Edit charges' : '+ Add admission / exam / other charge'}
                  </button>
                )}
              </div>
            )}

            {(feeData.balanceDue ?? 0) <= 0 && !takingAdvance && feeData.studentId != null && has('advance') && (
              <div className="no-print" style={{marginTop: '1rem'}}>
                <button className="btn btn-secondary" onClick={() => { setTakingAdvance(true); setAdvance(true); setPaidTuition(''); setPaidAC('0'); }}>
                  Receive advance fee for coming months
                </button>
              </div>
            )}

            {/* Payment Controls (No Print) */}
            {((feeData.balanceDue ?? 0) > 0 || takingAdvance) && (
               <div className="no-print" style={{marginTop: '2rem', borderTop: '1px solid #ccc', paddingTop: '1rem'}}>
                  {(feeData.arrears ?? []).length > 0 && (
                    <p style={{fontSize: '0.9rem', marginBottom: '0.75rem'}}>
                      Earlier months still owing (cleared first):{' '}
                      {(feeData.arrears ?? []).map((line) => `${periodLabel(line)} ${rs(line.amount)}${line.fine ? ` incl. ${rs(line.fine)} fine` : ''}`).join(' · ')}
                    </p>
                  )}
                  {pendingFine(feeData) > 0 && (
                    <label style={{display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: 'var(--danger)', fontWeight: 600}}>
                      <input type="checkbox" checked={waiveFine} onChange={(e) => toggleWaiveFine(e.target.checked)} />
                      Waive late fine of {rs(pendingFine(feeData))} (recorded in the Activity Log)
                    </label>
                  )}
                  {(() => {
                    const extra = (parseFloat(paidTuition) || 0) - Math.max(0, tuitionDue(feeData) - (waiveFine ? pendingFine(feeData) : 0));
                    if (extra <= 0 || !has('advance')) return null;
                    return (
                      <label style={{display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', fontWeight: 600}}>
                        <input type="checkbox" checked={advance} onChange={(e) => setAdvance(e.target.checked)} />
                        Advance fee: keep the extra {rs(extra)} for the coming months (their vouchers are made now and marked paid)
                      </label>
                    );
                  })()}
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem'}}>
                     <div>
                        <label className="form-label">Receive Tuition &amp; Charges</label>
                        <input type="number" className="form-input" value={paidTuition} onChange={e => setPaidTuition(e.target.value)} />
                     </div>
                     <div>
                        <label className="form-label">Receive AC/Misc</label>
                        <input type="number" className="form-input" value={paidAC} onChange={e => setPaidAC(e.target.value)} />
                     </div>
                  </div>
                  <button className="btn btn-primary" onClick={handlePay} disabled={processing} style={{width: '100%'}}>
                    {processing ? 'Processing...' : 'Confirm & Save Payment'}
                  </button>
               </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
