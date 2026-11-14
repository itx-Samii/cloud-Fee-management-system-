"use client";
import React, { useState } from 'react';
import { reminderBatches, type ReminderBatch } from '@/lib/whatsapp';
import type { Defaulter } from '@/lib/types';

const rupees = (amount: number) => `Rs. ${amount.toLocaleString('en-US')}`;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "today", "yesterday", "3 days ago". */
export function daysAgo(iso: string, now: Date = new Date()): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(new Date(iso))) / DAY_MS);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

/** Records reminders opened in WhatsApp; false if the server refused. */
export async function recordReminder(batch: { number: string; studentIds: (string | number)[]; total: number }, bulk: boolean): Promise<string | null> {
  try {
    const res = await fetch('/api/reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bulk, reminders: [{ phone: batch.number, studentIds: batch.studentIds, amount: batch.total }] }),
    });
    if (res.ok) return null;
    return (await res.json().catch(() => null))?.error || 'The reminder could not be recorded.';
  } catch {
    return 'The reminder could not be recorded (no connection).';
  }
}

const SKIP_OPTIONS = [
  { value: '0', label: "Don't leave anyone out" },
  { value: '1', label: 'Reminded today' },
  { value: '3', label: 'Reminded in the last 3 days' },
  { value: '7', label: 'Reminded in the last 7 days' },
  { value: '30', label: 'Reminded in the last 30 days' },
];

type Batch = ReminderBatch<Defaulter>;

function queueOf(batches: Batch[], skipDays: string): { queue: Batch[]; recent: number } {
  const days = parseInt(skipDays) || 0;
  if (days === 0) return { queue: batches, recent: 0 };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = today.getTime() - (days - 1) * DAY_MS;
  const queue = batches.filter((b) => !b.lastReminded || new Date(b.lastReminded).getTime() < cutoff);
  return { queue, recent: batches.length - queue.length };
}

/**
 * Fee reminders to every family on the list, one after another: each opens in WhatsApp with the
 * message written, staff press Send there and come back for the next. Nothing is sent by itself.
 */
