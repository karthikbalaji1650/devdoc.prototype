import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { TestRunItem, TestSuiteItem } from '../../types/operations';
import { countTicks, passRateTrend, velocity, type PassRatePoint, type VelocityDay } from '../../services/runTrends';

// DDS-SRS-023: velocity and pass-rate trend graphs on the metrics dashboard.
// Both are single-series (the title names the series, so no legend). The
// series colour (#3987e5) passed the dataviz palette checks against the
// dark panel surface (#101a2e). Every value is also in the table view.

const SERIES = '#3987e5';
const HEIGHT = 190;
const M = { top: 14, right: 40, bottom: 26, left: 36 };
const RANGES = [14, 30, 90] as const;

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const fmt = (n: number) => n.toLocaleString();

/** Never covers the mark it describes: for a point, below it in the upper
 * half of the plot and above it in the lower half; for a column (`beside`),
 * to its side, since a tall column fills the space under its top. */
function Tooltip({ x, y, width, beside = false, children }: { x: number; y: number; width: number; beside?: boolean; children: React.ReactNode }) {
  const w = 168;
  let position: React.CSSProperties;
  if (beside) {
    position = { left: x > width / 2 ? x - w - 14 : x + 14, top: M.top };
  } else {
    const left = Math.min(Math.max(x - w / 2, 0), Math.max(width - w, 0));
    const below = y < M.top + (HEIGHT - M.top - M.bottom) / 2;
    position = { left, ...(below ? { top: y + 12 } : { bottom: HEIGHT - y + 12 }) };
  }
  return (
    <div role="status" className="pointer-events-none absolute z-10 border border-[var(--border)] bg-[var(--panel-alt)] px-2.5 py-1.5 text-[11px] shadow-lg"
      style={{ width: w, ...position }}>
      {children}
    </div>
  );
}

/** Column per day; the mark's band is its hit target; arrow keys step days. */
function VelocityChart({ days }: { days: VelocityDay[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const plotW = Math.max(width - M.left - M.right, 10);
  const plotH = HEIGHT - M.top - M.bottom;
  const ticks = countTicks(Math.max(...days.map((d) => d.executed), 0));
  const max = ticks[ticks.length - 1];
  const band = plotW / days.length;
  const barW = Math.max(Math.min(24, band - 2), 1); // 2px surface gap between touching bars
  const y = (v: number) => M.top + plotH - (v / max) * plotH;
  const labelEvery = Math.ceil(days.length / 7);
  const total = days.reduce((s, d) => s + d.executed, 0);
  const peak = days.reduce((best, d, i) => (d.executed > days[best].executed ? i : best), 0);

  const bar = (d: VelocityDay, i: number) => {
    if (d.executed === 0) return null; // a zero day draws nothing
    const x = M.left + i * band + (band - barW) / 2;
    const top = y(d.executed);
    const h = M.top + plotH - top;
    const r = Math.min(4, barW / 2, h);
    // Rounded data end, square at the baseline.
    const path = `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`;
    return <path key={d.date} d={path} fill={SERIES} opacity={active === null || active === i ? 1 : 0.55} />;
  };

  return (
    <figure className="min-w-0 border border-[var(--border)] bg-[var(--panel)] p-4">
      <figcaption className="mb-1">
        <div className="text-sm font-semibold text-[var(--text)]">Execution velocity</div>
        <div className="text-[11px] text-[var(--text-dim)]">Test cases executed per day · {fmt(total)} in {days.length} days</div>
      </figcaption>
      <div ref={ref} className="relative">
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" tabIndex={0} className="focus:outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--blue)]"
            aria-label={`Test cases executed per day over the last ${days.length} days; ${fmt(total)} in total. Use the arrow keys for each day, or the table view.`}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') setActive((a) => Math.min((a ?? -1) + 1, days.length - 1));
              else if (e.key === 'ArrowLeft') setActive((a) => Math.max((a ?? days.length) - 1, 0));
              else if (e.key === 'Escape') setActive(null);
            }}
            onBlur={() => setActive(null)} onPointerLeave={() => setActive(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} stroke="var(--border-soft)" strokeWidth={1} />
                <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--text-dim)" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(t)}</text>
              </g>
            ))}
            {days.map(bar)}
            {days[peak].executed > 0 && (
              <text x={M.left + peak * band + band / 2} y={y(days[peak].executed) - 5} textAnchor="middle" fontSize={10} fill="var(--text)">{fmt(days[peak].executed)}</text>
            )}
            {days.map((d, i) => (i % labelEvery === 0 || i === days.length - 1) && (i === days.length - 1 || days.length - 1 - i >= labelEvery / 2) ? (
              <text key={d.date} x={M.left + i * band + band / 2} y={HEIGHT - 8} textAnchor="middle" fontSize={10} fill="var(--text-dim)">{shortDate(d.date)}</text>
            ) : null)}
            {days.map((d, i) => (
              <rect key={d.date} x={M.left + i * band} y={M.top} width={band} height={plotH} fill="transparent" onPointerEnter={() => setActive(i)} />
            ))}
          </svg>
        )}
        {active !== null && (
          <Tooltip x={M.left + active * band + band / 2} y={y(days[active].executed)} width={width} beside>
            <div className="font-semibold text-[var(--text)]">{fmt(days[active].executed)} executed</div>
            <div className="text-[var(--text-dim)]">{shortDate(days[active].date)} · {days[active].runs} run{days[active].runs === 1 ? '' : 's'}</div>
          </Tooltip>
        )}
      </div>
    </figure>
  );
}

