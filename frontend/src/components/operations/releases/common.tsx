import React from 'react';
import { navigateTo } from '../../../services/releasesRoute';

export const input = 'w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-500';
export const btn = 'px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed';
export const card = 'bg-white border border-slate-200 rounded-xl p-4 shadow-xs';

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
