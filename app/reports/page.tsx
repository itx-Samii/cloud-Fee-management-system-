"use client";
import React, { useState, useEffect } from 'react';
import { exportToCSV } from '@/lib/exportUtils';

export default function CollectionReports() {
  const [fees, setFees] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filter States
  const [search, setSearch] = useState('');
  const [selectedClass, setSelectedClass] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedYear, setSelectedYear] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');

  const fetchClasses = async () => {
    try {
      const res = await fetch('/api/classes');
      const data = await res.json();
      setClasses(data || []);
    } catch { console.error("Failed to fetch classes"); }
  };

  const fetchReportData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/fees?limit=5000`, { cache: 'no-store' });
      const data = await res.json();
      setFees(data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    async function checkRole() {
      try {
        const res = await fetch('/api/auth/login');
        const data = await res.json();
        if (data && data.user && data.user.role === 'accountant') {
          window.location.href = '/unauthorized';
        }
      } catch {}
    }
    checkRole();
    fetchReportData();
    fetchClasses();
  }, []);

  const filteredFees = fees.filter(f => {
    const matchSearch = !search || 
      f.studentName?.toLowerCase().includes(search.toLowerCase()) || 
      f.fatherName?.toLowerCase().includes(search.toLowerCase());
    
    const matchClass = selectedClass === 'all' || f.classId?.toString() === selectedClass;
    const matchMonth = selectedMonth === 'all' || f.month === selectedMonth;
    const matchYear = selectedYear === 'all' || f.year === selectedYear;
    const matchStatus = selectedStatus === 'all' || f.status === selectedStatus;
    const isNotACOnly = !f.isACOnly && f.month !== 'Annual Charges';

    return matchSearch && matchClass && matchMonth && matchYear && matchStatus && isNotACOnly;
  });

  const totalBilled = filteredFees.reduce((acc, f) => acc + (parseFloat(f.amount) || 0), 0);
  const totalCollected = filteredFees.reduce((acc, f) => acc + (f.status === 'Paid' ? (parseFloat(f.paidTuition) || parseFloat(f.amount) || 0) : 0), 0);
  const totalPending = Math.max(0, totalBilled - totalCollected); 

  return (
    <div style={{animation: 'fadeIn 0.5s ease-out'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem'}}>
        <div>
          <h1>Financial Overview</h1>
          <p>School fee collection flow and generated income statements.</p>
        </div>
        <button 
          className="btn btn-secondary" 
          onClick={() => {
            const exportData = filteredFees.map(f => ({
              ...f,
              netTuitionOnly: f.status === 'Paid' ? (f.paidTuition || f.amount) : 0
            }));
            exportToCSV(exportData, 'Financial_Report', {
              id: 'Voucher ID',
              studentName: 'Student',
              fatherName: 'Father Name',
              month: 'Month',
              year: 'Year',
              amount: 'Billed Amount',
              netTuitionOnly: 'Net Collected',
              status: 'Status',
              paymentDate: 'Payment Date'
            });
          }}
        >
          Export to Excel
        </button>
      </div>

      {/* Professional Filter Bar */}
      <div className="glass-panel no-print" style={{padding: '1.5rem', marginBottom: '2rem'}}>
        <div style={{display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'flex-end'}}>
          <div style={{flex: '1.5', minWidth: '240px'}}>
            <label className="form-label" style={{fontSize: '0.75rem', marginBottom: '0.5rem'}}>SEARCH STUDENT</label>
            <input 
              type="text" 
              className="form-input" 
              placeholder="Name or Father's Name..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{padding: '0.55rem 0.8rem'}}
            />
          </div>
          <div style={{flex: '1', minWidth: '150px'}}>
            <label className="form-label" style={{fontSize: '0.75rem', marginBottom: '0.5rem'}}>CLASS FILTER</label>
            <select className="form-input" style={{padding: '0.55rem 0.8rem'}} value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
              <option value="all">All Classes</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name} {c.section ? ` - ${c.section}` : ''}</option>
              ))}
            </select>
          </div>
          <div style={{flex: '1', minWidth: '120px'}}>
            <label className="form-label" style={{fontSize: '0.75rem', marginBottom: '0.5rem'}}>MONTH</label>
            <select className="form-input" style={{padding: '0.55rem 0.8rem'}} value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
              <option value="all">Full Year</option>
              {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div style={{flex: '0.8', minWidth: '100px'}}>
            <label className="form-label" style={{fontSize: '0.75rem', marginBottom: '0.5rem'}}>YEAR</label>
            <select className="form-input" style={{padding: '0.55rem 0.8rem'}} value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
              <option value="all">All</option>
              {["2025", "2026", "2027"].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div style={{flex: '0.8', minWidth: '120px'}}>
            <label className="form-label" style={{fontSize: '0.75rem', marginBottom: '0.5rem'}}>PAYMENT STATUS</label>
            <select className="form-input" style={{padding: '0.55rem 0.8rem'}} value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}>
              <option value="all">All</option>
              <option value="Paid">Paid Only</option>
              <option value="Unpaid">Unpaid Only</option>
            </select>
          </div>
        </div>
      </div>

      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '3rem'}}>
        <div className="glass-panel" style={{padding: '1.5rem', borderLeft: '4px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
          <span style={{color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em'}}>Billed Revenue</span>
          <h2 style={{fontSize: '2rem', fontWeight: 800}}>Rs. {totalBilled}</h2>
        </div>
        <div className="glass-panel" style={{padding: '1.5rem', borderLeft: '4px solid var(--success)', display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
          <span style={{color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em'}}>Total Collected</span>
          <h2 style={{fontSize: '2rem', fontWeight: 800, color: 'var(--success)'}}>Rs. {totalCollected}</h2>
        </div>
        <div className="glass-panel" style={{padding: '1.5rem', borderLeft: '4px solid var(--danger)', display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
          <span style={{color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em'}}>Total Outstanding</span>
          <h2 style={{fontSize: '2rem', fontWeight: 800, color: 'var(--danger)'}}>Rs. {totalPending}</h2>
        </div>
      </div>

      <h2>Recent Income Logs</h2>
      <div className="glass-panel table-container" style={{marginTop: '1.5rem'}}>
        <table className="table">
          <thead>
            <tr>
              <th style={{width: '60px'}}>Sr No</th>
              <th>Student & Father Name</th>
              <th>Billing Month</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{textAlign: 'center', padding: '2rem'}}>Loading accounting data...</td></tr>
            ) : filteredFees.length === 0 ? (
              <tr><td colSpan={5} style={{textAlign: 'center', padding: '2rem', color: 'var(--text-muted)'}}>No records match these filters.</td></tr>
            ) : (
              filteredFees.slice(0, 100).map((f, idx) => (
                <tr key={f.id}>
                  <td style={{color: 'var(--text-muted)'}}>#{idx + 1}</td>
                  <td>
                    <div style={{fontWeight: 600}}>{f.studentName || `Student ID: ${f.studentId}`}</div>
                    <div style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>S/O: {f.fatherName || 'N/A'}</div>
                  </td>
                  <td>{f.month} {f.year}</td>
                  <td>
                    <div style={{fontWeight: 600, color: f.status === 'Paid' ? 'var(--success)' : 'inherit'}}>Rs. {f.isACOnly ? 0 : (f.paidTuition || f.amount)}</div>
                  </td>
                  <td>
                    <span className={`badge ${f.status === 'Paid' ? 'badge-success' : 'badge-warning'}`}>
                      {f.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
