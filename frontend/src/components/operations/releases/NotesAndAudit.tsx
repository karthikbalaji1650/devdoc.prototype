import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { draftReleaseNotes, loadAudit, updateRelease, type AuditEntry, type Release } from '../../../services/releasesApiService';
import { type Act, Badge, btn, card, input } from './common';

export const Notes: React.FC<{ release: Release; runName: (id: string) => string; act: Act }> = ({ release, runName, act }) => {
  const [text, setText] = useState(release.notes);
  return (
    <div className="space-y-2">
      <textarea aria-label="Release notes" className={`${input} font-mono`} rows={16} disabled={!release.canEdit} value={text} onChange={(e) => setText(e.target.value)} placeholder="No release notes yet." />
      {release.canEdit ? (
        <div className="flex gap-2">
          <button type="button" onClick={() => setText(draftReleaseNotes(release, runName))} className={`${btn} border border-slate-300`}>Draft from release</button>
          <button type="button" onClick={() => act(() => updateRelease(release.id, { notes: text }), 'Release notes saved.')} className={`${btn} bg-emerald-700 hover:bg-emerald-800 text-white`}>Save notes</button>
        </div>
      ) : <p className="text-xs text-slate-500">Only {release.createdByName}, who created this release, edits its notes.</p>}
    </div>
  );
};

const ACTIONS: Record<string, string> = {
  'release-created': 'Release created', 'release-edited': 'Release details changed', 'status-changed': 'Status changed',
  'release-cancelled': 'Release cancelled', 'signers-changed': 'Signers changed', 'build-registered': 'Build registered',
  'test-runs-linked': 'Test runs linked', 'gates-overridden': 'Gates overridden', 'signed-off': 'Signed off',
  'promoted-to-final': 'Promoted to Final', 'blocker-logged': 'Blocker logged', 'blocker-closed': 'Blocker closed',
  'blocker-open': 'Blocker reopened', 'blocker-removed': 'Blocker removed', 'blockers-synced': 'Blockers synced from Jira / GitHub',
  'blocker-query-changed': 'Blocker query changed', 'gate-rules-changed': 'Readiness rules changed',
};

export const Audit: React.FC<{ releaseId: string }> = ({ releaseId }) => {
  const [log, setLog] = useState<{ entries: AuditEntry[]; intact: boolean } | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { loadAudit(releaseId).then(setLog, (e: Error) => setError(e.message)); }, [releaseId]);
  useEffect(load, [load]);
  if (error) return <p role="alert" className="text-xs text-rose-600">{error}</p>;
  if (!log) return <p role="status" className="text-xs text-slate-500">Loading…</p>;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        {log.intact ? <Badge tone="green">Log intact</Badge> : <Badge tone="red">Log altered - entries do not match their chain</Badge>}
        <span className="text-slate-500">Entries are written by the server and cannot be edited or deleted.</span>
        <button type="button" onClick={load} className="ml-auto text-slate-500 hover:text-slate-800 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Refresh</button>
      </div>
      <table className={`${card} w-full text-xs`} aria-label="Audit log"><thead><tr className="text-left text-slate-500"><th>#</th><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead><tbody>
        {[...log.entries].reverse().map((e) => (
          <tr key={e.seq} className="border-t border-slate-100 align-top">
            <td className="py-1 text-slate-400">{e.seq}</td><td className="whitespace-nowrap">{new Date(e.at).toLocaleString()}</td>
            <td>{e.actor}</td><td className="font-semibold">{ACTIONS[e.action] ?? e.action}</td>
            <td className="text-slate-600 break-all">{Object.entries(e.details).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ')}</td>
          </tr>
        ))}
      </tbody></table>
    </div>
  );
};
