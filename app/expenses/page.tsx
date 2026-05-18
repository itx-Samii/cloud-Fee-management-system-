"use client";
import React, { useState, useEffect } from 'react';

export default function ExpenseManager() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [salaries, setSalaries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({ category: 'Salary', amount: '', description: '' });
  
  // Filtering states
  const [monthFilter, setMonthFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');

  const now = new Date();
  const currentMonthNum = now.getMonth();
  const currentYearNum = now.getFullYear();

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const [expRes, salRes] = await Promise.all([
        fetch('/api/expenses'),
        fetch('/api/salaries')
      ]);
      const expData = await expRes.json();
      const salData = await salRes.json();
      setExpenses(Array.isArray(expData) ? expData : []);
      setSalaries(Array.isArray(salData) ? salData : []);
    } catch (e) {
      console.error("Failed to fetch spending data", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...formData, amount: parseFloat(formData.amount) || 0, date: new Date().toISOString() };
    await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    setFormData({ category: 'Salary', amount: '', description: '' });
    fetchExpenses();
  };

  const handleDelete = async (id: any) => {
    if (!confirm("Are you sure you want to delete this expense record?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/expenses?id=${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error("Delete failed");
      await fetchExpenses();
    } catch (err) {
      alert("Failed to delete the record. Please try again.");
      setLoading(false);
    }
  };

  const allSpendingItems = [
    // Include manual expenses BUT ignore those with category 'Salary' to avoid table duplicates
    ...expenses.filter(e => e.category?.toLowerCase() !== 'salary').map(e => ({ ...e, type: 'manual', date: e.date || new Date().toISOString() })),
    ...salaries.map(s => ({ 
      id: `sal-${s.id}`, 
      date: s.paymentDate || s.date || new Date().toISOString(), 
      category: '💰 Salary (Auto)', 
      description: `Payroll: ${s.staffName} (${s.month})`, 
      amount: s.amount,
      type: 'auto' 
    }))
  ];

  const filteredItems = allSpendingItems.filter(e => {
    const d = new Date(e.date || new Date());
    const mMatch = monthFilter === 'all' || d.getMonth() === parseInt(monthFilter);
    const yMatch = yearFilter === 'all' || d.getFullYear() === parseInt(yearFilter);
    return mMatch && yMatch;
  });

  const displayItems = filteredItems.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  // Calculate total: Sum of currently filtered items
  const filteredTotal = filteredItems.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
  
  // By default (when no filters), show current month's total for the "Monthly Spending" box
  const currentMonthTotal = allSpendingItems.filter(e => {
    const d = new Date(e.date || new Date());
    return d.getMonth() === currentMonthNum && d.getFullYear() === currentYearNum;
  }).reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

  const displayTotal = (monthFilter === 'all' && yearFilter === 'all') ? currentMonthTotal : filteredTotal;

  const totalExpense = allSpendingItems.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

  const categories = ['Salary', 'Electricity Bill', 'Internet', 'Maintenance & Repairs', 'Stationery', 'Petrol/Fuel', 'Other'];

  return (
    <div style={{animation: 'fadeIn 0.5s ease-out'}}>
      <h1 className="no-print">School Expense Manager</h1>
      <p className="no-print" style={{marginBottom: '2rem'}}>Log and track daily operational costs, salaries, and utility bills.</p>

      <div style={{display: 'flex', gap: '2rem', alignItems: 'flex-start'}}>
        
        {/* Left Side: Create Form */}
        <div className="glass-panel no-print" style={{padding: '2rem', flex: '1', maxWidth: '400px'}}>
          <h3 style={{marginBottom: '1.5rem', color: 'var(--primary)'}}>Add New Expense</h3>
          <form onSubmit={handleAdd}>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select className="form-input" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Amount (Rs.)</label>
              <input required type="number" className="form-input" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Short Description</label>
              <input required type="text" className="form-input" placeholder="e.g. Month of April Bill" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
            </div>
            <button type="submit" className="btn btn-primary" style={{width: '100%', marginTop: '1rem'}}>Record Expense</button>
          </form>
        </div>

        {/* Right Side: Expense List & Total */}
        <div style={{flex: '2'}}>
          
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem'}}>
            <div className="glass-panel" style={{padding: '1.5rem', background: 'var(--bg-card)', borderLeft: '4px solid var(--danger)', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
              <span style={{color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em'}}>
                {(monthFilter === 'all' && yearFilter === 'all') ? 'Current Month Spending' : 'Selected Period Spending'}
              </span>
              <div style={{display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.5rem'}}>
                 <span style={{fontSize: '1.8rem', fontWeight: 800, color: 'var(--danger)'}}>Rs. {displayTotal}</span>
              </div>
            </div>
            <div className="glass-panel" style={{padding: '1.5rem', background: 'var(--bg-card)', borderLeft: '4px solid var(--primary)', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
              <span style={{color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em'}}>Lifetime Expenditure</span>
              <h3 style={{fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '0.5rem'}}>Rs. {totalExpense}</h3>
            </div>
          </div>

          {/* New Professional Filter Bar */}
          <div className="glass-panel no-print" style={{padding: '1.5rem', marginBottom: '2rem'}}>
             <div style={{display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1.5rem'}}>
                <div style={{flex: '1', minWidth: '140px'}}>
                   <label className="form-label" style={{fontSize: '0.75rem', marginBottom: '0.5rem'}}>AUDIT MONTH</label>
                   <select className="form-input" style={{padding: '0.5rem 0.8rem'}} value={monthFilter} onChange={e => setMonthFilter(e.target.value)}>
                     <option value="all">Full Year</option>
                     {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => (
                       <option key={m} value={i}>{m}</option>
                     ))}
                   </select>
                </div>
                <div style={{flex: '1', minWidth: '120px'}}>
                   <label className="form-label" style={{fontSize: '0.75rem', marginBottom: '0.5rem'}}>AUDIT YEAR</label>
                   <select className="form-input" style={{padding: '0.5rem 0.8rem'}} value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
                     <option value="all">All Records</option>
                     {["2025", "2026", "2027"].map(y => <option key={y} value={y}>{y}</option>)}
                   </select>
                </div>
                {(monthFilter !== 'all' || yearFilter !== 'all') && (
                  <button 
                    onClick={() => {setMonthFilter('all'); setYearFilter('all');}} 
                    className="btn btn-secondary"
                    style={{padding: '0.5rem 1rem', fontSize: '0.85rem', height: '40px'}}
                  >
                    Reset View
                  </button>
                )}
             </div>
          </div>
          
          <div className="glass-panel table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th className="no-print">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} style={{textAlign: 'center', padding: '2rem'}}>Loading ledger...</td></tr>
                ) : displayItems.length === 0 ? (
                  <tr><td colSpan={5} style={{textAlign: 'center', padding: '2rem', color: 'var(--text-muted)'}}>No expenses match your filters.</td></tr>
                ) : (
                  displayItems.map((e: any, idx: number) => (
                    <tr key={`exp_${e.id}_${idx}`} style={{background: e.type === 'auto' ? 'rgba(79, 70, 229, 0.05)' : 'transparent'}}>
                      <td style={{color: 'var(--text-muted)', fontSize: '0.85rem'}}>{new Date(e.date || new Date()).toLocaleDateString('en-GB')}</td>
                      <td><span className={`badge ${e.type === 'auto' ? 'badge-success' : 'badge-neutral'}`}>{e.category}</span></td>
                      <td>{e.description}</td>
                      <td style={{fontWeight: 700}}>Rs. {e.amount}</td>
                      <td className="no-print">
                        {e.type === 'manual' ? (
                          <button onClick={() => handleDelete(e.id)} className="btn btn-danger" style={{padding: '0.2rem 0.5rem', fontSize: '0.8rem'}}>Del</button>
                        ) : (
                          <span style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>🔒 Linked</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
