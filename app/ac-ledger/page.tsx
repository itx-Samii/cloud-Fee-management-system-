"use client";
import React, { useState, useEffect } from 'react';
import { exportToCSV } from '@/lib/exportUtils';

export default function ACLedger() {
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedClass, setSelectedClass] = useState('all');
  const [selectedYear, setSelectedYear] = useState('2026');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [payAmount, setPayAmount] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sRes, cRes] = await Promise.all([
        fetch('/api/students?limit=1000', { cache: 'no-store' }),
        fetch('/api/classes', { cache: 'no-store' })
      ]);
      const sData = await sRes.json();
      const cData = await cRes.json();
      setStudents(sData.students || []);
      setClasses(cData || []);
    } catch {
      console.error("Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filtered = students.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase()) || s.fatherName?.toLowerCase().includes(search.toLowerCase());
    const matchesClass = selectedClass === 'all' || s.classId?.toString() === selectedClass;
    
    // For now, match against updatedAt year as a proxy for the 'Session'
    const sessionYear = new Date(s.updatedAt || Date.now()).getFullYear().toString();
    const matchesYear = selectedYear === 'all' || sessionYear === selectedYear;

    const total = s.annualCharges || 0;
    const paid = s.paidAnnualCharges || 0;
    const remaining = total - paid;
    const status = remaining <= 0 ? 'Cleared' : paid > 0 ? 'Partial' : 'Unpaid';
    const matchesStatus = statusFilter === 'all' || status === statusFilter;

    return matchesSearch && matchesClass && matchesStatus && matchesYear;
  });

  const handleCollect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !payAmount) return;
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount.');
      return;
    }
    const remaining = (selectedStudent.annualCharges || 0) - (selectedStudent.paidAnnualCharges || 0);
    if (amount > remaining) {
      alert(`Amount exceeds remaining balance of Rs. ${remaining}`);
      return;
    }
    setProcessing(true);
    try {
      // Correctly update paidAnnualCharges on the student record
      const newPaid = (selectedStudent.paidAnnualCharges || 0) + amount;
      const res = await fetch('/api/students', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedStudent.id,
          paidAnnualCharges: newPaid
        })
      });
      if (res.ok) {
        setShowModal(false);
        setPayAmount('');
        await fetchData();
        alert(`Rs. ${amount} AC installment recorded successfully!`);
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to record payment');
      }
    } catch {
      alert('System Error — check your connection');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div style={{animation: 'fadeIn 0.5s ease-out'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem'}}>
        <div>
          <h1>Annual Charges (AC) Ledger</h1>
          <p>Track payments and installments for session-based charges.</p>
        </div>
        <button 
          className="btn btn-secondary" 
          onClick={() => exportToCSV(filtered, 'AC_Ledger', {
            name: 'Student Name',
            fatherName: 'Father Name',
            annualCharges: 'Total AC',
            paidAnnualCharges: 'Paid Amount',
            remaining: 'Remaining Balance'
          })}
        >
          Export to Excel
        </button>
      </div>

      <div className="glass-panel" style={{padding: '1.5rem', marginBottom: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap'}}>
        <div style={{flex: 1.5, minWidth: '200px'}}>
          <label className="form-label">Search Student</label>
          <input 
            type="text" 
            className="form-input" 
            placeholder="Name or Father's Name..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div style={{flex: 1, minWidth: '150px'}}>
          <label className="form-label">Class</label>
          <select className="form-input" value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
            <option value="all">All Classes</option>
            {classes.map(c => (
              <option key={c.id} value={c.id.toString()}>{c.name} {c.section ? ` - ${c.section}` : ''}</option>
            ))}
          </select>
        </div>
        <div style={{flex: 1, minWidth: '120px'}}>
          <label className="form-label">Year</label>
          <select className="form-input" value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
            <option value="all">All</option>
            <option value="2025">2025</option>
            <option value="2026">2026</option>
            <option value="2027">2027</option>
          </select>
        </div>
        <div style={{flex: 1, minWidth: '150px'}}>
          <label className="form-label">Payment Status</label>
          <select className="form-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">All Statuses</option>
            <option value="Cleared">Cleared (Paid)</option>
            <option value="Partial">Partial Paid</option>
            <option value="Unpaid">Unpaid</option>
          </select>
        </div>
      </div>

      {/* AC Summary Metrics */}
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem'}}>
        <div className="glass-panel" style={{padding: '1.5rem', borderLeft: '4px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
          <span style={{fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Total AC Goal</span>
          <h2 style={{fontSize: '2rem', fontWeight: 800, margin: 0}}>Rs. {filtered.reduce((sum, s) => sum + (parseFloat(s.annualCharges) || 0), 0).toLocaleString()}</h2>
        </div>
        
        <div className="glass-panel" style={{padding: '1.5rem', borderLeft: '4px solid var(--success)', display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
          <span style={{fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Total Collected AC</span>
          <h2 style={{fontSize: '2rem', fontWeight: 800, margin: 0, color: 'var(--success)'}}>Rs. {filtered.reduce((sum, s) => sum + (parseFloat(s.paidAnnualCharges) || 0), 0).toLocaleString()}</h2>
        </div>

        <div className="glass-panel" style={{padding: '1.5rem', borderLeft: '4px solid var(--danger)', display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
          <span style={{fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Outstanding AC</span>
          <h2 style={{fontSize: '2rem', fontWeight: 800, margin: 0, color: 'var(--danger)'}}>Rs. {filtered.reduce((sum, s) => sum + ((parseFloat(s.annualCharges) || 0) - (parseFloat(s.paidAnnualCharges) || 0)), 0).toLocaleString()}</h2>
        </div>
      </div>

      <div className="glass-panel table-container">
        <table className="table">
          <thead>
            <tr>
              <th style={{width: '80px'}}>Sr No</th>
              <th>Student & Father Name</th>
              <th>Class</th>
              <th>Total AC (Goal)</th>
              <th>Submitted AC</th>
              <th>Remaining</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{textAlign: 'center', padding: '3rem'}}>Loading audit data...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} style={{textAlign: 'center', padding: '3rem'}}>No records found for selected filters.</td></tr>
            ) : (
              filtered.map(s => {
                const studentClass = classes.find(c => c.id.toString() === s.classId?.toString());
                const className = studentClass ? `${studentClass.name} ${studentClass.section || ''}` : 'N/A';
                const total = s.annualCharges || 0;
                const paid = s.paidAnnualCharges || 0;
                const remaining = total - paid;
                const status = remaining <= 0 ? 'Cleared' : paid > 0 ? 'Partial' : 'Unpaid';
                const badgeClass = status === 'Cleared' ? 'badge-success' : status === 'Partial' ? 'badge-warning' : 'badge-danger';

                  return (
                    <tr key={s.id}>
                      <td style={{color: 'var(--text-muted)'}}>#{students.indexOf(s) + 1}</td>
                      <td>
                        <div style={{fontWeight: 700}}>{s.name}</div>
                        <div style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>S/O: {s.fatherName}</div>
                      </td>
                      <td>{className}</td>
                    <td>Rs. {total}</td>
                    <td style={{color: 'var(--success)', fontWeight: 600}}>{paid > 0 ? `Rs. ${paid}` : '-'}</td>
                    <td style={{color: remaining > 0 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: 600}}>
                      {remaining > 0 ? `Rs. ${remaining}` : '0'}
                    </td>
                    <td><span className={`badge ${badgeClass}`}>{status}</span></td>
                    <td>
                      <button 
                        className="btn btn-primary" 
                        style={{padding: '0.4rem 0.8rem', fontSize: '0.8rem'}}
                        onClick={() => { setSelectedStudent(s); setShowModal(true); }}
                        disabled={remaining <= 0}
                      >
                        {remaining <= 0 ? 'Completed' : 'Collect AC'}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showModal && selectedStudent && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'}}>
          <div className="glass-panel" style={{width: '100%', maxWidth: '450px', padding: '2rem'}}>
            <h2 style={{marginBottom: '0.5rem'}}>Collect AC Installment</h2>
            <p style={{marginBottom: '1.5rem', color: 'var(--text-muted)'}}>Student: <strong>{selectedStudent.name}</strong></p>
            
            <div style={{background: '#f8fafc', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #e2e8f0'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem'}}>
                <span>Total Yearly AC:</span>
                <span style={{fontWeight: 600}}>Rs. {selectedStudent.annualCharges}</span>
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between', color: 'var(--danger)'}}>
                <span>Remaining Balance:</span>
                <span style={{fontWeight: 700}}>Rs. {selectedStudent.annualCharges - selectedStudent.paidAnnualCharges}</span>
              </div>
            </div>

            <form onSubmit={handleCollect}>
              <div className="form-group">
                <label className="form-label">Installment Amount (Rs.)</label>
                <input 
                  required 
                  type="number" 
                  className="form-input" 
                  autoFocus
                  placeholder="e.g. 500" 
                  value={payAmount} 
                  onChange={e => setPayAmount(e.target.value)} 
                />
              </div>
              <div style={{display: 'flex', gap: '1rem', marginTop: '2rem'}}>
                <button type="button" className="btn btn-secondary" style={{flex: 1}} onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{flex: 1}} disabled={processing}>
                  {processing ? 'Saving...' : 'Receive Cash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
