import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Plus, RefreshCw, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { getStoredSession } from '../../services/authService';
import { loadTestManagement } from '../../services/testManagementApiService';
import type { TestRunItem, TestSuiteItem } from '../../types/operations';
import {
  REPOSITORIES, RELEASE_STATUSES, RELEASE_TYPES, SEVERITIES,
  deleteBlocker, draftReleaseNotes, isReleasesAvailable, linkRuns, loadAudit, loadReleases, lookupBlocker, overrideGates,
  promoteBuild, registerBuild, saveBlocker, saveRelease, seedReleases, signOff, syncBlockers,
  type AuditEntry, type BlockerQuery, type Build, type Release,
} from '../../services/releasesApiService';
import { connected, loadTrackers } from '../../services/trackersApiService';

// Release Master (DDS-SRS-033 - 046). Data, gate evaluation and the audit
// log live on the server; this screen shows them and sends changes.

const SAMPLE_RELEASES = [
  {
    id: 'rel-13-03-01', version: 'v13.03.01', title: 'BMC Firmware Security & Fix Patch', type: 'Patch',
    targetDate: '2026-08-16', segment: 'All customers', status: 'Approved',
    signoffRoles: [
      { role: 'QA Lead', userName: 'Judia Lumina' }, { role: 'Dev Lead', userName: 'Vaishnavi Aasaithambi' },
      { role: 'Product Owner', userName: 'Manivannan Thangavel' },
    ],
    documents: [{ id: 'wh3-1205-sample', title: 'WH3-1205: WebUI HPM Firmware Upgrade Failure Investigation & Fix' }],
    blockers: [{ id: 'b-1205', key: 'WH3-1205', tracker: 'Jira', title: 'HPM upload halts on dual-flash', severity: 'Critical', status: 'Closed' }],
  },
  {
    id: 'rel-13-04-00', version: 'v13.04.00', title: 'BMC Firmware WebSocket Streaming GA', type: 'Minor',
    targetDate: '2026-09-01', segment: 'Enterprise', status: 'In Progress',
    signoffRoles: [
      { role: 'QA Lead', userName: 'Judia Lumina' }, { role: 'Dev Lead', userName: 'Vaishnavi Aasaithambi' },
      { role: 'Product Owner', userName: 'Manivannan Thangavel' },
    ],
    documents: [{ id: 'adr-0042', title: 'ADR 0042: Migration from REST Polling to WebSocket State Streaming' }],
    blockers: [{ id: 'b-1310', key: 'WH3-1310', tracker: 'Jira', title: 'Sensor telemetry timeout under 100+ sessions', severity: 'Blocker', status: 'Open' }],
  },
];

type Tab = 'overview' | 'builds' | 'blockers' | 'notes' | 'audit';
const input = 'w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-500';
const btn = 'px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed';
const card = 'bg-white border border-slate-200 rounded-xl p-4 shadow-xs';

