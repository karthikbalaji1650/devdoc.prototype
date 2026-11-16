// Release management (DDS-SRS-033 - 046) on the server: /api/releases.
// The server evaluates readiness gates, decides who may do what, and keeps
// the audit log; this client only reads and sends changes. Every call throws
// with the server's message on failure.
import { isBackendConfigured } from './backendAuthService';
import { fetchWithTimeout } from './fetchWithTimeout';

export type ReleaseType = 'Major' | 'Minor' | 'Patch' | 'Hotfix';
export type ReleaseStatus = 'Planned' | 'In Progress' | 'RC Frozen' | 'Approved' | 'Deployed' | 'Cancelled';
export const RELEASE_TYPES: ReleaseType[] = ['Major', 'Minor', 'Patch', 'Hotfix'];
/** Statuses a person can pick; cancelling is its own action. */
export const SETTABLE_STATUSES: ReleaseStatus[] = ['Planned', 'In Progress', 'RC Frozen', 'Approved', 'Deployed'];
export const SEVERITIES = ['Blocker', 'Critical', 'Major', 'Minor'] as const;
export const REPOSITORIES = ['Artifactory', 'Nexus', 'AWS ECR', 'Other'] as const;
/** A release has the creator plus 1 to 4 others. */
export const MIN_SIGNERS = 2;
export const MAX_SIGNERS = 5;

export interface Milestone { key: string; name: string; plannedDate: string | null; actualDate: string | null }
export interface Signer { userId: string; name: string; designation: string | null; department: string | null }
export interface GateRules { minPassRate: number; requireNoOpenBlockers: boolean; mandatorySuiteIds: string[] }
export interface GateCheck { id: string; label: string; passed: boolean; detail: string }
export interface Signoff { userId: string; userName: string; decision: 'Approved' | 'Rejected'; comment: string | null; at: string }

export interface Build {
  id: string;
  number: number;
  label: string;
  kind: 'RC' | 'Final';
  imageName: string;
  commitSha: string | null;
  branchTag: string | null;
  artifactUrl: string;
  repository: string;
  sha256: string;
  builtAt: string | null;
  pipelineBuildId: string | null;
  testRunIds: string[];
  /** By user id. */
  signoffs: Record<string, Signoff>;
  gateOverride: { by: string; byId: string; reason: string; at: string } | null;
  promotedBy: string | null;
  promotedAt: string | null;
  createdByName: string | null;
  createdAt: string;
  gates: {
    checks: GateCheck[]; passed: boolean; overridden: boolean; ready: boolean;
    passRate: number | null; coverage: number | null; linkedRuns: number;
    verification: 'Pending' | 'Verified' | 'Failed';
  };
  signoffStatus: { required: number; approved: number; rejected: number; waitingFor: string[]; complete: boolean };
}

export interface Blocker {
  id: string; key: string; tracker: 'Jira' | 'GitHub'; title: string | null; url: string | null;
  severity: (typeof SEVERITIES)[number]; status: 'Open' | 'Closed';
  /** "manual": entered by hand. "synced": from the release's blocker query.
   * "linked": by key. The last two are read from Jira / GitHub (044) and
   * kept current by each sync. */
  source: 'manual' | 'synced' | 'linked';
  syncedAt: string | null;
  syncNote: string | null;
}

/** Which Jira / GitHub issues are the release's blockers (044). */
export interface BlockerQuery { jira?: { jql: string }; github?: { repo: string; label: string } }
export interface BlockerSync { at: string; added: string[]; closed: string[]; reopened: string[]; error: string | null }

export interface ReleaseMetrics {
  milestonesDone: number; milestonesTotal: number; openBlockers: number; builds: number;
  latestBuild: string | null; latestPassRate: number | null; latestCoverage: number | null; finalBuild: string | null;
}

