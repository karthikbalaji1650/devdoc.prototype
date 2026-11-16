import React from 'react';
import { navigateTo } from '../../../services/releasesRoute';

export const input = 'w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-500';
export const btn = 'px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed';
export const card = 'bg-white border border-slate-200 rounded-xl p-4 shadow-xs';
/** A panel inside a card (build details, gates, sign-offs). */
export const subPanel = 'rounded-lg border border-[var(--border-soft)] bg-[var(--bg)] p-3';

// Tables: the card is the frame; cells carry their own padding.
export const tableFrame = 'bg-white border border-slate-200 rounded-xl overflow-x-auto';
export const th = 'px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)] bg-[var(--panel-alt)] whitespace-nowrap';
export const td = 'px-3 py-2.5 align-top';
export const tr = 'border-t border-[var(--border-soft)]';

/** A labelled input: the label text sits above the control. */
export const Field: React.FC<{ label: string; hint?: string; className?: string; children: React.ReactNode }> = ({ label, hint, className = '', children }) => (
  <div className={className}>
    <label className="block text-xs">
      <span className="block mb-1 text-[11px] font-medium text-[var(--text-dim)]">{label}</span>
      {children}
    </label>
    {hint && <p className="mt-1 text-[10px] text-[var(--text-dim)]">{hint}</p>}
  </div>
);

/** A section heading with an optional line under it and actions on the right. */
export const SectionHeader: React.FC<{ title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }> = ({ title, description, actions }) => (
  <div className="flex flex-wrap items-start justify-between gap-2">
    <div>
      <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
      {description && <p className="mt-0.5 text-[11px] text-[var(--text-dim)]">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

/** A label / value pair in a details list. */
export const Detail: React.FC<{ label: string; className?: string; children: React.ReactNode }> = ({ label, className = '', children }) => (
  <div className={`min-w-0 ${className}`}>
    <dt className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">{label}</dt>
    <dd className="mt-0.5 text-xs text-[var(--text)] break-all">{children}</dd>
  </div>
);

/** Runs a change, then reloads; shows the server's message on failure. */
export type Act = (op: () => Promise<unknown>, done: string) => Promise<void>;

export type Tone = 'green' | 'red' | 'amber' | 'slate' | 'blue';
const TONES: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  red: 'bg-rose-50 text-rose-700 border-rose-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
};

export const Badge: React.FC<{ tone: Tone; children: React.ReactNode }> = ({ tone, children }) => (
  <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${TONES[tone]}`}>{children}</span>
);

export const statusTone = (status: string): Tone =>
  status === 'Approved' || status === 'Deployed' ? 'green' : status === 'Cancelled' ? 'red' : status === 'RC Frozen' ? 'amber' : status === 'In Progress' ? 'blue' : 'slate';

export const severityTone = (severity: string): Tone =>
  severity === 'Blocker' || severity === 'Critical' ? 'red' : severity === 'Major' ? 'amber' : 'slate';

/** An ordinary link that moves around Release Master without reloading the page. */
export const AppLink: React.FC<React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }> = ({ to, onClick, children, ...rest }) => (
  <a
    href={to}
    onClick={(e) => {
      onClick?.(e);
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      navigateTo(to);
    }}
    {...rest}
  >
    {children}
  </a>
);
