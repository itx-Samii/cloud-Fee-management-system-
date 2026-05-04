"use client";
import React, { useState, useEffect } from 'react';

export default function ClassWiseTracking() {
  const [month, setMonth] = useState('April');
  const [year, setYear] = useState('2026');
  const [classId, setClassId] = useState('1');
  const [classes, setClasses] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [trackingData, setTrackingData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Print & Logo States
  const [schoolName, setSchoolName] = useState('YOUR SCHOOL NAME');
  const [logo, setLogo] = useState('');
  const [printTargetId, setPrintTargetId] = useState<number | null>(null);

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
      
      const fees = await feesRes.json();
      const studentData = await studentsRes.json();
      const studentsOfClass = studentData.data || [];
      
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
          remainingAnnualCharges: feeRecord ? feeRecord.remainingAnnualCharges : (student.annualCharges - (student.paidAnnualCharges || 0))
        };
      });

      setTrackingData(merged);
      return merged;
    } catch {
      alert("Failed to load tracking data");
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
    setLogo(localStorage.getItem('fms-school-logo') || '');
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
          body: JSON.stringify({ month, year })
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
                style={{padding: '0.2rem 0.5rem', fontSize: '0.85rem', width: '200px', border: 'none', background: 'transparent', textAlign: 'right', fontWeight: 800}}
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
        </div>
      </div>

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
              <th>Net Due</th>
              <th>Status</th>
              <th className="no-print">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{textAlign: 'center', padding: '2rem'}}>Processing records...</td></tr>
            ) : trackingData.length === 0 ? (
              <tr><td colSpan={5} style={{textAlign: 'center', padding: '2rem', color: 'var(--text-muted)'}}>No students found in this class.</td></tr>
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
                  <td style={{fontWeight: 700}}>Rs. {Number(d.amount) + Number(d.remainingAnnualCharges || 0)}</td>
                  <td>
                    <span className={`badge ${d.status === 'Paid' ? 'badge-success' : d.status === 'Unpaid' ? 'badge-danger' : 'badge-warning'}`}>
                      {d.status === 'Paid' ? 'Submitted' : d.status === 'Unpaid' ? 'Defaulter' : 'Not Generated'}
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
        {trackingData.filter(d => d.voucherId === printTargetId).map(f => (
          <div key={f.id} className="voucher-card">
            {['Bank Copy', 'School Copy', 'Student Copy'].map((copy, i) => (
              <div key={copy} className="voucher-copy" style={{
                borderRight: i < 2 ? '1.5px dashed #999' : 'none',
                color: '#000',
                background: '#fff'
              }}>
                {/* TOP: Header + Student Info */}
                <div>
                  {/* Header */}
                  <div style={{display: 'flex', alignItems: 'center', gap: '3mm', marginBottom: '5mm'}}>
                     {logo && <img src={logo} alt="Logo" style={{width: '44px', height: '44px', objectFit: 'contain'}} />}
                     <div>
                        <h3 style={{fontSize: '11pt', fontWeight: 900, margin: 0, textTransform: 'uppercase', color: '#000'}}>{schoolName}</h3>
                        <p style={{fontSize: '7pt', margin: '1mm 0 2mm 0', fontWeight: 600, color: '#333'}}>Rawalpindi, Pakistan</p>
                        <div style={{display: 'inline-block', padding: '0.5mm 3mm', border: '1px solid #000', fontSize: '8pt', fontWeight: 800, textTransform: 'uppercase'}}>{copy}</div>
                     </div>
                  </div>

                  {/* Student Info */}
                  <div style={{fontSize: '9pt', marginTop: '3mm'}}>
                     {[
                       ['Voucher No:', `#${f.voucherId}`],
                       ['Adm No:', f.admissionNumber || 'N/A'],
                       ['Month:', `${f.month} ${f.year}`],
                       ['Student Name:', f.studentName],
                       ['Father Name:', f.fatherName],
                       ['Class / Section:', f.className]
                     ].map(([label, value]) => (
                       <div key={label} style={{display: 'flex', justifyContent: 'space-between', marginBottom: '2.5mm', borderBottom: '0.5px solid #ddd', paddingBottom: '1mm'}}>
                          <strong>{label}</strong>
                          <span style={{fontWeight: 500}}>{value}</span>
                       </div>
                     ))}
                  </div>
                </div>

                {/* BOTTOM: Fees + Signatures */}
                <div>
                   <div style={{fontSize: '9pt', display: 'flex', justifyContent: 'space-between', marginBottom: '2mm'}}>
                      <span>Tuition Fee</span>
                      <span>Rs. {f.baseAmount}</span>
                   </div>
                   {f.discount > 0 && (
                      <div style={{fontSize: '9pt', display: 'flex', justifyContent: 'space-between', color: '#e11d48', marginBottom: '2mm'}}>
                         <strong>Discount</strong>
                         <strong>- Rs. {f.discount}</strong>
                      </div>
                   )}
                   {f.remainingAnnualCharges > 0 && (
                      <div style={{fontSize: '9pt', display: 'flex', justifyContent: 'space-between', background: '#fff7ed', padding: '1mm 2mm', marginBottom: '2mm'}}>
                         <strong>O/S Annual</strong>
                         <strong>Rs. {f.remainingAnnualCharges}</strong>
                      </div>
                   )}
                   <div style={{background: '#000', color: '#fff', padding: '2.5mm 3mm', display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '12pt', marginTop: '2mm'}}>
                      <span>TOTAL</span>
                      <span>Rs. {Number(f.amount) + Number(f.remainingAnnualCharges || 0)}</span>
                   </div>
                   <div style={{marginTop: '8mm', display: 'flex', justifyContent: 'space-between', fontSize: '8pt', fontWeight: 700}}>
                      <div style={{width: '40%', borderTop: '1px solid #555', textAlign: 'center', paddingTop: '1.5mm'}}>Cashier</div>
                      <div style={{width: '40%', borderTop: '1px solid #555', textAlign: 'center', paddingTop: '1.5mm'}}>Officer</div>
                   </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

    </div>
  );
}
