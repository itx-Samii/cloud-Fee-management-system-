"use client";
import React, { useState, useEffect, useCallback } from 'react';
import '../generate/generate.css';
import { clearStoredSetting, useStoredSetting } from '@/lib/useStoredSetting';
import { useFeeSettings } from '@/lib/useFeeSettings';
import { isLeft, monthlyBill, yearOptions } from '@/lib/fees';
import ChallanBill from '../components/ChallanBill';
import FeeSettingsFields from '../components/FeeSettingsFields';
import type { Charge, FeeVoucher, RecordId, SchoolClass, Student } from '@/lib/types';

/** A student of the selected class merged with their voucher for the chosen month (if any). */
type TrackingRow = Student & {
  studentName: string;
  amount: number;
  baseAmount?: number;
  charges?: Charge[];
  status: string;
  paymentDate?: string | null;
  voucherId: RecordId | null;
  month: string;
  year: string;
  previousArrears: number;
  paidTuition: number;
  remainingAnnualCharges?: number;
  className?: string;
  lateFine?: number;
  fineWaived?: boolean;
  balanceDue?: number;
  dueDate?: string;
  /** The student has left (status here is the voucher's, so it can't say). */
  left: boolean;
};

async function fetchTrackingRows(month: string, year: string, classId: string): Promise<TrackingRow[]> {
  const [feesRes, studentsRes] = await Promise.all([
    fetch(`/api/fees?month=${month}&year=${year}`, { cache: 'no-store' }),
    fetch(`/api/students?classId=${classId}&limit=1000`, { cache: 'no-store' })
  ]);

  const feesData = await feesRes.json();
  const fees: FeeVoucher[] = Array.isArray(feesData) ? feesData : [];

  const studentData = await studentsRes.json();
  const studentsOfClass: Student[] = studentData.students || [];

  // Students who have left only show up for months they were billed.
  const billed = (student: Student) => fees.find((f) => f.studentId?.toString() === student.id?.toString());
  return studentsOfClass.filter((student) => !isLeft(student) || billed(student)).map((student) => {
    const feeRecord = billed(student);
    return {
      ...student,
      studentName: student.name,
      fatherName: student.fatherName,
      amount: feeRecord ? feeRecord.amount : monthlyBill(student),
      baseAmount: feeRecord ? feeRecord.baseAmount : student.monthlyFee,
      charges: feeRecord ? feeRecord.charges : student.monthlyCharges,
      discount: feeRecord ? feeRecord.discount : student.discount,
      status: feeRecord ? feeRecord.status : 'Not Generated',
      paymentDate: feeRecord ? feeRecord.paymentDate : null,
      voucherId: feeRecord ? feeRecord.id : null,
      month: feeRecord ? feeRecord.month : month,
      year: feeRecord ? feeRecord.year : year,
      previousArrears: feeRecord ? (feeRecord.previousArrears || 0) : 0,
      paidTuition: feeRecord ? (feeRecord.paidTuition || 0) : 0,
      remainingAnnualCharges: feeRecord
        ? feeRecord.remainingAnnualCharges
        : (student.annualCharges || 0) - (student.paidAnnualCharges || 0),
      lateFine: feeRecord?.lateFine,
      fineWaived: feeRecord?.fineWaived,
      balanceDue: feeRecord?.balanceDue,
      dueDate: feeRecord?.dueDate,
      left: isLeft(student),
    };
  });
}

