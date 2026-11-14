"use client";
import React, { useState } from 'react';
import type { FeeSettings } from '@/lib/fees';

interface Props {
  settings: FeeSettings & { lateFineOn?: boolean };
  canEdit: boolean;
  onSave: (changes: Partial<FeeSettings>) => Promise<boolean>;
  inputStyle?: React.CSSProperties;
}

/**
 * The school's "due after" and "late fine" settings. Only principals can edit them.
 */
export default function FeeSettingsFields({ settings, canEdit, onSave, inputStyle = {} }: Props) {
  const hint = canEdit ? 'Applies to the whole school' : 'Set by the principal';
  const fineOff = settings.lateFineOn === false;
  return (
    <>
      <div style={{flex: 1}}>
        <label className="form-label" style={{fontSize: '0.8rem', color: 'var(--secondary)', marginBottom: '0.8rem'}}>DUE AFTER (DAYS)</label>
        <SettingBox key={settings.dueDays} value={settings.dueDays} disabled={!canEdit} title={hint} style={inputStyle} onCommit={(dueDays) => onSave({ dueDays })} />
      </div>
      <div style={{flex: 1.2}}>
        <label className="form-label" style={{fontSize: '0.8rem', color: 'var(--danger)', marginBottom: '0.8rem'}}>LATE FINE (RS.)</label>
        <SettingBox
          key={settings.lateFine}
          value={settings.lateFine}
          disabled={!canEdit || fineOff}
          title={fineOff ? 'Late Fine is switched off by your service provider' : hint}
          style={inputStyle}
          onCommit={(lateFine) => onSave({ lateFine })}
        />
        {fineOff && <div style={{fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem'}}>Switched off by your service provider</div>}
      </div>
    </>
  );
}

interface BoxProps {
  value: number;
  disabled: boolean;
  title: string;
  style: React.CSSProperties;
  onCommit: (value: number) => Promise<boolean>;
}

/** A number box that saves when you leave it. Remounted (via key) when the saved value changes. */
function SettingBox({ value, disabled, title, style, onCommit }: BoxProps) {
  const [draft, setDraft] = useState(String(value));

  const commit = () => {
    const next = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(next) || next === value) {
      setDraft(String(value));
      return;
    }
    onCommit(next).then((saved) => {
      if (!saved) setDraft(String(value));
    });
  };

  return (
    <input
      type="number"
      min={0}
      className="form-input"
      value={draft}
      disabled={disabled}
      title={title}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      style={style}
    />
  );
}