export default function ReminderQueue({ rows, school, onSent, onClose }: {
  rows: Defaulter[];
  school: string;
  onSent: (studentIds: (string | number)[]) => void;
  onClose: () => void;
}) {
  // The list as it was when opened: marking families as reminded mustn't reshuffle the queue.
  const [{ batches, noPhone }] = useState(() => reminderBatches(rows, school));
  const [skipDays, setSkipDays] = useState('3');
  const [{ queue, recent }, setQueue] = useState(() => queueOf(batches, '3'));
  const [index, setIndex] = useState(0);
  const [opened, setOpened] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState('');

  const current = queue[index];
  const finished = index >= queue.length;

  const changeSkip = (value: string) => {
    setSkipDays(value);
    setQueue(queueOf(batches, value));
    setIndex(0);
  };

  const open = (batch: Batch) => {
    const studentIds = batch.members.map((m) => m.studentId);
    setOpened((n) => n + 1);
    setIndex((i) => i + 1);
    onSent(studentIds);
    recordReminder({ number: batch.number, studentIds, total: batch.total }, true).then((problem) => problem && setError(problem));
  };

  return (
    <div style={{position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backdropFilter: 'blur(4px)'}}>
      <div className="glass-panel" role="dialog" aria-label="Send reminders" style={{width: '100%', maxWidth: '620px', maxHeight: '92vh', overflowY: 'auto', padding: '1.5rem'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem'}}>
          <div>
            <h2 style={{margin: 0}}>📣 Send reminders</h2>
            <p style={{fontSize: '0.85rem', marginTop: '0.4rem'}}>
              Each family opens in WhatsApp with the message ready. Press Send there, then come back here for the next. Brothers and sisters get one message together.
            </p>
          </div>
          <button className="btn btn-secondary" style={{padding: '0.3rem 0.8rem'}} onClick={onClose}>Close</button>
        </div>

        <div style={{display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', margin: '1rem 0', fontSize: '0.9rem'}}>
          <label className="form-label" style={{margin: 0}} htmlFor="reminder-skip">Leave out families</label>
          <select id="reminder-skip" className="form-input" style={{width: 'auto', padding: '0.4rem 0.7rem'}} value={skipDays} onChange={(e) => changeSkip(e.target.value)} disabled={opened > 0}>
            {SKIP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div style={{fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem'}}>
          {queue.length} famil{queue.length === 1 ? 'y' : 'ies'} to remind
          {recent > 0 && ` · ${recent} left out (reminded recently)`}
          {noPhone.length > 0 && ` · ${noPhone.length} student(s) without a phone number`}
        </div>

        {error && <div style={{color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '0.75rem'}}>{error}</div>}

        {finished ? (
          <div style={{textAlign: 'center', padding: '1.5rem', border: '1px solid var(--border)', borderRadius: '12px'}}>
            <div style={{fontSize: '2rem'}}>✅</div>
            <div style={{fontWeight: 700, fontSize: '1.1rem', marginTop: '0.5rem'}}>
              {queue.length === 0 ? 'Nobody left to remind.' : `Done: ${opened} opened in WhatsApp${skipped ? `, ${skipped} skipped` : ''}.`}
            </div>
            {index > 0 && <button className="btn btn-secondary" style={{marginTop: '1rem'}} onClick={() => setIndex((i) => i - 1)}>← Back</button>}
          </div>
        ) : (
          <div style={{border: '1px solid var(--border)', borderRadius: '12px', padding: '1rem'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem'}}>
              <span>Family {index + 1} of {queue.length}</span>
              <span>+{current.number}</span>
            </div>
            {current.members.map((m) => (
              <div key={String(m.studentId)} style={{display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.2rem 0'}}>
                <span><strong>{m.name}</strong> <span style={{color: 'var(--text-muted)', fontSize: '0.85rem'}}>{m.className}</span></span>
                <span>{rupees(m.total)}</span>
              </div>
            ))}
            {current.members.length > 1 && (
              <div style={{display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', marginTop: '0.3rem', paddingTop: '0.3rem', fontWeight: 700}}>
                <span>Total</span><span>{rupees(current.total)}</span>
              </div>
            )}
            {current.lastReminded && (
              <div style={{fontSize: '0.8rem', color: 'var(--warning)', marginTop: '0.4rem'}}>Last reminded {daysAgo(current.lastReminded)}</div>
            )}
            <div style={{background: 'var(--bg-body)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.75rem', fontSize: '0.85rem', margin: '0.75rem 0', whiteSpace: 'pre-wrap'}}>
              {current.message}
            </div>
            <div style={{display: 'flex', gap: '0.5rem', flexWrap: 'wrap'}}>
              <button className="btn btn-secondary" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>← Back</button>
              <button className="btn btn-secondary" onClick={() => { setSkipped((n) => n + 1); setIndex((i) => i + 1); }}>Skip</button>
              <a href={current.link} target="school-pay-whatsapp" className="btn" style={{flex: 1, textAlign: 'center', textDecoration: 'none', background: '#25D366', color: 'white', border: 'none', fontWeight: 700}} onClick={() => open(current)}>
                Open in WhatsApp →
              </a>
            </div>
          </div>
        )}

        {noPhone.length > 0 && (
          <details style={{marginTop: '1rem', fontSize: '0.85rem'}}>
            <summary style={{cursor: 'pointer', color: 'var(--text-muted)'}}>{noPhone.length} student(s) can&apos;t be messaged: no parent phone number</summary>
            <ul style={{margin: '0.5rem 0 0 1.2rem', color: 'var(--text-muted)'}}>
              {noPhone.map((s) => <li key={String(s.studentId)}>{s.name} ({s.className}) · {rupees(s.total)}</li>)}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
