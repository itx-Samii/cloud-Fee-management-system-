"use client";
import React, { useState, useEffect } from 'react';
import '../generate/generate.css';

function numberToWords(num: number): string {
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

export default function ClassWiseTracking() {
  const currentMonth = new Date().toLocaleString('default', { month: 'long' });
  const currentYear = new Date().getFullYear().toString();
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);
  const [classId, setClassId] = useState('1');
  const [classes, setClasses] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [trackingData, setTrackingData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Print & Logo States
  const [schoolName, setSchoolName] = useState('YOUR SCHOOL NAME');
  const [schoolAddress, setSchoolAddress] = useState('Rawalpindi, Pakistan');
  const [logo, setLogo] = useState('');
  const [printTargetId, setPrintTargetId] = useState<number | null>(null);

  // Professional Branding States
  const [bankName, setBankName] = useState('Meezan Bank Limited');
  const [bankBranch, setBankBranch] = useState('Bank Road Sadar, Rawalpindi');
  const [bankAccountTitle, setBankAccountTitle] = useState('YOUR SCHOOL SYSTEM');
  const [bankAccountNo, setBankAccountNo] = useState('0000-000000-0000');
  const [instituteId, setInstituteId] = useState('2109');
  const [paymentMethods, setPaymentMethods] = useState('1. CASH DEPOSIT AT ALL BRANCHES OF MENTIONED BANK.\n2. ONLINE VIA MOBILE BANKING OR ATM.');
  const [challanNote, setChallanNote] = useState('Fine is imposed to maintain discipline. Amount of fine is donated as charity.');
  const [validUntilDays, setValidUntilDays] = useState(10);
  const [lateFine, setLateFine] = useState(500);
  const [showConfig, setShowConfig] = useState(false);

  // Edit Modal States
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fetchTracking = async () => {
    if (!classId) return;
    setLoading(true);
    try {
      const [feesRes, studentsRes] = await Promise.all([
        fetch(`/api/fees?month=${month}&year=${year}`, { cache: 'no-store' }),
        fetch(`/api/students?classId=${classId}&limit=1000`, { cache: 'no-store' })
      ]);
      
      let fees = await feesRes.json();
      if (!Array.isArray(fees)) fees = [];
      
      const studentData = await studentsRes.json();
      const studentsOfClass = studentData.students || [];
      
      const merged = studentsOfClass.map((student: any) => {
        const feeRecord = fees.find((f: any) => f.studentId === student.id);
        return {
          ...student, // Keep all student fields for editing
          studentName: student.name,
          fatherName: student.fatherName,
          amount: feeRecord ? feeRecord.amount : student.monthlyFee - (student.discount || 0),
          baseAmount: feeRecord ? feeRecord.baseAmount : student.monthlyFee,
          discount: feeRecord ? feeRecord.discount : student.discount,
          status: feeRecord ? feeRecord.status : 'Not Generated',
          paymentDate: feeRecord ? feeRecord.paymentDate : null,
          voucherId: feeRecord ? feeRecord.id : null,
          month: feeRecord ? feeRecord.month : month,
          year: feeRecord ? feeRecord.year : year,
          previousArrears: feeRecord ? (feeRecord.previousArrears || 0) : 0,
          paidTuition: feeRecord ? (feeRecord.paidTuition || 0) : 0,
          remainingAnnualCharges: feeRecord ? feeRecord.remainingAnnualCharges : (student.annualCharges - (student.paidAnnualCharges || 0))
        };
      });

      setTrackingData(merged);
      return merged;
    } catch (err: any) {
      console.error("Tracking Fetch Error:", err);
      alert(`Failed to load tracking data: ${err.message || 'Unknown error'}`);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const fetchClasses = async () => {
    try {
      const res = await fetch('/api/classes');
      const data = await res.json();
      setClasses(data || []);
      if (data && data.length > 0 && !classId) {
        setClassId(data[0].id.toString());
      }
    } catch {
      console.error("Failed to fetch classes");
    }
  };

  useEffect(() => {
    setMounted(true);
    setSchoolName(localStorage.getItem('fms-school-name') || 'YOUR SCHOOL NAME');
    setSchoolAddress(localStorage.getItem('fms-school-address') || 'Rawalpindi, Pakistan');
    setLogo(localStorage.getItem('fms-school-logo') || '');

    setBankName(localStorage.getItem('fms-bank-name') || 'Meezan Bank Limited');
    setBankBranch(localStorage.getItem('fms-bank-branch') || 'Bank Road Sadar, Rawalpindi');
    setBankAccountTitle(localStorage.getItem('fms-bank-title') || 'YOUR SCHOOL SYSTEM');
    setBankAccountNo(localStorage.getItem('fms-bank-no') || '0000-000000-0000');
    setInstituteId(localStorage.getItem('fms-inst-id') || '2109');
    setPaymentMethods(localStorage.getItem('fms-pay-methods') || '1. CASH DEPOSIT AT ALL BRANCHES OF MENTIONED BANK.\n2. ONLINE VIA MOBILE BANKING OR ATM.');
    setChallanNote(localStorage.getItem('fms-note') || 'Fine is imposed to maintain discipline. Amount of fine is donated as charity.');
    setValidUntilDays(parseInt(localStorage.getItem('fms-valid-days') || '10'));
    setLateFine(parseInt(localStorage.getItem('fms-late-fine') || '500'));

    fetchClasses();
  }, []);

  useEffect(() => {
    if (classId) {
      fetchTracking();
    }
  }, [month, year, classId]);

  const handlePrintAction = async (student: any) => {
    // Always re-fetch to ensure we have the absolute latest data (AC Balance, etc.) before printing
    const latestData = await fetchTracking();
    
    // Find the updated student record from the fresh fetching results
    let target = latestData.find((d: any) => d.id === student.id);
    
    // If voucher not generated, generate it now
    if (!target?.voucherId) {
      setLoading(true);
      try {
        const res = await fetch('/api/fees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            month, 
            year,
            studentIds: [student.id]
          })
        });
        if (res.ok) {
          // Re-fetch again to get the new voucher ID after creation
          const refreshedData = await fetchTracking();
          target = refreshedData.find((d: any) => d.id === student.id);
        }
      } catch (err) {
        alert("Failed to auto-generate voucher");
        setLoading(false);
        return;
      }
      setLoading(false);
    }

    if (target?.voucherId) {
      setPrintTargetId(target.voucherId);
      // Wait for React to render the print section with the setPrintTargetId
      setTimeout(() => {
        window.print();
        setPrintTargetId(null);
      }, 300);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch('/api/students', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingStudent)
      });
      if (res.ok) {
        setShowEditModal(false);
        fetchTracking();
      }
    } catch (err) {
      alert("Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  };

  const paidCount = trackingData.filter(d => d.status === 'Paid').length;
  const unpaidCount = trackingData.filter(d => d.status === 'Unpaid' || d.status === 'Not Generated').length;

  return (
    <div>
      {/* Print-Only Report Header (Only for List Printing) */}
      {!printTargetId && (
        <div className="print-only" style={{marginBottom: '2rem', borderBottom: '2px solid #000', paddingBottom: '1rem'}}>
          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem'}}>
            {logo && <img src={logo} alt="Logo" style={{height: '60px', width: '60px', objectFit: 'contain', marginRight: '15px'}} />}
            <div style={{textAlign: 'center'}}>
              <h1 style={{margin: 0, fontSize: '1.8rem', color: '#000'}}>{schoolName}</h1>
              <h2 style={{margin: 0, fontSize: '1.2rem', color: '#000', textTransform: 'uppercase', letterSpacing: '2px'}}>Student Fee Status Report</h2>
            </div>
          </div>
          <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 600, color: '#000'}}>
            <span>Class: {classes.find(c => c.id.toString() === classId)?.name || 'N/A'} {classes.find(c => c.id.toString() === classId)?.section ? `(${classes.find(c => c.id.toString() === classId).section})` : ''}</span>
            <span>Session: {month} {year}</span>
            <span>Date: {new Date().toLocaleDateString()}</span>
          </div>
        </div>
      )}

      <div className="no-print" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem'}}>
        <div>
          <h1 style={{marginBottom: '0.25rem'}}>Class-wise Fee Tracking</h1>
          <p>Monitor defaulters and print customized vouchers for specific classes.</p>
        </div>
        <div style={{display: 'flex', gap: '1rem', background: 'var(--bg-card)', padding: '0.75rem 1.25rem', borderRadius: '12px', border: '1px solid var(--border)', alignItems: 'center'}}>
           <div style={{textAlign: 'right'}}>
              <div style={{fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase'}}>Challan Branding</div>
              <input 
                type="text" 
                value={schoolName} 
                onChange={e => { setSchoolName(e.target.value); localStorage.setItem('fms-school-name', e.target.value); }} 
                className="form-input" 
                style={{padding: '0.2rem 0.5rem', fontSize: '0.85rem', width: '200px', border: 'none', background: 'transparent', textAlign: 'right', fontWeight: 800, display: 'block'}}
                placeholder="School Name"
              />
              <input 
                type="text" 
                value={schoolAddress} 
                onChange={e => { setSchoolAddress(e.target.value); localStorage.setItem('fms-school-address', e.target.value); }} 
                className="form-input" 
                style={{padding: '0.2rem 0.5rem', fontSize: '0.7rem', width: '200px', border: 'none', background: 'transparent', textAlign: 'right', fontWeight: 600, display: 'block'}}
                placeholder="Location & Contact"
              />
           </div>
           <div style={{width: '2px', height: '30px', background: 'var(--border)'}}></div>
           <div style={{position: 'relative'}}>
              {logo ? (
                <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                  <img src={logo} alt="Logo" style={{height: '35px', width: '35px', objectFit: 'contain', borderRadius: '4px'}} />
                  <button onClick={() => { setLogo(''); localStorage.removeItem('fms-school-logo'); }} style={{background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '1.2rem'}} title="Remove Logo">×</button>
                </div>
              ) : (
                <label style={{cursor: 'pointer', color: 'var(--primary)', fontSize: '0.8rem', fontWeight: 600}}>
                   + Upload Logo
                   <input 
                     type="file" 
                     hidden 
                     accept="image/*" 
                     onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (file.size > 2 * 1024 * 1024) {
                            alert('Logo image is too large. Please select an image under 2MB.');
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            const res = ev.target?.result as string;
                            setLogo(res);
                            try {
                              localStorage.setItem('fms-school-logo', res);
                            } catch (storageErr) {
                              alert('Logo is too large to save locally. Please use a smaller image (under 2MB).');
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                     }} 
                   />
                </label>
              )}
           </div>
           <div style={{width: '2px', height: '30px', background: 'var(--border)'}}></div>
           <button className="btn btn-secondary" onClick={() => setShowConfig(!showConfig)} style={{padding: '0.4rem 1rem', fontSize: '0.8rem'}}>
              ⚙️ Config
           </button>
        </div>
      </div>

      {showConfig && (
        <div className="glass-panel no-print" style={{padding: '2rem', marginBottom: '2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', backdropFilter: 'blur(10px)'}}>
           <div>
              <label className="form-label" style={{fontSize: '0.8rem', color: 'var(--primary)', marginBottom: '0.8rem'}}>BANK NAME</label>
              <input className="form-input" value={bankName} onChange={e => {setBankName(e.target.value); localStorage.setItem('fms-bank-name', e.target.value);}} style={{background: 'var(--bg-card)', border: '1px solid var(--border)', height: '50px', fontSize: '1rem'}} />
           </div>
           <div>
              <label className="form-label" style={{fontSize: '0.8rem', color: 'var(--primary)', marginBottom: '0.8rem'}}>BANK BRANCH / ADDRESS</label>
              <input className="form-input" value={bankBranch} onChange={e => {setBankBranch(e.target.value); localStorage.setItem('fms-bank-branch', e.target.value);}} style={{background: 'var(--bg-card)', border: '1px solid var(--border)', height: '50px', fontSize: '1rem'}} />
           </div>
           <div>
              <label className="form-label" style={{fontSize: '0.8rem', color: 'var(--primary)', marginBottom: '0.8rem'}}>ACCOUNT TITLE</label>
              <input className="form-input" value={bankAccountTitle} onChange={e => {setBankAccountTitle(e.target.value); localStorage.setItem('fms-bank-title', e.target.value);}} style={{background: 'var(--bg-card)', border: '1px solid var(--border)', height: '50px', fontSize: '1rem'}} />
           </div>
           <div>
              <label className="form-label" style={{fontSize: '0.8rem', color: 'var(--primary)', marginBottom: '0.8rem'}}>ACCOUNT NUMBER</label>
              <input className="form-input" value={bankAccountNo} onChange={e => {setBankAccountNo(e.target.value); localStorage.setItem('fms-bank-no', e.target.value);}} style={{background: 'var(--bg-card)', border: '1px solid var(--border)', height: '50px', fontSize: '1rem'}} />
           </div>
           <div style={{display: 'flex', gap: '1.5rem'}}>
              <div style={{flex: 1.5}}>
                <label className="form-label" style={{fontSize: '0.8rem', color: 'var(--primary)', marginBottom: '0.8rem'}}>INSTITUTE ID</label>
                <input className="form-input" value={instituteId} onChange={e => {setInstituteId(e.target.value); localStorage.setItem('fms-inst-id', e.target.value);}} style={{background: 'var(--bg-card)', border: '1px solid var(--border)', height: '50px', fontSize: '1rem'}} />
              </div>
              <div style={{flex: 1}}>
                <label className="form-label" style={{fontSize: '0.8rem', color: 'var(--secondary)', marginBottom: '0.8rem'}}>DAYS VALID</label>
                <input type="number" className="form-input" value={validUntilDays} onChange={e => {setValidUntilDays(parseInt(e.target.value)); localStorage.setItem('fms-valid-days', e.target.value);}} style={{background: 'var(--bg-card)', border: '1px solid var(--border)', height: '50px', fontSize: '1rem'}} />
              </div>
              <div style={{flex: 1.2}}>
                <label className="form-label" style={{fontSize: '0.8rem', color: 'var(--danger)', marginBottom: '0.8rem'}}>LATE FINE</label>
                <input type="number" className="form-input" value={lateFine} onChange={e => {setLateFine(parseInt(e.target.value)); localStorage.setItem('fms-late-fine', e.target.value);}} style={{background: 'var(--bg-card)', border: '1px solid var(--border)', height: '50px', fontSize: '1rem'}} />
              </div>
           </div>
           <div style={{gridColumn: '1 / -1'}}>
              <label className="form-label" style={{fontSize: '0.7rem', color: 'var(--primary)'}}>PAYMENT METHODS (ONE PER LINE)</label>
              <textarea className="form-input" rows={3} value={paymentMethods} onChange={e => {setPaymentMethods(e.target.value); localStorage.setItem('fms-pay-methods', e.target.value);}} style={{background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: '0.8rem'}} />
           </div>
           <div style={{gridColumn: '1 / -1'}}>
              <label className="form-label" style={{fontSize: '0.7rem', color: 'var(--primary)'}}>CHALLAN FOOTER NOTE</label>
              <input className="form-input" value={challanNote} onChange={e => {setChallanNote(e.target.value); localStorage.setItem('fms-note', e.target.value);}} style={{background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: '0.85rem'}} />
           </div>
        </div>
      )}

      <div className="glass-panel no-print" style={{padding: '1.5rem', marginBottom: '2rem', display: 'flex', gap: '1rem'}}>
        <div style={{flex: 1}}>
          <label className="form-label">Select Class</label>
          <select className="form-input" value={classId} onChange={e => setClassId(e.target.value)}>
            <option value="">-- Choose Class --</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} {c.section ? ` - ${c.section}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div style={{flex: 1}}>
          <label className="form-label">Month</label>
          <select className="form-input" value={month} onChange={e => setMonth(e.target.value)}>
            {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div style={{flex: 1}}>
          <label className="form-label">Year</label>
          <select className="form-input" value={year} onChange={e => setYear(e.target.value)}>
            {Array.from({length: 5}, (_, i) => (new Date().getFullYear() - 2 + i).toString()).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{flex: 1}}>
          <label className="form-label">Filter View</label>
          <select className="form-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">All Students</option>
            <option value="Paid">Submitted (Paid)</option>
            <option value="Unpaid">Defaulters (Pending)</option>
            <option value="Not Generated">Not Generated</option>
          </select>
        </div>
        <div style={{alignSelf: 'flex-end'}}>
          <button className="btn btn-secondary" onClick={() => window.print()} style={{height: '42px'}}>Print List</button>
        </div>
      </div>

      <div className="no-print" style={{display: 'flex', gap: '2rem', marginBottom: '2rem'}}>
        <div style={{flex: 1, padding: '1.5rem', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--success)', borderRadius: '12px'}}>
           <h3 style={{color: 'var(--success)'}}>Submitted: {paidCount} Students</h3>
        </div>
        <div style={{flex: 1, padding: '1.5rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', borderRadius: '12px'}}>
           <h3 style={{color: 'var(--danger)'}}>Pending/Defaulters: {unpaidCount} Students</h3>
        </div>
      </div>

      <div className={`glass-panel table-container ${printTargetId ? 'no-print' : ''}`}>
        <table className="table">
          <thead>
            <tr>
              <th style={{width: '80px'}}>Sr No</th>
              <th>Adm No</th>
              <th>Student & Father Name</th>
              <th>Monthly Fee</th>
              <th>Arrears</th>
              <th>Total Pending</th>
              <th>Status</th>
              <th className="no-print">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{textAlign: 'center', padding: '2rem'}}>Processing records...</td></tr>
            ) : trackingData.length === 0 ? (
              <tr><td colSpan={8} style={{textAlign: 'center', padding: '2rem', color: 'var(--text-muted)'}}>No students found in this class.</td></tr>
            ) : (
              trackingData
                .filter(d => statusFilter === 'all' || d.status === statusFilter || (statusFilter === 'Unpaid' && d.status === 'Not Generated'))
                .map((d, idx) => (
                <tr key={d.id} style={{background: (d.status === 'Unpaid' || d.status === 'Not Generated') ? 'rgba(239, 68, 68, 0.05)' : 'transparent'}}>
                  <td style={{color: 'var(--text-muted)'}}>#{idx + 1}</td>
                  <td style={{fontWeight: 700}}>{d.admissionNumber || 'N/A'}</td>
                  <td>
                    <div style={{fontWeight: 600}}>{d.studentName}</div>
                    <div style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>S/O: {d.fatherName || 'N/A'}</div>
                  </td>
                  <td>Rs. {d.amount}</td>
                  <td style={{color: '#64748b'}}>Rs. {Number(d.previousArrears || 0) + Number(d.remainingAnnualCharges || 0)}</td>
                  <td style={{fontWeight: 700, color: '#e11d48'}}>Rs. {(Number(d.amount) + Number(d.remainingAnnualCharges || 0) + Number(d.previousArrears || 0)) - Number(d.paidTuition || 0)}</td>
                  <td>
                    <span className={`badge ${d.status === 'Paid' ? 'badge-success' : d.status === 'Partially Paid' ? 'badge-warning' : (d.status === 'Unpaid' || d.status === 'Not Generated') ? 'badge-danger' : 'badge-warning'}`}>
                      {d.status === 'Paid' ? 'Submitted' : d.status === 'Partially Paid' ? 'Partial' : d.status === 'Unpaid' ? 'Defaulter' : 'Not Generated'}
                    </span>
                  </td>
                  <td className="no-print">
                    <div style={{display: 'flex', gap: '0.5rem'}}>
                      <button 
                        className="btn btn-secondary" 
                        style={{padding: '0.35rem 0.6rem', fontSize: '0.75rem'}}
                        onClick={() => { setEditingStudent(d); setShowEditModal(true); }}
                      >
                        Modify
                      </button>
                      <button 
                        className="btn btn-primary" 
                        style={{padding: '0.35rem 0.8rem', fontSize: '0.75rem'}}
                        onClick={() => handlePrintAction(d)}
                        disabled={d.status === 'Paid'}
                      >
                        Print Challan
                      </button>
                      {d.voucherId && (
                        <button 
                          className="btn" 
                          style={{padding: '0.35rem 0.8rem', fontSize: '0.75rem', background: '#e11d48', color: 'white', border: 'none'}}
                          onClick={async () => {
                            if(confirm(`Are you sure you want to REVERSE/DELETE this voucher #${d.voucherId}?`)) {
                              const res = await fetch(`/api/fees?id=${d.voucherId}`, { method: 'DELETE' });
                              if(res.ok) fetchTracking();
                              else alert("Failed to reverse.");
                            }
                          }}
                        >
                          Reverse
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modify Modal */}
      {showEditModal && editingStudent && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'}}>
          <div className="glass-panel" style={{width: '100%', maxWidth: '450px', padding: '2rem'}}>
            <h2 style={{marginBottom: '1.5rem'}}>Modify Student & Fee</h2>
            <form onSubmit={handleSaveEdit}>
              <div className="form-group">
                <label className="form-label">Student Name</label>
                <input required className="form-input" value={editingStudent.name} onChange={e => setEditingStudent({...editingStudent, name: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Father Name</label>
                <input required className="form-input" value={editingStudent.fatherName} onChange={e => setEditingStudent({...editingStudent, fatherName: e.target.value})} />
              </div>
              <div style={{display: 'flex', gap: '1rem'}}>
                <div className="form-group" style={{flex: 1}}>
                  <label className="form-label">Base Fee (Rs.)</label>
                  <input required type="number" className="form-input" value={editingStudent.monthlyFee} onChange={e => setEditingStudent({...editingStudent, monthlyFee: parseFloat(e.target.value)})} />
                </div>
                <div className="form-group" style={{flex: 1}}>
                  <label className="form-label">Discount (Rs.)</label>
                  <input required type="number" className="form-input" value={editingStudent.discount} onChange={e => setEditingStudent({...editingStudent, discount: parseFloat(e.target.value)})} />
                </div>
              </div>
              <div style={{display: 'flex', gap: '1rem', marginTop: '1.5rem'}}>
                <button type="button" className="btn btn-secondary" style={{flex: 1}} onClick={() => setShowEditModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{flex: 1}} disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="print-only">
        {trackingData.filter(d => d.voucherId === printTargetId).map(f => {
          const totalAmount = Number(f.amount) + Number(f.remainingAnnualCharges || 0) + Number(f.previousArrears || 0);
          const qrData = `ID:${f.voucherId}|ADM:${f.admissionNumber}|NAME:${f.studentName}|TOTAL:${totalAmount}`;
          const qrURL = `https://chart.googleapis.com/chart?chs=100x100&cht=qr&chl=${encodeURIComponent(qrData)}`;
          const validDate = new Date();
          validDate.setDate(validDate.getDate() + validUntilDays);

          return (
            <div key={f.id} className="voucher-card">
              {['Bank Copy', 'Student Copy', 'Information'].map((section, sectionIdx) => (
                <div key={section} className="voucher-copy" style={{
                  borderRight: sectionIdx < 2 ? '1px solid #000' : 'none',
                }}>
                  {logo && <img src={logo} alt="Watermark" className="logo-watermark" />}
                  <div className="voucher-content">
                     {sectionIdx < 2 ? (
                       <>
                         <div className="copy-header">{section}</div>
                         <div style={{textAlign: 'center', marginBottom: '2mm'}}>
                            <h4 style={{margin: 0, fontSize: '10pt'}}>{bankName}</h4>
                            <p style={{margin: 0, fontSize: '7pt'}}>{bankBranch}</p>
                            <p style={{margin: '0.5mm 0', fontSize: '7pt', fontWeight: 700}}>( {bankAccountNo} )</p>
                         </div>

                         <div style={{border: '1px solid #000', padding: '1mm', fontSize: '8pt', marginBottom: '2mm', textAlign: 'center'}}>
                            <strong>A/C Title: {bankAccountTitle}</strong>
                         </div>

                         <div className="info-grid">
                            <div className="info-item"><strong>Document No</strong> <span>{f.voucherId}</span></div>
                            <div className="info-item"><strong>Date</strong> <span>{new Date().toLocaleDateString('en-GB')}</span></div>
                            <div className="info-item"><strong>Student Name</strong> <span>{f.studentName}</span></div>
                            <div className="info-item"><strong>Father Name</strong> <span>{f.fatherName}</span></div>
                            <div className="info-item"><strong>Student ID</strong> <span>{f.admissionNumber || 'N/A'}</span></div>
                            <div className="info-item"><strong>Session</strong> <span>{f.month} {f.year}</span></div>
                            <div className="info-item"><strong>Program</strong> <span>{f.className}</span></div>
                            <div className="info-item"><strong>Institute ID</strong> <span>{instituteId}</span></div>
                         </div>

                         <table className="challan-table">
                            <thead>
                               <tr><th>Particulars</th><th style={{width: '30%'}}>Amount</th></tr>
                            </thead>
                            <tbody>
                               <tr><td>Monthly Tuition Fee</td><td style={{textAlign: 'right'}}>{f.baseAmount || f.amount}</td></tr>
                               {f.discount > 0 && <tr><td>Less: Discount</td><td style={{textAlign: 'right', color: 'red'}}>- {f.discount}</td></tr>}
                               {f.previousArrears > 0 && <tr><td>Previous Arrears</td><td style={{textAlign: 'right'}}>{f.previousArrears}</td></tr>}
                               {f.remainingAnnualCharges > 0 && <tr><td>Annual Charges O/S</td><td style={{textAlign: 'right'}}>{f.remainingAnnualCharges}</td></tr>}
                               <tr style={{fontWeight: 900, background: '#f8fafc'}}>
                                  <td><strong>Total (Within Due Date)</strong></td>
                                  <td style={{textAlign: 'right'}}><strong>PKR {totalAmount.toLocaleString()}</strong></td>
                               </tr>
                               <tr style={{fontWeight: 900, background: '#fff1f2', color: '#e11d48'}}>
                                  <td><strong>Total (After Due Date)</strong></td>
                                  <td style={{textAlign: 'right'}}><strong>PKR {(totalAmount + lateFine).toLocaleString()}</strong></td>
                               </tr>
                            </tbody>
                         </table>

                         <div style={{fontSize: '7.5pt', margin: '2mm 0'}}>
                            <strong>Amount in Words (PKR)</strong>
                            <div style={{textTransform: 'uppercase', marginTop: '1mm', borderBottom: '0.5px solid #ccc', paddingBottom: '1mm'}}>{numberToWords(totalAmount)}</div>
                         </div>

                         <div style={{fontSize: '11pt', fontWeight: 900, margin: '3mm 0'}}>
                            Valid Upto: {validDate.toLocaleDateString('en-GB')}
                         </div>

                         <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto'}}>
                            <div style={{textAlign: 'center', fontSize: '7pt', width: '120px', borderTop: '0.5pt solid #000', paddingTop: '1mm'}}>Student Signature</div>
                            <div style={{textAlign: 'center', fontSize: '7pt', width: '120px', borderTop: '0.5pt solid #000', paddingTop: '1mm'}}>Cashier Stamp</div>
                         </div>
                       </>
                     ) : (
                       <>
                         <div className="copy-header">INFORMATION</div>
                         <div style={{fontSize: '8pt', whiteSpace: 'pre-line', lineHeight: '1.4'}}>
                            {paymentMethods}
                         </div>
                         <div style={{marginTop: 'auto', borderTop: '1pt solid #eee', paddingTop: '3mm'}}>
                            <div style={{fontSize: '8pt', fontWeight: 700, marginBottom: '2mm'}}>Important Notes:</div>
                            <p style={{fontSize: '7pt', color: '#444', margin: 0}}>{challanNote}</p>
                         </div>
                         <div style={{textAlign: 'center', marginTop: '5mm'}}>
                            {logo && <img src={logo} alt="Logo" style={{width: '80px', height: '80px', objectFit: 'contain', opacity: 0.8}} />}
                            <div style={{fontSize: '9pt', fontWeight: 800, marginTop: '2mm'}}>{schoolName}</div>
                            <div style={{fontSize: '7pt'}}>{schoolAddress}</div>
                         </div>
                       </>
                     )}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

    </div>
  );
}
