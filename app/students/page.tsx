"use client";
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { exportToCSV } from '@/lib/exportUtils';
import { TEMPLATE_HEADINGS, parseCsv, readStudentRows, toCsv } from '@/lib/csv';
import { chargesTotal, isLeft } from '@/lib/fees';
import ChargesEditor, { fromDrafts, toDrafts, type ChargeDraft } from '../components/ChargesEditor';
import { useFeatures } from '@/lib/useFeatures';
import type { RecordId, SchoolClass, Student } from '@/lib/types';

type StudentRow = Student & { className?: string };

interface ImportProblem {
  row: number;
  message: string;
}

const EMPTY_FORM = { name: '', fatherName: '', parentPhone: '', admissionNumber: '', classId: '', monthlyFee: '', discount: '', annualCharges: '0', status: 'Active' };

/** A ready-to-fill spreadsheet with the columns the import understands. */
function downloadTemplate() {
  const csv = toCsv([TEMPLATE_HEADINGS, ['Ali Khan', 'Imran Khan', '', '', '5th', 'A', '3000', '0', '5000']]);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  link.download = 'students_template.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

async function fetchClassList(): Promise<SchoolClass[]> {
  const res = await fetch('/api/classes');
  const data = await res.json();
  if (data?.error) console.error("API Error:", data.error);
  return Array.isArray(data) ? data : [];
}

export default function StudentsDirectory() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editVersion, setEditVersion] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<RecordId | null>(null);
  const [selectedClassId, setSelectedClassId] = useState('all');
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [monthlyCharges, setMonthlyCharges] = useState<ChargeDraft[]>([]);
  const { has } = useFeatures();
  const [importProblems, setImportProblems] = useState<ImportProblem[] | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchClassList().then(setClasses).catch(() => console.error("Failed to fetch classes"));
  }, []);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const classQuery = selectedClassId !== 'all' ? `&classId=${selectedClassId}` : '';
      const res = await fetch(`/api/students?page=${page}&limit=20&search=${encodeURIComponent(search)}${classQuery}&status=${statusFilter}`, { cache: 'no-store' });
      const data = await res.json();
      setStudents(Array.isArray(data.students) ? data.students : []);
      if (data.error) console.error("API Error:", data.error);
      setTotalPages(data.totalPages || 1);
      setTotalRecords(data.total || 0);
    } catch {
      alert("Failed to fetch students");
    } finally {
      setLoading(false);
    }
  }, [search, page, selectedClassId, statusFilter]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchStudents();
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [fetchStudents]);

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: formData.name,
      fatherName: formData.fatherName,
      parentPhone: formData.parentPhone,
      classId: formData.classId,
      monthlyFee: parseFloat(formData.monthlyFee || '0'),
      discount: parseFloat(formData.discount || '0'),
      // Not sent when Extra Charges is switched off, so the stored ones stay as they are.
      monthlyCharges: has('charges') ? fromDrafts(monthlyCharges) : undefined,
      annualCharges: parseFloat(formData.annualCharges || '0'),
      paidAnnualCharges: editingId ? undefined : 0, // only init for new
      status: formData.status,
      ...(editingId ? { id: editingId, expectedUpdatedAt: editVersion } : {})
    };

    const res = await fetch('/api/students', {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      setShowModal(false);
      setEditingId(null);
      setFormData(EMPTY_FORM);
      setMonthlyCharges([]);
      fetchStudents();
    } else {
      alert((await res.json().catch(() => null))?.error || "Failed to save.");
    }
  };

  const handleEditClick = (student: StudentRow) => {
    setEditingId(student.id);
    setEditVersion(student.updatedAt ?? null);
    setFormData({
      name: student.name || '',
      fatherName: student.fatherName || '',
      parentPhone: student.parentPhone || '',
      admissionNumber: student.admissionNumber || '',
      classId: student.classId || '',
      monthlyFee: (student.monthlyFee || 0).toString(),
      discount: (student.discount || 0).toString(),
      annualCharges: (student.annualCharges || 0).toString(),
      status: isLeft(student) ? 'Left' : 'Active'
    });
    setMonthlyCharges(toDrafts(student.monthlyCharges));
    setShowModal(true);
  };

  /** Reads an Excel CSV, checks it on the server, and adds every student only if all rows are fine. */
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const { rows, missing } = readStudentRows(parseCsv(await file.text()));
    if (missing.length > 0) {
      alert(`The file needs these columns: ${missing.join(', ')}. Download the template to see the expected layout.`);
      return;
    }
    if (rows.length === 0) {
      alert('The file has no student rows.');
      return;
    }
    setImporting(true);
    try {
      const res = await fetch('/api/students/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows })
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        alert(`${data.created} student(s) imported.`);
        fetchStudents();
      } else if (data?.errors) {
        setImportProblems(data.errors);
      } else {
        alert(data?.error || 'Import failed.');
      }
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteStudent = async (id: RecordId) => {
    if (!confirm("Are you sure you want to delete this student?")) return;
    const res = await fetch(`/api/students?id=${id}`, { method: 'DELETE' });
    if (res.ok) fetchStudents();
  };



  return (
    <div style={{animation: 'fadeIn 0.5s ease-out'}}>
      <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem'}}>
        <div>
          <h1>Global Student Directory</h1>
          <p>Showing {students.length} of {totalRecords} total records across all classes</p>
        </div>
        <div className="workspace-actions">
          <button
            className="btn btn-secondary"
            onClick={() => exportToCSV(students, 'All_Students', {
              id: 'ID',
              admissionNumber: 'Admission No',
              name: 'Name',
              rollNumber: 'Roll No',
              classId: 'Class ID',
              monthlyFee: 'Monthly Fee',
              discount: 'Discount',
              annualCharges: 'AC Total',
              paidAnnualCharges: 'AC Paid',
              status: 'Status'
            })}
          >
            Export to Excel
          </button>
          {has('importStudents') && (
            <>
              <button className="btn btn-secondary" onClick={downloadTemplate}>Template</button>
              <button className="btn btn-secondary" disabled={importing} onClick={() => fileInput.current?.click()}>
                {importing ? 'Importing...' : 'Import from Excel (CSV)'}
              </button>
            </>
          )}
          <input ref={fileInput} type="file" accept=".csv,text/csv" style={{display: 'none'}} onChange={handleImportFile} />
          <button onClick={() => { setEditingId(null); setFormData(EMPTY_FORM); setMonthlyCharges([]); setShowModal(true); }} className="btn btn-primary">+ Add Student Globally</button>
        </div>
      </div>

      <div className="glass-panel workspace-student-filters">
        <input
          type="text"
          className="form-input"
          placeholder="Search by name, father name, or class..."
          style={{flex: 2}}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <select
          className="form-input"
          style={{flex: 1}}
          value={selectedClassId}
          onChange={(e) => { setSelectedClassId(e.target.value); setPage(1); }}
        >
          <option value="all">All Classes</option>
          {classes.map(c => (
            <option key={c.id} value={c.id}>{c.name} {c.section ? `- ${c.section}` : ''}</option>
          ))}
        </select>
        <select
          className="form-input"
          style={{flex: 1}}
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="all">All Students</option>
          <option value="active">Currently Enrolled</option>
          <option value="left">Left the School</option>
        </select>
      </div>

      <div className="glass-panel table-container">
        <table className="table">
          <thead>
            <tr>
              <th style={{width: '80px'}}>Sr No</th>
              <th>Adm No</th>
              <th>Roll No</th>
              <th>Student & Father Name</th>
              <th>Class</th>
              <th>Base Fee</th>
              <th>Discount Applied</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{padding: '3rem', textAlign: 'center'}}>Loading data...</td></tr>
            ) : students.length === 0 ? (
              <tr><td colSpan={9} style={{padding: '3rem', textAlign: 'center'}}>No students found.</td></tr>
            ) : (
              students.map((s, idx) => (
                <tr key={s.id}>
                  <td style={{color: 'var(--text-muted)'}}>#{(page - 1) * 20 + idx + 1}</td>
                  <td style={{fontWeight: 700}}>{s.admissionNumber || 'N/A'}</td>
                  <td>{s.rollNumber ?? '-'}</td>
                  <td>
                    <div style={{fontWeight: 600}}>{s.name}</div>
                    <div style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>S/O: {s.fatherName || 'N/A'}{s.parentPhone ? ` · ${s.parentPhone}` : ''}</div>
                  </td>
                  <td>{s.className?.toString().includes('Class') ? s.className : `Class ${s.className || s.classId}`}</td>
                  <td>
                    Rs. {s.monthlyFee || 0}
                    {chargesTotal(s.monthlyCharges) > 0 && (
                      <div style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>+ {(s.monthlyCharges ?? []).map((c) => `${c.label} ${c.amount}`).join(', ')}</div>
                    )}
                  </td>
                  <td>{(s.discount ?? 0) > 0 ? <span className="badge badge-warning">- Rs. {s.discount}</span> : 'None'}</td>
                  <td><span className={`badge ${isLeft(s) ? 'badge-neutral' : 'badge-success'}`}>{s.status || 'Active'}</span></td>
                  <td>
                    <div style={{display: 'flex', gap: '0.5rem'}}>
                      {has('studentLedger') && <Link href={`/ledger/${s.id}`} className="btn btn-secondary" style={{padding: '0.4rem 0.8rem', fontSize: '0.8rem'}}>Ledger</Link>}
                      <button className="btn btn-secondary" style={{padding: '0.4rem 0.8rem', fontSize: '0.8rem'}} onClick={() => handleEditClick(s)}>Modify</button>
                      <button className="btn" style={{padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: '#e11d48', color: 'white', border: 'none'}} onClick={() => handleDeleteStudent(s.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem'}}>
          <button className="btn btn-secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
          <span style={{alignSelf: 'center'}}>Page {page} of {totalPages}</span>
          <button className="btn btn-secondary" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}

      {showModal && (
        <div className="workspace-modal no-print" style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'}}>
          <div className="glass-panel" style={{width: '100%', maxWidth: '500px', padding: '2rem', maxHeight: '92vh', overflowY: 'auto'}}>
            <h2 style={{marginBottom: '1.5rem'}}>{editingId ? 'Modify Student Record' : 'Register Student'}</h2>
            <form onSubmit={handleSaveStudent}>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem'}}>
                <div className="form-group">
                  <label className="form-label">Admission Number</label>
                  <input className="form-input" value={formData.admissionNumber || "Assigned on save"} readOnly />
                </div>
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input required className="form-input" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                </div>
              </div>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem'}}>
                <div>
                  <label className="form-label">Father&apos;s Name</label>
                  <input required className="form-input" value={formData.fatherName} onChange={e => setFormData({...formData, fatherName: e.target.value})} />
                  <label className="form-label" style={{marginTop: '0.75rem'}}>Parent Phone (WhatsApp)</label>
                  <input className="form-input" placeholder="0300-1234567" type="tel" value={formData.parentPhone} onChange={e => setFormData({...formData, parentPhone: e.target.value})} />
                </div>
                <div>
                  <label className="form-label">Assign Class</label>
                  <select required className="form-input" value={formData.classId} onChange={e => setFormData({...formData, classId: e.target.value})}>
                    <option value="">-- Select a Class --</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name} {c.section ? `- ${c.section}` : ''}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem'}}>
                <div className="form-group">
                  <label className="form-label">Monthly Fixed Fee (Rs.)</label>
                  <input required type="number" className="form-input" value={formData.monthlyFee} onChange={e => setFormData({...formData, monthlyFee: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Discount / Scholarship (Rs.)</label>
                  <input type="number" className="form-input" placeholder="0" value={formData.discount} onChange={e => setFormData({...formData, discount: e.target.value})} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Annual Charges (Total for Year)</label>
                <input type="number" className="form-input" placeholder="Admission, Registration, etc." value={formData.annualCharges} onChange={e => setFormData({...formData, annualCharges: e.target.value})} />
              </div>
              {has('charges') && <div className="form-group">
                <label className="form-label">Monthly Extra Charges (e.g. Transport)</label>
                <ChargesEditor value={monthlyCharges} onChange={setMonthlyCharges} />
                <p style={{fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.4rem'}}>
                  Billed every month on top of the fee. Changes also update this student&apos;s unpaid vouchers.
                </p>
              </div>}
              {editingId && (
                <div className="form-group">
                  <label className="form-label">Enrolment</label>
                  <select className="form-input" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                    <option value="Active">Currently enrolled</option>
                    <option value="Left">Left the school (stop monthly vouchers)</option>
                  </select>
                </div>
              )}
              <div style={{display: 'flex', gap: '1rem', marginTop: '2rem'}}>
                <button type="button" className="btn btn-secondary" style={{flex: 1}} onClick={() => { setShowModal(false); setEditingId(null); }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{flex: 1}}>{editingId ? 'Update Record' : 'Save Record'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {importProblems && (
        <div className="workspace-modal no-print" style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'}}>
          <div className="glass-panel" style={{width: '100%', maxWidth: '560px', padding: '2rem', maxHeight: '80vh', overflowY: 'auto'}}>
            <h2 style={{marginBottom: '0.5rem'}}>Nothing was imported</h2>
            <p style={{marginBottom: '1.25rem'}}>Fix these rows in the file and import it again. Row numbers match the spreadsheet.</p>
            <ul style={{paddingLeft: '1.25rem', marginBottom: '1.5rem'}}>
              {importProblems.slice(0, 50).map((p, i) => (
                <li key={i} style={{marginBottom: '0.35rem'}}><strong>Row {p.row}:</strong> {p.message}</li>
              ))}
            </ul>
            {importProblems.length > 50 && <p style={{marginBottom: '1rem'}}>...and {importProblems.length - 50} more.</p>}
            <button className="btn btn-primary" style={{width: '100%'}} onClick={() => setImportProblems(null)}>OK</button>
          </div>
        </div>
      )}

    </div>
  );
}