/** Pass rate per finished run over time; the crosshair snaps to the nearest run. */
function PassRateChart({ points, days, now }: { points: PassRatePoint[]; days: number; now: Date }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const plotW = Math.max(width - M.left - M.right, 10);
  const plotH = HEIGHT - M.top - M.bottom;
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1)).getTime();
  const t1 = now.getTime();
  const x = (iso: string) => M.left + ((new Date(iso).getTime() - t0) / Math.max(t1 - t0, 1)) * plotW;
  const y = (v: number) => M.top + plotH - (v / 100) * plotH;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.at).toFixed(1)},${y(p.rate).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  const nearest = (px: number) => points.reduce((best, p, i) => (Math.abs(x(p.at) - px) < Math.abs(x(points[best].at) - px) ? i : best), 0);
  const axisDates = [0, 0.5, 1].map((f) => new Date(t0 + f * (t1 - t0)));

  return (
    <figure className="min-w-0 border border-[var(--border)] bg-[var(--panel)] p-4">
      <figcaption className="mb-1">
        <div className="text-sm font-semibold text-[var(--text)]">Pass-rate trend</div>
        <div className="text-[11px] text-[var(--text-dim)]">Passed ÷ executed, per finished run · {points.length} run{points.length === 1 ? '' : 's'}</div>
      </figcaption>
      <div ref={ref} className="relative">
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" tabIndex={0} className="focus:outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--blue)]"
            aria-label={points.length ? `Pass rate of ${points.length} finished runs over the last ${days} days; latest ${last.rate}%. Use the arrow keys for each run, or the table view.` : `No finished runs in the last ${days} days.`}
            onKeyDown={(e) => {
              if (!points.length) return;
              if (e.key === 'ArrowRight') setActive((a) => Math.min((a ?? -1) + 1, points.length - 1));
              else if (e.key === 'ArrowLeft') setActive((a) => Math.max((a ?? points.length) - 1, 0));
              else if (e.key === 'Escape') setActive(null);
            }}
            onBlur={() => setActive(null)} onPointerLeave={() => setActive(null)}
            onPointerMove={(e) => { if (points.length) setActive(nearest(e.clientX - e.currentTarget.getBoundingClientRect().left)); }}>
            {[0, 25, 50, 75, 100].map((t) => (
              <g key={t}>
                <line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} stroke="var(--border-soft)" strokeWidth={1} />
                <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--text-dim)" style={{ fontVariantNumeric: 'tabular-nums' }}>{t}%</text>
              </g>
            ))}
            {axisDates.map((d, i) => (
              <text key={i} x={M.left + (i / 2) * plotW} y={HEIGHT - 8} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} fontSize={10} fill="var(--text-dim)">
                {d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
              </text>
            ))}
            {active !== null && <line x1={x(points[active].at)} x2={x(points[active].at)} y1={M.top} y2={M.top + plotH} stroke="var(--text-faint)" strokeWidth={1} />}
            {points.length > 1 && <path d={line} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
            {points.map((p, i) => (
              <circle key={p.id} cx={x(p.at)} cy={y(p.rate)} r={active === i ? 5 : 4} fill={SERIES} stroke="var(--panel)" strokeWidth={2} />
            ))}
            {last && <text x={x(last.at) + 8} y={y(last.rate)} dy="0.32em" fontSize={10} fill="var(--text)">{last.rate}%</text>}
            {!points.length && <text x={M.left + plotW / 2} y={M.top + plotH / 2} textAnchor="middle" fontSize={11} fill="var(--text-dim)">No finished runs in this range</text>}
          </svg>
        )}
        {active !== null && points[active] && (
          <Tooltip x={x(points[active].at)} y={y(points[active].rate)} width={width}>
            <div className="font-semibold text-[var(--text)]">{points[active].rate}% passed</div>
            <div className="truncate text-[var(--text-dim)]">{points[active].name}</div>
            <div className="text-[var(--text-dim)]">{fmt(points[active].passed)} of {fmt(points[active].executed)} · {new Date(points[active].at).toLocaleDateString()}</div>
          </Tooltip>
        )}
      </div>
    </figure>
  );
}

