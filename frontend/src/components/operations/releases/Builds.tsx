import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import type { TestRunItem } from '../../../types/operations';
import { REPOSITORIES, linkRuns, overrideGates, promoteBuild, registerBuild, signOff, type Build, type Release } from '../../../services/releasesApiService';
import { releasesPath } from '../../../services/releasesRoute';
import { type Act, AppLink, Badge, btn, card, input } from './common';

const emptyBuild = { imageName: '', commitSha: '', branchTag: '', artifactUrl: '', repository: 'Artifactory', sha256: '', builtAt: '', pipelineBuildId: '' };
const verificationTone = (v: Build['gates']['verification']) => (v === 'Verified' ? 'green' : v === 'Failed' ? 'red' : 'slate');

export const Builds: React.FC<{ release: Release; runs: TestRunItem[]; meId: string; focusBuildId: string | null; act: Act }> = ({ release, runs, meId, focusBuildId, act }) => {
  const [form, setForm] = useState(emptyBuild);
  const fields: [keyof typeof emptyBuild, string][] = [['imageName', 'Image name / tag'], ['commitSha', 'Commit SHA'], ['branchTag', 'Branch / tag'], ['artifactUrl', 'Artifact URL'], ['sha256', 'SHA-256 checksum'], ['builtAt', 'Build time'], ['pipelineBuildId', 'CI/CD pipeline build ID']];
  const hasFinal = release.metrics.finalBuild !== null;
  return (
    <div className="space-y-4">
      {release.canEdit && !hasFinal && (
        <form aria-label="Register RC build" className={`${card} grid grid-cols-2 md:grid-cols-4 gap-2 items-end`}
          onSubmit={(e) => { e.preventDefault(); void act(async () => { await registerBuild(release.id, form); setForm(emptyBuild); }, 'Build registered.'); }}>
          {fields.map(([k, label]) => (
            <label key={k} className="text-xs">{label}<input className={input} type={k === 'builtAt' ? 'datetime-local' : 'text'} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></label>
          ))}
          <label className="text-xs">Repository<select className={input} value={form.repository} onChange={(e) => setForm({ ...form, repository: e.target.value })}>{REPOSITORIES.map((r) => <option key={r}>{r}</option>)}</select></label>
          <button type="submit" className={`${btn} bg-blue-600 text-white`}>Register next RC</button>
        </form>
      )}
      {!release.canEdit && <p className="text-xs text-slate-500">Only {release.createdByName}, who created this release, registers builds and links test runs. Signers sign off, override gates and promote.</p>}
      {release.builds.length === 0 && <p className="text-xs text-slate-500">No builds registered.</p>}
      {[...release.builds].reverse().map((b) => <BuildCard key={b.id} release={release} build={b} runs={runs} meId={meId} focused={b.id === focusBuildId} act={act} />)}
    </div>
  );
};

