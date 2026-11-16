import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { AUDIT_ACTIONS, draftReleaseNotes, loadAudit, updateRelease, type AuditEntry, type Release } from '../../../services/releasesApiService';
import { formatAuditDetails } from './auditFormat';
import { type Act, Badge, SectionHeader, btn, card, input, tableFrame, td, th, tr } from './common';

export const Notes: React.FC<{ release: Release; runName: (id: string) => string; act: Act }> = ({ release, runName, act }) => {
  const [text, setText] = useState(release.notes);
  return (
    <section className={`${card} space-y-3`}>
      <SectionHeader
        title="Release notes"
        description={release.canEdit ? 'Markdown. "Draft from release" fills it in from the builds and linked test runs; edit it before saving.' : undefined}
        actions={release.canEdit && <>
          <button type="button" onClick={() => setText(draftReleaseNotes(release, runName))} className={`${btn} border border-slate-300`}>Draft from release</button>
          <button type="button" onClick={() => act(() => updateRelease(release.id, { notes: text }), 'Release notes saved.')} className={`${btn} bg-emerald-700 hover:bg-emerald-800 text-white`}>Save notes</button>
        </>}
      />
      <textarea aria-label="Release notes" className={`${input} font-mono leading-relaxed`} rows={18} disabled={!release.canEdit} value={text} onChange={(e) => setText(e.target.value)} placeholder="No release notes yet." />
      {!release.canEdit && <p className="text-xs text-slate-500">Only {release.createdByName}, who created this release, edits its notes.</p>}
    </section>
  );
};

export const Audit: React.FC<{ releaseId: string }> = ({ releaseId }) => {
  const [log, setLog] = useState<{ entries: AuditEntry[]; intact: boolean } | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { loadAudit(releaseId).then(setLog, (e: Error) => setError(e.message)); }, [releaseId]);
  useEffect(load, [load]);
  if (error) return <p role="alert" className="text-xs text-rose-600">{error}</p>;
  if (!log) return <p role="status" className="text-xs text-slate-500">Loading…</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {log.intact ? <Badge tone="green">Log intact</Badge> : <Badge tone="red">Log altered - entries do not match their chain</Badge>}
        <span className="text-slate-500">Entries are written by the server and cannot be edited or deleted.</span>
        <button type="button" onClick={load} className={`${btn} ml-auto flex items-center gap-1.5 border border-slate-300`}><RefreshCw className="w-3 h-3" /> Refresh</button>
      </div>
      <div className={tableFrame}>
        <table className="w-full text-xs" aria-label="Audit log">
          <thead><tr><th className={`${th} w-12 text-right`}>#</th><th className={th}>When</th><th className={th}>Who</th><th className={th}>Action</th><th className={th}>Details</th></tr></thead>
          <tbody>
            {[...log.entries].reverse().map((e) => (
              <tr key={e.seq} className={tr}>
                <td className={`${td} text-right tabular-nums text-slate-500`}>{e.seq}</td>
                <td className={`${td} whitespace-nowrap`}>{new Date(e.at).toLocaleString()}</td>
                <td className={`${td} whitespace-nowrap`}>{e.actor}</td>
                <td className={`${td} whitespace-nowrap font-semibold`}>{AUDIT_ACTIONS[e.action] ?? e.action}</td>
                <td className={td}>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                    {formatAuditDetails(e.details).map(({ label, value }) => (
                      <React.Fragment key={label}>
                        <dt className="text-[var(--text-dim)] whitespace-nowrap">{label}</dt>
                        <dd className={`text-[var(--text)] break-all ${label === 'SHA-256' ? 'font-mono' : ''}`}>{value}</dd>
                      </React.Fragment>
                    ))}
                  </dl>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
