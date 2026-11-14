"use client";
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { gradeOf, promotedFee, suggestNextClass, type FeeRule } from '@/lib/promotionPlan';
import type { SchoolClass } from '@/lib/types';

interface PromoClass extends SchoolClass { id: number }
interface PromoStudent { id: number; name: string; fatherName?: string; classId: number; monthlyFee?: number; annualCharges?: number }
interface PastPromotion { id: number; doneAt: string; doneByName?: string; doneBy: string; summary: string; students: number; undoneAt?: string; undoneBy?: string }
interface Overview { classes: PromoClass[]; students: PromoStudent[]; history: PastPromotion[]; token: string }

type FeeMode = FeeRule['mode'];
interface Row { to: string; feeMode: FeeMode; feeAmount: string; addAC: string; keepBack: number[] }

const rupees = (amount: number) => `Rs. ${amount.toLocaleString('en-US')}`;
const labelOf = (c: SchoolClass | undefined) => (c ? `${c.name.trim()}${c.section?.trim() ? ` - ${c.section.trim()}` : ''}` : 'Unknown class');
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function byGrade(a: SchoolClass, b: SchoolClass) {
  const ga = gradeOf(a.name) ?? Infinity;
  const gb = gradeOf(b.name) ?? Infinity;
  return ga !== gb ? ga - gb : labelOf(a).localeCompare(labelOf(b));
}

function feeRuleOf(row: Row): FeeRule {
  const amount = parseFloat(row.feeAmount) || 0;
  return row.feeMode === 'add' || row.feeMode === 'percent' ? { mode: row.feeMode, amount } : { mode: row.feeMode };
}

function freshRows(data: Overview): Record<number, Row> {
  const rows: Record<number, Row> = {};
  for (const c of data.classes) {
    const next = suggestNextClass(c, data.classes);
    const target = data.classes.find((t) => t.id === next);
    rows[c.id] = { to: next ? String(next) : '', feeMode: 'keep', feeAmount: '', addAC: target?.annualCharges ? String(target.annualCharges) : '', keepBack: [] };
  }
  return rows;
}

async function fetchOverview(): Promise<Overview | string> {
  const res = await fetch('/api/promotion', { cache: 'no-store' });
  const body = await res.json().catch(() => null);
  return res.ok ? body : body?.error || 'Could not load the classes.';
}

