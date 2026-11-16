import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { getStoredSession } from '../../services/authService';
import { loadTestManagement } from '../../services/testManagementApiService';
import type { TestRunItem, TestSuiteItem } from '../../types/operations';
import {
  createRelease, isReleasesAvailable, loadRelease, loadReleases,
  type NewRelease, type Release, type ReleaseLine,
} from '../../services/releasesApiService';
import { RELEASE_TABS, navigateTo, parseReleasesPath, releasesPath, type ReleaseTab } from '../../services/releasesRoute';
import { useLocationPath } from '../../hooks/useLocationPath';
import { Audit, Notes } from './releases/NotesAndAudit';
import { Blockers } from './releases/Blockers';
import { Builds } from './releases/Builds';
import { NewReleaseForm } from './releases/NewReleaseForm';
import { Overview } from './releases/Overview';
import { ReleaseList } from './releases/ReleaseList';
import { type Act, AppLink, Badge, btn, card, statusTone } from './releases/common';

// Release Master (DDS-SRS-033 - 046). Data, gate evaluation, who-may-do-what
// and the audit log live on the server; this screen shows them and sends
// changes. Every release and tab has its own URL (see releasesRoute.ts).
//
// Anyone signed in can create a release and read any release. The creator
// changes it; its signers (the creator plus 1 to 4 people they pick) sign
// off, override gates and promote.

const TAB_LABELS = (r: Release): Record<ReleaseTab, string> => ({
  overview: 'Overview', builds: `Builds (${r.builds.length})`, blockers: `Blockers (${r.metrics.openBlockers} open)`, notes: 'Release notes', audit: 'Audit log',
});

export const ReleaseMaster: React.FC = () => {
  const path = useLocationPath();
  const route = parseReleasesPath(path);
  const me = getStoredSession()?.user;
  const [lines, setLines] = useState<ReleaseLine[] | null>(null);
  const [release, setRelease] = useState<Release | null>(null);
  const [runs, setRuns] = useState<TestRunItem[]>([]);
  const [suites, setSuites] = useState<TestSuiteItem[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const openId = route.view === 'release' ? route.releaseId : null;

  // A message is about the page it was shown on: clear it on leaving.
  useEffect(() => { setNotice(''); setError(''); }, [path]);

  const refresh = useCallback(async () => {
    if (openId) setRelease(await loadRelease(openId));
    else setLines(await loadReleases());
  }, [openId]);

  useEffect(() => {
    if (!isReleasesAvailable() || route.view === 'new') return;
    setRelease(null);
    setError('');
    refresh().catch((err: Error) => setError(err.message));
  }, [refresh, route.view]);

  useEffect(() => {
    if (!isReleasesAvailable() || !openId) return;
    loadTestManagement().then((tm) => { setRuns(tm.runs); setSuites(tm.suites); }).catch(() => undefined);
  }, [openId]);

  const act: Act = async (op, done) => {
    setError(''); setNotice('');
    try { await op(); await refresh(); setNotice(done); } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };

  if (!isReleasesAvailable()) {
    return <div className={card}><h2 className="text-lg font-bold text-slate-900">Release Master</h2><p className="text-xs text-slate-600 mt-1">Releases are stored on the server. Run the app with VITE_API_BASE_URL set.</p></div>;
  }
  const runName = (id: string) => runs.find((r) => r.id === id)?.name ?? id;

  return (
    <div className="space-y-4 text-left">
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-[var(--border)]">
        <div>
          <h2 className="text-xl font-bold text-[var(--text)]">Release Master</h2>
          <p className="text-xs text-[var(--text-dim)] mt-1">Releases, release candidate builds, readiness gates, sign-offs and audit log.</p>
        </div>
        {route.view !== 'new' && (
          <AppLink to={releasesPath({ view: 'new' })} className={`${btn} flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white`}><Plus className="w-3.5 h-3.5" /> New release</AppLink>
        )}
      </div>

      {error && <p role="alert" className="text-xs rounded-lg border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2">{error}</p>}
      {notice && <p role="status" className="text-xs rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 px-3 py-2">{notice}</p>}

      {route.view === 'new' && me && (
        <NewReleaseForm creatorId={me.id} creatorName={me.name} onCancel={() => navigateTo(releasesPath())}
          onCreate={(body: NewRelease) => {
            setError(''); setNotice('');
            createRelease(body).then(
              (created) => navigateTo(releasesPath({ view: 'release', releaseId: created.id, tab: 'overview', buildId: null })),
              (err: Error) => setError(err.message),
            );
          }} />
      )}

      {route.view === 'list' && (
        lines === null && !error
          ? <p role="status" className="text-xs text-slate-500">Loading releases…</p>
          : lines && <ReleaseList releases={lines} meId={me?.id ?? ''} />
      )}

      {route.view === 'release' && (
        release === null
          ? (!error && <p role="status" className="text-xs text-slate-500">Loading release…</p>)
          : (
            <>
              <header className="space-y-2">
                <AppLink to={releasesPath()} className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline"><ArrowLeft aria-hidden className="w-3.5 h-3.5" />All releases</AppLink>
                <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-2xl font-bold text-[var(--text)]">{release.version}</h3>
                      <Badge tone={statusTone(release.status)}>{release.status}</Badge>
                      <Badge tone="slate">{release.type}</Badge>
                    </div>
                    {release.title && <p className="mt-1 text-sm text-[var(--text)]">{release.title}</p>}
                    <p className="mt-1 text-xs text-[var(--text-dim)]">
                      {release.createdBy === me?.id ? 'You created this release' : release.isSigner ? `You are a signer · created by ${release.createdByName}` : `Created by ${release.createdByName}`}
                    </p>
                  </div>
                  <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                    <div><dt className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">Target date</dt><dd className="text-[var(--text)]">{release.targetDate}</dd></div>
                    {release.segment && <div><dt className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">Customer</dt><dd className="text-[var(--text)]">{release.segment}</dd></div>}
                  </dl>
                </div>
              </header>
              <div role="tablist" aria-label="Release sections" className="flex gap-1 overflow-x-auto border-b border-slate-200">
                {RELEASE_TABS.map((t) => (
                  <AppLink key={t} role="tab" aria-selected={route.tab === t} to={releasesPath({ view: 'release', releaseId: release.id, tab: t, buildId: null })}
                    className={`px-3 py-2 text-xs whitespace-nowrap border-b-2 -mb-px ${route.tab === t ? 'border-[var(--blue)] text-[var(--text)] font-semibold' : 'border-transparent text-[var(--text-dim)]'}`}>
                    {TAB_LABELS(release)[t]}
                  </AppLink>
                ))}
              </div>
              {route.tab === 'overview' && <Overview key={release.id} release={release} suites={suites} act={act} />}
              {route.tab === 'builds' && <Builds release={release} runs={runs} meId={me?.id ?? ''} focusBuildId={route.buildId} act={act} />}
              {route.tab === 'blockers' && <Blockers release={release} act={act} />}
              {route.tab === 'notes' && <Notes key={release.id} release={release} runName={runName} act={act} />}
              {route.tab === 'audit' && <Audit releaseId={release.id} />}
            </>
          )
      )}
    </div>
  );
};
