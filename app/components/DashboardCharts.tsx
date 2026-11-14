'use client';

import { useEffect, useRef, useState } from 'react';
import type { DashboardPeriod, DashboardPoint } from '@/lib/dashboard';

const number = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('en-PK', { notation: 'compact', maximumFractionDigits: 1 });
const money = (value: number) => `Rs. ${number.format(value)}`;
const dailyLabel = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const monthlyLabel = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' });

function niceLimit(value: number) {
  if (value <= 0) return 1;
  const scale = 10 ** Math.floor(Math.log10(value));
  const unit = value / scale;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * scale;
}

function CashFlow({ points, period }: { points: DashboardPoint[]; period: DashboardPeriod }) {
  const [selected, setSelected] = useState<number | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const activeBar = useRef<HTMLButtonElement>(null);
  const activity = points.filter((point) => point.collections !== 0 || point.expenses !== 0);
  const point = points.find((entry) => entry.date.getTime() === selected) ?? activity.at(-1);
  const activeKey = point?.date.getTime();
  const upper = niceLimit(points.reduce((max, entry) => Math.max(max, entry.collections, entry.expenses), 0));
  const minimum = points.reduce((min, entry) => Math.min(min, entry.collections, entry.expenses), 0);
  const lower = minimum < 0 ? -niceLimit(-minimum) : 0;
  const position = (value: number) => (value - lower) / (upper - lower) * 100;
  const label = period === 'monthly' ? dailyLabel : monthlyLabel;
  const tickStep = Math.max(1, Math.ceil(points.length / 6));

  useEffect(() => {
    if (!scroll.current || !activeBar.current) return;
    const viewport = scroll.current.getBoundingClientRect();
    const bar = activeBar.current.getBoundingClientRect();
    if (bar.right > viewport.right) scroll.current.scrollLeft += bar.right - viewport.right + 4;
    else if (bar.left < viewport.left) scroll.current.scrollLeft -= viewport.left - bar.left + 4;
  }, [activeKey]);

  return (
    <section className="glass-panel dashboard-chart dashboard-flow" aria-labelledby="cash-flow-title">
      <div className="dashboard-chart-heading">
        <div><h2 id="cash-flow-title">Collections vs. expenses</h2><p>{period === 'monthly' ? 'Daily activity this month' : 'Monthly activity across all sessions'}</p></div>
        <span className="dashboard-chart-unit">PKR</span>
      </div>
      {point ? (
        <>
          <div className="dashboard-plot-wrap">
            <div className="dashboard-plot-axis" aria-hidden="true"><span>{compact.format(upper)}</span><span>{compact.format((upper + lower) / 2)}</span><span>{compact.format(lower)}</span></div>
            <div className="dashboard-plot-scroll" ref={scroll}>
              <div className="dashboard-plot" style={{ minWidth: points.length * 24 }}>
                <div className="dashboard-plot-gridlines" aria-hidden="true"><i /><i /><i /></div>
                {lower < 0 && <div className="dashboard-zero" aria-hidden="true" style={{ bottom: `${position(0)}%` }} />}
                <div className="dashboard-bars" role="group" aria-label="Select a period to see its totals">
                  {points.map((entry) => {
                    const key = entry.date.getTime();
                    const active = key === activeKey;
                    const caption = `${label.format(entry.date)}: collections ${money(entry.collections)}, expenses ${money(entry.expenses)}`;
                    return (
                      <button type="button" key={key} ref={active ? activeBar : undefined} className="dashboard-bar-group" aria-pressed={active} aria-label={caption} title={caption} onClick={() => setSelected(key)}>
                        {[entry.collections, entry.expenses].map((value, index) => (
                          <span key={index} className={index === 0 ? 'dashboard-series-income' : 'dashboard-series-expense'} style={{
                            bottom: `${position(Math.min(0, value))}%`,
                            height: `${Math.abs(value) / (upper - lower) * 100}%`,
                          }} aria-hidden="true" />
                        ))}
                      </button>
                    );
                  })}
                </div>
                <div className="dashboard-ticks" aria-hidden="true">
                  {points.map((entry, index) => <span key={entry.date.getTime()}>{index % tickStep === 0 ? (period === 'monthly' ? entry.date.getDate() : label.format(entry.date)) : ''}</span>)}
                </div>
              </div>
            </div>
          </div>
          <dl className="dashboard-chart-selection" aria-live="polite">
            <div><dt>Selected period</dt><dd>{label.format(point.date)}</dd></div>
            <div><dt><i className="dashboard-series-income" /> Collections</dt><dd>{money(point.collections)}</dd></div>
            <div><dt><i className="dashboard-series-expense" /> Expenses</dt><dd>{money(point.expenses)}</dd></div>
          </dl>
        </>
      ) : <div className="dashboard-chart-empty"><p>No dated collections or expenses in this view yet.</p></div>}
    </section>
  );
}

function CollectionBreakdown({ tuition, annualCharges }: { tuition: number; annualCharges: number }) {
  const total = tuition + annualCharges;
  const segments = [
    { label: 'Tuition', value: tuition, color: 'dashboard-series-income' },
    { label: 'Annual charges', value: annualCharges, color: 'dashboard-series-annual' },
  ];
  const plotted = tuition >= 0 && annualCharges >= 0 && total > 0;
  const split = plotted ? tuition / total * 100 : 0;

  return (
    <section className="glass-panel dashboard-chart dashboard-breakdown" aria-labelledby="collections-breakdown-title">
      <div className="dashboard-chart-heading"><div><h2 id="collections-breakdown-title">Collections breakdown</h2><p>Tuition and annual charges</p></div></div>
      {plotted ? (
        <div className="dashboard-donut" aria-hidden="true">
          <svg viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="17" pathLength="100" className="dashboard-series-annual" />
            <circle cx="22" cy="22" r="17" pathLength="100" className="dashboard-series-income" strokeDasharray={`${split} ${100 - split}`} />
          </svg>
          <div><span>Collected</span><strong>{money(total)}</strong></div>
        </div>
      ) : <div className="dashboard-chart-empty"><p>{total === 0 ? 'No collections in this view yet.' : 'See recorded amounts below.'}</p></div>}
      <dl className="dashboard-breakdown-values">
        {segments.map((segment) => <div key={segment.label}><dt><i className={segment.color} />{segment.label}</dt><dd>{money(segment.value)}</dd></div>)}
      </dl>
    </section>
  );
}

export default function DashboardCharts({ points, period, tuition, annualCharges }: { points: DashboardPoint[]; period: DashboardPeriod; tuition: number; annualCharges: number }) {
  return (
    <div className="dashboard-charts">
      <CashFlow key={period} points={points} period={period} />
      <CollectionBreakdown tuition={tuition} annualCharges={annualCharges} />
    </div>
  );
}
