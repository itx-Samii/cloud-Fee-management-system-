"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export default function ClassesHub() {
  const [classes, setClasses] = useState<any[]>([]);
  const [showClassModal, setShowClassModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [classForm, setClassForm] = useState({ name: '', section: '' });

  const fetchClasses = async () => {
    try {
      const res = await fetch('/api/classes');
      const data = await res.json();
      setClasses(data || []);
    } catch {
      console.error("Failed to fetch classes");
    }
  };

  useEffect(() => {
    fetchClasses();
  }, []);

  const handleEditClick = (c: any) => {
    setEditingId(c.id);
    setClassForm({ name: c.name, section: c.section || '' });
    setShowClassModal(true);
  };

  const handleDeleteClass = async (id: number) => {
    if (!confirm("Are you sure you want to delete this class? All references will fallback to raw IDs.")) return;
    const res = await fetch(`/api/classes?id=${id}`, { method: 'DELETE' });
    if (res.ok) fetchClasses();
  };

  return (
    <div style={{animation: 'fadeIn 0.5s ease-out'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem'}}>
        <div>
          <h1>Classes Management</h1>
          <p>Organize students into classes and sections.</p>
        </div>
        <button onClick={() => { setEditingId(null); setClassForm({name:'', section:''}); setShowClassModal(true); }} className="btn btn-primary">+ Create New Class</button>
      </div>

      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem'}}>
        {classes.length === 0 ? (
          <div className="glass-panel" style={{gridColumn: '1 / -1', padding: '3rem', textAlign: 'center'}}>
            <p style={{color: 'var(--text-muted)'}}>No classes have been created yet.</p>
          </div>
        ) : (
          classes.map(c => (
            <div key={c.id} className="glass-panel" style={{padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                <div>
                  <h2 style={{margin: 0, fontSize: '1.4rem'}}>{c.name}</h2>
                  {c.section && <span className="badge badge-success" style={{marginTop: '0.5rem', display: 'inline-block'}}>{c.section}</span>}
                </div>
                <button className="btn btn-secondary" style={{padding: '0.3rem 0.6rem', fontSize: '0.75rem'}} onClick={() => handleEditClick(c)}>Edit</button>
              </div>
              <div style={{color: 'var(--text-muted)', fontSize: '0.9rem', flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem'}}>
                <span>Created: {new Date(c.createdAt).toLocaleDateString()}</span>
                <span style={{color: 'var(--text-main)', fontWeight: 600}}>Total Students: {c.studentCount || 0}</span>
              </div>
              <div style={{display: 'flex', gap: '0.5rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)'}}>
                <Link href={`/classes/${c.id}`} className="btn btn-secondary" style={{flex: 1, textAlign: 'center', textDecoration: 'none'}}>View Students</Link>
                <button onClick={() => handleDeleteClass(c.id)} className="btn" style={{background: '#e11d48', color: 'white', border: 'none', padding: '0 1rem'}}>Delete</button>
              </div>
            </div>
          ))
        )}
      </div>

      {showClassModal && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'}}>
          <div className="glass-panel" style={{width: '100%', maxWidth: '500px', padding: '2rem'}}>
            <h2 style={{marginBottom: '1.5rem'}}>{editingId ? 'Edit Class' : 'Create New Class'}</h2>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const res = await fetch('/api/classes', {
                method: editingId ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editingId ? { ...classForm, id: editingId } : classForm)
              });
              if(res.ok) {
                setShowClassModal(false);
                setEditingId(null);
                setClassForm({name:'', section:''});
                fetchClasses();
              } else {
                alert((await res.json()).error);
              }
            }}>
              <div className="form-group">
                <label className="form-label">Class Full Name (e.g., Class 10)</label>
                <input required className="form-input" value={classForm.name} onChange={e => setClassForm({...classForm, name: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Section (Optional, e.g., A, B, Blue)</label>
                <input className="form-input" value={classForm.section} onChange={e => setClassForm({...classForm, section: e.target.value})} />
              </div>
              
              <div style={{display: 'flex', gap: '1rem', marginTop: '2rem'}}>
                <button type="button" className="btn btn-secondary" style={{flex: 1}} onClick={() => { setShowClassModal(false); setEditingId(null); }}>Close</button>
                <button type="submit" className="btn btn-primary" style={{flex: 1}}>{editingId ? 'Update' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
