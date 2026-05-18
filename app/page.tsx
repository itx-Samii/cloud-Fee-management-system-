"use client";
import React, { useState, useEffect } from 'react';

export default function Dashboard() {
  const [viewMode, setViewMode] = useState<'monthly' | 'all-time'>('monthly');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{fees: any[], students: any[], expenses: any[], salaries: any[]}>({ 
    fees: [], 
    students: [], 
    expenses: [], 
    salaries: [] 
  });

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const currentMonth = new Date().toLocaleString('default', { month: 'long' });
      const currentYear = new Date().getFullYear().toString();
      
      await fetch('/api/fees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: currentMonth, year: currentYear })
      }).catch(err => console.error("Silent generate failed", err));

      const [feesRes, studentsRes, expRes, salRes] = await Promise.all([
        fetch('/api/fees', { cache: 'no-store' }),
        fetch('/api/students?limit=5000', { cache: 'no-store' }),

        fetch('/api/expenses', { cache: 'no-store' }),
        fetch('/api/salaries', { cache: 'no-store' }) 
      ]);
      
      const fees = feesRes.ok ? await feesRes.json() : [];
      const sr = studentsRes.ok ? await studentsRes.json() : {total:0, students:[]};
      const exps = expRes.ok ? await expRes.json() : [];
      const sals = salRes.ok ? await salRes.json() : [];
      
      setData({ fees, students: sr.students || [], expenses: exps, salaries: sals });
    } catch (err) {
      console.error("Dashboard error", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const calculateMetrics = () => {
    const now = new Date();
    const { fees, students, expenses, salaries } = data;
    
    const isPaidInTargetRange = (dateStr: string) => {
        if (!dateStr) return false;
        if (viewMode === 'all-time') return true;
        const d = new Date(dateStr);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    };

    const allTimeAC = students.reduce((a, s: any) => a + (parseFloat(s.paidAnnualCharges) || 0), 0);
    
    const targetFees = fees.filter((f: any) => (f.status === 'Paid' || f.status === 'Partially Paid') && isPaidInTargetRange(f.paymentDate));
    // User wants ONLY Tuition from the filtered fees (Monthly or All-time)
    const tuitionIn = targetFees.reduce((a, c: any) => a + (c.isACOnly ? 0 : (parseFloat(c.paidTuition) || parseFloat(c.amount) || 0)), 0);
    
    // Monthly Gross = All Time AC + Selected Tuition (User's specific formula)
    const gross = allTimeAC + tuitionIn;

    // Expenses (Filter out manual 'Salary' entries to prevent double counting with formal salaries)
    const targetExps = expenses.filter((e: any) => isPaidInTargetRange(e.date) && e.category?.toLowerCase() !== 'salary')
                               .reduce((a, c: any) => a + (parseFloat(c.amount) || 0), 0);
    const targetSals = salaries.filter((s: any) => isPaidInTargetRange(s.paymentDate)).reduce((a, c: any) => a + (parseFloat(c.amount) || 0), 0);

    const currentMonthBilled = fees.filter((f: any) => f.month === now.toLocaleString('default', { month: 'long' }) && f.year === now.getFullYear().toString())
                                   .reduce((a: number, c: any) => a + (parseFloat(c.amount) || 0), 0);
    const totalBilled = fees.reduce((a, c: any) => a + (parseFloat(c.amount) || 0), 0) + students.reduce((a, s: any) => a + (parseFloat(s.annualCharges) || 0), 0);

    const expected = (viewMode === 'all-time') ? totalBilled : currentMonthBilled;

    return {
      students: students.length,
      gross,
      acIn: allTimeAC,
      tuitionIn,
      expenses: targetExps + targetSals,
      expected,
      pending: (fees.reduce((a, c) => a + ((parseFloat(c.amount) || 0) - (parseFloat(c.paidTuition) || 0)), 0)) + 
               (students.reduce((a, s) => a + ((parseFloat(s.annualCharges) || 0) - (parseFloat(s.paidAnnualCharges) || 0)), 0))
    };
  };

  const metrics = calculateMetrics();
  
  const unifiedLogs = [
    ...data.fees.filter((f: any) => f.status === 'Paid' || f.status === 'Partially Paid').map((f: any) => ({
      id: `fee-${f.id}`,
      type: 'INCOME',
      category: f.month === 'Annual Charges' ? 'Annual Charges' : 'Fee',
      title: f.studentName || 'Student Payment',
      amount: f.totalReceived || f.amount,
      date: f.paymentDate || f.date || new Date().toISOString(),
    })),
    ...data.expenses.map((e: any) => ({
      id: `exp-${e.id}`,
      type: 'EXPENSE',
      category: e.category || 'General',
      title: e.description || 'Expense',
      amount: e.amount,
      date: e.date || new Date().toISOString(),
    })),
    ...data.salaries.map((s: any) => ({
      id: `sal-${s.id}`,
      type: 'EXPENSE',
      category: 'Salary',
      title: s.staffName || `Staff ID: ${s.staffId}`,
      amount: s.amount,
      date: s.paymentDate || s.date || new Date().toISOString(),
    }))
  ].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
   .slice(0, 10);

  return (
    <div style={{animation: 'fadeIn 0.5s ease-out'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2.5rem'}}>
        <div>
          <h1 style={{marginBottom: '0.25rem'}}>School Pay Dashboard</h1>
          <p>Financial performance overview for {viewMode === 'monthly' ? 'this month' : 'all sessions'}.</p>
        </div>
        <div style={{background: 'var(--bg-card)', padding: '0.5rem', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', gap: '0.5rem'}}>
            <button 
                onClick={() => setViewMode('monthly')}
                className={`btn ${viewMode === 'monthly' ? 'btn-primary' : 'btn-secondary'}`}
                style={{padding: '0.6rem 1.2rem', fontSize: '0.85rem', boxShadow: 'none', borderRadius: '10px'}}
            >
                🔄 Monthly View
            </button>
            <button 
                onClick={() => setViewMode('all-time')}
                className={`btn ${viewMode === 'all-time' ? 'btn-primary' : 'btn-secondary'}`}
                style={{padding: '0.6rem 1.2rem', fontSize: '0.85rem', boxShadow: 'none', borderRadius: '10px'}}
            >
                🌍 Lifetime Audit
            </button>
        </div>
      </div>

      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '3rem'}}>
        
        <div className="glass-panel" style={{padding: '1.5rem'}}>
          <h3 style={{color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase'}}>Total Enrollment</h3>
          <div style={{display: 'flex', alignItems: 'flex-end', gap: '1rem'}}>
            <span style={{fontSize: '2.5rem', fontWeight: 700, lineHeight: 1}}>{metrics.students}</span>
          </div>
        </div>

        <div className="glass-panel" style={{padding: '1.5rem', borderBottom: '3px solid var(--primary)'}}>
          <h3 style={{color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase'}}>
            {viewMode === 'monthly' ? 'Monthly' : 'Total'} Gross Collected
          </h3>
          <div style={{marginBottom: '0.5rem'}}>
            <span style={{fontSize: '2.5rem', fontWeight: 700, lineHeight: 1, color: 'var(--primary)'}}>Rs. {metrics.gross}</span>
          </div>
        </div>

        <div className="glass-panel" style={{padding: '1.5rem', borderBottom: '3px solid var(--danger)'}}>
          <h3 style={{color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase'}}>
            {viewMode === 'monthly' ? 'Monthly' : 'Total'} Expenses
          </h3>
          <div style={{display: 'flex', alignItems: 'flex-end', gap: '1rem'}}>
            <span style={{fontSize: '2.5rem', fontWeight: 700, lineHeight: 1, color: 'var(--danger)'}}>Rs. {metrics.expenses}</span>
          </div>
        </div>

        <div className="glass-panel" style={{padding: '1.5rem', borderBottom: '3px solid var(--success)'}}>
          <h3 style={{color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase'}}>
             Net Profit ({viewMode === 'monthly' ? 'Month' : 'Total'})
          </h3>
          <div style={{display: 'flex', alignItems: 'flex-end', gap: '1rem'}}>
            <span style={{fontSize: '2.5rem', fontWeight: 700, lineHeight: 1, color: 'var(--success)'}}>Rs. {metrics.gross - metrics.expenses}</span>
          </div>
        </div>
      </div>



      <h2>Recent Activity (In / Out)</h2>
      <p style={{marginBottom: '1.5rem'}}>Latest financial movements (Income & Expenses) recorded in the system.</p>
      
      <div className="glass-panel table-container">
        <table className="table">
          <thead>
            <tr>
              <th>S.No</th>
              <th>Description / Title</th>
              <th>Category</th>
              <th>Date</th>
              <th>Amount</th>
              <th className="no-print">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
               <tr>
                 <td colSpan={6} style={{textAlign: 'center', padding: '3rem'}}>
                   <span style={{color: 'var(--text-muted)'}}>Calculating metrics...</span>
                 </td>
               </tr>
            ) : unifiedLogs.length === 0 ? (
              <tr>
                <td colSpan={6} style={{textAlign: 'center', padding: '3rem'}}>
                  <span style={{color: 'var(--text-muted)'}}>No recent activity found.</span>
                </td>
              </tr>
            ) : (
               unifiedLogs.map((log, idx) => (
                 <tr key={`log_${log.id}_${idx}_${log.type}`}>
                   <td style={{color: 'var(--text-muted)', fontSize: '0.9rem'}}>{idx + 1}.</td>
                   <td style={{fontWeight: 'bold'}}>
                      {log.title}
                      {log.type === 'INCOME' ? (
                        <span style={{fontSize: '0.7rem', marginLeft: '8px', padding: '2px 6px', background: 'var(--success-bg)', color: 'var(--success)', borderRadius: '4px'}}>IN</span>
                      ) : (
                        <span style={{fontSize: '0.7rem', marginLeft: '8px', padding: '2px 6px', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: '4px'}}>OUT</span>
                      )}
                   </td>
                   <td style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>{log.category}</td>
                   <td style={{fontSize: '0.9rem'}}>{new Date(log.date || new Date()).toLocaleDateString('en-GB')}</td>
                   <td style={{fontWeight: 700, color: log.type === 'INCOME' ? 'var(--success)' : 'var(--danger)'}}>
                      {log.type === 'INCOME' ? '+' : '-'} Rs. {log.amount}
                   </td>
                   <td className="no-print">
                      {log.type === 'INCOME' && (
                        <button 
                          className="btn" 
                          style={{padding: '0.2rem 0.5rem', fontSize: '0.7rem', background: '#e11d48', color: 'white', border: 'none'}}
                          onClick={async () => {
                            if(confirm(`Are you sure you want to REVERSE this payment of Rs. ${log.amount}?`)) {
                              const rawId = log.id.replace('fee-', '');
                              const res = await fetch(`/api/fees?id=${rawId}`, { method: 'DELETE' });
                              if(res.ok) loadDashboard();
                              else alert("Failed to reverse.");
                            }
                          }}
                        >
                          Reverse
                        </button>
                      )}
                    </td>
                 </tr>
               ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{marginTop: '3rem'}}>
         <h2>System Security & Maintenance</h2>
         <p style={{marginBottom: '1.5rem'}}>Protect your 3+ years of data with regular offline backups.</p>
         
         <div className="glass-panel" style={{padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem', border: '1px solid var(--primary-light)'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <div>
                 <h3 style={{marginBottom: '0.5rem'}}>Full System Backup & Restore</h3>
                 <p style={{color: 'var(--text-muted)', maxWidth: '500px', fontSize: '0.9rem'}}>
                   Manage your database backups. <strong>Recommendation:</strong> Save your data to a USB drive once a week.
                 </p>
              </div>
              <div style={{display: 'flex', gap: '1rem'}}>
                <button 
                  className="btn btn-primary" 
                  style={{padding: '1rem 2rem'}}
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/admin/backup');
                      const data = await res.json();
                      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      const date = new Date().toISOString().split('T')[0];
                      a.download = `School_ERP_Backup_${date}.json`;
                      document.body.appendChild(a);
                      a.click();
                      window.URL.revokeObjectURL(url);
                      alert("Backup Downloaded Successfully!");
                    } catch (e) {
                      alert("Backup failed. Check system connection.");
                    }
                  }}
                >
                  Download Backup
                </button>
                
                <div style={{position: 'relative'}}>
                  <button 
                    className="btn btn-secondary" 
                    style={{padding: '1rem 2rem', border: '1px solid var(--primary)', color: 'var(--primary)'}}
                    onClick={() => document.getElementById('restore-input')?.click()}
                  >
                    📤 Restore from Backup
                  </button>
                  <input 
                    id="restore-input" 
                    type="file" 
                    accept=".json" 
                    style={{display: 'none'}} 
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      
                      if (!confirm("WARNING: This will delete ALL current data and replace it with the backup. Continue?")) return;

                      const reader = new FileReader();
                      reader.onload = async (event) => {
                        try {
                          const backup = JSON.parse(event.target?.result as string);
                          const res = await fetch('/api/admin/restore', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(backup)
                          });
                          
                          if (res.ok) {
                            alert("SUCCESS! System data has been restored. Refreshing...");
                            window.location.reload();
                          } else {
                            const err = await res.json();
                            alert("ERROR: " + err.error);
                          }
                        } catch (err) {
                          alert("Invalid backup file.");
                        }
                      };
                      reader.readAsText(file);
                    }}
                  />
                </div>
              </div>
            </div>

            <div style={{borderTop: '1px dashed var(--border)', paddingTop: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
               <div>
                  <h3 style={{marginBottom: '0.5rem'}}>Security Credentials</h3>
                  <p style={{color: 'var(--text-muted)', fontSize: '0.9rem'}}>Update your administrator login password.</p>
               </div>
               <button 
                 className="btn btn-secondary" 
                 style={{padding: '0.75rem 1.5rem', color: 'var(--danger)', borderColor: 'var(--danger)'}}
                 onClick={() => {
                   const oldPass = prompt("Enter Current Password:");
                   if (!oldPass) return;
                   const newPass = prompt("Enter New Password:");
                   if (!newPass) return;
                   const confirmPass = prompt("Confirm New Password:");
                   if (newPass !== confirmPass) {
                     alert("Passwords do not match!");
                     return;
                   }

                   fetch('/api/auth/change-password', {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({ oldPassword: oldPass, newPassword: newPass })
                   }).then(async res => {
                     if (res.ok) {
                       alert("Password changed successfully! Please login again.");
                       window.location.href = '/login';
                     } else {
                       const err = await res.json();
                       alert("Error: " + err.error);
                     }
                   });
                 }}
               >
                 🔒 Change Admin Password
               </button>
            </div>
         </div>
      </div>
    </div>
  );
}