const BuildCard: React.FC<{ release: Release; build: Build; runs: TestRunItem[]; meId: string; focused: boolean; act: Act }> = ({ release, build, runs, meId, focused, act }) => {
  const [linked, setLinked] = useState<string[]>(build.testRunIds);
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const ref = useRef<HTMLElement>(null);
  useEffect(() => setLinked(build.testRunIds), [build.testRunIds]);
  useEffect(() => { if (focused) ref.current?.scrollIntoView?.({ block: 'start' }); }, [focused]);
  const g = build.gates;
  const isFinal = build.kind === 'Final';
  const open = release.status !== 'Cancelled' && !isFinal;
  const mine = build.signoffs[meId];

  return (
    <section ref={ref} aria-label={`Build ${build.label}`} className={`${card} space-y-3 ${focused ? 'ring-2 ring-blue-400' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold text-slate-900"><AppLink to={releasesPath({ view: 'release', releaseId: release.id, tab: 'builds', buildId: build.id })} className="hover:underline">{build.label}</AppLink></h3>
        <Badge tone={isFinal ? 'blue' : 'slate'}>{build.kind}</Badge>
        <Badge tone={verificationTone(g.verification)}>{g.verification}</Badge>
        {g.overridden && <Badge tone="amber">Gates overridden</Badge>}
      </div>
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-[11px]">
        {[['Image', build.imageName], ['Commit', [build.commitSha, build.branchTag].filter(Boolean).join(' · ') || '-'], ['Repository', build.repository],
          ['Built', build.builtAt || '-'], ['Pipeline build', build.pipelineBuildId || '-'], ['Artifact', build.artifactUrl], ['Registered by', build.createdByName ?? '-']].map(([k, v]) => (
          <div key={k}><dt className="text-slate-500">{k}</dt><dd className="text-slate-800 break-all">{v}</dd></div>
        ))}
        <div className="col-span-2 md:col-span-4"><dt className="text-slate-500">SHA-256</dt><dd className="font-mono text-slate-800 break-all">{build.sha256}</dd></div>
      </dl>

      <div className="grid md:grid-cols-3 gap-3 text-xs">
        <div role="group" aria-label="Linked test runs">
          <h4 className="font-semibold text-slate-800 mb-1">Linked test runs ({g.linkedRuns}) · coverage {g.coverage ?? '-'}%</h4>
          {runs.map((r) => (
            <label key={r.id} className="flex items-center gap-2"><input type="checkbox" disabled={!release.canEdit || isFinal} checked={linked.includes(r.id)}
              onChange={(e) => setLinked(e.target.checked ? [...linked, r.id] : linked.filter((x) => x !== r.id))} />{r.name}</label>
          ))}
          {release.canEdit && !isFinal && <button type="button" onClick={() => act(() => linkRuns(release.id, build.id, linked), 'Test runs linked.')} className={`${btn} mt-1 border border-slate-300`}>Save linked runs</button>}
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
          {release.isSigner && open && !g.passed && !build.gateOverride && (
            <div className="flex gap-1 mt-1">
              <input aria-label="Override reason" placeholder="Reason for override" className={input} value={reason} onChange={(e) => setReason(e.target.value)} />
              <button type="button" disabled={!reason.trim()} onClick={() => act(() => overrideGates(release.id, build.id, reason), 'Gates overridden.')} className={`${btn} border border-amber-300 text-amber-800`}>Override</button>
            </div>
          )}
        </div>

        <div role="group" aria-label="Sign-offs">
          <h4 className="font-semibold text-slate-800 mb-1">Sign-offs ({build.signoffStatus.approved} / {build.signoffStatus.required})</h4>
          {release.signers.map((s) => {
            const d = build.signoffs[s.userId];
            return (
              <div key={s.userId} className="mb-1.5">
                <div><b>{s.name}</b>{s.title ? <span className="text-slate-500"> · {s.title}</span> : null} · {d ? <Badge tone={d.decision === 'Approved' ? 'green' : 'red'}>{d.decision}</Badge> : <span className="text-slate-500">pending</span>}</div>
                {d?.comment && <div className="text-slate-600">"{d.comment}"</div>}
              </div>
            );
          })}
          {release.isSigner && open && (
            <div className="mt-1 space-y-1">
              <p className="text-slate-600">{mine ? `You ${mine.decision.toLowerCase()} this build. You can change your decision.` : 'Your decision on this build:'}</p>
              <input aria-label="Sign-off comment" placeholder="Comment (needed to reject)" className={input} value={comment} onChange={(e) => setComment(e.target.value)} />
              <div className="flex gap-1">
                <button type="button" onClick={() => act(() => signOff(release.id, build.id, 'Approved', comment), `You approved ${build.label}.`)} className={`${btn} bg-emerald-700 hover:bg-emerald-800 text-white`}>Approve</button>
                <button type="button" disabled={!comment.trim()} onClick={() => act(() => signOff(release.id, build.id, 'Rejected', comment), `You rejected ${build.label}.`)} className={`${btn} border border-rose-300 text-rose-700`}>Reject</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {isFinal && <p className="text-xs text-blue-700 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Final build, promoted by {build.promotedBy} on {build.promotedAt?.slice(0, 10)}.</p>}
      {release.isSigner && open && (
        <button type="button" onClick={() => act(() => promoteBuild(release.id, build.id), `${build.label} promoted to Final.`)} className={`${btn} bg-blue-600 text-white`}>Promote to Final</button>
      )}
    </section>
  );
};
