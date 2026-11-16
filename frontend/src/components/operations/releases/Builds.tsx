import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import type { TestRunItem } from '../../../types/operations';
import { REPOSITORIES, linkRuns, overrideGates, promoteBuild, registerBuild, signOff, type Build, type Release } from '../../../services/releasesApiService';
import { releasesPath } from '../../../services/releasesRoute';
import { type Act, AppLink, Badge, Detail, Field, SectionHeader, btn, card, input, subPanel } from './common';

const emptyBuild = { imageName: '', commitSha: '', branchTag: '', artifactUrl: '', repository: 'Artifactory', sha256: '', builtAt: '', pipelineBuildId: '' };
type BuildForm = typeof emptyBuild;
const verificationTone = (v: Build['gates']['verification']) => (v === 'Verified' ? 'green' : v === 'Failed' ? 'red' : 'slate');
const FIRST_RC = 100;

export const Builds: React.FC<{ release: Release; runs: TestRunItem[]; meId: string; focusBuildId: string | null; act: Act }> = ({ release, runs, meId, focusBuildId, act }) => {
  const [form, setForm] = useState(emptyBuild);
  const hasFinal = release.metrics.finalBuild !== null;
  const next = Math.max(FIRST_RC - 1, ...release.builds.map((b) => b.number)) + 1;
  const text = (k: keyof BuildForm, label: string, className = '', mono = false) => (
    <Field label={label} className={className}>
      <input className={`${input} ${mono ? 'font-mono' : ''}`} type={k === 'builtAt' ? 'datetime-local' : 'text'} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
    </Field>
  );
  return (
    <div className="space-y-4">
      {release.canEdit && !hasFinal && (
        <form aria-label="Register RC build" className={`${card} space-y-4`}
          onSubmit={(e) => { e.preventDefault(); void act(async () => { await registerBuild(release.id, form); setForm(emptyBuild); }, 'Build registered.'); }}>
          <SectionHeader title="Register next RC build" description={`It will be registered as ${release.version}-RC${next}.`} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {text('imageName', 'Image name / tag', 'sm:col-span-2')}
            {text('commitSha', 'Commit SHA', '', true)}
            {text('branchTag', 'Branch / tag')}
            {text('artifactUrl', 'Artifact URL', 'sm:col-span-2')}
            <Field label="Repository"><select className={input} value={form.repository} onChange={(e) => setForm({ ...form, repository: e.target.value })}>{REPOSITORIES.map((r) => <option key={r}>{r}</option>)}</select></Field>
            {text('pipelineBuildId', 'CI/CD pipeline build ID')}
            {text('sha256', 'SHA-256 checksum', 'sm:col-span-2 lg:col-span-3', true)}
            {text('builtAt', 'Build time')}
          </div>
          <div className="flex justify-end">
            <button type="submit" className={`${btn} bg-blue-600 text-white`}>Register next RC</button>
          </div>
        </form>
      )}
      {!release.canEdit && <p className="text-xs text-slate-500">Only {release.createdByName}, who created this release, registers builds and links test runs. Signers sign off, override gates and promote.</p>}
      {release.builds.length === 0 && <p className={`${card} text-xs text-slate-500`}>No builds registered.</p>}
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
  const isUrl = /^https?:\/\//.test(build.artifactUrl);

  return (
    <section ref={ref} aria-label={`Build ${build.label}`} className={`${card} space-y-4 ${focused ? 'ring-2 ring-blue-400' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-[var(--text)] font-mono"><AppLink to={releasesPath({ view: 'release', releaseId: release.id, tab: 'builds', buildId: build.id })} className="hover:underline">{build.label}</AppLink></h3>
            <Badge tone={isFinal ? 'blue' : 'slate'}>{build.kind}</Badge>
            <Badge tone={verificationTone(g.verification)}>{g.verification}</Badge>
            {g.overridden && <Badge tone="amber">Gates overridden</Badge>}
          </div>
          <p className="text-[11px] text-[var(--text-dim)]">Registered by {build.createdByName ?? '-'} on {build.createdAt.slice(0, 10)}</p>
        </div>
        {release.isSigner && open && (
          <button type="button" onClick={() => act(() => promoteBuild(release.id, build.id), `${build.label} promoted to Final.`)} className={`${btn} bg-blue-600 text-white`}>Promote to Final</button>
        )}
      </div>

      {isFinal && <p className="text-xs text-blue-700 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Final build, promoted by {build.promotedBy} on {build.promotedAt?.slice(0, 10)}.</p>}

      <dl className={`${subPanel} grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4`}>
        <Detail label="Image" className="sm:col-span-2">{build.imageName}</Detail>
        <Detail label="Repository">{build.repository}</Detail>
        <Detail label="Pipeline build">{build.pipelineBuildId || '-'}</Detail>
        <Detail label="Commit"><span className="font-mono">{build.commitSha || '-'}</span></Detail>
        <Detail label="Branch / tag">{build.branchTag || '-'}</Detail>
        <Detail label="Built" className="lg:col-span-2">{build.builtAt ? build.builtAt.replace('T', ' ') : '-'}</Detail>
        <Detail label="Artifact" className="sm:col-span-2 lg:col-span-4">
          {isUrl ? <a href={build.artifactUrl} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">{build.artifactUrl}</a> : build.artifactUrl}
        </Detail>
        <Detail label="SHA-256" className="sm:col-span-2 lg:col-span-4"><span className="font-mono">{build.sha256}</span></Detail>
      </dl>

      <div className="grid gap-3 lg:grid-cols-3 text-xs">
        <div role="group" aria-label="Linked test runs" className={`${subPanel} space-y-2`}>
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="font-semibold text-[var(--text)]">Linked test runs ({g.linkedRuns})</h4>
            <span className="text-[11px] text-[var(--text-dim)]">Coverage {g.coverage ?? '-'}%</span>
          </div>
          {runs.length === 0 && <p className="text-slate-500">No test runs yet.</p>}
          <div className="space-y-1.5">
            {runs.map((r) => (
              <label key={r.id} className="flex items-start gap-2"><input type="checkbox" className="mt-0.5" disabled={!release.canEdit || isFinal} checked={linked.includes(r.id)}
                onChange={(e) => setLinked(e.target.checked ? [...linked, r.id] : linked.filter((x) => x !== r.id))} />{r.name}</label>
            ))}
          </div>
          {release.canEdit && !isFinal && <button type="button" onClick={() => act(() => linkRuns(release.id, build.id, linked), 'Test runs linked.')} className={`${btn} border border-slate-300`}>Save linked runs</button>}
        </div>

        <div role="group" aria-label="Readiness gates" className={`${subPanel} space-y-2`}>
          <h4 className="font-semibold text-[var(--text)]">Readiness gates</h4>
          <ul className="space-y-2">
            {g.checks.map((c) => (
              <li key={c.id} className="flex gap-2">
                {c.passed ? <CheckCircle2 aria-label="Passed" className="w-4 h-4 text-emerald-600 shrink-0" /> : <XCircle aria-label="Not met" className="w-4 h-4 text-rose-600 shrink-0" />}
                <div><div className="font-semibold text-[var(--text)]">{c.label}</div><div className="text-[var(--text-dim)]">{c.detail}</div></div>
              </li>
            ))}
          </ul>
          {build.gateOverride && <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-800">Overridden by {build.gateOverride.by}: {build.gateOverride.reason}</p>}
          {release.isSigner && open && !g.passed && !build.gateOverride && (
            <div className="flex gap-2 pt-1">
              <input aria-label="Override reason" placeholder="Reason for override" className={input} value={reason} onChange={(e) => setReason(e.target.value)} />
              <button type="button" disabled={!reason.trim()} onClick={() => act(() => overrideGates(release.id, build.id, reason), 'Gates overridden.')} className={`${btn} shrink-0 border border-amber-300 text-amber-800`}>Override</button>
            </div>
          )}
        </div>

        <div role="group" aria-label="Sign-offs" className={`${subPanel} space-y-2`}>
          <h4 className="font-semibold text-[var(--text)]">Sign-offs ({build.signoffStatus.approved} / {build.signoffStatus.required})</h4>
          <ul className="space-y-2">
            {release.signers.map((s) => {
              const d = build.signoffs[s.userId];
              return (
                <li key={s.userId}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-[var(--text)]">{s.name}</div>
                      {s.designation && <div className="text-[11px] text-[var(--text-dim)]">{s.designation}</div>}
                    </div>
                    {d ? <Badge tone={d.decision === 'Approved' ? 'green' : 'red'}>{d.decision}</Badge> : <span className="text-[11px] text-[var(--text-dim)]">pending</span>}
                  </div>
                  {d?.comment && <div className="mt-0.5 text-[var(--text-dim)] italic">"{d.comment}"</div>}
                </li>
              );
            })}
          </ul>
          {release.isSigner && open && (
            <div className="space-y-2 border-t border-[var(--border-soft)] pt-2">
              <p className="text-slate-600">{mine ? `You ${mine.decision.toLowerCase()} this build. You can change your decision.` : 'Your decision on this build:'}</p>
              <input aria-label="Sign-off comment" placeholder="Comment (needed to reject)" className={input} value={comment} onChange={(e) => setComment(e.target.value)} />
              <div className="flex gap-2">
                <button type="button" onClick={() => act(() => signOff(release.id, build.id, 'Approved', comment), `You approved ${build.label}.`)} className={`${btn} bg-emerald-700 hover:bg-emerald-800 text-white`}>Approve</button>
                <button type="button" disabled={!comment.trim()} onClick={() => act(() => signOff(release.id, build.id, 'Rejected', comment), `You rejected ${build.label}.`)} className={`${btn} border border-rose-300 text-rose-700`}>Reject</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