export interface Release {
  id: string;
  version: string;
  title: string | null;
  type: ReleaseType;
  targetDate: string;
  segment: string | null;
  status: ReleaseStatus;
  notes: string;
  milestones: Milestone[];
  /** The creator first. */
  signers: Signer[];
  gateRules: GateRules;
  blockerQuery: BlockerQuery | null;
  blockerSync: BlockerSync | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  cancelledReason: string | null;
  cancelledAt: string | null;
  /** The signed-in user is the creator (and the release is not cancelled). */
  canEdit: boolean;
  /** The signed-in user is one of the signers. */
  isSigner: boolean;
  /** A build is Final or the release is cancelled, so the signers can no longer change. */
  signersLocked: boolean;
  builds: Build[];
  blockers: Blocker[];
  metrics: ReleaseMetrics;
}

/** One line of the release list. */
export interface ReleaseLine {
  id: string; version: string; title: string | null; type: ReleaseType; status: ReleaseStatus;
  targetDate: string; segment: string | null; createdBy: string; createdByName: string;
  signerCount: number; canEdit: boolean; isSigner: boolean;
  metrics: { builds: number; latestBuild: string | null; finalBuild: string | null; openBlockers: number };
}

export interface AuditEntry {
  seq: number; at: string; actorId: string; actor: string; actorRole: string; action: string;
  details: Record<string, unknown>; prevHash: string; hash: string;
}

/** What each audit action is called on screen. */
export const AUDIT_ACTIONS: Record<string, string> = {
  'release-created': 'Release created', 'release-edited': 'Release details changed', 'status-changed': 'Status changed',
  'release-cancelled': 'Release cancelled', 'signers-changed': 'Signers changed', 'build-registered': 'Build registered',
  'test-runs-linked': 'Test runs linked', 'gates-overridden': 'Gates overridden', 'signed-off': 'Signed off',
  'promoted-to-final': 'Promoted to Final', 'blocker-logged': 'Blocker logged', 'blocker-closed': 'Blocker closed',
  'blocker-open': 'Blocker reopened', 'blocker-removed': 'Blocker removed', 'blockers-synced': 'Blockers synced from Jira / GitHub',
  'blocker-query-changed': 'Blocker query changed', 'gate-rules-changed': 'Readiness rules changed',
};