async function fetchClassList(): Promise<SchoolClass[]> {
  const res = await fetch('/api/classes');
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export default function ClassWiseTracking() {
  const currentMonth = new Date().toLocaleString('default', { month: 'long' });
  const currentYear = new Date().getFullYear().toString();
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);
  const [classId, setClassId] = useState('1');
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [trackingData, setTrackingData] = useState<TrackingRow[]>([]);
  // Starts true because a class is preselected; selecting a class or period sets it again.
  const [loading, setLoading] = useState(true);

  // Print & Logo States (branding is saved in this browser)
  const [schoolName, setSchoolName] = useStoredSetting('fms-school-name', 'YOUR SCHOOL NAME');
  const [schoolAddress, setSchoolAddress] = useStoredSetting('fms-school-address', 'Rawalpindi, Pakistan');
  const [logo, setLogo] = useStoredSetting('fms-school-logo', '');
  const [printTargetId, setPrintTargetId] = useState<RecordId | null>(null);
  const [printTargetRecord, setPrintTargetRecord] = useState<TrackingRow | null>(null);

  // Professional Branding States
  const [bankName, setBankName] = useStoredSetting('fms-bank-name', 'Meezan Bank Limited');
  const [bankBranch, setBankBranch] = useStoredSetting('fms-bank-branch', 'Bank Road Sadar, Rawalpindi');
  const [bankAccountTitle, setBankAccountTitle] = useStoredSetting('fms-bank-title', 'YOUR SCHOOL SYSTEM');
  const [bankAccountNo, setBankAccountNo] = useStoredSetting('fms-bank-no', '0000-000000-0000');
  const [instituteId, setInstituteId] = useStoredSetting('fms-inst-id', '2109');
  const [paymentMethods, setPaymentMethods] = useStoredSetting('fms-pay-methods', '1. CASH DEPOSIT AT ALL BRANCHES OF MENTIONED BANK.\n2. ONLINE VIA MOBILE BANKING OR ATM.');
  const [challanNote, setChallanNote] = useStoredSetting('fms-note', 'Fine is imposed to maintain discipline. Amount of fine is donated as charity.');
  // Due days and late fine are school-wide (the server charges the fine), not per browser.
  const { settings: feeSettings, save: saveFeeSettings, canEdit: canEditFees } = useFeeSettings();
  const [showConfig, setShowConfig] = useState(false);

  // Edit Modal States
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<TrackingRow | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fetchTracking = useCallback(
    () =>
      fetchTrackingRows(month, year, classId)
        .then((rows) => {
          setTrackingData(rows);
          return rows;
        })
        .catch((err): TrackingRow[] => {
          console.error("Tracking Fetch Error:", err);
          alert(`Failed to load tracking data: ${(err instanceof Error && err.message) || 'Unknown error'}`);
          return [];
        })
        .finally(() => setLoading(false)),
    [month, year, classId]
  );

  useEffect(() => {
    // Inject dynamic @page style for A4 landscape
    const styleEl = document.createElement('style');
    styleEl.id = 'print-page-style-tracking';
    styleEl.innerHTML = `@media print { @page { size: A4 landscape !important; margin: 5mm !important; } }`;
    document.head.appendChild(styleEl);

    fetchClassList()
      .then((data) => {
        setClasses(data);
        // Keep the chosen class if it exists here, otherwise start with the first one.
        setClassId((current) => (data.length === 0 || data.some((c) => c.id.toString() === current) ? current : data[0].id.toString()));
      })
      .catch(() => console.error("Failed to fetch classes"));

    return () => {
      const el = document.getElementById('print-page-style-tracking');
      if (el) el.remove();
    };
  }, []);

  useEffect(() => {
    if (classId) {
      fetchTracking();
    }
  }, [classId, fetchTracking]);

  const selectedClassObj = classes.find(c => c.id.toString() === classId);

  const handlePrintAction = async (student: TrackingRow) => {
    setLoading(true);
    try {
      // Always re-fetch to ensure we have the absolute latest data before printing
      const latestData = await fetchTracking();
      let target = latestData.find((d) => d.id?.toString() === student.id?.toString());

      // If voucher not generated, generate it now
      if (!target?.voucherId) {
        const res = await fetch('/api/fees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ month, year, studentIds: [student.id] })
        });
        if (!res.ok) {
          alert('Failed to generate voucher. Please try again.');
          return;
        }
        // Re-fetch to get the new voucher ID
        const refreshedData = await fetchTracking();
        target = refreshedData.find((d) => d.id?.toString() === student.id?.toString());
      }

      if (!target?.voucherId) {
        alert('Could not resolve voucher. Please refresh and try again.');
        return;
      }

      // Enrich with className from classes list (avoid stale class names)
      const classObj = classes.find((c) => c.id?.toString() === target.classId?.toString());
      const resolvedTarget = {
        ...target,
        className: classObj ? `${classObj.name}${classObj.section ? ' - ' + classObj.section : ''}` : target.className || `Class ${target.classId}`
      };

      // Store the RECORD DIRECTLY — no filtering needed, avoids stale-state race condition
      setPrintTargetRecord(resolvedTarget);
      setPrintTargetId(resolvedTarget.voucherId);

      // Give React 400ms to render the print section, then print
      setTimeout(() => {
        window.print();
        setPrintTargetId(null);
        setPrintTargetRecord(null);
      }, 400);
    } catch (err) {
      console.error('Print challan error:', err);
      alert(`Print failed: ${(err instanceof Error && err.message) || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    setIsSaving(true);
    try {
      // Only what this form edits: the row also carries voucher fields (its status is the voucher's).
      const { id, name, fatherName, monthlyFee, discount } = editingStudent;
      const res = await fetch('/api/students', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, fatherName, monthlyFee, discount, expectedUpdatedAt: editingStudent.updatedAt ?? null })
      });
      if (res.ok) {
        setShowEditModal(false);
        fetchTracking();
      } else {
        alert((await res.json().catch(() => null))?.error || "Failed to save changes");
      }
    } catch {
      alert("Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  };

  const paidCount = trackingData.filter(d => d.status === 'Paid').length;
  const unpaidCount = trackingData.filter(d => d.status === 'Unpaid' || d.status === 'Not Generated').length;

  const needle = search.trim().toLowerCase();
  const shownRows = trackingData
    .filter(d => statusFilter === 'all' || d.status === statusFilter || (statusFilter === 'Unpaid' && d.status === 'Not Generated'))
    .filter(d => !needle || [d.studentName, d.fatherName, d.admissionNumber, d.parentPhone, d.voucherId, d.rollNumber].some(v => String(v ?? '').toLowerCase().includes(needle)));

  return (
    <div>
      {/* Print-Only Report Header (Only for List Printing) */}
      {!printTargetId && (
        <div className="print-only" style={{marginBottom: '2rem', borderBottom: '2px solid #000', paddingBottom: '1rem'}}>
          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem'}}>
            {/* eslint-disable-next-line @next/next/no-img-element -- logo is a data URL saved in this browser; next/image can't optimise it */}
            {logo && <img src={logo} alt="Logo" style={{height: '60px', width: '60px', objectFit: 'contain', marginRight: '15px'}} />}
            <div style={{textAlign: 'center'}}>
              <h1 style={{margin: 0, fontSize: '1.8rem', color: '#000'}}>{schoolName}</h1>
              <h2 style={{margin: 0, fontSize: '1.2rem', color: '#000', textTransform: 'uppercase', letterSpacing: '2px'}}>Student Fee Status Report</h2>
            </div>
          </div>
          <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 600, color: '#000'}}>
            <span>Class: {selectedClassObj?.name || 'N/A'} {selectedClassObj?.section ? `(${selectedClassObj.section})` : ''}</span>
            <span>Session: {month} {year}</span>
            <span>Date: {new Date().toLocaleDateString()}</span>
          </div>
        </div>
      )}

      <div className="no-print" style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem'}}>
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
                onChange={e => setSchoolName(e.target.value)} 
                className="form-input" 
                style={{padding: '0.2rem 0.5rem', fontSize: '0.85rem', width: '200px', border: 'none', background: 'transparent', textAlign: 'right', fontWeight: 800, display: 'block'}}
                placeholder="School Name"
              />
              <input 
                type="text" 
                value={schoolAddress} 
                onChange={e => setSchoolAddress(e.target.value)} 
                className="form-input" 
                style={{padding: '0.2rem 0.5rem', fontSize: '0.7rem', width: '200px', border: 'none', background: 'transparent', textAlign: 'right', fontWeight: 600, display: 'block'}}
                placeholder="Location & Contact"
              />
           </div>
           <div style={{width: '2px', height: '30px', background: 'var(--border)'}}></div>
           <div style={{position: 'relative'}}>
              {logo ? (
                <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- logo is a data URL saved in this browser; next/image can't optimise it */}
                  <img src={logo} alt="Logo" style={{height: '35px', width: '35px', objectFit: 'contain', borderRadius: '4px'}} />
                  <button onClick={() => clearStoredSetting('fms-school-logo')} style={{background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '1.2rem'}} title="Remove Logo">×</button>
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
                            if (!setLogo(ev.target?.result as string)) {
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
        <div className="glass-panel no-print" style={{padding: '2rem', marginBottom: '2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '2rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', backdropFilter: 'blur(10px)'}}>
           <div>
              <label className="form-label" style={{fontSize: '0.8rem', color: 'var(--primary)', marginBottom: '0.8rem'}}>BANK NAME</label>
              <input className="form-input" value={bankName} onChange={e => setBankName(e.target.value)} style={{background: 'var(--bg-card)', border: '1px solid var(--border)', height: '50px', fontSize: '1rem'}} />
           </div>
           <div>
              <label className="form-label" style={{fontSize: '0.8rem', color: 'var(--primary)', marginBottom: '0.8rem'}}>BANK BRANCH / ADDRESS</label>
              <input className="form-input" value={bankBranch} onChange={e => setBankBranch(e.target.value)} style={{background: 'var(--bg-card)', border: '1px solid var(--border)', height: '50px', fontSize: '1rem'}} />
           </div>
           <div>
              <label className="form-label" style={{fontSize: '0.8rem', color: 'var(--primary)', marginBottom: '0.8rem'}}>ACCOUNT TITLE</label>
              <input className="form-input" value={bankAccountTitle} onChange={e => setBankAccountTitle(e.target.value)} style={{background: 'var(--bg-card)', border: '1px solid var(--border)', height: '50px', fontSize: '1rem'}} />
           </div>
           <div>
              <label className="form-label" style={{fontSize: '0.8rem', color: 'var(--primary)', marginBottom: '0.8rem'}}>ACCOUNT NUMBER</label>
              <input className="form-input" value={bankAccountNo} onChange={e => setBankAccountNo(e.target.value)} style={{background: 'var(--bg-card)', border: '1px solid var(--border)', height: '50px', fontSize: '1rem'}} />
           </div>
           <div style={{display: 'flex', gap: '1.5rem'}}>
              <div style={{flex: 1.5}}>
                <label className="form-label" style={{fontSize: '0.8rem', color: 'var(--primary)', marginBottom: '0.8rem'}}>INSTITUTE ID</label>
                <input className="form-input" value={instituteId} onChange={e => setInstituteId(e.target.value)} style={{background: 'var(--bg-card)', border: '1px solid var(--border)', height: '50px', fontSize: '1rem'}} />
              </div>
              <FeeSettingsFields settings={feeSettings} canEdit={canEditFees} onSave={saveFeeSettings} inputStyle={{background: 'var(--bg-card)', border: '1px solid var(--border)', height: '50px', fontSize: '1rem'}} />
           </div>
           <div style={{gridColumn: '1 / -1'}}>
              <label className="form-label" style={{fontSize: '0.7rem', color: 'var(--primary)'}}>PAYMENT METHODS (ONE PER LINE)</label>
              <textarea className="form-input" rows={3} value={paymentMethods} onChange={e => setPaymentMethods(e.target.value)} style={{background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: '0.8rem'}} />
           </div>
           <div style={{gridColumn: '1 / -1'}}>
              <label className="form-label" style={{fontSize: '0.7rem', color: 'var(--primary)'}}>CHALLAN FOOTER NOTE</label>
              <input className="form-input" value={challanNote} onChange={e => setChallanNote(e.target.value)} style={{background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: '0.85rem'}} />
           </div>
        </div>
      )}

      <div className="glass-panel no-print" style={{padding: '1.5rem', marginBottom: '2rem', display: 'flex', flexWrap: 'wrap', gap: '1rem'}}>
        <div style={{flex: '2 1 240px'}}>
          <label className="form-label">Search</label>
          <input
            type="search"
            className="form-input"
            placeholder="Name, father name, adm no, phone or voucher no..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div style={{flex: '1 1 150px'}}>
          <label className="form-label">Select Class</label>
          <select className="form-input" value={classId} onChange={e => { if (e.target.value === classId) return; setClassId(e.target.value); setLoading(Boolean(e.target.value)); }}>
            <option value="">-- Choose Class --</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} {c.section ? ` - ${c.section}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div style={{flex: '1 1 150px'}}>
          <label className="form-label">Month</label>
          <select className="form-input" value={month} onChange={e => { if (e.target.value === month) return; setMonth(e.target.value); setLoading(Boolean(classId)); }}>
            {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div style={{flex: '1 1 150px'}}>
          <label className="form-label">Year</label>
          <select className="form-input" value={year} onChange={e => { if (e.target.value === year) return; setYear(e.target.value); setLoading(Boolean(classId)); }}>
            {yearOptions().map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{flex: '1 1 150px'}}>
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
              <th style={{width: '80px'}}>Roll No</th>
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
            ) : shownRows.length === 0 ? (
              <tr><td colSpan={8} style={{textAlign: 'center', padding: '2rem', color: 'var(--text-muted)'}}>No students in this class match the search or filter.</td></tr>
            ) : (
              shownRows.map((d) => (
                <tr key={d.id} style={{background: (d.status === 'Unpaid' || d.status === 'Not Generated') ? 'rgba(239, 68, 68, 0.05)' : 'transparent'}}>
                  <td style={{color: 'var(--text-muted)'}}>{d.rollNumber ?? '-'}</td>
                  <td style={{fontWeight: 700}}>{d.admissionNumber || 'N/A'}</td>
                  <td>
                    <div style={{fontWeight: 600}}>
                      {d.studentName}
                      {d.left && <span className="badge badge-neutral" style={{marginLeft: '0.5rem'}}>Left</span>}
                    </div>
                    <div style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>S/O: {d.fatherName || 'N/A'}</div>
                  </td>
                  <td>Rs. {d.amount}</td>
                  <td style={{color: '#64748b'}}>Rs. {Number(d.previousArrears || 0) + Number(d.remainingAnnualCharges || 0)}</td>
                  <td style={{fontWeight: 700, color: '#e11d48'}}>Rs. {d.balanceDue ?? Number(d.amount) + Number(d.remainingAnnualCharges || 0)}</td>
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
                              else alert((await res.json().catch(() => null))?.error || "Failed to reverse.");
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
        <div className="workspace-modal no-print" style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'}}>
          <div className="glass-panel" style={{width: '100%', maxWidth: '450px', padding: '2rem'}}>
            <h2 style={{marginBottom: '1.5rem'}}>Modify Student & Fee</h2>
            <form onSubmit={handleSaveEdit}>
              <div className="form-group">
                <label className="form-label">Student Name</label>
                <input required className="form-input" value={editingStudent.name ?? ''} onChange={e => setEditingStudent({...editingStudent, name: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Father Name</label>
                <input required className="form-input" value={editingStudent.fatherName ?? ''} onChange={e => setEditingStudent({...editingStudent, fatherName: e.target.value})} />
              </div>
              <div style={{display: 'flex', gap: '1rem'}}>
                <div className="form-group" style={{flex: 1}}>
                  <label className="form-label">Base Fee (Rs.)</label>
                  <input required type="number" className="form-input" value={Number.isFinite(editingStudent.monthlyFee) ? editingStudent.monthlyFee : ''} onChange={e => setEditingStudent({...editingStudent, monthlyFee: parseFloat(e.target.value) || 0})} />
                </div>
                <div className="form-group" style={{flex: 1}}>
                  <label className="form-label">Discount (Rs.)</label>
                  <input required type="number" className="form-input" value={Number.isFinite(editingStudent.discount) ? editingStudent.discount : ''} onChange={e => setEditingStudent({...editingStudent, discount: parseFloat(e.target.value) || 0})} />
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
        {printTargetRecord && (() => {
          const f = printTargetRecord;
          return (
            <div className="voucher-card">
              {['Bank Copy', 'Student Copy', 'Information'].map((section, sectionIdx) => (
                <div key={section} className="voucher-copy" style={{
                  borderRight: sectionIdx < 2 ? '1px solid #000' : 'none',
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- logo is a data URL saved in this browser; next/image can't optimise it */}
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

                         <ChallanBill voucher={f} settings={feeSettings} />

                         <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto'}}>
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
                            {/* eslint-disable-next-line @next/next/no-img-element -- logo is a data URL saved in this browser; next/image can't optimise it */}
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
        })()}
      </div>

    </div>
  );
}