export const TrendCharts: React.FC<{ runs: TestRunItem[]; suites: TestSuiteItem[]; now?: Date }> = ({ runs, suites, now: nowProp }) => {
  const [suiteId, setSuiteId] = useState<string>('');
  const [range, setRange] = useState<(typeof RANGES)[number]>(30);
  const [asTable, setAsTable] = useState(false);
  const now = useMemo(() => nowProp ?? new Date(), [nowProp]);
  const days = useMemo(() => velocity(runs, range, now, suiteId || null), [runs, range, now, suiteId]);
  const points = useMemo(() => passRateTrend(runs, range, now, suiteId || null), [runs, range, now, suiteId]);
  const selectCls = 'border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 text-xs text-[var(--text)] focus:border-[var(--blue)] focus:outline-none';

  return (
    <section aria-label="Trends" className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-dim)]">Range
          <select aria-label="Range" className={selectCls} value={range} onChange={(e) => setRange(Number(e.target.value) as (typeof RANGES)[number])}>
            {RANGES.map((r) => <option key={r} value={r}>Last {r} days</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-dim)]">Suite
          <select aria-label="Suite" className={selectCls} value={suiteId} onChange={(e) => setSuiteId(e.target.value)}>
            <option value="">All suites</option>
            {suites.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => setAsTable((t) => !t)} aria-pressed={asTable}
          className="ml-auto border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-dim)] hover:text-[var(--text)]">
          {asTable ? 'Show charts' : 'Show as table'}
        </button>
      </div>

      {asTable ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <table className="w-full border border-[var(--border)] text-xs" aria-label="Test cases executed per day">
            <thead><tr className="text-left text-[var(--text-dim)]"><th className="px-3 py-1.5 font-semibold">Day</th><th className="px-3 py-1.5 text-right font-semibold">Executed</th><th className="px-3 py-1.5 text-right font-semibold">Runs</th></tr></thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date} className="border-t border-[var(--border)] text-[var(--text)]">
                  <td className="px-3 py-1">{shortDate(d.date)}</td>
                  <td className="px-3 py-1 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(d.executed)}</td>
                  <td className="px-3 py-1 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{d.runs}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="w-full border border-[var(--border)] text-xs" aria-label="Pass rate per finished run">
            <thead><tr className="text-left text-[var(--text-dim)]"><th className="px-3 py-1.5 font-semibold">Run</th><th className="px-3 py-1.5 font-semibold">Date</th><th className="px-3 py-1.5 text-right font-semibold">Passed</th><th className="px-3 py-1.5 text-right font-semibold">Pass rate</th></tr></thead>
            <tbody>
              {points.length === 0 && <tr><td colSpan={4} className="px-3 py-2 text-[var(--text-dim)]">No finished runs in this range.</td></tr>}
              {points.map((p) => (
                <tr key={p.id} className="border-t border-[var(--border)] text-[var(--text)]">
                  <td className="max-w-[16rem] truncate px-3 py-1">{p.name}</td>
                  <td className="px-3 py-1">{new Date(p.at).toLocaleDateString()}</td>
                  <td className="px-3 py-1 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(p.passed)} / {fmt(p.executed)}</td>
                  <td className="px-3 py-1 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{p.rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <VelocityChart days={days} />
          <PassRateChart points={points} days={range} now={now} />
        </div>
      )}
    </section>
  );
};
