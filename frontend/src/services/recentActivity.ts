// The dashboard's recent activity: document updates and release events in one
// list, newest first. Documents only record when they were last saved; releases
// record every action in their audit log, so their entries say what happened.
import type { DocStatus, DocumentModel } from '../types/document';
import { AUDIT_ACTIONS } from './releasesApiService';

export interface ReleaseActivityEntry {
  releaseId: string; version: string | null; seq: number; at: string;
  actorId: string; actor: string; action: string; details: Record<string, unknown>;
}

export type ActivityItem =
  | { kind: 'document'; key: string; at: string; docId: string; title: string; docNumber: string; author: string; status: DocStatus }
  | { kind: 'release'; key: string; at: string; releaseId: string; version: string; title: string; line: string };

const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/** A release audit entry as a heading ("Signed off") and a sentence ("Judia approved v2.4.0-RC100"). */
export function describeReleaseEvent(e: ReleaseActivityEntry): { title: string; line: string } {
  const d = e.details;
  const who = e.actor;
  const sentences: Record<string, () => string> = {
    'release-created': () => `${who} created the release`,
    'release-edited': () => `${who} changed the release details`,
    'status-changed': () => `${who} changed the status from ${text(d.from)} to ${text(d.to)}`,
    'release-cancelled': () => `${who} cancelled the release${d.reason ? `: ${text(d.reason)}` : ''}`,
    'signers-changed': () => `${who} changed the signers`,
    'build-registered': () => `${who} registered ${text(d.build)}`,
    'test-runs-linked': () => `${who} linked test runs to ${text(d.build)}`,
    'gates-overridden': () => `${who} overrode the gates on ${text(d.build)}${d.reason ? `: ${text(d.reason)}` : ''}`,
    'signed-off': () => `${who} ${d.decision === 'Rejected' ? 'rejected' : 'approved'} ${text(d.build)}`,
    'promoted-to-final': () => `${who} promoted ${text(d.build)} to Final`,
    'blocker-logged': () => `${who} logged blocker ${text(d.key)}${d.severity ? ` (${text(d.severity)})` : ''}`,
    'blocker-closed': () => `${who} closed blocker ${text(d.key)}`,
    'blocker-open': () => `${who} reopened blocker ${text(d.key)}`,
    'blocker-removed': () => `${who} removed blocker ${text(d.key)}`,
    'blockers-synced': () => 'Blockers synced from Jira / GitHub',
    'blocker-query-changed': () => `${who} changed the blocker query`,
    'gate-rules-changed': () => `${who} changed the readiness rules`,
  };
  const say = sentences[e.action];
  return { title: AUDIT_ACTIONS[e.action] ?? e.action, line: say ? say() : `${who}: ${e.action}` };
}

/** Documents (with their last save time) and release events, newest first. */
export function mergeActivity(
  docs: { doc: DocumentModel; updatedAt: string | undefined }[],
  releaseEvents: ReleaseActivityEntry[],
  limit: number,
): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const { doc, updatedAt } of docs) {
    if (!updatedAt || new Date(updatedAt).getTime() <= 0) continue; // never saved on the server
    const m = doc.metadata;
    items.push({
      kind: 'document', key: `doc:${m.id}`, at: updatedAt, docId: m.id,
      title: m.title || 'Untitled document', docNumber: m.docNumber ?? '', author: m.author ?? '', status: m.status,
    });
  }
  for (const e of releaseEvents) {
    items.push({ kind: 'release', key: `rel:${e.releaseId}:${e.seq}`, at: e.at, releaseId: e.releaseId, version: e.version ?? 'Release', ...describeReleaseEvent(e) });
  }
  return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, limit);
}