const Badge: React.FC<{ tone: 'green' | 'red' | 'amber' | 'slate' | 'blue'; children: React.ReactNode }> = ({ tone, children }) => {
  const tones = { green: 'bg-emerald-50 text-emerald-700 border-emerald-200', red: 'bg-rose-50 text-rose-700 border-rose-200', amber: 'bg-amber-50 text-amber-800 border-amber-200', slate: 'bg-slate-100 text-slate-600 border-slate-200', blue: 'bg-blue-50 text-blue-700 border-blue-200' };
  return <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${tones[tone]}`}>{children}</span>;
};
const verificationTone = (v: Build['gates']['verification']) => (v === 'Verified' ? 'green' : v === 'Failed' ? 'red' : 'slate');

export const ReleaseMaster: React.FC = () => {
  const me = getStoredSession()?.user?.name ?? '';
  const [releases, setReleases] = useState<Release[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [runs, setRuns] = useState<TestRunItem[]>([]);
  const [suites, setSuites] = useState<TestSuiteItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    let snap = await loadReleases();
    if (!snap.seeded && snap.releases.length === 0) snap = await seedReleases(SAMPLE_RELEASES);
    setReleases(snap.releases);
    setCanManage(snap.canManage);
    setSelectedId((cur) => (cur && snap.releases.some((r) => r.id === cur) ? cur : snap.releases[0]?.id ?? null));
  }, []);

  useEffect(() => {
    if (!isReleasesAvailable()) return;
    refresh().catch((err: Error) => setError(err.message));
    loadTestManagement().then((tm) => { setRuns(tm.runs); setSuites(tm.suites); }).catch(() => undefined);
  }, [refresh]);

  /** Runs a change, then reloads; shows the server's message on failure. */
  const act = async (op: () => Promise<unknown>, done: string) => {
    setError(''); setNotice('');
    try { await op(); await refresh(); setNotice(done); } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };

  if (!isReleasesAvailable()) {
    return <div className={card}><h2 className="text-lg font-bold text-slate-900">Release Master</h2><p className="text-xs text-slate-600 mt-1">Releases are stored on the server. Run the app with VITE_API_BASE_URL set.</p></div>;
  }
  const release = releases?.find((r) => r.id === selectedId) ?? null;
  const runName = (id: string) => runs.find((r) => r.id === id)?.name ?? id;

  return (
    <div className="space-y-4 text-left">
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-[var(--border)]">
        <div>
          <h2 className="text-xl font-bold text-[var(--text)]">Release Master</h2>
          <p className="text-xs text-[var(--text-dim)] mt-1">Releases, release candidate builds, readiness gates, sign-offs and audit log.</p>
        </div>
        {canManage && <button type="button" onClick={() => setCreating(true)} className={`${btn} flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white`}><Plus className="w-3.5 h-3.5" /> New release</button>}
      </div>

      {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
      {notice && <p role="status" className="text-xs text-emerald-700">{notice}</p>}
      {releases === null && !error && <p role="status" className="text-xs text-slate-500">Loading releases…</p>}

      {creating && <NewReleaseForm onCancel={() => setCreating(false)} onCreate={(body) => act(async () => {
        const id = `rel-${Date.now()}`;
        await saveRelease(id, body);
        setSelectedId(id); setTab('overview'); setCreating(false);
      }, `Release ${body.version} created.`)} />}

      {releases && releases.length > 0 && (
        <div role="tablist" aria-label="Releases" className="flex flex-wrap gap-2">
          {releases.map((r) => (
            <button key={r.id} role="tab" aria-selected={r.id === selectedId} type="button" onClick={() => setSelectedId(r.id)}
              className={`${btn} border ${r.id === selectedId ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300'}`}>
              {r.version} · {r.status}
            </button>
          ))}
        </div>
      )}
      {releases && releases.length === 0 && <p className="text-xs text-slate-500">No releases yet.</p>}

      {release && (
        <>
          <div role="tablist" aria-label="Release sections" className="flex gap-1 border-b border-slate-200">
            {(['overview', 'builds', 'blockers', 'notes', 'audit'] as Tab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)}
                className={`px-3 py-2 text-xs border-b-2 -mb-px ${tab === t ? 'border-[var(--blue)] text-[var(--text)] font-semibold' : 'border-transparent text-[var(--text-dim)]'}`}>
                {{ overview: 'Overview', builds: `Builds (${release.builds.length})`, blockers: `Blockers (${release.metrics.openBlockers} open)`, notes: 'Release notes', audit: 'Audit log' }[t]}
              </button>
            ))}
          </div>
          {tab === 'overview' && <Overview key={release.id} release={release} suites={suites} canManage={canManage} act={act} />}
          {tab === 'builds' && <Builds release={release} runs={runs} me={me} canManage={canManage} act={act} />}
          {tab === 'blockers' && <Blockers release={release} canManage={canManage} act={act} />}
          {tab === 'notes' && <Notes key={release.id} release={release} canManage={canManage} runName={runName} act={act} />}
          {tab === 'audit' && <Audit releaseId={release.id} />}
        </>
      )}
    </div>
  );
};

type Act = (op: () => Promise<unknown>, done: string) => Promise<void>;

