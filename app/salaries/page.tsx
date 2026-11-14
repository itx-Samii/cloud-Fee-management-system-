"use client";
import React, { useState, useEffect, useCallback } from 'react';
import { exportToCSV } from '@/lib/exportUtils';
import type { RecordId, SalaryRecord, StaffMember } from '@/lib/types';
import { yearOptions } from '@/lib/fees';
import { useFeeSettings } from '@/lib/useFeeSettings';

const rupees = (amount: number) => `Rs. ${(Number(amount) || 0).toLocaleString('en-US')}`;

/** Staff list plus the salaries already paid for one month. */
async function fetchPayroll(month: string, year: string): Promise<{ staff: StaffMember[]; history: SalaryRecord[] }> {
  const [sRes, hRes] = await Promise.all([
    fetch('/api/staff'),
    fetch(`/api/salaries?month=${month}&year=${year}`)
  ]);
  const s = await sRes.json();
  const h = await hRes.json();
  return { staff: Array.isArray(s) ? s : [], history: Array.isArray(h) ? h : [] };
}

export default function SalaryManagement() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [history, setHistory] = useState<SalaryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'directory' | 'payroll'>('payroll');

  // Staff Form
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [staffData, setStaffData] = useState({ name: '', designation: 'Teacher', salary: '', deductionPerOff: '0' });
  const [editingId, setEditingId] = useState<RecordId | null>(null);

  // Payment Processing Modal
  const [showPayModal, setShowPayModal] = useState(false);
  const [payingStaff, setPayingStaff] = useState<StaffMember | null>(null);
  const [offs, setOffs] = useState('0');
  const [customRate, setCustomRate] = useState('0');
  const [isProcessing, setIsProcessing] = useState(false);

  // Salary slip being shown / printed
  const [slip, setSlip] = useState<{ member: StaffMember; record: SalaryRecord } | null>(null);
  const { settings } = useFeeSettings();

  // Reversal Confirmation Modal
  const [showReverseModal, setShowReverseModal] = useState(false);
  const [reversingId, setReversingId] = useState<RecordId | null>(null);

  // Payroll Form
  const [selectedMonth, setSelectedMonth] = useState(new Date().toLocaleString('default', { month: 'long' }));
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [payrollStatusFilter, setPayrollStatusFilter] = useState('all');

  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const fetchData = useCallback(
    () =>
      fetchPayroll(selectedMonth, selectedYear)
        .then((data) => {
          setStaff(data.staff);
          setHistory(data.history);
        })
        .catch((err) => console.error(err))
        .finally(() => setLoading(false)),
    [selectedMonth, selectedYear]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    const method = editingId ? 'PUT' : 'POST';

    // Ensure numbers are sent correctly
    const payload = {
      ...staffData,
      id: editingId,
      salary: parseFloat(staffData.salary || '0'),
      deductionPerOff: parseFloat(staffData.deductionPerOff || '0')
    };

    const res = await fetch('/api/staff', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      setShowStaffModal(false);
      setEditingId(null);
      setStaffData({ name: '', designation: 'Teacher', salary: '', deductionPerOff: '0' });
      fetchData();
    }
  };

  const handleConfirmPayment = async () => {
    if (!payingStaff) return;
    setIsProcessing(true);

    const deductionAmount = parseFloat(offs) * parseFloat(customRate || '0');
    const netAmount = payingStaff.salary - deductionAmount;

    try {
      const res = await fetch('/api/salaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffId: payingStaff.id,
          month: selectedMonth,
          year: selectedYear,
          amount: netAmount,
          offs: parseFloat(offs),
          deduction: deductionAmount
        })
      });

      if (res.ok) {
        setShowPayModal(false);
        setOffs('0');
        fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to pay salary");
      }
    } catch {
      alert("System error. Check connection.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReversePayment = async () => {
    if (!reversingId) return;
    setIsProcessing(true);

    try {
      const res = await fetch(`/api/salaries?id=${reversingId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        setShowReverseModal(false);
        setReversingId(null);
        fetchData();
      } else {
        alert("Failed to reverse payment.");
      }
    } catch {
      alert("System error.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteStaff = async (id: RecordId) => {
    if (!confirm("Are you sure you want to delete this staff member? All their salary history will also be removed.")) return;

    try {
      const res = await fetch(`/api/staff?id=${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchData();
      } else {
        alert("Failed to delete staff.");
      }
    } catch {
      alert("Error deleting staff.");
    }
  };

  const isPaid = (staffId: RecordId) => history.some(h => h.staffId?.toString() === staffId?.toString());

  return (
    <>
    <div className={slip ? 'no-print' : undefined} style={{animation: 'fadeIn 0.5s ease-out'}}>
      <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem'}}>
        <div>
          <h1>Staff & Salary Management</h1>
          <p>Manage school employees and process monthly payroll.</p>
        </div>
        <div style={{display: 'flex', gap: '0.5rem'}}>
          <button
            className="btn btn-secondary"
            style={{padding: '0.4rem 1rem', fontSize: '0.85rem'}}
            onClick={() => exportToCSV<StaffMember | SalaryRecord>(tab === 'directory' ? staff : history, tab === 'directory' ? 'Staff_List' : `Payroll_${selectedMonth}_${selectedYear}`, tab === 'directory' ? {
              name: 'Name',
              designation: 'Designation',
              salary: 'Salary',
              joinedDate: 'Joined Date'
            } : {
              staffName: 'Employee',
              designation: 'Designation',
              month: 'Month',
              year: 'Year',
              amount: 'Paid Amount',
              paymentDate: 'Payment Date'
            })}
          >
            Export to Excel
          </button>
          <button
            className={`btn ${tab === 'payroll' ? 'btn-primary' : 'btn-secondary'}`}
            style={{padding: '0.5rem 1.5rem', border: 'none', boxShadow: 'none'}}
            onClick={() => setTab('payroll')}
          >
            Payroll
          </button>
          <button
            className={`btn ${tab === 'directory' ? 'btn-primary' : 'btn-secondary'}`}
            style={{padding: '0.5rem 1.5rem', border: 'none', boxShadow: 'none'}}
            onClick={() => setTab('directory')}
          >
            Staff Directory
          </button>
        </div>
      </div>

      {tab === 'directory' ? (
        <div className="glass-panel" style={{padding: '1.5rem'}}>
          <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem'}}>
            <h3>Active Staff List</h3>
            <button className="btn btn-primary" onClick={() => { setEditingId(null); setShowStaffModal(true); }}>+ Add Employee</button>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th style={{width: '60px'}}>Sr No</th>
                  <th>Name</th>
                  <th>Designation</th>
                  <th>Fixed Salary</th>
                  <th>Deduction / Off</th>
                  <th>Joined Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{textAlign: 'center', padding: '3rem'}}>Loading directory...</td></tr>
                ) : staff.length === 0 ? (
                  <tr><td colSpan={6} style={{textAlign: 'center', padding: '3rem', color: 'var(--text-muted)'}}>No employees registered yet.</td></tr>
                ) : (
                  staff.map((s, idx) => (
                    <tr key={s.id}>
                      <td style={{color: 'var(--text-muted)'}}>#{idx + 1}</td>
                      <td style={{fontWeight: 700}}>{s.name}</td>
                      <td><span className="badge badge-neutral" style={{background: '#f1f5f9'}}>{s.designation}</span></td>
                      <td style={{fontWeight: 600}}>Rs. {s.salary}</td>
                      <td><span style={{color: 'var(--danger)', fontSize: '0.85rem', fontWeight: 600}}>Rs. {s.deductionPerOff || 0} / off</span></td>
                      <td>{s.joinedDate ? new Date(s.joinedDate).toLocaleDateString() : 'N/A'}</td>
                      <td>
                        <div style={{display: 'flex', gap: '0.5rem'}}>
                          <button className="btn btn-secondary" style={{padding: '0.35rem 0.75rem', fontSize: '0.8rem'}} onClick={() => { setEditingId(s.id); setStaffData({name: s.name, designation: s.designation ?? '', salary: s.salary.toString(), deductionPerOff: (s.deductionPerOff || 0).toString()}); setShowStaffModal(true); }}>Edit</button>
                          <button className="btn btn-secondary" style={{padding: '0.35rem 0.75rem', fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'var(--danger)'}} onClick={() => handleDeleteStaff(s.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div>
          <div className="glass-panel" style={{padding: '1.5rem', marginBottom: '2rem', display: 'flex', gap: '1.5rem', alignItems: 'flex-end'}}>
            <div style={{flex: 1}}>
              <label className="form-label">Select Month</label>
              <select className="form-input" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
                {months.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div style={{flex: 1}}>
              <label className="form-label">Select Year</label>
              <select className="form-input" value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
                {yearOptions().map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div style={{flex: 1}}>
              <label className="form-label">Filter Status</label>
              <select className="form-input" value={payrollStatusFilter} onChange={e => setPayrollStatusFilter(e.target.value)}>
                <option value="all">All Staff</option>
                <option value="paid">PAID Only</option>
                <option value="pending">PENDING Only</option>
              </select>
            </div>
            <div style={{flex: 1, textAlign: 'right'}}>
              <div style={{color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600}}>Total Monthly Payroll</div>
              <div style={{fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)'}}>Rs. {history.reduce((a, b) => a + (parseFloat(String(b.amount)) || 0), 0)}</div>
            </div>
          </div>

          <div className="glass-panel" style={{padding: '1.5rem'}}>
             <table className="table">
                <thead>
                  <tr>
                    <th style={{width: '60px'}}>Sr No</th>
                    <th>Employee Name</th>
                    <th>Basic Salary</th>
                    <th>Deduction</th>
                    <th>Net Paid</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.length === 0 ? (
                    <tr><td colSpan={6} style={{textAlign: 'center', padding: '3rem'}}>Register staff first to process salaries.</td></tr>
                  ) : (
                    staff
                      .filter(s => {
                        if (payrollStatusFilter === 'all') return true;
                        const paid = isPaid(s.id);
                        return payrollStatusFilter === 'paid' ? paid : !paid;
                      })
                      .map((s, idx) => {
                        const paid = isPaid(s.id);
                        const paymentInfo = history.find(h => h.staffId?.toString() === s.id?.toString());
                        return (
                          <tr key={s.id}>
                            <td style={{color: 'var(--text-muted)'}}>#{idx + 1}</td>
                            <td style={{fontWeight: 600}}>{s.name} <div style={{fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400}}>{s.designation}</div></td>
                            <td>Rs. {s.salary}</td>
                            <td style={{color: 'var(--danger)'}}>{paymentInfo ? `Rs. ${paymentInfo.deduction || 0}` : '-'}</td>
                            <td style={{fontWeight: 700}}>{paymentInfo ? `Rs. ${paymentInfo.amount}` : '-'}</td>
                            <td>
                              <span className={`badge ${paid ? 'badge-success' : 'badge-warning'}`}>
                                {paid ? 'PAID' : 'PENDING'}
                              </span>
                            </td>
                            <td>
                              {paymentInfo ? (
                                <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem'}}>
                                  <div style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>
                                    {new Date(paymentInfo.paymentDate).toLocaleDateString()}
                                  </div>
                                  <button
                                    className="btn btn-secondary"
                                    style={{padding: '0.2rem 0.6rem', fontSize: '0.75rem'}}
                                    onClick={() => setSlip({ member: s, record: paymentInfo })}
                                  >
                                    Slip
                                  </button>
                                  <button
                                    className="btn btn-secondary"
                                    style={{padding: '0.2rem 0.6rem', fontSize: '0.75rem', color: 'var(--danger)', borderColor: 'var(--danger)'}}
                                    onClick={() => { setReversingId(paymentInfo.id); setShowReverseModal(true); }}
                                    title="Reverse Payment"
                                  >
                                    Reverse
                                  </button>
                                </div>
                              ) : (
                                <button
                                  className="btn btn-primary"
                                  style={{padding: '0.4rem 1rem', fontSize: '0.85rem'}}
                                  onClick={() => {
                                    setPayingStaff(s);
                                    setOffs('0');
                                    setCustomRate((s.deductionPerOff || 0).toString());
                                    setShowPayModal(true);
                                  }}
                                >
                                  Process Pay
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
             </table>
          </div>
        </div>
      )}

      {showStaffModal && (
        <div className="workspace-modal no-print" style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'}}>
          <div className="glass-panel" style={{width: '100%', maxWidth: '450px', padding: '2rem'}}>
            <h2 style={{marginBottom: '1.5rem'}}>{editingId ? 'Edit Employee' : 'Add New Employee'}</h2>
            <form onSubmit={handleSaveStaff}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input required className="form-input" value={staffData.name} onChange={e => setStaffData({...staffData, name: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Designation</label>
                <input required className="form-input" value={staffData.designation} onChange={e => setStaffData({...staffData, designation: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Monthly Fixed Salary (Rs.)</label>
                <input required type="number" className="form-input" value={staffData.salary} onChange={e => setStaffData({...staffData, salary: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Deduction per Off (Rs.)</label>
                <input required type="number" className="form-input" value={staffData.deductionPerOff} onChange={e => setStaffData({...staffData, deductionPerOff: e.target.value})} />
                <p style={{fontSize: '0.75rem', marginTop: '0.25rem'}}>Amount to subtract for each day of leave/off.</p>
              </div>
              <div style={{display: 'flex', gap: '1rem', marginTop: '2rem'}}>
                <button type="button" className="btn btn-secondary" style={{flex: 1}} onClick={() => setShowStaffModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{flex: 1}}>Save Employee</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Salary Process Modal */}
      {showPayModal && payingStaff && (
        <div className="workspace-modal no-print" style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'}}>
          <div className="glass-panel" style={{width: '100%', maxWidth: '400px', padding: '2rem'}}>
            <h2 style={{marginBottom: '0.5rem'}}>Process Payroll</h2>
            <p style={{marginBottom: '1.5rem', fontSize: '0.9rem'}}>Paying <strong>{payingStaff.name}</strong> for {selectedMonth} {selectedYear}.</p>

            <div style={{background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '1.5rem'}}>
               <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: '1rem'}}>
                 <span style={{color: 'var(--text-muted)'}}>Basic Salary:</span>
                 <span style={{fontWeight: 600}}>Rs. {payingStaff.salary}</span>
               </div>
               <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center'}}>
                 <span style={{color: 'var(--text-muted)'}}>Rate per Off (Rs.):</span>
                 <input
                   type="number"
                   className="form-input"
                   style={{width: '100px', padding: '0.35rem', textAlign: 'right', fontSize: '0.9rem'}}
                   value={customRate}
                   onChange={e => setCustomRate(e.target.value)}
                 />
               </div>
            </div>

            <div className="form-group">
              <label className="form-label">Number of Offs / Leaves</label>
              <input
                type="number"
                className="form-input"
                autoFocus
                value={offs}
                onChange={e => setOffs(e.target.value)}
              />
            </div>

            <div style={{marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px dashed var(--border)'}}>
               <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: '1rem'}}>
                 <span style={{fontWeight: 600}}>Total Deduction:</span>
                 <span style={{color: 'var(--danger)', fontWeight: 700}}>- Rs. {parseFloat(offs || '0') * parseFloat(customRate || '0')}</span>
               </div>
               <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center'}}>
                 <span style={{fontWeight: 700, fontSize: '1.1rem'}}>Net Payable:</span>
                 <span style={{color: 'var(--primary)', fontWeight: 800, fontSize: '1.3rem'}}>Rs. {payingStaff.salary - (parseFloat(offs || '0') * parseFloat(customRate || '0'))}</span>
               </div>
            </div>

            <div style={{display: 'flex', gap: '1rem', marginTop: '2rem'}}>
              <button className="btn btn-secondary" style={{flex: 1}} onClick={() => setShowPayModal(false)}>Cancel</button>
              <button className="btn btn-primary" style={{flex: 1}} disabled={isProcessing} onClick={handleConfirmPayment}>
                {isProcessing ? 'Paying...' : 'Confirm Pay'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reverse Confirmation Modal */}
      {showReverseModal && (
        <div className="workspace-modal no-print" style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'}}>
          <div className="glass-panel" style={{width: '100%', maxWidth: '380px', padding: '2rem', border: '1px solid var(--danger)'}}>
            <h3 style={{color: 'var(--danger)', marginBottom: '1rem'}}>Reverse Payment?</h3>
            <p style={{marginBottom: '2rem', fontSize: '0.9rem'}}>
              This will remove the salary record and <strong>automatically delete</strong> the entry from your Expense reports.
            </p>
            <div style={{display: 'flex', gap: '1rem'}}>
              <button className="btn btn-secondary" style={{flex: 1}} onClick={() => setShowReverseModal(false)}>Cancel</button>
              <button className="btn btn-primary" style={{flex: 1, background: 'var(--danger)'}} disabled={isProcessing} onClick={handleReversePayment}>
                {isProcessing ? 'Reversing...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

    {slip && (
      <div className="slip-overlay" style={{position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'}}>
        <div style={{background: 'white', color: '#0f172a', width: '100%', maxWidth: '560px', padding: '2rem', borderRadius: '12px'}}>
          <div style={{textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '0.75rem', marginBottom: '1.25rem'}}>
            <div style={{fontSize: '1.4rem', fontWeight: 900}}>{settings.schoolName || 'School'}</div>
            <div style={{fontWeight: 700, letterSpacing: '0.1em'}}>SALARY SLIP: {(slip.record.month || '').toUpperCase()} {slip.record.year}</div>
          </div>
          <table style={{width: '100%', borderCollapse: 'collapse', marginBottom: '1.25rem'}}>
            <tbody>
              {[
                ['Employee', slip.record.staffName || slip.member.name],
                ['Designation', slip.member.designation || '-'],
                ['Gross salary', rupees((slip.record.amount || 0) + (slip.record.deduction || 0))],
                ['Days off', String(slip.record.offs || 0)],
                ['Deduction', `- ${rupees(slip.record.deduction || 0)}`],
                ['Net paid', rupees(slip.record.amount || 0)],
                ['Paid on', slip.record.paymentDate || slip.record.date ? new Date(slip.record.paymentDate || slip.record.date || '').toLocaleDateString('en-GB') : '-'],
                ['Reference', `#${slip.record.id}`],
              ].map(([label, value]) => (
                <tr key={label} style={{borderBottom: '1px solid #e2e8f0', fontWeight: label === 'Net paid' ? 800 : 400}}>
                  <td style={{padding: '0.5rem 0', color: '#475569'}}>{label}</td>
                  <td style={{padding: '0.5rem 0', textAlign: 'right'}}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: '3rem', fontSize: '0.85rem'}}>
            <div style={{borderTop: '1px solid #0f172a', paddingTop: '0.3rem', width: '40%', textAlign: 'center'}}>Received by (employee)</div>
            <div style={{borderTop: '1px solid #0f172a', paddingTop: '0.3rem', width: '40%', textAlign: 'center'}}>Principal / Accountant</div>
          </div>
          <div className="no-print" style={{display: 'flex', gap: '0.75rem', marginTop: '2rem'}}>
            <button className="btn btn-secondary" style={{flex: 1}} onClick={() => setSlip(null)}>Close</button>
            <button className="btn btn-primary" style={{flex: 1}} onClick={() => window.print()}>Print Slip</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
