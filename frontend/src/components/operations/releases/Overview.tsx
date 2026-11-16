import React, { useEffect, useState } from 'react';
import type { TestSuiteItem } from '../../../types/operations';
import { RELEASE_TYPES, SETTABLE_STATUSES, cancelRelease, updateRelease, type Release } from '../../../services/releasesApiService';
import { SignersPanel } from './SignersPanel';
import { type Act, Badge, Field, SectionHeader, btn, card, input, td, th, tr } from './common';

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
  const metrics: [string, React.ReactNode][] = [
    ['Milestones done', `${m.milestonesDone} / ${m.milestonesTotal}`], ['Builds', m.builds], ['Latest build', m.latestBuild ?? '-'],
    ['Latest pass rate', m.latestPassRate === null ? '-' : `${m.latestPassRate}%`], ['Open blockers', m.openBlockers], ['Final build', m.finalBuild ?? '-'],
  ];

  return (
    <div className="space-y-4">
      {cancelled && (
        <p role="status" className="text-xs bg-rose-50 border border-rose-200 text-rose-800 rounded-lg px-3 py-2">
          Cancelled{release.cancelledAt ? ` on ${release.cancelledAt.slice(0, 10)}` : ''}: {release.cancelledReason}. Nothing was deleted, and nothing here can change.
        </p>
      )}
      <ul aria-label="Release metrics" className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {metrics.map(([k, v]) => (
          <li key={k} className={`${card} py-3!`}>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">{k}</div>
            <div className="mt-1 text-lg font-bold text-[var(--text)] truncate">{v}</div>
          </li>
        ))}
      </ul>

      <div className="grid gap-4 xl:grid-cols-3 items-start">
        <div className="space-y-4 xl:col-span-2 min-w-0">
          <section className={`${card} space-y-4`} aria-label="Release details">
            <SectionHeader title="Release details" description={`Created by ${release.createdByName} on ${release.createdAt.slice(0, 10)}.`} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Version" hint={hasBuilds && !ro ? 'Fixed once a build is registered.' : undefined}>
                <input className={input} disabled={ro || hasBuilds} value={draft.version} onChange={(e) => set('version', e.target.value)} />
              </Field>
              <Field label="Title" className="lg:col-span-2"><input className={input} disabled={ro} value={draft.title ?? ''} onChange={(e) => set('title', e.target.value)} /></Field>
              <Field label="Type"><select className={input} disabled={ro} value={draft.type} onChange={(e) => set('type', e.target.value as Release['type'])}>{RELEASE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
              <Field label="Target date"><input type="date" className={input} disabled={ro} value={draft.targetDate} onChange={(e) => set('targetDate', e.target.value)} /></Field>
              {cancelled
                ? <div className="text-xs"><span className="block mb-1 text-[11px] font-medium text-[var(--text-dim)]">Status</span><Badge tone="red">Cancelled</Badge></div>
                : <Field label="Status"><select className={input} disabled={ro} value={draft.status} onChange={(e) => set('status', e.target.value as Release['status'])}>{SETTABLE_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>}
              <Field label="Customer segment / tenant" className="sm:col-span-2 lg:col-span-3"><input className={input} disabled={ro} value={draft.segment ?? ''} onChange={(e) => set('segment', e.target.value)} /></Field>
            </div>
          </section>

          <section className={`${card} space-y-3`} aria-label="Milestones">
            <SectionHeader title="Milestones" description="Planned and actual dates for each phase." />
            <div className="overflow-x-auto rounded-lg border border-[var(--border-soft)]">
              <table className="w-full text-xs">
                <thead><tr><th className={th}>Phase</th><th className={`${th} w-44`}>Planned</th><th className={`${th} w-44`}>Actual</th></tr></thead>
                <tbody>
                  {draft.milestones.map((ms, i) => (
                    <tr key={ms.key} className={tr}>
                      <td className={`${td} align-middle font-semibold text-[var(--text)]`}>{ms.name}</td>
                      {(['plannedDate', 'actualDate'] as const).map((f) => (
                        <td key={f} className="px-3 py-1.5">
                          <input type="date" aria-label={`${ms.name} ${f === 'plannedDate' ? 'planned' : 'actual'} date`} className={input} disabled={ro} value={ms[f] ?? ''}
                            onChange={(e) => set('milestones', draft.milestones.map((x, j) => (j === i ? { ...x, [f]: e.target.value || null } : x)))} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="space-y-4 min-w-0">
          <SignersPanel release={release} act={act} />

          <section aria-label="Readiness rules" className={`${card} text-xs space-y-3`}>
            <SectionHeader title="Readiness rules" description={hasFinal ? 'The rules are fixed once a build is Final.' : 'What a build must meet before it can go Final.'} />
            <label className="flex items-center justify-between gap-3">
              <span>Minimum pass rate (%)</span>
              <input type="number" min={0} max={100} className={`${input} w-20! text-right`} disabled={ro || hasFinal} value={draft.gateRules.minPassRate} onChange={(e) => set('gateRules', { ...draft.gateRules, minPassRate: Number(e.target.value) })} />
            </label>
            <label className="flex items-center gap-2"><input type="checkbox" disabled={ro || hasFinal} checked={draft.gateRules.requireNoOpenBlockers} onChange={(e) => set('gateRules', { ...draft.gateRules, requireNoOpenBlockers: e.target.checked })} /> No open Critical or Blocker issues</label>
            <fieldset className="space-y-1.5 border-t border-[var(--border-soft)] pt-3">
              <legend className="mb-1.5 text-[11px] font-medium text-[var(--text-dim)]">Mandatory regression suites (must be 100% executed)</legend>
              {suites.length === 0 && <p className="text-slate-500">No test suites yet.</p>}
              {suites.map((s) => (
                <label key={s.id} className="flex items-start gap-2"><input type="checkbox" className="mt-0.5" disabled={ro || hasFinal} checked={draft.gateRules.mandatorySuiteIds.includes(s.id)}
                  onChange={(e) => set('gateRules', { ...draft.gateRules, mandatorySuiteIds: e.target.checked ? [...draft.gateRules.mandatorySuiteIds, s.id] : draft.gateRules.mandatorySuiteIds.filter((x) => x !== s.id) })} />{s.title}</label>
              ))}
            </fieldset>
          </section>
        </div>
      </div>

      {release.canEdit && (
        <div className={`${card} flex flex-wrap items-center justify-between gap-3`}>
          <p className="text-xs text-slate-500">Saves the release details, milestones and readiness rules. Signers are saved on their own.</p>
          <button type="button" onClick={() => act(() => updateRelease(release.id, {
            version: draft.version, title: draft.title, type: draft.type, targetDate: draft.targetDate, segment: draft.segment,
            status: cancelled ? undefined : draft.status, milestones: draft.milestones, gateRules: draft.gateRules,
          }), 'Release saved.')} className={`${btn} bg-emerald-700 hover:bg-emerald-800 text-white`}>Save release</button>
        </div>
      )}

      {release.canEdit && release.status !== 'Deployed' && (
        <details className={`${card} border-rose-200`}>
          <summary className="cursor-pointer text-xs font-semibold text-rose-700">Cancel this release</summary>
          <div className="mt-3 flex flex-wrap gap-2 items-end">
            <Field label="Reason (kept in the audit log)" className="flex-1 min-w-60"><input className={input} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            <button type="button" disabled={!reason.trim()} onClick={() => act(() => cancelRelease(release.id, reason), 'Release cancelled.')} className={`${btn} border border-rose-300 text-rose-700`}>Cancel release</button>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">A cancelled release can't be changed or reopened. Its builds, sign-offs and history are kept.</p>
        </details>
      )}
    </div>
  );
};
