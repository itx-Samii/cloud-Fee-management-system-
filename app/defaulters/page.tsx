"use client";
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { exportToCSV } from '@/lib/exportUtils';
import { useFeeSettings } from '@/lib/useFeeSettings';
import { useFeatures } from '@/lib/useFeatures';
import { reminderMessage, whatsappLink } from '@/lib/whatsapp';
import type { Defaulter, SchoolClass } from '@/lib/types';

const rupees = (amount: number) => `Rs. ${amount.toLocaleString('en-US')}`;

async function fetchDefaulters(classId: string, minMonths: string): Promise<Defaulter[]> {
  const res = await fetch(`/api/defaulters?classId=${encodeURIComponent(classId)}&minMonths=${minMonths}`, { cache: 'no-store' });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Failed to load the defaulter list');
  return data;
}

async function fetchClassList(): Promise<SchoolClass[]> {
  const res = await fetch('/api/classes');
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export default function DefaulterList() {
  const [classId, setClassId] = useState('all');
  const [minMonths, setMinMonths] = useState('1');
  const [search, setSearch] = useState('');
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [rows, setRows] = useState<Defaulter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { settings } = useFeeSettings();
  const { has } = useFeatures();
  const schoolName = settings.schoolName || 'the school';

  useEffect(() => {
    fetchClassList().then(setClasses).catch(() => {});
  }, []);

  const loadRows = useCallback(
    () =>
      fetchDefaulters(classId, minMonths)
        .then((list) => {
          setRows(list);
          setError('');
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setLoading(false)),
    [classId, minMonths]
  );

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const needle = search.trim().toLowerCase();
  const shown = needle
    ? rows.filter((r) => [r.name, r.fatherName, r.admissionNumber].some((v) => String(v ?? '').toLowerCase().includes(needle)))
    : rows;
  const total = shown.reduce((sum, r) => sum + r.total, 0);

  const handleExport = () =>
    exportToCSV(
      shown.map((r) => ({ ...r, state: r.left ? 'Left' : 'Active', lastPaid: r.lastPayment ? new Date(r.lastPayment).toLocaleDateString('en-GB') : 'Never' })),
      'defaulter_list',
      {
        admissionNumber: 'Adm No',
        name: 'Student',
        fatherName: 'Father Name',
        parentPhone: 'Parent Phone',
        className: 'Class',
        months: 'Months Unpaid',
        oldestUnpaid: 'Unpaid Since',
        tuition: 'Tuition Owed (incl. fines)',
        annualCharges: 'Annual Charges Owed',
        total: 'Total Owed',
        lastPaid: 'Last Payment',
        state: 'Status',
      }
    );

  const selectStyle = { padding: '0.55rem 0.8rem' };

  return (
    <div style={{animation: 'fadeIn 0.5s ease-out'}}>
      <h1>Defaulter List</h1>
      <p className="no-print" style={{marginBottom: '2rem'}}>
        Every student with overdue fees, biggest balance first. Late fines and annual charges are included; bills not yet due are left out.
      </p>

      <div className="glass-panel no-print" style={{padding: '1.5rem', marginBottom: '2rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end'}}>
        <div style={{minWidth: '180px'}}>
          <label className="form-label">Class</label>
          <select className="form-input" style={selectStyle} value={classId} onChange={(e) => { setLoading(true); setClassId(e.target.value); }}>
            <option value="all">All Classes</option>
            {classes.map((c) => <option key={String(c.id)} value={String(c.id)}>{c.name}{c.section ? ` - ${c.section}` : ''}</option>)}
          </select>
        </div>
        <div style={{minWidth: '180px'}}>
          <label className="form-label">Unpaid For</label>
          <select className="form-input" style={selectStyle} value={minMonths} onChange={(e) => { setLoading(true); setMinMonths(e.target.value); }}>
            <option value="0">Anything owed</option>
            <option value="1">1 month or more</option>
            <option value="2">2 months or more</option>
            <option value="3">3 months or more</option>
            <option value="6">6 months or more</option>
          </select>
        </div>
        <div style={{flex: 1, minWidth: '200px'}}>
          <label className="form-label">Search</label>
          <input className="form-input" style={selectStyle} placeholder="Name, father name or admission no..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className="btn btn-secondary" onClick={handleExport}>Export CSV</button>
        <button className="btn btn-primary" onClick={() => window.print()}>Print</button>
      </div>

      {error && <div className="badge badge-danger" style={{padding: '1rem', display: 'block', fontSize: '1rem', marginBottom: '2rem'}}>{error}</div>}

      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem'}}>
        <div className="glass-panel" style={{padding: '1.5rem', borderLeft: '4px solid var(--danger)'}}>
          <div className="form-label">Total Outstanding</div>
          <div style={{fontSize: '1.8rem', fontWeight: 800, color: 'var(--danger)'}}>{rupees(total)}</div>
        </div>
        <div className="glass-panel" style={{padding: '1.5rem', borderLeft: '4px solid var(--warning)'}}>
          <div className="form-label">Students</div>
          <div style={{fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-main)'}}>{shown.length}</div>
        </div>
      </div>

      <div className="glass-panel table-container">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Student</th>
              <th>Class</th>
              <th>Unpaid</th>
              <th>Tuition</th>
              <th>Annual</th>
              <th>Total Owed</th>
              <th>Last Paid</th>
              <th className="no-print"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{textAlign: 'center', padding: '2rem'}}>Loading...</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={9} style={{textAlign: 'center', padding: '2rem', color: 'var(--text-muted)'}}>Nobody owes anything here.</td></tr>
            ) : (
              shown.map((r, i) => (
                <tr key={String(r.studentId)}>
                  <td style={{color: 'var(--text-muted)'}}>{i + 1}</td>
                  <td>
                    <div style={{fontWeight: 600}}>
                      {r.name}
                      {r.left && <span className="badge badge-neutral" style={{marginLeft: '0.5rem'}}>Left</span>}
                    </div>
                    <div style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>
                      S/O {r.fatherName || 'N/A'} · Adm {r.admissionNumber || 'N/A'}{r.parentPhone ? ` · ${r.parentPhone}` : ''}
                    </div>
                  </td>
                  <td>{r.className}</td>
                  <td>
                    {r.months > 0 ? (
                      <>
                        <span className={`badge ${r.months >= 3 ? 'badge-danger' : 'badge-warning'}`}>{r.months} month(s)</span>
                        <div style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>since {r.oldestUnpaid}</div>
                      </>
                    ) : '-'}
                  </td>
                  <td>
                    {rupees(r.tuition)}
                    {r.fines > 0 && <div style={{fontSize: '0.75rem', color: 'var(--danger)'}}>incl. {rupees(r.fines)} fines</div>}
                  </td>
                  <td>{rupees(r.annualCharges)}</td>
                  <td style={{fontWeight: 800, color: 'var(--danger)'}}>{rupees(r.total)}</td>
                  <td style={{fontSize: '0.85rem'}}>{r.lastPayment ? new Date(r.lastPayment).toLocaleDateString('en-GB') : 'Never'}</td>
                  <td className="no-print">
                    <div style={{display: 'flex', gap: '0.4rem'}}>
                      {has('studentLedger') && <Link href={`/ledger/${r.studentId}`} className="btn btn-secondary" style={{padding: '0.3rem 0.7rem', fontSize: '0.8rem'}}>Ledger</Link>}
                      {(() => {
                        const link = has('whatsapp') && whatsappLink(r.parentPhone, reminderMessage({ school: schoolName, student: r.name, className: r.className, total: r.total, months: r.months, since: r.oldestUnpaid }));
                        return link ? (
                          <a href={link} target="_blank" rel="noopener noreferrer" className="btn" style={{padding: '0.3rem 0.7rem', fontSize: '0.8rem', background: '#25D366', color: 'white', border: 'none'}} title={`Send a reminder to ${r.parentPhone}`}>WhatsApp</a>
                        ) : null;
                      })()}
                    </div>
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
