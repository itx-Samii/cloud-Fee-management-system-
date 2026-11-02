"use client";
import React, { useState, useEffect, useCallback } from 'react';
import type { AuditEntry } from '@/lib/types';

const PAGE_SIZE = 200;

// Filter value = the part of the action name before the dot.
const TYPES = [
  { value: '', label: 'Everything' },
  { value: 'payment', label: 'Payments received' },
  { value: 'voucher', label: 'Voucher charges / reversals' },
  { value: 'vouchers', label: 'Vouchers generated' },
  { value: 'student', label: 'Students' },
  { value: 'class', label: 'Classes' },
  { value: 'expense', label: 'Expenses' },
  { value: 'salary', label: 'Salaries' },
  { value: 'staff', label: 'Staff' },
  { value: 'user', label: 'User logins' },
  { value: 'login', label: 'Sign-ins' },
  { value: 'password', label: 'Password changes' },
  { value: 'backup', label: 'Backups & restores' },
  { value: 'settings', label: 'Fee settings' },
];

// Actions that move money backwards or remove records stand out in red.
const WARNING_ACTIONS = ['payment.reverse', 'voucher.delete', 'student.delete', 'expense.delete', 'salary.reverse', 'staff.delete', 'class.delete', 'user.delete', 'backup.restore'];

async function fetchEntries(type: string, before?: string): Promise<AuditEntry[]> {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (type) params.set('type', type);
  if (before) params.set('before', before);
  const res = await fetch(`/api/admin/audit?${params}`, { cache: 'no-store' });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Failed to load the activity log');
  return data;
}

export default function ActivityLog() {
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadEntries = useCallback(
    () =>
      fetchEntries(type)
        .then((rows) => {
          setEntries(rows);
          setHasMore(rows.length === PAGE_SIZE);
          setError('');
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setLoading(false)),
    [type]
  );

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const loadOlder = () => {
    const last = entries[entries.length - 1];
    if (!last) return;
    setLoading(true);
    fetchEntries(type, last.at)
      .then((rows) => {
        setEntries((current) => [...current, ...rows]);
        setHasMore(rows.length === PAGE_SIZE);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  const needle = search.trim().toLowerCase();
  const shown = needle
    ? entries.filter((e) => [e.summary, e.username, e.displayName].some((v) => String(v ?? '').toLowerCase().includes(needle)))
    : entries;

  return (
    <div style={{animation: 'fadeIn 0.5s ease-out'}}>
      <h1>Activity Log</h1>
      <p style={{marginBottom: '2rem'}}>
        Who did what, and when. Entries are added automatically and cannot be edited or deleted by anyone.
      </p>

      <div className="glass-panel no-print" style={{padding: '1.5rem', marginBottom: '2rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end'}}>
        <div style={{minWidth: '220px'}}>
          <label className="form-label">Show</label>
          <select
            className="form-input"
            value={type}
            onChange={(e) => {
              setLoading(true);
              setType(e.target.value);
            }}
          >
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div style={{flex: 1, minWidth: '220px'}}>
          <label className="form-label">Search</label>
          <input
            type="text"
            className="form-input"
            placeholder="Student name, receipt number, username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div className="badge badge-danger" style={{padding: '1rem', display: 'block', fontSize: '1rem', marginBottom: '2rem'}}>{error}</div>
      )}

      <div className="glass-panel table-container">
        <table className="table">
          <thead>
            <tr>
              <th style={{width: '170px'}}>When</th>
              <th style={{width: '180px'}}>Who</th>
              <th>What happened</th>
            </tr>
          </thead>
          <tbody>
            {loading && entries.length === 0 ? (
              <tr><td colSpan={3} style={{textAlign: 'center', padding: '2rem'}}>Loading activity...</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={3} style={{textAlign: 'center', padding: '2rem', color: 'var(--text-muted)'}}>Nothing recorded yet.</td></tr>
            ) : (
              shown.map((e, i) => (
                <tr key={`${e.at}_${i}`}>
                  <td style={{fontSize: '0.85rem'}}>
                    <div style={{fontWeight: 600}}>{new Date(e.at).toLocaleDateString('en-GB')}</div>
                    <div style={{color: 'var(--text-muted)'}}>{new Date(e.at).toLocaleTimeString()}</div>
                  </td>
                  <td>
                    <div style={{fontWeight: 600}}>{e.displayName || e.username}</div>
                    <div style={{fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase'}}>{e.role} · {e.username}</div>
                  </td>
                  <td style={{color: WARNING_ACTIONS.includes(e.action) ? 'var(--danger)' : 'var(--text-main)'}}>{e.summary}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div style={{textAlign: 'center', marginTop: '1.5rem'}}>
          <button className="btn btn-secondary" onClick={loadOlder} disabled={loading}>
            {loading ? 'Loading...' : 'Load older entries'}
          </button>
        </div>
      )}
    </div>
  );
}