export default function PromotionPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [rows, setRows] = useState<Record<number, Row>>({});
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(
    () =>
      fetchOverview().then((result) => {
        if (typeof result === 'string') return setError(result);
        setData(result);
        setRows(freshRows(result));
      }),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  const classes = useMemo(() => [...(data?.classes ?? [])].sort(byGrade), [data]);
  const studentsOf = useMemo(() => {
    const map = new Map<number, PromoStudent[]>();
    for (const s of data?.students ?? []) map.set(Number(s.classId), [...(map.get(Number(s.classId)) ?? []), s]);
    return map;
  }, [data]);
  const withStudents = classes.filter((c) => (studentsOf.get(c.id)?.length ?? 0) > 0);

  const update = (id: number, change: Partial<Row>) => setRows((all) => ({ ...all, [id]: { ...all[id], ...change } }));
  const moving = (c: PromoClass) => {
    const row = rows[c.id];
    return row?.to ? (studentsOf.get(c.id)?.length ?? 0) - row.keepBack.length : 0;
  };

  const sizesAfter = useMemo(() => {
    const after = new Map(classes.map((c) => [c.id, studentsOf.get(c.id)?.length ?? 0]));
    for (const c of withStudents) {
      const row = rows[c.id];
      if (!row?.to) continue;
      const n = (studentsOf.get(c.id)?.length ?? 0) - row.keepBack.length;
      after.set(c.id, (after.get(c.id) ?? 0) - n);
      if (row.to !== 'left') after.set(Number(row.to), (after.get(Number(row.to)) ?? 0) + n);
    }
    return after;
  }, [classes, withStudents, rows, studentsOf]);

  const steps = withStudents
    .filter((c) => rows[c.id]?.to && moving(c) > 0)
    .map((c) => {
      const row = rows[c.id];
      return {
        fromClassId: c.id,
        to: row.to === 'left' ? 'left' : Number(row.to),
        fee: feeRuleOf(row),
        addAnnualCharges: row.to === 'left' ? 0 : parseFloat(row.addAC) || 0,
        keepBack: row.keepBack,
      };
    });
  const totalMoving = steps.reduce((sum, s) => sum + moving(classes.find((c) => c.id === s.fromClassId) as PromoClass), 0);
  const passingOut = steps.filter((s) => s.to === 'left').reduce((sum, s) => sum + moving(classes.find((c) => c.id === s.fromClassId) as PromoClass), 0);

  const feePreview = (c: PromoClass, row: Row) => {
    const fees = (studentsOf.get(c.id) ?? []).map((s) => Number(s.monthlyFee) || 0);
    if (fees.length === 0 || row.to === 'left') return '';
    const target = classes.find((t) => t.id === Number(row.to));
    const range = (list: number[]) => {
      const lo = Math.min(...list);
      const hi = Math.max(...list);
      return lo === hi ? rupees(lo) : `${rupees(lo)}–${rupees(hi)}`;
    };
    const rule = feeRuleOf(row);
    return `${range(fees)} → ${range(fees.map((f) => promotedFee(f, rule, target)))}`;
  };

  const submit = async () => {
    if (!data || steps.length === 0) return;
    const lines = steps.map((s) => {
      const from = classes.find((c) => c.id === s.fromClassId) as PromoClass;
      const to = s.to === 'left' ? 'Passed out (marked Left)' : labelOf(classes.find((c) => c.id === s.to));
      return `• ${labelOf(from)} → ${to}: ${moving(from)} student(s)`;
    });
    if (!confirm(`Promote ${totalMoving} student(s)?\n\n${lines.join('\n')}\n\nYou can undo this afterwards.`)) return;

    setBusy(true);
    setError('');
    setDone('');
    try {
      const res = await fetch('/api/promotion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steps, token: data.token }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error || 'Promotion failed.');
      } else {
        setDone(`${body.moved} student(s) promoted${body.passedOut ? `, ${body.passedOut} of them passed out` : ''}${body.keptBack ? `; ${body.keptBack} kept back in their class` : ''}.`);
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const undo = async (p: PastPromotion) => {
    if (!confirm(`Undo the promotion of ${when(p.doneAt)}?\n\n${p.students} student(s) go back to their previous class, fee and status. A student edited since keeps the newer class or fee.`)) return;
    setBusy(true);
    setError('');
    setDone('');
    try {
      const res = await fetch(`/api/promotion?id=${p.id}`, { method: 'DELETE' });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error || 'Undo failed.');
      } else {
        const changed = body.changedSince.length ? ` ${body.changedSince.length} kept their newer class or fee: ${body.changedSince.join(', ')}.` : '';
        setDone(`Promotion undone: ${body.restored} student(s) put back.${changed}`);
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const chosen = choosing === null ? null : classes.find((c) => c.id === choosing);
  const chosenStudents = chosen ? (studentsOf.get(chosen.id) ?? []).filter((s) => s.name.toLowerCase().includes(search.toLowerCase())) : [];
  const latest = data?.history[0];

  return (
    <div style={{animation: 'fadeIn 0.5s ease-out'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem'}}>
        <div>
          <h1>Class Promotion</h1>
          <p>Move students up to their next class for the new session, all classes in one go.</p>
        </div>
        <Link href="/classes" className="btn btn-secondary" style={{textDecoration: 'none'}}>← Classes</Link>
      </div>

      <div className="glass-panel" style={{padding: '1rem 1.25rem', marginBottom: '1.5rem', borderLeft: '4px solid var(--warning)', fontSize: '0.9rem', color: 'var(--text-muted)'}}>
        Check where each class goes, then press Promote. Students who failed can be kept back in their class, and the top class can be marked as passed out.
        Vouchers already made stay billed to the old class and fee, so promote <strong style={{color: 'var(--text-main)'}}>before</strong> generating the new session&apos;s first vouchers.
        The latest promotion can be undone.
      </div>

      {error && <div className="glass-panel" style={{padding: '1rem 1.25rem', marginBottom: '1rem', borderLeft: '4px solid var(--danger)', color: 'var(--danger)'}}>{error}</div>}
      {done && <div className="glass-panel" style={{padding: '1rem 1.25rem', marginBottom: '1rem', borderLeft: '4px solid var(--success)', color: 'var(--success)', fontWeight: 600}}>{done}</div>}

      {!data ? (
        !error && <div className="glass-panel" style={{padding: '2rem', textAlign: 'center'}}>Loading...</div>
      ) : withStudents.length === 0 ? (
        <div className="glass-panel" style={{padding: '2rem', textAlign: 'center', color: 'var(--text-muted)'}}>No class has any students to promote.</div>
      ) : (
        <>
          <div className="glass-panel table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>From class</th>
                  <th>Move to</th>
                  <th>Monthly fee in the new class</th>
                  <th>Add annual charges</th>
                  <th>Students</th>
                </tr>
              </thead>
              <tbody>
                {withStudents.map((c) => {
                  const row = rows[c.id];
                  if (!row) return null;
                  const count = studentsOf.get(c.id)?.length ?? 0;
                  const target = classes.find((t) => t.id === Number(row.to));
                  const promoting = row.to && row.to !== 'left';
                  return (
                    <tr key={c.id} style={{opacity: row.to ? 1 : 0.6}}>
                      <td>
                        <div style={{fontWeight: 700}}>{labelOf(c)}</div>
                        <div style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>{count} student(s)</div>
                      </td>
                      <td>
                        <select aria-label={`Move ${labelOf(c)} to`} className="form-input" style={{minWidth: '180px'}} value={row.to}
                          onChange={(e) => {
                            const next = classes.find((t) => t.id === Number(e.target.value));
                            update(c.id, { to: e.target.value, addAC: next?.annualCharges ? String(next.annualCharges) : '', ...(e.target.value === 'left' && { feeMode: 'keep' }) });
                          }}>
                          <option value="">— Don&apos;t move —</option>
                          {classes.filter((t) => t.id !== c.id).map((t) => <option key={t.id} value={t.id}>{labelOf(t)}</option>)}
                          <option value="left">🎓 Passed out</option>
                        </select>
                      </td>
                      <td>
                        {promoting ? (
                          <>
                            <div style={{display: 'flex', gap: '0.4rem', flexWrap: 'wrap'}}>
                              <select aria-label={`Fee rule for ${labelOf(c)}`} className="form-input" style={{width: 'auto'}} value={row.feeMode} onChange={(e) => update(c.id, { feeMode: e.target.value as FeeMode })}>
                                <option value="keep">Keep each student&apos;s fee</option>
                                <option value="add">Increase by Rs.</option>
                                <option value="percent">Increase by %</option>
                                <option value="class" disabled={!target?.monthlyFee}>{labelOf(target)}&apos;s fee ({rupees(Number(target?.monthlyFee) || 0)})</option>
                              </select>
                              {(row.feeMode === 'add' || row.feeMode === 'percent') && (
                                <input aria-label={`Fee increase for ${labelOf(c)}`} type="number" min="0" className="form-input" style={{width: '100px'}} placeholder={row.feeMode === 'add' ? 'Rs.' : '%'} value={row.feeAmount} onChange={(e) => update(c.id, { feeAmount: e.target.value })} />
                              )}
                            </div>
                            <div style={{fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem'}}>{feePreview(c, row)}</div>
                          </>
                        ) : row.to === 'left' ? (
                          <span style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>Marked as Left: no more vouchers; history and any balance stay</span>
                        ) : <span style={{color: 'var(--text-muted)'}}>—</span>}
                      </td>
                      <td>
                        {promoting ? (
                          <input aria-label={`Annual charges for ${labelOf(c)}`} type="number" min="0" className="form-input" style={{width: '110px'}} placeholder="Rs. 0" value={row.addAC} onChange={(e) => update(c.id, { addAC: e.target.value })} />
                        ) : <span style={{color: 'var(--text-muted)'}}>—</span>}
                      </td>
                      <td>
                        {row.to ? (
                          <button className="btn btn-secondary" style={{padding: '0.35rem 0.7rem', fontSize: '0.8rem', whiteSpace: 'nowrap'}} onClick={() => { setChoosing(c.id); setSearch(''); }}>
                            {count - row.keepBack.length} move{row.keepBack.length ? `, ${row.keepBack.length} stay` : ''} ✎
                          </button>
                        ) : <span style={{color: 'var(--text-muted)', fontSize: '0.85rem'}}>all stay</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="glass-panel" style={{padding: '1.25rem', marginTop: '1.5rem'}}>
            <div className="form-label" style={{marginBottom: '0.75rem'}}>Class sizes after promotion</div>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: '0.5rem'}}>
              {classes.map((c) => {
                const now = studentsOf.get(c.id)?.length ?? 0;
                const after = sizesAfter.get(c.id) ?? 0;
                return (
                  <span key={c.id} className={`badge ${after !== now ? 'badge-success' : 'badge-neutral'}`} style={{fontSize: '0.8rem'}}>
                    {labelOf(c)}: {now} → {after}
                  </span>
                );
              })}
            </div>
          </div>

          <div style={{display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginTop: '1.5rem'}}>
            <span style={{color: 'var(--text-muted)', fontSize: '0.9rem'}}>
              {totalMoving} student(s) will move{passingOut ? `, ${passingOut} of them passing out` : ''}
            </span>
            <button className="btn btn-primary" disabled={busy || totalMoving === 0} onClick={submit}>
              {busy ? 'Working...' : `⬆️ Promote ${totalMoving} student(s)`}
            </button>
          </div>
        </>
      )}

      {data && data.history.length > 0 && (
        <div className="glass-panel" style={{padding: '1.25rem', marginTop: '2rem'}}>
          <h2 style={{fontSize: '1.2rem', marginBottom: '1rem'}}>Past promotions</h2>
          <div style={{display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
            {data.history.map((p) => (
              <div key={p.id} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)'}}>
                <div style={{flex: '1 1 300px'}}>
                  <div style={{fontWeight: 600}}>
                    {when(p.doneAt)} · {p.doneByName || p.doneBy} · {p.students} student(s)
                    {p.undoneAt && <span className="badge badge-neutral" style={{marginLeft: '0.5rem'}}>Undone {when(p.undoneAt)}</span>}
                  </div>
                  <div style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>{p.summary}</div>
                </div>
                {p === latest && !p.undoneAt && (
                  <button className="btn" style={{background: 'var(--danger)', color: 'white', border: 'none', padding: '0.4rem 0.9rem'}} disabled={busy} onClick={() => undo(p)}>
                    Undo this promotion
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {chosen && rows[chosen.id] && (
        <div className="workspace-modal no-print" style={{position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backdropFilter: 'blur(4px)'}}>
          <div className="glass-panel" style={{width: '100%', maxWidth: '520px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '1.5rem'}}>
            <h2 style={{marginBottom: '0.25rem'}}>{labelOf(chosen)}</h2>
            <p style={{fontSize: '0.85rem', marginBottom: '1rem'}}>Untick the students who stay in {labelOf(chosen)} (failed or repeating the year).</p>
            <input className="form-input" placeholder="Search name..." value={search} onChange={(e) => setSearch(e.target.value)} style={{marginBottom: '0.75rem'}} />
            <div style={{overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem'}}>
              {chosenStudents.map((s) => {
                const stays = rows[chosen.id].keepBack.includes(s.id);
                return (
                  <label key={s.id} style={{display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.45rem 0.5rem', borderRadius: '6px', cursor: 'pointer', background: stays ? 'rgba(225,29,72,0.08)' : 'transparent'}}>
                    <input type="checkbox" checked={!stays} onChange={() => update(chosen.id, { keepBack: stays ? rows[chosen.id].keepBack.filter((id) => id !== s.id) : [...rows[chosen.id].keepBack, s.id] })} />
                    <span style={{flex: 1}}>
                      {s.name}
                      {s.fatherName && <span style={{color: 'var(--text-muted)', fontSize: '0.8rem'}}> · S/O {s.fatherName}</span>}
                    </span>
                    <span style={{fontSize: '0.75rem', color: stays ? 'var(--danger)' : 'var(--success)'}}>{stays ? 'stays' : 'moves'}</span>
                  </label>
                );
              })}
              {chosenStudents.length === 0 && <div style={{color: 'var(--text-muted)', padding: '1rem', textAlign: 'center'}}>No student matches.</div>}
            </div>
            <button className="btn btn-primary" style={{marginTop: '1rem'}} onClick={() => setChoosing(null)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
