import React, { useEffect, useState } from 'react';
import type { TestSuiteItem } from '../../../types/operations';
import { RELEASE_TYPES, SETTABLE_STATUSES, cancelRelease, updateRelease, type Release } from '../../../services/releasesApiService';
import { SignersPanel } from './SignersPanel';
import { type Act, Badge, btn, card, input } from './common';

export const Overview: React.FC<{ release: Release; suites: TestSuiteItem[]; act: Act }> = ({ release, suites, act }) => {
  const [draft, setDraft] = useState(release);
  const [reason, setReason] = useState('');
  useEffect(() => setDraft(release), [release]);
  const set = <K extends keyof Release>(k: K, v: Release[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const m = release.metrics;
  const ro = !release.canEdit;
  const hasBuilds = release.metrics.builds > 0;
  const hasFinal = release.metrics.finalBuild !== null;
  const cancelled = release.status === 'Cancelled';

  return (
    <div className="space-y-4">
      {cancelled && (
        <p role="status" className="text-xs bg-rose-50 border border-rose-200 text-rose-800 rounded-lg px-3 py-2">
          Cancelled{release.cancelledAt ? ` on ${release.cancelledAt.slice(0, 10)}` : ''}: {release.cancelledReason}. Nothing was deleted, and nothing here can change.
        </p>
      )}
      <ul aria-label="Release metrics" className="grid grid-cols-2 md:grid-cols-6 gap-2">
        {[['Milestones done', `${m.milestonesDone} / ${m.milestonesTotal}`], ['Builds', m.builds], ['Latest build', m.latestBuild ?? '-'],
          ['Latest pass rate', m.latestPassRate === null ? '-' : `${m.latestPassRate}%`], ['Open blockers', m.openBlockers], ['Final build', m.finalBuild ?? '-']].map(([k, v]) => (
          <li key={k as string} className={card}><div className="text-[10px] uppercase text-slate-500">{k}</div><div className="text-sm font-bold text-slate-900">{v}</div></li>
        ))}
      </ul>

      <section className={`${card} grid grid-cols-2 md:grid-cols-3 gap-3`} aria-label="Release details">
        <label className="text-xs">Version<input className={input} disabled={ro || hasBuilds} value={draft.version} onChange={(e) => set('version', e.target.value)} />
          {hasBuilds && !ro && <span className="text-[10px] text-slate-500">Fixed once a build is registered.</span>}</label>
        <label className="text-xs">Title<input className={input} disabled={ro} value={draft.title ?? ''} onChange={(e) => set('title', e.target.value)} /></label>
        <label className="text-xs">Type<select className={input} disabled={ro} value={draft.type} onChange={(e) => set('type', e.target.value as Release['type'])}>{RELEASE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="text-xs">Target date<input type="date" className={input} disabled={ro} value={draft.targetDate} onChange={(e) => set('targetDate', e.target.value)} /></label>
        <label className="text-xs">Customer segment / tenant<input className={input} disabled={ro} value={draft.segment ?? ''} onChange={(e) => set('segment', e.target.value)} /></label>
        <label className="text-xs">Status
          {cancelled ? <div className="pt-1.5"><Badge tone="red">Cancelled</Badge></div> : (
            <select className={input} disabled={ro} value={draft.status} onChange={(e) => set('status', e.target.value as Release['status'])}>{SETTABLE_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
          )}
        </label>
        <p className="col-span-full text-[11px] text-slate-500">Created by {release.createdByName} on {release.createdAt.slice(0, 10)}.</p>
      </section>

      <SignersPanel release={release} act={act} />

      <section className={card} aria-label="Milestones">
        <h3 className="text-sm font-bold text-slate-800 mb-2">Milestones</h3>
        <table className="w-full text-xs"><thead><tr className="text-left text-slate-500"><th>Phase</th><th>Planned</th><th>Actual</th></tr></thead><tbody>
          {draft.milestones.map((ms, i) => (
            <tr key={ms.key}><td className="py-1 font-semibold">{ms.name}</td>
              {(['plannedDate', 'actualDate'] as const).map((f) => (
                <td key={f}><input type="date" aria-label={`${ms.name} ${f === 'plannedDate' ? 'planned' : 'actual'} date`} className={input} disabled={ro} value={ms[f] ?? ''}
                  onChange={(e) => set('milestones', draft.milestones.map((x, j) => (j === i ? { ...x, [f]: e.target.value || null } : x)))} /></td>
              ))}</tr>
          ))}
        </tbody></table>
      </section>

      <section aria-label="Readiness rules" className={`${card} text-xs space-y-2`}>
        <h3 className="text-sm font-bold text-slate-800">Readiness rules</h3>
        {hasFinal && <p className="text-slate-500">The rules are fixed once a build is Final.</p>}
        <label className="block">Minimum pass rate (%)<input type="number" min={0} max={100} className={input} disabled={ro || hasFinal} value={draft.gateRules.minPassRate} onChange={(e) => set('gateRules', { ...draft.gateRules, minPassRate: Number(e.target.value) })} /></label>
        <label className="flex items-center gap-2"><input type="checkbox" disabled={ro || hasFinal} checked={draft.gateRules.requireNoOpenBlockers} onChange={(e) => set('gateRules', { ...draft.gateRules, requireNoOpenBlockers: e.target.checked })} /> No open Critical or Blocker issues</label>
        <div>Mandatory regression suites (must be 100% executed)
          {suites.map((s) => (
            <label key={s.id} className="flex items-center gap-2"><input type="checkbox" disabled={ro || hasFinal} checked={draft.gateRules.mandatorySuiteIds.includes(s.id)}
              onChange={(e) => set('gateRules', { ...draft.gateRules, mandatorySuiteIds: e.target.checked ? [...draft.gateRules.mandatorySuiteIds, s.id] : draft.gateRules.mandatorySuiteIds.filter((x) => x !== s.id) })} />{s.title}</label>
          ))}
        </div>
      </section>

      {release.canEdit && (
        <button type="button" onClick={() => act(() => updateRelease(release.id, {
          version: draft.version, title: draft.title, type: draft.type, targetDate: draft.targetDate, segment: draft.segment,
          status: cancelled ? undefined : draft.status, milestones: draft.milestones, gateRules: draft.gateRules,
        }), 'Release saved.')} className={`${btn} bg-emerald-700 hover:bg-emerald-800 text-white`}>Save release</button>
      )}

      {release.canEdit && release.status !== 'Deployed' && (
        <details className={card}>
          <summary className="cursor-pointer text-xs font-semibold text-slate-700">Cancel this release</summary>
          <div className="mt-2 flex gap-2 items-end">
            <label className="text-xs flex-1">Reason (kept in the audit log)<input className={input} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
            <button type="button" disabled={!reason.trim()} onClick={() => act(() => cancelRelease(release.id, reason), 'Release cancelled.')} className={`${btn} border border-rose-300 text-rose-700`}>Cancel release</button>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">A cancelled release can't be changed or reopened. Its builds, sign-offs and history are kept.</p>
        </details>
      )}
    </div>
  );
};