const NewReleaseForm: React.FC<{ onCreate: (body: Partial<Release>) => void; onCancel: () => void }> = ({ onCreate, onCancel }) => {
  const [version, setVersion] = useState('');
  const [type, setType] = useState<Release['type']>('Minor');
  const [targetDate, setTargetDate] = useState('');
  const [segment, setSegment] = useState('');
  return (
    <form aria-label="New release" className={`${card} grid grid-cols-2 md:grid-cols-5 gap-2 items-end`} onSubmit={(e) => { e.preventDefault(); onCreate({ version, type, targetDate, segment, status: 'Planned' }); }}>
      <label className="text-xs">Version<input className={input} value={version} onChange={(e) => setVersion(e.target.value)} placeholder="v2.4.0" required /></label>
      <label className="text-xs">Type<select className={input} value={type} onChange={(e) => setType(e.target.value as Release['type'])}>{RELEASE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
      <label className="text-xs">Target date<input type="date" className={input} value={targetDate} onChange={(e) => setTargetDate(e.target.value)} required /></label>
      <label className="text-xs">Customer segment / tenant<input className={input} value={segment} onChange={(e) => setSegment(e.target.value)} /></label>
      <div className="flex gap-2"><button type="submit" className={`${btn} bg-emerald-600 text-white`}>Create</button><button type="button" onClick={onCancel} className={`${btn} border border-slate-300`}>Cancel</button></div>
    </form>
  );
};

const Overview: React.FC<{ release: Release; suites: TestSuiteItem[]; canManage: boolean; act: Act }> = ({ release, suites, canManage, act }) => {
  const [draft, setDraft] = useState(release);
  useEffect(() => setDraft(release), [release]);
  const set = <K extends keyof Release>(k: K, v: Release[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const m = release.metrics;
  const ro = !canManage;
  return (
    <div className="space-y-4">
      <ul aria-label="Release metrics" className="grid grid-cols-2 md:grid-cols-6 gap-2">
        {[['Milestones done', `${m.milestonesDone} / ${m.milestonesTotal}`], ['Builds', m.builds], ['Latest build', m.latestBuild ?? '-'],
          ['Latest pass rate', m.latestPassRate === null ? '-' : `${m.latestPassRate}%`], ['Open blockers', m.openBlockers], ['Final build', m.finalBuild ?? '-']].map(([k, v]) => (
          <li key={k as string} className={card}><div className="text-[10px] uppercase text-slate-500">{k}</div><div className="text-sm font-bold text-slate-900">{v}</div></li>
        ))}
      </ul>
      <section className={`${card} grid grid-cols-2 md:grid-cols-3 gap-3`} aria-label="Release details">
        <label className="text-xs">Version<input className={input} disabled={ro} value={draft.version} onChange={(e) => set('version', e.target.value)} /></label>
        <label className="text-xs">Title<input className={input} disabled={ro} value={draft.title ?? ''} onChange={(e) => set('title', e.target.value)} /></label>
        <label className="text-xs">Type<select className={input} disabled={ro} value={draft.type} onChange={(e) => set('type', e.target.value as Release['type'])}>{RELEASE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="text-xs">Target date<input type="date" className={input} disabled={ro} value={draft.targetDate} onChange={(e) => set('targetDate', e.target.value)} /></label>
        <label className="text-xs">Customer segment / tenant<input className={input} disabled={ro} value={draft.segment ?? ''} onChange={(e) => set('segment', e.target.value)} /></label>
        <label className="text-xs">Status<select className={input} disabled={ro} value={draft.status} onChange={(e) => set('status', e.target.value as Release['status'])}>{RELEASE_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
      </section>
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
      <section className={`${card} grid md:grid-cols-2 gap-4`}>
        <div aria-label="Sign-off roles" role="group">
          <h3 className="text-sm font-bold text-slate-800 mb-2">Required sign-offs</h3>
          {draft.signoffRoles.map((r, i) => (
            <div key={i} className="flex gap-2 mb-1">
              <input aria-label="Role" className={input} disabled={ro} value={r.role} onChange={(e) => set('signoffRoles', draft.signoffRoles.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} />
              <input aria-label={`User for ${r.role}`} placeholder="User's full name" className={input} disabled={ro} value={r.userName ?? ''} onChange={(e) => set('signoffRoles', draft.signoffRoles.map((x, j) => (j === i ? { ...x, userName: e.target.value || null } : x)))} />
              {!ro && <button type="button" aria-label={`Remove role ${r.role}`} onClick={() => set('signoffRoles', draft.signoffRoles.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          ))}
          {!ro && <button type="button" onClick={() => set('signoffRoles', [...draft.signoffRoles, { role: '', userName: null }])} className="text-xs text-blue-700 hover:underline">+ Add role</button>}
        </div>
        <div aria-label="Readiness rules" role="group" className="text-xs space-y-2">
          <h3 className="text-sm font-bold text-slate-800">Readiness rules</h3>
          <label className="block">Minimum pass rate (%)<input type="number" min={0} max={100} className={input} disabled={ro} value={draft.gateRules.minPassRate} onChange={(e) => set('gateRules', { ...draft.gateRules, minPassRate: Number(e.target.value) })} /></label>
          <label className="flex items-center gap-2"><input type="checkbox" disabled={ro} checked={draft.gateRules.requireNoOpenBlockers} onChange={(e) => set('gateRules', { ...draft.gateRules, requireNoOpenBlockers: e.target.checked })} /> No open Critical or Blocker issues</label>
          <div>Mandatory regression suites (must be 100% executed)
            {suites.map((s) => (
              <label key={s.id} className="flex items-center gap-2"><input type="checkbox" disabled={ro} checked={draft.gateRules.mandatorySuiteIds.includes(s.id)}
                onChange={(e) => set('gateRules', { ...draft.gateRules, mandatorySuiteIds: e.target.checked ? [...draft.gateRules.mandatorySuiteIds, s.id] : draft.gateRules.mandatorySuiteIds.filter((x) => x !== s.id) })} />{s.title}</label>
            ))}
          </div>
        </div>
      </section>
      {release.documents.length > 0 && <p className="text-xs text-slate-600">Linked documents: {release.documents.map((d) => d.title).join('; ')}</p>}
      {canManage && <button type="button" onClick={() => act(() => saveRelease(release.id, draft), 'Release saved.')} className={`${btn} bg-emerald-600 text-white`}>Save release</button>}
    </div>
  );
};

const emptyBuild = { imageName: '', commitSha: '', branchTag: '', artifactUrl: '', repository: 'Artifactory', sha256: '', builtAt: '', pipelineBuildId: '' };

const Builds: React.FC<{ release: Release; runs: TestRunItem[]; me: string; canManage: boolean; act: Act }> = ({ release, runs, me, canManage, act }) => {
  const [form, setForm] = useState(emptyBuild);
  const fields: [keyof typeof emptyBuild, string][] = [['imageName', 'Image name / tag'], ['commitSha', 'Commit SHA'], ['branchTag', 'Branch / tag'], ['artifactUrl', 'Artifact URL'], ['sha256', 'SHA-256 checksum'], ['builtAt', 'Build time'], ['pipelineBuildId', 'CI/CD pipeline build ID']];
  return (
    <div className="space-y-4">
      {canManage && (
        <form aria-label="Register RC build" className={`${card} grid grid-cols-2 md:grid-cols-4 gap-2 items-end`}
          onSubmit={(e) => { e.preventDefault(); void act(async () => { await registerBuild(release.id, form); setForm(emptyBuild); }, 'Build registered.'); }}>
          {fields.map(([k, label]) => (
            <label key={k} className="text-xs">{label}<input className={input} type={k === 'builtAt' ? 'datetime-local' : 'text'} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></label>
          ))}
          <label className="text-xs">Repository<select className={input} value={form.repository} onChange={(e) => setForm({ ...form, repository: e.target.value })}>{REPOSITORIES.map((r) => <option key={r}>{r}</option>)}</select></label>
          <button type="submit" className={`${btn} bg-blue-600 text-white`}>Register next RC</button>
        </form>
      )}
      {release.builds.length === 0 && <p className="text-xs text-slate-500">No builds registered.</p>}
      {[...release.builds].reverse().map((b) => <BuildCard key={b.id} release={release} build={b} runs={runs} me={me} canManage={canManage} act={act} />)}
    </div>
  );
};

const BuildCard: React.FC<{ release: Release; build: Build; runs: TestRunItem[]; me: string; canManage: boolean; act: Act }> = ({ release, build, runs, me, canManage, act }) => {
  const [linked, setLinked] = useState<string[]>(build.testRunIds);
  const [reason, setReason] = useState('');
  const [comments, setComments] = useState<Record<string, string>>({});
  useEffect(() => setLinked(build.testRunIds), [build.testRunIds]);
  const g = build.gates;
  const isFinal = build.kind === 'Final';
  return (
    <section aria-label={`Build ${build.label}`} className={`${card} space-y-3`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold text-slate-900">{build.label}</h3>
        <Badge tone={isFinal ? 'blue' : 'slate'}>{build.kind}</Badge>
        <Badge tone={verificationTone(g.verification)}>{g.verification}</Badge>
        {g.overridden && <Badge tone="amber">Gates overridden</Badge>}
      </div>
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-[11px]">
        {[['Image', build.imageName], ['Commit', [build.commitSha, build.branchTag].filter(Boolean).join(' · ') || '-'], ['Repository', build.repository],
          ['Built', build.builtAt || '-'], ['Pipeline build', build.pipelineBuildId || '-'], ['Artifact', build.artifactUrl]].map(([k, v]) => (
          <div key={k}><dt className="text-slate-500">{k}</dt><dd className="text-slate-800 break-all">{v}</dd></div>
        ))}
        <div className="col-span-2 md:col-span-4"><dt className="text-slate-500">SHA-256</dt><dd className="font-mono text-slate-800 break-all">{build.sha256}</dd></div>
      </dl>

      <div className="grid md:grid-cols-3 gap-3 text-xs">
        <div role="group" aria-label="Linked test runs">
          <h4 className="font-semibold text-slate-800 mb-1">Linked test runs ({g.linkedRuns}) · coverage {g.coverage ?? '-'}%</h4>
          {runs.map((r) => (
            <label key={r.id} className="flex items-center gap-2"><input type="checkbox" disabled={!canManage || isFinal} checked={linked.includes(r.id)}
              onChange={(e) => setLinked(e.target.checked ? [...linked, r.id] : linked.filter((x) => x !== r.id))} />{r.name}</label>
          ))}
          {canManage && !isFinal && <button type="button" onClick={() => act(() => linkRuns(release.id, build.id, linked), 'Test runs linked.')} className={`${btn} mt-1 border border-slate-300`}>Save linked runs</button>}
        </div>
        <div role="group" aria-label="Readiness gates">
          <h4 className="font-semibold text-slate-800 mb-1">Readiness gates</h4>
          <ul className="space-y-1">
            {g.checks.map((c) => (
              <li key={c.id} className="flex gap-1.5">{c.passed ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />}
                <span><b>{c.label}</b> - {c.detail}</span></li>
            ))}
          </ul>
          {build.gateOverride && <p className="mt-1 text-amber-800">Overridden by {build.gateOverride.by}: {build.gateOverride.reason}</p>}
          {canManage && !g.passed && !build.gateOverride && !isFinal && (
            <div className="flex gap-1 mt-1">
              <input aria-label="Override reason" placeholder="Reason for override" className={input} value={reason} onChange={(e) => setReason(e.target.value)} />
              <button type="button" disabled={!reason.trim()} onClick={() => act(() => overrideGates(release.id, build.id, reason), 'Gates overridden.')} className={`${btn} border border-amber-300 text-amber-800`}>Override</button>
            </div>
          )}
        </div>
        <div role="group" aria-label="Sign-offs">
          <h4 className="font-semibold text-slate-800 mb-1">Sign-offs ({build.signoffStatus.approved} / {build.signoffStatus.required})</h4>
          {release.signoffRoles.map((r) => {
            const s = build.signoffs[r.role];
            const mine = r.userName === me && !isFinal;
            return (
              <div key={r.role} className="mb-1.5">
                <div><b>{r.role}</b> · {r.userName ?? 'not assigned'} · {s ? <Badge tone={s.decision === 'Approved' ? 'green' : 'red'}>{s.decision}</Badge> : <span className="text-slate-500">pending</span>}</div>
                {s?.comment && <div className="text-slate-600">"{s.comment}"</div>}
                {mine && (
                  <div className="flex gap-1 mt-0.5">
                    <input aria-label={`Comment for ${r.role}`} placeholder="Comment (needed to reject)" className={input} value={comments[r.role] ?? ''} onChange={(e) => setComments({ ...comments, [r.role]: e.target.value })} />
                    <button type="button" aria-label={`Approve as ${r.role}`} onClick={() => act(() => signOff(release.id, build.id, r.role, 'Approved', comments[r.role] ?? ''), `Signed off as ${r.role}.`)} className={`${btn} bg-emerald-600 text-white`}>Approve</button>
                    <button type="button" aria-label={`Reject as ${r.role}`} onClick={() => act(() => signOff(release.id, build.id, r.role, 'Rejected', comments[r.role] ?? ''), `Rejected as ${r.role}.`)} className={`${btn} border border-rose-300 text-rose-700`}>Reject</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {isFinal && <p className="text-xs text-blue-700 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Final build, promoted by {build.promotedBy} on {build.promotedAt?.slice(0, 10)}.</p>}
      {canManage && !isFinal && (
        <button type="button" onClick={() => act(() => promoteBuild(release.id, build.id), `${build.label} promoted to Final.`)}
          className={`${btn} bg-blue-600 text-white`}>Promote to Final</button>
      )}
    </section>
  );
};

const Blockers: React.FC<{ release: Release; canManage: boolean; act: Act }> = ({ release, canManage, act }) => {
  const empty = { key: '', tracker: 'Jira' as const, title: '', url: '', severity: 'Major' as const };
  const [form, setForm] = useState<{ key: string; tracker: 'Jira' | 'GitHub'; title: string; url: string; severity: (typeof SEVERITIES)[number] }>(empty);
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
    await saveRelease(release.id, { ...release, blockerQuery: Object.keys(blockerQuery).length ? blockerQuery : null });
    const result = await syncBlockers(release.id);
    if (result.error) throw new Error(result.error);
  }, 'Blocker query saved and synced.');

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        {anyTracker
          ? 'Jira / GitHub issues blocking this release. Issues read from a tracker keep their status, title and severity in step with it; others are entered by hand.'
          : 'Jira / GitHub issues blocking this release, entered by hand. An admin can connect Jira or GitHub under Data Management to read them from the tracker.'}
      </p>

      {anyTracker && (
        <section aria-label="Blocker query" className={`${card} space-y-2`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold text-slate-900">Issues marked as blockers for this release</div>
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
              <label className="text-xs md:col-span-3">Jira JQL
                <input className={`${input} font-mono`} disabled={!canManage} value={jql} onChange={(e) => setJql(e.target.value)} placeholder={`fixVersion = "${release.version}" AND labels = release-blocker`} />
              </label>
            )}
            {trackers.github && <>
              <label className="text-xs md:col-span-2">GitHub repository<input className={`${input} font-mono`} disabled={!canManage} value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repo" /></label>
              <label className="text-xs">Label<input className={`${input} font-mono`} disabled={!canManage} value={label} onChange={(e) => setLabel(e.target.value)} /></label>
            </>}
          </div>
          {canManage && <button type="button" onClick={() => void saveQuery()} className={`${btn} bg-blue-600 text-white`}>Save and sync</button>}
          <p className="text-[10px] text-slate-500">Synced every 5 minutes. An issue that stops matching is closed here.</p>
        </section>
      )}

      <table className={`${card} w-full text-xs`} aria-label="Release blockers"><thead><tr className="text-left text-slate-500"><th>Issue</th><th>Title</th><th>Severity</th><th>Status</th><th /></tr></thead><tbody>
        {release.blockers.map((b) => (
          <tr key={b.id} className="border-t border-slate-100">
            <td className="py-1 font-mono">{b.url ? <a href={b.url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">{b.key}</a> : b.key} <span className="text-slate-400">{b.tracker}{fromTracker(b) ? ` · ${b.source === 'synced' ? 'from query' : 'linked'}` : ''}</span></td>
            <td>{b.title ?? '-'}{b.syncNote && <div className="text-[10px] text-slate-500">{b.syncNote}</div>}</td><td>{b.severity}</td><td><Badge tone={b.status === 'Open' ? 'red' : 'green'}>{b.status}</Badge></td>
            <td className="text-right">{canManage && <>
              {!fromTracker(b) && (
                <button type="button" onClick={() => act(() => saveBlocker(release.id, b.id, { ...b, status: b.status === 'Open' ? 'Closed' : 'Open' }), `${b.key} ${b.status === 'Open' ? 'closed' : 'reopened'}.`)} className="text-blue-700 hover:underline mr-2">{b.status === 'Open' ? 'Close' : 'Reopen'}</button>
              )}
              <button type="button" aria-label={`Remove ${b.key}`} onClick={() => act(() => deleteBlocker(release.id, b.id), `${b.key} removed.`)} className="text-slate-400 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5 inline" /></button>
            </>}</td>
          </tr>
        ))}
        {release.blockers.length === 0 && <tr><td colSpan={5} className="py-2 text-slate-500">No blockers.</td></tr>}
      </tbody></table>

      {canManage && anyTracker && (
        <form aria-label="Link issue" className={`${card} flex flex-wrap gap-2 items-end`} onSubmit={(e) => { e.preventDefault(); void act(async () => { await lookupBlocker(release.id, link.tracker, link.key); setLink({ ...link, key: '' }); }, `${link.key} linked.`); }}>
          <label className="text-xs">Tracker<select className={input} value={link.tracker} onChange={(e) => setLink({ ...link, tracker: e.target.value as 'Jira' | 'GitHub' })}>
            {trackers.jira && <option>Jira</option>}{trackers.github && <option>GitHub</option>}
          </select></label>
          <label className="text-xs flex-1 min-w-40">Issue key<input className={`${input} font-mono`} value={link.key} onChange={(e) => setLink({ ...link, key: e.target.value })} placeholder={link.tracker === 'Jira' ? 'WH3-1300' : 'owner/repo#42'} required /></label>
          <button type="submit" className={`${btn} bg-blue-600 text-white`}>Link issue</button>
        </form>
      )}
      {canManage && (
        <details className={card} open={!anyTracker}>
          <summary className="cursor-pointer text-xs font-semibold text-slate-700">Log a blocker by hand</summary>
          <form aria-label="Log blocker" className="mt-2 grid grid-cols-2 md:grid-cols-6 gap-2 items-end" onSubmit={(e) => { e.preventDefault(); void act(async () => { await saveBlocker(release.id, `b-${Date.now()}`, form); setForm(empty); }, `${form.key} logged.`); }}>
            <label className="text-xs">Issue key<input className={input} value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="WH3-1300 or #42" required /></label>
            <label className="text-xs">Tracker<select className={input} value={form.tracker} onChange={(e) => setForm({ ...form, tracker: e.target.value as 'Jira' | 'GitHub' })}><option>Jira</option><option>GitHub</option></select></label>
            <label className="text-xs">Title<input className={input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            <label className="text-xs">URL<input className={input} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://" /></label>
            <label className="text-xs">Severity<select className={input} value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as (typeof SEVERITIES)[number] })}>{SEVERITIES.map((s) => <option key={s}>{s}</option>)}</select></label>
            <button type="submit" className={`${btn} bg-blue-600 text-white`}>Log blocker</button>
          </form>
        </details>
      )}
    </div>
  );
};

const Notes: React.FC<{ release: Release; canManage: boolean; runName: (id: string) => string; act: Act }> = ({ release, canManage, runName, act }) => {
  const [text, setText] = useState(release.notes);
  return (
    <div className="space-y-2">
      <textarea aria-label="Release notes" className={`${input} font-mono`} rows={16} disabled={!canManage} value={text} onChange={(e) => setText(e.target.value)} placeholder="No release notes yet." />
      {canManage && (
        <div className="flex gap-2">
          <button type="button" onClick={() => setText(draftReleaseNotes(release, runName))} className={`${btn} border border-slate-300`}>Draft from release</button>
          <button type="button" onClick={() => act(() => saveRelease(release.id, { ...release, notes: text }), 'Release notes saved.')} className={`${btn} bg-emerald-600 text-white`}>Save notes</button>
        </div>
      )}
    </div>
  );
};

const ACTIONS: Record<string, string> = {
  'release-created': 'Release created', 'status-changed': 'Status changed', 'build-registered': 'Build registered',
  'test-runs-linked': 'Test runs linked', 'gates-overridden': 'Gates overridden', 'signed-off': 'Signed off',
  'promoted-to-final': 'Promoted to Final', 'blocker-logged': 'Blocker logged', 'blocker-closed': 'Blocker closed',
  'blocker-open': 'Blocker reopened', 'blocker-removed': 'Blocker removed', 'blockers-synced': 'Blockers synced from Jira / GitHub', 'blocker-query-changed': 'Blocker query changed', 'gate-rules-changed': 'Readiness rules changed',
  'signoff-roles-changed': 'Sign-off roles changed', 'release-deleted': 'Release deleted',
};

const Audit: React.FC<{ releaseId: string }> = ({ releaseId }) => {
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
