"use client";
import React, { useState, useEffect, useCallback } from 'react';
import ChallanBranding from './ChallanBranding';
import { useChallanBranding } from './useChallanBranding';
import { useFeeSettings } from '@/lib/useFeeSettings';
import { useFeatures } from '@/lib/useFeatures';
import ChallanDocument from '../components/ChallanDocument';
import FeeSettingsFields from '../components/FeeSettingsFields';
import { COMMON_CHARGES, VoucherCharges } from '../components/ChargesEditor';
import type { FeeVoucher, RecordId, SchoolClass } from '@/lib/types';
import { yearOptions } from '@/lib/fees';

async function fetchFeesFor(month: string, year: string): Promise<FeeVoucher[]> {
  const res = await fetch(`/api/fees?month=${month}&year=${year}`, { cache: 'no-store' });
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function fetchClassList(): Promise<SchoolClass[]> {
  const res = await fetch('/api/classes');
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export default function GenerateFees() {
  const [fees, setFees] = useState<FeeVoucher[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [printTargetId, setPrintTargetId] = useState<RecordId | null>(null);
  const branding = useChallanBranding();
  // Due days and late fine are school-wide (the server charges the fine), not per browser.
  const { settings: feeSettings, save: saveFeeSettings, canEdit: canEditFees } = useFeeSettings();
  const [showConfig, setShowConfig] = useState(false);
  const { has } = useFeatures();

  const handlePrintIndividual = (id: RecordId) => {
    setPrintTargetId(id);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const currentMonth = new Date().toLocaleString('default', { month: 'long' });
  const currentYear = new Date().getFullYear().toString();

  const fetchMonthFees = useCallback(
    (m: string = currentMonth, y: string = currentYear) =>
      fetchFeesFor(m, y).then(setFees).catch((err) => console.error("Failed to fetch vouchers", err)),
    [currentMonth, currentYear]
  );

  const [classes, setClasses] = useState<SchoolClass[]>([]);

  const [genMonth, setGenMonth] = useState(currentMonth);
  const [genYear, setGenYear] = useState(currentYear);
  const [isGenerating, setIsGenerating] = useState(false);

  // Charges on top of the fee: one voucher's (modal), or one charge for every voucher shown.
  const [chargesFor, setChargesFor] = useState<FeeVoucher | null>(null);
  const [showBulkCharge, setShowBulkCharge] = useState(false);
  const [bulkLabel, setBulkLabel] = useState('');
  const [bulkAmount, setBulkAmount] = useState('');
  const [addingCharge, setAddingCharge] = useState(false);

  useEffect(() => {
    fetchMonthFees();
    fetchClassList().then(setClasses).catch(() => console.error("Failed to fetch classes"));
  }, [fetchMonthFees]);

  const [selectedClass, setSelectedClass] = useState('all');

  const filteredFees = (fees || []).filter(f => {
    const matchesSearch = (f.studentName || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
                         (f.fatherName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (f.id || "").toString() === searchQuery;
    
    // Flexible class match (trimming both sides)
    const matchesClass = selectedClass === 'all' || 
                         (f.className || "").toString().trim() === selectedClass.trim();
    return matchesSearch && matchesClass;
  });

  const handlePrintBulk = async () => {
    if (filteredFees.length === 0) {
      const confirmGen = confirm("No vouchers found for this month/class. Do you want to generate them now?");
      if (!confirmGen) return;
      
      setIsGenerating(true);
      try {
        const res = await fetch('/api/fees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ month: genMonth, year: genYear, classId: classes.find(c => c.name === selectedClass)?.id || 'all' })
        });
        if (res.ok) {
          await fetchMonthFees(genMonth, genYear);
          // Small delay to allow state to update before printing
          setTimeout(() => {
            setPrintTargetId(-1);
            setTimeout(() => window.print(), 300);
          }, 500);
        }
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    setPrintTargetId(-1);
    setTimeout(() => {
      window.print();
    }, 200);
  };

  const handleBulkCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = bulkLabel.trim();
    const amount = parseFloat(bulkAmount) || 0;
    if (!confirm(`Add ${label} of Rs. ${amount} to all ${filteredFees.length} voucher(s) shown? Vouchers that already have a "${label}" charge are left as they are.`)) return;
    setAddingCharge(true);
    try {
      const res = await fetch('/api/fees', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: filteredFees.map((f) => f.id), charge: { label, amount } })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert(data?.error || 'Failed to add the charge.');
        return;
      }
      alert(`${label} added to ${data.added} voucher(s).${data.skipped ? ` ${data.skipped} skipped (already had it, or too old to change).` : ''}`);
      setShowBulkCharge(false);
      setBulkLabel('');
      setBulkAmount('');
      fetchMonthFees(genMonth, genYear);
    } finally {
      setAddingCharge(false);
    }
  };


  return (
    <div className="generate-vouchers" style={{animation: 'fadeIn 0.5s ease-out'}}>
      <div className="no-print" style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem', gap: '1.5rem', background: 'var(--bg-card)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)'}}>
        <div style={{flex: 1, display: 'flex', gap: '1rem'}}>
          <div>
            <label className="form-label">Billing Month</label>
            <select className="form-input" value={genMonth} onChange={e => {setGenMonth(e.target.value); fetchMonthFees(e.target.value, genYear);}}>
              {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Year</label>
            <select className="form-input" value={genYear} onChange={e => {setGenYear(e.target.value); fetchMonthFees(genMonth, e.target.value);}}>
              {yearOptions().map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div style={{flex: 1}}>
            <label className="form-label">Filter Class</label>
            <select className="form-input" value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
              <option value="all">All Classes</option>
              {classes.map(c => {
                const displayName = `${c.name}${c.section ? ` - ${c.section}` : ''}`;
                return <option key={c.id} value={displayName}>{displayName}</option>;
              })}
            </select>
          </div>
        </div>
        
        <div style={{display: 'flex', gap: '1rem', alignItems: 'center'}}>
          <button 
            className="btn btn-primary" 
            style={{height: '42px', padding: '0 1.5rem', fontWeight: 800, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem'}}
            onClick={handlePrintBulk}
            disabled={isGenerating || !branding.ready}
          >
            <span>🖨️</span> {isGenerating ? 'Processing...' : `Print Class Challans (${filteredFees.length})`}
          </button>
          <input 
            type="text" 
            placeholder="Search student..." 
            className="form-input" 
            style={{maxWidth: '250px', height: '42px'}}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="no-print" style={{display: 'flex', justifyContent: 'flex-end', gap: '.65rem', flexWrap: 'wrap', marginBottom: '1rem'}}>
        {filteredFees.length > 0 && has('charges') && (
          <button type="button" className="btn btn-secondary" onClick={() => setShowBulkCharge(!showBulkCharge)}>+ Charge for all shown</button>
        )}
        <button type="button" className="btn btn-secondary" aria-expanded={showConfig} onClick={() => setShowConfig(!showConfig)}>Challan Config</button>
      </div>
      {showConfig && (
        <div className="glass-panel no-print challan-config">
          <ChallanBranding {...branding} canEdit={canEditFees} />
          <div className="challan-config-fees">
            <FeeSettingsFields settings={feeSettings} canEdit={canEditFees} onSave={saveFeeSettings} />
          </div>
        </div>
      )}
      {branding.error && !showConfig && <p className="no-print" role="alert">{branding.error} Open Challan Config to retry.</p>}

      {filteredFees.length === 0 ? (
        <div className="glass-panel no-print" style={{padding: '4rem', textAlign: 'center'}}>
          <h3 style={{color: 'var(--text-muted)'}}>{fees.length > 0 ? "No vouchers match your filters." : "No vouchers generated for this billing cycle yet."}</h3>
        </div>
      ) : (
        <>
          {showBulkCharge && has('charges') && (
            <form onSubmit={handleBulkCharge} className="glass-panel no-print" style={{padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap'}}>
              <div style={{flex: '2 1 200px'}}>
                <label className="form-label">Charge (e.g. Examination Fee)</label>
                <input required className="form-input" list="bulk-charge-names" value={bulkLabel} onChange={e => setBulkLabel(e.target.value)} />
                <datalist id="bulk-charge-names">
                  {COMMON_CHARGES.map((name) => <option key={name} value={name} />)}
                </datalist>
              </div>
              <div style={{flex: '1 1 120px'}}>
                <label className="form-label">Amount (Rs.)</label>
                <input required type="number" min="1" className="form-input" value={bulkAmount} onChange={e => setBulkAmount(e.target.value)} />
              </div>
              <button type="submit" className="btn btn-primary" disabled={addingCharge || filteredFees.length === 0} style={{height: '42px'}}>
                {addingCharge ? 'Adding...' : `Add to ${filteredFees.length} voucher(s)`}
              </button>
              <p style={{flexBasis: '100%', margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)'}}>
                Goes on every voucher in the list below ({genMonth} {genYear}{selectedClass !== 'all' ? `, ${selectedClass}` : ', all classes'}{searchQuery ? ', matching the search' : ''}). It is added to what each student owes and shows on the challan.
              </p>
            </form>
          )}

          <div className="glass-panel table-container no-print">
            <table className="table">
              <thead>
                <tr>
                  <th style={{width: '80px'}}>Sr No</th>
                  <th>Adm No</th>
                  <th>Student & Father Name</th>
                  <th>Class</th>
                  <th>Month</th>
                  <th>Monthly Fee</th>
                  <th>Arrears</th>
                  <th>Total Pending</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredFees.map((f, idx) => (
                  <tr key={f.id}>
                    <td style={{color: 'var(--text-muted)'}}>#{idx + 1}</td>
                    <td style={{fontWeight: 700}}>{f.admissionNumber || 'N/A'}</td>
                    <td>
                      <div style={{fontWeight: 'bold'}}>{f.studentName}</div>
                      <div style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>S/O: {f.fatherName}</div>
                    </td>
                    <td style={{fontSize: '0.85rem'}}>{f.className}</td>
                    <td>{f.month} {f.year}</td>
                    <td>
                      Rs. {f.amount}
                      {(f.charges ?? []).length > 0 && (
                        <div style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>incl. {(f.charges ?? []).map((c) => `${c.label} ${c.amount}`).join(', ')}</div>
                      )}
                    </td>
                    <td style={{color: '#64748b'}}>Rs. {f.previousArrears || 0}</td>
                    <td style={{fontWeight: 700, color: '#e11d48'}}>
                      Rs. {f.balanceDue ?? 0}
                    </td>
                    <td><span className={`badge ${f.status === 'Paid' ? 'badge-success' : f.status === 'Partially Paid' ? 'badge-warning' : 'badge-danger'}`} style={{fontSize: '0.75rem'}}>{f.status}</span></td>
                    <td>
                      <div style={{display: 'flex', flexWrap: 'wrap', gap: '0.4rem', minWidth: '150px'}}>
                        <button 
                           className="btn btn-primary" 
                           style={{padding: '0.3rem 0.8rem', fontSize: '0.8rem'}}
                           disabled={!branding.ready} onClick={() => handlePrintIndividual(f.id)}
                        >
                           Print
                        </button>
                        {has('charges') && (
                          <button
                             className="btn btn-secondary"
                             style={{padding: '0.3rem 0.8rem', fontSize: '0.8rem'}}
                             onClick={() => setChargesFor(f)}
                          >
                             Charges
                          </button>
                        )}
                        <button
                           className="btn"
                           style={{padding: '0.3rem 0.8rem', fontSize: '0.8rem', background: '#e11d48', color: 'white', border: 'none'}}
                           onClick={async () => {
                             if(confirm(`Are you sure you want to REVERSE voucher #${f.id} for ${f.studentName}? This will undo any payment.`)) {
                               const res = await fetch(`/api/fees?id=${f.id}`, { method: 'DELETE' });
                               if(res.ok) {
                                 alert('Fee reversed successfully.');
                                 fetchMonthFees(genMonth, genYear);
                               } else {
                                 alert((await res.json().catch(() => null))?.error || 'Failed to reverse fee.');
                               }
                             }
                           }}
                        >
                           Reverse
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {chargesFor && (
            <div className="no-print workspace-modal" style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'}}>
              <div className="glass-panel" style={{width: '100%', maxWidth: '480px', padding: '2rem', maxHeight: '90vh', overflowY: 'auto'}}>
                <h2 style={{marginBottom: '0.25rem'}}>Charges on voucher #{chargesFor.id}</h2>
                <p style={{marginBottom: '1.25rem'}}>{chargesFor.studentName}, {chargesFor.month} {chargesFor.year}. Added on top of the monthly fee (admission fee, exam fee...).</p>
                <VoucherCharges
                  voucher={chargesFor}
                  onCancel={() => setChargesFor(null)}
                  onSaved={() => { setChargesFor(null); fetchMonthFees(genMonth, genYear); }}
                />
              </div>
            </div>
          )}

          <div className="print-container print-only">
            {(printTargetId === -1 ? filteredFees : filteredFees.filter((fee) => printTargetId != null && String(fee.id) === String(printTargetId))).map((fee) => (
              <ChallanDocument key={fee.id} voucher={fee} profile={branding.profile} settings={feeSettings} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
