"use client";
import React, { useId, useState } from 'react';
import type { Charge, FeeVoucher } from '@/lib/types';

/** A charge being typed: amounts stay text until saved. */
export interface ChargeDraft {
  label: string;
  amount: string;
}

/** Names offered while typing; any other name works too. */
export const COMMON_CHARGES = ['Admission Fee', 'Examination Fee', 'Transport', 'Computer Lab', 'Sports', 'Library', 'Stationery', 'Uniform', 'Registration Fee', 'Security Deposit'];

export const toDrafts = (charges?: Charge[]): ChargeDraft[] => (charges ?? []).map((c) => ({ label: c.label, amount: String(c.amount) }));

/** The drafts as charges to send; empty rows are dropped, anything else the server checks. */
export const fromDrafts = (drafts: ChargeDraft[]): Charge[] =>
  drafts.filter((d) => d.label.trim() || d.amount.trim()).map((d) => ({ label: d.label.trim(), amount: parseFloat(d.amount) || 0 }));

/** Rows of name + amount, with a button to add another. */
export default function ChargesEditor({ value, onChange }: { value: ChargeDraft[]; onChange: (drafts: ChargeDraft[]) => void }) {
  const listId = useId();
  const change = (index: number, field: keyof ChargeDraft, text: string) =>
    onChange(value.map((d, i) => (i === index ? { ...d, [field]: text } : d)));

  return (
    <div>
      <datalist id={listId}>
        {COMMON_CHARGES.map((name) => <option key={name} value={name} />)}
      </datalist>
      {value.map((d, i) => (
        <div key={i} style={{display: 'flex', gap: '0.5rem', marginBottom: '0.5rem'}}>
          <input className="form-input" list={listId} placeholder="e.g. Transport" value={d.label} onChange={(e) => change(i, 'label', e.target.value)} style={{flex: 2}} aria-label="Charge name" />
          <input className="form-input" type="number" min="0" placeholder="Rs." value={d.amount} onChange={(e) => change(i, 'amount', e.target.value)} style={{flex: 1}} aria-label="Charge amount" />
          <button type="button" className="btn btn-secondary" onClick={() => onChange(value.filter((_, j) => j !== i))} title="Remove this charge" style={{padding: '0 0.75rem'}}>×</button>
        </div>
      ))}
      <button type="button" className="btn btn-secondary" onClick={() => onChange([...value, { label: '', amount: '' }])} style={{padding: '0.35rem 0.9rem', fontSize: '0.85rem'}}>
        + Add charge
      </button>
    </div>
  );
}

/** Edits one voucher's charges and saves them; the server sends the voucher back with fresh balances. */
export function VoucherCharges({ voucher, onSaved, onCancel }: { voucher: FeeVoucher; onSaved: (voucher: FeeVoucher) => void; onCancel?: () => void }) {
  const [drafts, setDrafts] = useState<ChargeDraft[]>(() => {
    const current = toDrafts(voucher.charges);
    return current.length > 0 ? current : [{ label: '', amount: '' }];
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/fees', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: voucher.id, charges: fromDrafts(drafts) }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) onSaved(data);
      else alert(data?.error || 'Failed to save the charges.');
    } catch {
      alert('Failed to save the charges.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <ChargesEditor value={drafts} onChange={setDrafts} />
      <div style={{display: 'flex', gap: '0.5rem', marginTop: '1rem'}}>
        {onCancel && <button type="button" className="btn btn-secondary" onClick={onCancel} style={{flex: 1}}>Cancel</button>}
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving} style={{flex: 1}}>
          {saving ? 'Saving...' : 'Save charges'}
        </button>
      </div>
    </div>
  );
}
