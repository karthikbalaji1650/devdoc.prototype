import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { SEVERITIES, addBlocker, deleteBlocker, lookupBlocker, syncBlockers, updateBlocker, updateRelease, type BlockerQuery, type Release } from '../../../services/releasesApiService';
import { connected, loadTrackers } from '../../../services/trackersApiService';
import { type Act, Badge, Field, btn, card, input, severityTone, tableFrame, td, th, tr } from './common';

export const Blockers: React.FC<{ release: Release; act: Act }> = ({ release, act }) => {
  const canManage = release.canEdit;
  const empty = { key: '', tracker: 'Jira' as 'Jira' | 'GitHub', title: '', url: '', severity: 'Major' as (typeof SEVERITIES)[number] };
  const [form, setForm] = useState(empty);
  // Jira / GitHub (044): which trackers are connected, the release's query, link by key.
  const [trackers, setTrackers] = useState<{ jira: boolean; github: boolean }>({ jira: false, github: false });
  useEffect(() => { loadTrackers().then((c) => setTrackers(connected(c))).catch(() => {}); }, []);
  const anyTracker = trackers.jira || trackers.github;
  const q = release.blockerQuery ?? {};
  const [jql, setJql] = useState(q.jira?.jql ?? '');
  const [repo, setRepo] = useState(q.github?.repo ?? '');
  const [label, setLabel] = useState(q.github?.label ?? 'release-blocker');
  const [link, setLink] = useState<{ tracker: 'Jira' | 'GitHub'; key: string }>({ tracker: trackers.jira || !trackers.github ? 'Jira' : 'GitHub', key: '' });
  const sync = release.blockerSync;
  const fromTracker = (b: Release['blockers'][number]) => b.source === 'synced' || b.source === 'linked';

  const saveQuery = () => act(async () => {
    const blockerQuery: BlockerQuery = {};
    if (jql.trim()) blockerQuery.jira = { jql: jql.trim() };
    if (repo.trim()) blockerQuery.github = { repo: repo.trim(), label: label.trim() || 'release-blocker' };
    await updateRelease(release.id, { blockerQuery: Object.keys(blockerQuery).length ? blockerQuery : null });
    const result = await syncBlockers(release.id);
    if (result.error) throw new Error(result.error);
  }, 'Blocker query saved and synced.');

  return (
    <div className="space-y-3">
      {!canManage && <p className="text-xs text-slate-500">Only {release.createdByName}, who created this release, manages its blockers.</p>}
      <p className="text-xs text-slate-500">
        {anyTracker
          ? 'Jira / GitHub issues blocking this release. Issues read from a tracker keep their status, title and severity in step with it; others are entered by hand.'
          : 'Jira / GitHub issues blocking this release, entered by hand. An admin can connect Jira or GitHub under Settings → System & Storage to read them from the tracker.'}
      </p>

      {anyTracker && (
        <section aria-label="Blocker query" className={`${card} space-y-2`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[var(--text)]">Issues marked as blockers for this release</h3>
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              {sync && (sync.error
                ? <span className="text-[var(--danger)]">Last sync failed: {sync.error}</span>
                : <span>Synced {new Date(sync.at).toLocaleString()}</span>)}
              {canManage && (release.blockerQuery || release.blockers.some(fromTracker)) && (
                <button type="button" onClick={() => act(async () => { const r = await syncBlockers(release.id); if (r.error) throw new Error(r.error); }, 'Blockers synced.')} className={`${btn} border border-slate-300`}>Sync now</button>
              )}
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            {trackers.jira && (
              <Field label="Jira JQL" className="md:col-span-3">
                <input className={`${input} font-mono`} disabled={!canManage} value={jql} onChange={(e) => setJql(e.target.value)} placeholder={`fixVersion = "${release.version}" AND labels = release-blocker`} />
              </Field>
            )}
            {trackers.github && <>
              <Field label="GitHub repository" className="md:col-span-2"><input className={`${input} font-mono`} disabled={!canManage} value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repo" /></Field>
              <Field label="Label"><input className={`${input} font-mono`} disabled={!canManage} value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
            </>}
          </div>
          {canManage && <button type="button" onClick={() => void saveQuery()} className={`${btn} bg-blue-600 text-white`}>Save and sync</button>}
          <p className="text-[10px] text-slate-500">Synced every 5 minutes. An issue that stops matching is closed here.</p>
        </section>
      )}

      <div className={tableFrame}>
        <table className="w-full text-xs" aria-label="Release blockers">
          <thead><tr><th className={th}>Issue</th><th className={th}>Title</th><th className={th}>Severity</th><th className={th}>Status</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {release.blockers.map((b) => (
              <tr key={b.id} className={tr}>
                <td className={`${td} whitespace-nowrap`}>
                  <div className="font-mono font-semibold">{b.url ? <a href={b.url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">{b.key}</a> : b.key}</div>
                  <div className="mt-0.5 text-[10px] text-[var(--text-dim)]">{b.tracker}{fromTracker(b) ? ` · ${b.source === 'synced' ? 'from query' : 'linked'}` : ''}</div>
                </td>
                <td className={td}>{b.title ?? '-'}{b.syncNote && <div className="mt-0.5 text-[10px] text-slate-500">{b.syncNote}</div>}</td>
                <td className={td}><Badge tone={severityTone(b.severity)}>{b.severity}</Badge></td>
                <td className={td}><Badge tone={b.status === 'Open' ? 'red' : 'green'}>{b.status}</Badge></td>
                <td className={`${td} text-right whitespace-nowrap`}>{canManage && <>
                  {!fromTracker(b) && (
                    <button type="button" onClick={() => act(() => updateBlocker(release.id, b.id, { status: b.status === 'Open' ? 'Closed' : 'Open' }), `${b.key} ${b.status === 'Open' ? 'closed' : 'reopened'}.`)} className="text-blue-700 hover:underline mr-3">{b.status === 'Open' ? 'Close' : 'Reopen'}</button>
                  )}
                  <button type="button" aria-label={`Remove ${b.key}`} onClick={() => act(() => deleteBlocker(release.id, b.id), `${b.key} removed.`)} className="align-middle text-[var(--text-dim)] hover:text-rose-600"><Trash2 className="w-3.5 h-3.5 inline" /></button>
                </>}</td>
              </tr>
            ))}
            {release.blockers.length === 0 && <tr className={tr}><td colSpan={5} className={`${td} text-slate-500`}>No blockers.</td></tr>}
          </tbody>
        </table>
      </div>

      {canManage && anyTracker && (
        <form aria-label="Link issue" className={`${card} flex flex-wrap gap-3 items-end`} onSubmit={(e) => { e.preventDefault(); void act(async () => { await lookupBlocker(release.id, link.tracker, link.key); setLink({ ...link, key: '' }); }, `${link.key} linked.`); }}>
          <Field label="Tracker"><select className={input} value={link.tracker} onChange={(e) => setLink({ ...link, tracker: e.target.value as 'Jira' | 'GitHub' })}>
            {trackers.jira && <option>Jira</option>}{trackers.github && <option>GitHub</option>}
          </select></Field>
          <Field label="Issue key" className="flex-1 min-w-40"><input className={`${input} font-mono`} value={link.key} onChange={(e) => setLink({ ...link, key: e.target.value })} placeholder={link.tracker === 'Jira' ? 'WH3-1300' : 'owner/repo#42'} required /></Field>
          <button type="submit" className={`${btn} bg-blue-600 text-white`}>Link issue</button>
        </form>
      )}
      {canManage && (
        <details className={card} open={!anyTracker}>
          <summary className="cursor-pointer text-sm font-semibold text-[var(--text)]">Log a blocker by hand</summary>
          <form aria-label="Log blocker" className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); void act(async () => { await addBlocker(release.id, { ...form, title: form.title || undefined, url: form.url || undefined }); setForm(empty); }, `${form.key} logged.`); }}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Issue key"><input className={`${input} font-mono`} value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="WH3-1300 or #42" required /></Field>
              <Field label="Tracker"><select className={input} value={form.tracker} onChange={(e) => setForm({ ...form, tracker: e.target.value as 'Jira' | 'GitHub' })}><option>Jira</option><option>GitHub</option></select></Field>
              <Field label="Severity"><select className={input} value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as (typeof SEVERITIES)[number] })}>{SEVERITIES.map((s) => <option key={s}>{s}</option>)}</select></Field>
              <Field label="URL"><input className={input} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://" /></Field>
              <Field label="Title" className="sm:col-span-2 lg:col-span-4"><input className={input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            </div>
            <div className="flex justify-end"><button type="submit" className={`${btn} bg-blue-600 text-white`}>Log blocker</button></div>
          </form>
        </details>
      )}
    </div>
  );
};