export { isBackendConfigured as isReleasesAvailable };

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const base = (import.meta.env.VITE_API_BASE_URL as string).replace(/\/$/, '');
  let res: Response;
  try {
    res = await fetchWithTimeout(`${base}/api/releases${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      retries: method === 'GET' ? 1 : 0,
    });
  } catch {
    throw new Error('Could not reach the server.');
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(typeof data?.error === 'string' ? data.error : `Server error (${res.status}).`), { status: res.status });
  return data as T;
}
const enc = encodeURIComponent;

export const loadReleases = () => call<{ releases: ReleaseLine[] }>('GET', '').then((r) => r.releases);
export const loadRelease = (id: string) => call<{ release: Release }>('GET', `/${enc(id)}`).then((r) => r.release);

export interface NewRelease {
  version: string; type: ReleaseType; targetDate: string; segment?: string; title?: string;
  /** The 1 to 4 people besides you; you are added as the first signer. */
  signerIds: string[];
}
export const createRelease = (release: NewRelease) => call<{ release: Release }>('POST', '', release).then((r) => r.release);

/** The fields of a release a person can edit; only those sent change. */
export type ReleaseChanges = Partial<Pick<Release,
  'version' | 'title' | 'type' | 'targetDate' | 'segment' | 'status' | 'notes' | 'milestones' | 'gateRules' | 'blockerQuery'>>;
export const updateRelease = (id: string, changes: ReleaseChanges) => call<{ release: Release }>('PATCH', `/${enc(id)}`, changes).then((r) => r.release);
export const setSigners = (id: string, userIds: string[]) => call<{ release: Release }>('PUT', `/${enc(id)}/signers`, { userIds }).then((r) => r.release);
export const cancelRelease = (id: string, reason: string) => call<{ release: Release }>('POST', `/${enc(id)}/cancel`, { reason }).then((r) => r.release);

export const registerBuild = (id: string, build: Record<string, string>) => call<{ build: Build }>('POST', `/${enc(id)}/builds`, build);
export const linkRuns = (id: string, buildId: string, testRunIds: string[]) =>
  call<{ build: Build }>('PUT', `/${enc(id)}/builds/${enc(buildId)}/runs`, { testRunIds });
export const overrideGates = (id: string, buildId: string, reason: string) =>
  call<{ build: Build }>('POST', `/${enc(id)}/builds/${enc(buildId)}/override`, { reason });
/** The signed-in signer's own decision. */
export const signOff = (id: string, buildId: string, decision: 'Approved' | 'Rejected', comment: string) =>
  call<{ build: Build }>('POST', `/${enc(id)}/builds/${enc(buildId)}/signoffs`, { decision, comment: comment || undefined });
export const promoteBuild = (id: string, buildId: string) => call<{ build: Build }>('POST', `/${enc(id)}/builds/${enc(buildId)}/promote`);

export interface NewBlocker { key: string; tracker: 'Jira' | 'GitHub'; title?: string; url?: string; severity: (typeof SEVERITIES)[number] }
export const addBlocker = (id: string, blocker: NewBlocker) => call<{ blocker: Blocker }>('POST', `/${enc(id)}/blockers`, blocker);
export const updateBlocker = (id: string, blockerId: string, changes: Partial<Pick<Blocker, 'status' | 'severity' | 'title' | 'url' | 'key'>>) =>
  call<{ blocker: Blocker }>('PATCH', `/${enc(id)}/blockers/${enc(blockerId)}`, changes);
export const deleteBlocker = (id: string, blockerId: string) => call<null>('DELETE', `/${enc(id)}/blockers/${enc(blockerId)}`);
/** Links a Jira (PROJ-123) or GitHub (owner/repo#123) issue, read from the tracker. */
export const lookupBlocker = (id: string, tracker: 'Jira' | 'GitHub', key: string) =>
  call<{ blocker: Blocker }>('POST', `/${enc(id)}/blockers/lookup`, { tracker, key });
export const syncBlockers = (id: string) => call<BlockerSync>('POST', `/${enc(id)}/blockers/sync`);
/** The latest audit entries across every release, newest first (the dashboard's recent activity). */
export const loadReleaseActivity = (limit = 10) =>
  call<{ entries: import('./recentActivity').ReleaseActivityEntry[] }>('GET', `/activity?limit=${limit}`).then((r) => r.entries);
export const loadAudit = (id: string) => call<{ entries: AuditEntry[]; intact: boolean }>('GET', `/${enc(id)}/audit`);

/** A Markdown draft of the release notes from what the release holds. */
export function draftReleaseNotes(release: Release, runName: (id: string) => string): string {
  const final = release.builds.find((b) => b.kind === 'Final');
  const build = final ?? release.builds[release.builds.length - 1];
  const lines = [`# ${release.version}${release.title ? ` - ${release.title}` : ''}`, '',
    `Type: ${release.type} · Target date: ${release.targetDate}${release.segment ? ` · Customer: ${release.segment}` : ''} · Status: ${release.status}`, ''];
  if (build) {
    lines.push(`## Build ${build.label}${final ? ' (Final)' : ''}`, '',
      `- Image: ${build.imageName}`, `- SHA-256: ${build.sha256}`, `- Artifact: ${build.artifactUrl}`);
    if (build.commitSha) lines.push(`- Commit: ${build.commitSha}${build.branchTag ? ` (${build.branchTag})` : ''}`);
    lines.push('');
    if (build.testRunIds.length) {
      lines.push('## Testing', '', ...build.testRunIds.map((r) => `- ${runName(r)}`),
        '', `Pass rate: ${build.gates.passRate ?? '-'}% · Coverage: ${build.gates.coverage ?? '-'}%`, '');
    }
  }
  const closed = release.blockers.filter((b) => b.status === 'Closed');
  const open = release.blockers.filter((b) => b.status === 'Open');
  if (closed.length) lines.push('## Fixed', '', ...closed.map((b) => `- ${b.key}${b.title ? `: ${b.title}` : ''}`), '');
  if (open.length) lines.push('## Known issues', '', ...open.map((b) => `- ${b.key} (${b.severity})${b.title ? `: ${b.title}` : ''}`), '');
  return lines.join('\n');
}
