import React from 'react';
import type { ReleaseLine } from '../../../services/releasesApiService';
import { releasesPath } from '../../../services/releasesRoute';
import { AppLink, Badge, card, statusTone, tableFrame, td, th, tr } from './common';

/** Every release, one line each; anyone signed in can read them. */
export const ReleaseList: React.FC<{ releases: ReleaseLine[]; meId: string }> = ({ releases, meId }) => {
  if (releases.length === 0) {
    return <p className={`${card} text-xs text-slate-500`}>No releases yet. Use "New release" to create the first one.</p>;
  }
  return (
    <div className={tableFrame}>
      <table className="w-full text-xs" aria-label="Releases">
        <thead>
          <tr>
            <th className={th}>Release</th><th className={th}>Status</th><th className={th}>Type</th><th className={th}>Target date</th>
            <th className={th}>Created by</th><th className={`${th} text-right`}>Signers</th><th className={th}>Latest build</th>
            <th className={`${th} text-right`}>Open blockers</th><th className={th}>Your role</th>
          </tr>
        </thead>
        <tbody>
          {releases.map((r) => (
            <tr key={r.id} className={`${tr} hover:bg-[var(--panel-alt)]`}>
              <td className={td}>
                <AppLink to={releasesPath({ view: 'release', releaseId: r.id, tab: 'overview', buildId: null })} className="text-sm font-semibold text-blue-700 hover:underline">{r.version}</AppLink>
                {r.title && <div className="mt-0.5 text-[11px] text-slate-500">{r.title}</div>}
              </td>
              <td className={td}><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
              <td className={td}>{r.type}</td>
              <td className={`${td} whitespace-nowrap`}>{r.targetDate}</td>
              <td className={td}>{r.createdByName}</td>
              <td className={`${td} text-right tabular-nums`}>{r.signerCount}</td>
              <td className={`${td} font-mono whitespace-nowrap`}>{r.metrics.finalBuild ?? r.metrics.latestBuild ?? '-'}</td>
              <td className={`${td} text-right`}>{r.metrics.openBlockers > 0 ? <Badge tone="red">{r.metrics.openBlockers}</Badge> : <span className="tabular-nums">0</span>}</td>
              <td className={td}>{r.createdBy === meId ? <Badge tone="blue">Creator</Badge> : r.isSigner ? <Badge tone="slate">Signer</Badge> : <span className="text-slate-500">-</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
