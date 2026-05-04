"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function ClassDetails() {
  const params = useParams();
  const classId = params.classId as string;

  const [students, setStudents] = useState<any[]>([]);
  const [classInfo, setClassInfo] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ name: '', fatherName: '', admissionNumber: '', monthlyFee: '', discount: '', annualCharges: '0' });

  const fetchClassDetails = async () => {
    try {
      const res = await fetch('/api/classes');
      const data = await res.json();
      const current = data.find((c: any) => c.id.toString() === classId);
      setClassInfo(current || { name: `Class ${classId}`, section: '' });
    } catch {
      console.error("Failed to load class specifics");
    }
  };

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/students?page=${page}&limit=20&search=${search}&classId=${classId}`);
      const data = await res.json();
      setStudents(data.data || []);
      setTotalPages(data.totalPages || 1);
    } catch {
      alert("Failed to fetch students");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClassDetails();
  }, [classId]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchStudents();
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [search, page, classId]);

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: formData.name,
      fatherName: formData.fatherName,
      admissionNumber: formData.admissionNumber || undefined,
      classId: classId,
      monthlyFee: parseFloat(formData.monthlyFee || '0'),
      discount: parseFloat(formData.discount || '0'),
      annualCharges: parseFloat(formData.annualCharges || '0'),
      paidAnnualCharges: editingId ? undefined : 0,
      status: 'Active',
      ...(editingId ? { id: editingId } : {})
    };

    const res = await fetch('/api/students', {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      setShowModal(false);
      setEditingId(null);
      setFormData({ name: '', fatherName: '', admissionNumber: '', monthlyFee: '', discount: '', annualCharges: '0' });
      fetchStudents();
    } else {
      alert("Failed to save.");
    }
  };

  const handleEditClick = (student: any) => {
    setEditingId(student.id);
    setFormData({
      name: student.name || '',
      fatherName: student.fatherName || '',
      admissionNumber: student.admissionNumber || '',
      monthlyFee: (student.monthlyFee || 0).toString(),
      discount: (student.discount || 0).toString(),
      annualCharges: (student.annualCharges || 0).toString()
    });
    setShowModal(true);
  };

  const handleDeleteStudent = async (id: number) => {
    if (!confirm("Are you sure you want to delete this student?")) return;
    const res = await fetch(`/api/students?id=${id}`, { method: 'DELETE' });
    if (res.ok) fetchStudents();
  };

  return (
    <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
      <div style={{ marginBottom: '1rem' }}>
        <Link href="/classes" style={{ color: 'var(--primary)', textDecoration: 'none' }}>← Back to Classes</Link>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1>{classInfo ? `${classInfo.name} ${classInfo.section ? ` - ${classInfo.section}` : ''}` : 'Loading...'}</h1>
          <p>Manage {students.length} students assigned to this class.</p>
        </div>
        <button onClick={() => { setEditingId(null); setFormData({ name: '', fatherName: '', admissionNumber: '', monthlyFee: '', discount: '', annualCharges: '0' }); setShowModal(true); }} className="btn btn-primary">+ Register Student</button>
      </div>

      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <input
          type="text"
          className="form-input"
          placeholder="Search within this class..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      <div className="glass-panel table-container">
        <table className="table">
          <thead>
            <tr>
              <th style={{width: '80px'}}>Sr No</th>
              <th>Adm No</th>
              <th>Student & Father Name</th>
              <th>Base Fee</th>
              <th>Discount Applied</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: '3rem', textAlign: 'center' }}>Loading data...</td></tr>
            ) : students.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: '3rem', textAlign: 'center' }}>No students found in this class.</td></tr>
            ) : (
              students.map((s, idx) => (
                <tr key={s.id}>
                  <td style={{ color: 'var(--text-muted)' }}>#{(page - 1) * 20 + idx + 1}</td>
                  <td style={{ fontWeight: 700 }}>{s.admissionNumber || 'N/A'}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{s.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>S/O: {s.fatherName || 'N/A'}</div>
                  </td>
                  <td>Rs. {s.monthlyFee || 0}</td>
                  <td>{s.discount > 0 ? <span className="badge badge-warning">- Rs. {s.discount}</span> : 'None'}</td>
                  <td><span className="badge badge-success">{s.status}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => handleEditClick(s)}>Modify</button>
                      <button className="btn" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: '#e11d48', color: 'white', border: 'none' }} onClick={() => handleDeleteStudent(s.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem' }}>
          <button className="btn btn-secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
          <span style={{ alignSelf: 'center' }}>Page {page} of {totalPages}</span>
          <button className="btn btn-secondary" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', padding: '2rem' }}>
            <h2 style={{ marginBottom: '1.5rem' }}>{editingId ? 'Modify Student' : `Register to ${classInfo?.name}`}</h2>
            <form onSubmit={handleSaveStudent}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input required className="form-input" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label">Father's Name</label>
                <input required className="form-input" value={formData.fatherName} onChange={e => setFormData({ ...formData, fatherName: e.target.value })} />
              </div>
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label">Admission Number</label>
                <input className="form-input" placeholder="e.g. ADM-001" value={formData.admissionNumber} onChange={e => setFormData({ ...formData, admissionNumber: e.target.value })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                <div className="form-group">
                  <label className="form-label">Monthly Fixed Fee (Rs.)</label>
                  <input required type="number" className="form-input" value={formData.monthlyFee} onChange={e => setFormData({ ...formData, monthlyFee: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Discount (Rs.)</label>
                  <input type="number" className="form-input" placeholder="0" value={formData.discount} onChange={e => setFormData({ ...formData, discount: e.target.value })} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Annual Charges (Total for Year)</label>
                <input type="number" className="form-input" placeholder="Admission, Registration, etc." value={formData.annualCharges} onChange={e => setFormData({ ...formData, annualCharges: e.target.value })} />
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setShowModal(false); setEditingId(null); }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>{editingId ? 'Update Record' : 'Save Record'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
