import React from 'react';
import type { ReleaseLine } from '../../../services/releasesApiService';
import { releasesPath } from '../../../services/releasesRoute';
import { AppLink, Badge, card, statusTone } from './common';

/** Every release, one line each; anyone signed in can read them. */
export const ReleaseList: React.FC<{ releases: ReleaseLine[]; meId: string }> = ({ releases, meId }) => {
  if (releases.length === 0) {
    return <p className="text-xs text-slate-500">No releases yet. Use "New release" to create the first one.</p>;
  }
  return (
    <table className={`${card} w-full text-xs`} aria-label="Releases">
      <thead>
        <tr className="text-left text-slate-500">
          <th className="py-1">Version</th><th>Status</th><th>Type</th><th>Target date</th><th>Created by</th><th>Signers</th><th>Builds</th><th>Open blockers</th><th>You</th>
        </tr>
      </thead>
      <tbody>
        {releases.map((r) => (
          <tr key={r.id} className="border-t border-slate-100">
            <td className="py-1.5">
              <AppLink to={releasesPath({ view: 'release', releaseId: r.id, tab: 'overview', buildId: null })} className="font-semibold text-blue-700 hover:underline">{r.version}</AppLink>
              {r.title && <div className="text-[11px] text-slate-500">{r.title}</div>}
            </td>
            <td><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
            <td>{r.type}</td>
            <td>{r.targetDate}</td>
            <td>{r.createdByName}</td>
            <td>{r.signerCount}</td>
            <td>{r.metrics.finalBuild ?? r.metrics.latestBuild ?? '-'}</td>
            <td>{r.metrics.openBlockers}</td>
            <td>{r.createdBy === meId ? <Badge tone="blue">Creator</Badge> : r.isSigner ? <Badge tone="slate">Signer</Badge> : '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
