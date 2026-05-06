"use client";
import React, { useState, useEffect, useRef } from 'react';
import './collection.css';

export default function FeeCollection() {
  const [search, setSearch] = useState('');
  const [feeData, setFeeData] = useState<any>(null);
  const [allFees, setAllFees] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [paidTuition, setPaidTuition] = useState<string>('');
  const [paidAC, setPaidAC] = useState<string>('0');
  
  const [mounted, setMounted] = useState(false);
  const [schoolName, setSchoolName] = useState('TRUST SCHOOL SYSTEM');
  const [schoolAddress, setSchoolAddress] = useState('Campus Address / Contact No');
  const [logo, setLogo] = useState('');

  // Pre-fetch all fees for rapid typeahead searching
  useEffect(() => {
    fetch('/api/fees', { cache: 'no-store' }).then(r => r.json()).then(data => {
      setAllFees(data || []);
    }).catch(console.error);

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    
    setMounted(true);
    setSchoolName(localStorage.getItem('fms-school-name') || 'TRUST SCHOOL SYSTEM');
    setSchoolAddress(localStorage.getItem('fms-school-address') || 'Campus Address / Contact No');
    setLogo(localStorage.getItem('fms-school-logo') || '');
    
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSaveName = (e: React.FocusEvent<HTMLHeadingElement>) => {
    const text = e.currentTarget.textContent || 'TRUST SCHOOL SYSTEM';
    setSchoolName(text);
    localStorage.setItem('fms-school-name', text);
  };

  const handleSaveAddress = (e: React.FocusEvent<HTMLParagraphElement>) => {
    const text = e.currentTarget.textContent || 'Campus Address / Contact No';
    setSchoolAddress(text);
    localStorage.setItem('fms-school-address', text);
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setFeeData(null);
    setErrorMsg('');

    if (val.trim().length > 0) {
      const match = allFees.filter(f => 
        (f.studentName?.toLowerCase().includes(val.toLowerCase()) ||
        f.fatherName?.toLowerCase().includes(val.toLowerCase()) ||
        f.id.toString() === val) &&
        f.month !== 'Annual Charges' // Hide Annual Charges from this list
      );
      setSuggestions(match.slice(0, 8)); // top 8 matches
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
    }
  };

  const selectStudent = (studentFee: any) => {
    setSearch(studentFee.id.toString());
    setFeeData(studentFee);
    setPaidTuition(studentFee.amount.toString());
    setPaidAC((studentFee.remainingAnnualCharges || 0).toString());
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
      const found = allFees.find((f: any) => 
        f.id.toString() === search.toString()
      );

      if (found) {
        setFeeData(found);
        setPaidTuition(found.amount.toString());
        setPaidAC((found.remainingAnnualCharges || 0).toString());
      } else {
        setErrorMsg("No active billing voucher found for this ID.");
      }
    } catch {
      setErrorMsg("System offline or error.");
    } finally {
      setLoading(false);
    }
  };

  const handlePay = async () => {
    if (!feeData) return;
    setProcessing(true);
    try {
      const res = await fetch('/api/fees', {
        method: 'PUT',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          id: feeData.id,
          paidTuition: parseFloat(paidTuition),
          paidAC: parseFloat(paidAC)
        })
      });
      const updated = await res.json();
      if (res.ok) {
        // Correctly sync ALL updated data (status, paymentDate, paidTuition, paidAC, totalReceived)
        setFeeData({ 
          ...feeData, 
          ...updated,
          remainingAnnualCharges: (feeData.remainingAnnualCharges || 0) - parseFloat(paidAC)
        });
        
        // Update the global list so search results show the new status
        setAllFees(prev => prev.map(f => f.id === updated.id ? { ...f, ...updated } : f));

        // trigger print wrapper
        setTimeout(() => window.print(), 300);
      } else {
        alert(updated.error);
      }
    } catch {
      alert("Error processing payment.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div style={{animation: 'fadeIn 0.5s ease-out'}}>
      <h1 className="no-print">Fee Collection Portal</h1>
      <p className="no-print" style={{marginBottom: '2rem'}}>Scan or enter voucher number / student roll number to receive cash.</p>

      <form onSubmit={handleSearch} className="glass-panel no-print" style={{padding: '2rem', display: 'flex', gap: '1rem', alignItems: 'flex-end', marginBottom: '2rem', position: 'relative'}}>
        <div style={{flex: 1, position: 'relative'}} ref={dropdownRef}>
          <label className="form-label">Search by Name, Father's Name, or Voucher ID</label>
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
              {mounted ? (schoolName === 'TRUST SCHOOL SYSTEM' ? "THE BROOK FIELD SCHOOL'S SYSTEM" : schoolName) : "THE BROOK FIELD SCHOOL'S SYSTEM"}
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
              {mounted ? (schoolAddress === 'Campus Address / Contact No' ? "Dhoke Hassu, Rawalpindi. Mob: 0333-5435678, 0345-5904708" : schoolAddress) : "Dhoke Hassu, Rawalpindi. Mob: 0333-5435678, 0345-5904708"}
            </div>

            {/* Sub Header (Official Receipt + ID) */}
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px'}}>
               <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                  <span style={{fontWeight: 800}}>Dated:</span>
                  <span style={{borderBottom: '1px solid #1e3a8a', minWidth: '150px', fontWeight: 600}} contentEditable suppressContentEditableWarning>{new Date().toLocaleDateString()}</span>
               </div>
               <div style={{textAlign: 'center'}}>
                  <span style={{background: '#3730a3', color: 'white', padding: '2px 15px', borderRadius: '4px', fontWeight: 900, fontSize: '0.8rem'}}>OFFICIAL RECEIPT</span>
               </div>
               <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                  <span style={{fontWeight: 800}}>No.</span>
                  <span style={{fontSize: '1.5rem', fontWeight: 900, letterSpacing: '2px'}} contentEditable suppressContentEditableWarning>{feeData.id}</span>
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
                <tr>
                  <td contentEditable suppressContentEditableWarning>1. Admission Fee / Security</td>
                  <td style={{textAlign: 'right'}} contentEditable suppressContentEditableWarning>0</td>
                </tr>
                <tr>
                  <td contentEditable suppressContentEditableWarning>2. Tuition Fee (Month: {feeData.month})</td>
                  <td style={{textAlign: 'right'}} contentEditable suppressContentEditableWarning>{feeData.baseAmount || feeData.amount}</td>
                </tr>
                {feeData.discount > 0 && (
                  <tr>
                    <td style={{color: 'var(--success)', fontWeight: 'bold'}} contentEditable suppressContentEditableWarning>3. Scholarship / Discount</td>
                    <td style={{textAlign: 'right', color: 'var(--success)', fontWeight: 'bold'}} contentEditable suppressContentEditableWarning>- {feeData.discount}</td>
                  </tr>
                )}
                <tr>
                  <td contentEditable suppressContentEditableWarning>4. Examination Fee</td>
                  <td style={{textAlign: 'right'}} contentEditable suppressContentEditableWarning>0</td>
                </tr>
                <tr>
                  <td contentEditable suppressContentEditableWarning>5. Previous Balance / Arrears</td>
                  <td style={{textAlign: 'right'}} contentEditable suppressContentEditableWarning>{feeData.previousArrears || 0}</td>
                </tr>
                <tr>
                  <td contentEditable suppressContentEditableWarning>6. Annual Charges (AC) Pending</td>
                  <td style={{textAlign: 'right', color: feeData.remainingAnnualCharges > 0 ? 'var(--danger)' : 'inherit'}} contentEditable suppressContentEditableWarning>{feeData.remainingAnnualCharges || 0}</td>
                </tr>

                <tr>
                  <td contentEditable suppressContentEditableWarning>7. Fine / Other Charges</td>
                  <td style={{textAlign: 'right'}} contentEditable suppressContentEditableWarning>0</td>
                </tr>
              </tbody>
            </table>



            {/* Calculation & Signatures */}
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
              <div style={{flex: 1}}>
                 <div className="signature-section" style={{marginTop: '20px'}}>
                    <div className="sig-item" contentEditable suppressContentEditableWarning>Accountant</div>
                    <div className="sig-item" contentEditable suppressContentEditableWarning>Sig./Stamp</div>
                 </div>
                 <div className="no-print" style={{marginTop: '30px', textAlign: 'center'}}>
                    {feeData.status === 'Paid' || feeData.status === 'Partially Paid' ? (
                       <p style={{color: 'var(--success)', fontWeight: 'bold'}}>✓ Payment recorded on {new Date(feeData.paymentDate).toLocaleDateString()}</p>
                    ) : null}
                    <button className="btn btn-secondary" onClick={() => window.print()} style={{marginTop: '10px'}}>Print Receipt</button>
                 </div>
              </div>

              <div className="calculation-box">
                <div className="calc-row">
                  <div className="calc-label">Total Payable</div>
                  <div className="calc-value">{(feeData.baseAmount || feeData.amount) - (feeData.discount || 0) + (feeData.previousArrears || 0) + (feeData.remainingAnnualCharges || 0)}</div>
                </div>
                <div className="calc-row">
                  <div className="calc-label">Total Received</div>
                  <div className="calc-value">{feeData.totalReceived || 0}</div>
                </div>
                <div className="calc-row balance-row">
                  <div className="calc-label">Pending / Bal.</div>
                  <div className="calc-value">
                    {Math.max(0, ((feeData.baseAmount || feeData.amount) - (feeData.discount || 0) + (feeData.previousArrears || 0) + (feeData.remainingAnnualCharges || 0)) - (feeData.totalReceived || 0))}
                  </div>
                </div>
              </div>



            </div>

            {/* Payment Controls (No Print) */}
            {feeData.status !== 'Paid' && (
               <div className="no-print" style={{marginTop: '2rem', borderTop: '1px solid #ccc', paddingTop: '1rem'}}>
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem'}}>
                     <div>
                        <label className="form-label">Receive Tuition</label>
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
