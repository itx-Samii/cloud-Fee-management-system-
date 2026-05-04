"use client";
import React, { useState, useEffect } from 'react';

export default function GenerateFees() {
  const [fees, setFees] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [mounted, setMounted] = useState(false);
  const [schoolName, setSchoolName] = useState('YOUR SCHOOL NAME');
  const [logo, setLogo] = useState('');
  const [printTargetId, setPrintTargetId] = useState<number | null>(null);

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
    setFees(data || []);
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
    setLogo(localStorage.getItem('fms-school-logo') || '');
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

  const filteredFees = fees.filter(f => {
    const matchesSearch = f.studentName?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         f.fatherName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         f.id.toString() === searchQuery;
    const matchesClass = selectedClass === 'all' || f.className?.includes(selectedClass);
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
              {classes.map(c => <option key={c.id} value={c.name}>{c.name} {c.section ? `- ${c.section}` : ''}</option>)}
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
            <strong style={{color: 'var(--text-main)'}}>Upload School Logo:</strong>
            <input type="file" accept="image/*" onChange={handleLogoUpload} style={{fontSize: '0.9rem'}} />
            {logo && <button className="btn btn-secondary" onClick={() => {setLogo(''); localStorage.removeItem('fms-school-logo');}} style={{padding: '0.5rem'}}>Remove Logo</button>}
          </div>

          <div className="glass-panel table-container no-print">
            <table className="table">
              <thead>
                <tr>
                  <th style={{width: '80px'}}>Sr No</th>
                  <th>Adm No</th>
                  <th>Student & Father Name</th>
                  <th>Class</th>
                  <th>Month</th>
                  <th>Base Fee</th>
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
                    <td><span className={`badge ${f.status === 'Paid' ? 'badge-success' : 'badge-warning'}`}>{f.status}</span></td>
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
            {(printTargetId === -1 ? filteredFees : (printTargetId ? filteredFees.filter(f => f.id === printTargetId) : [])).map(f => (
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
                           ['Voucher No:', `#${f.id}`],
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
                          <span>Rs. {f.baseAmount || f.amount}</span>
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
        </>
      )}
    </div>
  );
}
