"use client";
import React, { useState, useEffect } from 'react';
import './generate.css';

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


export default function GenerateFees() {
  const [fees, setFees] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [mounted, setMounted] = useState(false);
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

  const handlePrintIndividual = (id: number) => {
    setPrintTargetId(id);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const currentMonth = new Date().toLocaleString('default', { month: 'long' });
  const currentYear = new Date().getFullYear().toString();

  const fetchMonthFees = async (m = currentMonth, y = currentYear) => {
    const res = await fetch(`/api/fees?month=${m}&year=${y}`, { cache: 'no-store' });
    const data = await res.json();
    setFees(Array.isArray(data) ? data : []);
  };

  const [classes, setClasses] = useState<any[]>([]);
  const fetchClasses = async () => {
    try {
      const res = await fetch('/api/classes');
      const data = await res.json();
      setClasses(data || []);
    } catch {
      console.error("Failed to fetch classes");
    }
  };

  const [genMonth, setGenMonth] = useState(currentMonth);
  const [genYear, setGenYear] = useState(currentYear);
  const [genClassId, setGenClassId] = useState('all');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleBulkGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    try {
      const res = await fetch('/api/fees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: genMonth, year: genYear, classId: genClassId })
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Successfully generated ${data.count} new vouchers for ${genMonth} ${genYear}`);
        fetchMonthFees(genMonth, genYear);
      } else {
        alert(data.error || "Generation failed");
      }
    } finally {
      setIsGenerating(false);
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

    fetchMonthFees();
    fetchClasses();
  }, []);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        setLogo(result);
        try {
          localStorage.setItem('fms-school-logo', result);
        } catch(e) {
          alert('Image too large for local storage! Please select a smaller logo (under 2MB).');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveName = (e: React.FocusEvent<HTMLHeadingElement>) => {
    const text = e.currentTarget.textContent || 'YOUR SCHOOL NAME';
    setSchoolName(text);
    localStorage.setItem('fms-school-name', text);
  };


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

  const calculateTotal = () => filteredFees.reduce((acc, curr) => acc + (curr.amount || 0), 0);

  return (
    <div style={{animation: 'fadeIn 0.5s ease-out'}}>
      <div className="no-print" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem', gap: '1.5rem', background: 'var(--bg-card)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)'}}>
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
              {Array.from({length: 5}, (_, i) => (new Date().getFullYear() - 2 + i).toString()).map(y => <option key={y} value={y}>{y}</option>)}
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
            disabled={isGenerating}
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

      {filteredFees.length === 0 ? (
        <div className="glass-panel no-print" style={{padding: '4rem', textAlign: 'center'}}>
          <h3 style={{color: 'var(--text-muted)'}}>{fees.length > 0 ? "No vouchers match your filters." : "No vouchers generated for this billing cycle yet."}</h3>
        </div>
      ) : (
        <>
          <div className="no-print" style={{marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--bg-card)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)'}}>
            <div style={{flex: 1, display: 'flex', alignItems: 'center', gap: '1rem'}}>
               <strong style={{color: 'var(--text-main)', whiteSpace: 'nowrap'}}>Challan Branding:</strong>
               <input 
                 type="text" 
                 placeholder="School Name" 
                 className="form-input" 
                 style={{height: '35px', fontSize: '0.85rem', maxWidth: '200px'}}
                 value={schoolName}
                 onChange={e => {setSchoolName(e.target.value); localStorage.setItem('fms-school-name', e.target.value);}}
               />
               <input 
                 type="text" 
                 placeholder="Location / Contact" 
                 className="form-input" 
                 style={{height: '35px', fontSize: '0.85rem'}}
                 value={schoolAddress}
                 onChange={e => {setSchoolAddress(e.target.value); localStorage.setItem('fms-school-address', e.target.value);}}
               />
            </div>
            <div style={{width: '1px', height: '25px', background: 'var(--border)'}}></div>
            <strong style={{color: 'var(--text-main)', whiteSpace: 'nowrap'}}>Logo:</strong>
            <input type="file" accept="image/*" onChange={handleLogoUpload} style={{fontSize: '0.8rem'}} />
            {logo && <button className="btn btn-secondary" onClick={() => {setLogo(''); localStorage.removeItem('fms-school-logo');}} style={{padding: '0.4rem'}}>Remove</button>}
            
            <button className="btn btn-secondary" onClick={() => setShowConfig(!showConfig)} style={{padding: '0.4rem 1rem', marginLeft: 'auto'}}>
               ⚙️ Challan Config
            </button>
          </div>

          {showConfig && (
            <div className="glass-panel no-print" style={{padding: '2rem', marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', backdropFilter: 'blur(10px)'}}>
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
                    <td>Rs. {f.amount}</td>
                    <td style={{color: '#64748b'}}>Rs. {f.previousArrears || 0}</td>
                    <td style={{fontWeight: 700, color: '#e11d48'}}>
                      Rs. {(Number(f.amount) + Number(f.previousArrears || 0)) - Number(f.paidTuition || 0)}
                    </td>
                    <td><span className={`badge ${f.status === 'Paid' ? 'badge-success' : f.status === 'Partially Paid' ? 'badge-warning' : 'badge-danger'}`} style={{fontSize: '0.75rem'}}>{f.status}</span></td>
                    <td>
                      <div style={{display: 'flex', gap: '0.4rem'}}>
                        <button 
                           className="btn btn-primary" 
                           style={{padding: '0.3rem 0.8rem', fontSize: '0.8rem'}}
                           onClick={() => handlePrintIndividual(f.id)}
                        >
                           Print
                        </button>
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
                                 alert('Failed to reverse fee.');
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

          <div className="print-container print-only">
            {(printTargetId === -1 ? filteredFees : (printTargetId ? filteredFees.filter(f => f.id === printTargetId) : [])).map(f => {
              const totalAmount = Number(f.amount) + Number(f.remainingAnnualCharges || 0) + Number(f.previousArrears || 0);
              const qrData = `ID:${f.id}|ADM:${f.admissionNumber}|NAME:${f.studentName}|TOTAL:${totalAmount}`;
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
                             {/* Header */}
                             <div className="copy-header">{section}</div>
                             <div style={{textAlign: 'center', marginBottom: '2mm'}}>
                                <h4 style={{margin: 0, fontSize: '10pt'}}>{bankName}</h4>
                                <p style={{margin: 0, fontSize: '7pt'}}>{bankBranch}</p>
                                <p style={{margin: '0.5mm 0', fontSize: '7pt', fontWeight: 700}}>( {bankAccountNo} )</p>
                             </div>

                             <div style={{border: '1px solid #000', padding: '1mm', fontSize: '8pt', marginBottom: '2mm', textAlign: 'center'}}>
                                <strong>A/C Title: {bankAccountTitle}</strong>
                             </div>

                             {/* Info Grid */}
                             <div className="info-grid">
                                <div className="info-item"><strong>Document No</strong> <span>{f.id}</span></div>
                                <div className="info-item"><strong>Date</strong> <span>{new Date().toLocaleDateString('en-GB')}</span></div>
                                <div className="info-item"><strong>Student Name</strong> <span>{f.studentName}</span></div>
                                <div className="info-item"><strong>Father Name</strong> <span>{f.fatherName}</span></div>
                                <div className="info-item"><strong>Student ID</strong> <span>{f.admissionNumber || 'N/A'}</span></div>
                                <div className="info-item"><strong>Session</strong> <span>{f.month} {f.year}</span></div>
                                <div className="info-item"><strong>Program</strong> <span>{f.className}</span></div>
                                <div className="info-item"><strong>Institute ID</strong> <span>{instituteId}</span></div>
                             </div>

                             {/* Table */}
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
        </>
      )}
    </div>
  );
}
