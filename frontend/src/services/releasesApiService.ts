// Release management (DDS-SRS-033 - 046) on the server: /api/releases.
// The server evaluates readiness gates and keeps the audit log; this
// client only reads and sends changes. Every call throws with the
// server's message on failure.
import { isBackendConfigured } from './backendAuthService';
import { fetchWithTimeout } from './fetchWithTimeout';

export type ReleaseType = 'Major' | 'Minor' | 'Patch' | 'Hotfix';
export type ReleaseStatus = 'Planned' | 'In Progress' | 'RC Frozen' | 'Approved' | 'Deployed' | 'Cancelled';
export const RELEASE_TYPES: ReleaseType[] = ['Major', 'Minor', 'Patch', 'Hotfix'];
export const RELEASE_STATUSES: ReleaseStatus[] = ['Planned', 'In Progress', 'RC Frozen', 'Approved', 'Deployed', 'Cancelled'];
export const SEVERITIES = ['Blocker', 'Critical', 'Major', 'Minor'] as const;
export const REPOSITORIES = ['Artifactory', 'Nexus', 'AWS ECR', 'Other'] as const;

export interface Milestone { key: string; name: string; plannedDate: string | null; actualDate: string | null }
export interface SignoffRole { role: string; userName: string | null }
export interface GateRules { minPassRate: number; requireNoOpenBlockers: boolean; mandatorySuiteIds: string[] }
export interface GateCheck { id: string; label: string; passed: boolean; detail: string }
export interface Signoff { userName: string; decision: 'Approved' | 'Rejected'; comment: string | null; at: string }

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
  signoffs: Record<string, Signoff>;
  gateOverride?: { by: string; reason: string; at: string };
  promotedBy?: string;
  promotedAt?: string;
  createdAt: string;
  gates: {
    checks: GateCheck[]; passed: boolean; overridden: boolean; ready: boolean;
    passRate: number | null; coverage: number | null; linkedRuns: number;
    verification: 'Pending' | 'Verified' | 'Failed';
  };
  signoffStatus: { required: number; approved: number; complete: boolean };
}

export interface Blocker {
  id: string; key: string; tracker: 'Jira' | 'GitHub'; title: string | null; url: string | null;
  severity: (typeof SEVERITIES)[number]; status: 'Open' | 'Closed';
}

export interface Release {
  id: string;
  version: string;
  title: string | null;
  type: ReleaseType;
  targetDate: string;
  segment: string | null;
  status: ReleaseStatus;
  milestones: Milestone[];
  signoffRoles: SignoffRole[];
  gateRules: GateRules;
  notes: string;
  documents: { id: string; title: string }[];
  createdBy: string;
  builds: Build[];
  blockers: Blocker[];
  metrics: {
    milestonesDone: number; milestonesTotal: number; openBlockers: number; builds: number;
    latestBuild: string | null; latestPassRate: number | null; latestCoverage: number | null; finalBuild: string | null;
  };
}

export interface AuditEntry {
  seq: number; at: string; actor: string; actorRole: string; action: string;
  details: Record<string, unknown>; prevHash: string; hash: string;
}

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

export interface ReleasesSnapshot { releases: Release[]; seeded: boolean; canManage: boolean }

export const loadReleases = () => call<ReleasesSnapshot>('GET', '');
export async function seedReleases(releases: unknown[]): Promise<ReleasesSnapshot> {
  try {
    return await call<ReleasesSnapshot>('POST', '/seed', { releases });
  } catch (err) {
    if ((err as { status?: number }).status === 409) return loadReleases(); // someone else seeded
    throw err;
  }
}
export const saveRelease = (id: string, release: Partial<Release>) => call<{ release: Release }>('PUT', `/${enc(id)}`, release);
export const deleteRelease = (id: string) => call<null>('DELETE', `/${enc(id)}`);
export const registerBuild = (id: string, build: Record<string, string>) => call<{ build: Build }>('POST', `/${enc(id)}/builds`, build);
export const linkRuns = (id: string, buildId: string, testRunIds: string[]) =>
  call<{ build: Build }>('PUT', `/${enc(id)}/builds/${enc(buildId)}/runs`, { testRunIds });
export const overrideGates = (id: string, buildId: string, reason: string) =>
  call<{ build: Build }>('POST', `/${enc(id)}/builds/${enc(buildId)}/override`, { reason });
export const signOff = (id: string, buildId: string, role: string, decision: 'Approved' | 'Rejected', comment: string) =>
  call<{ build: Build }>('POST', `/${enc(id)}/builds/${enc(buildId)}/signoffs`, { role, decision, comment: comment || undefined });
export const promoteBuild = (id: string, buildId: string) => call<{ build: Build }>('POST', `/${enc(id)}/builds/${enc(buildId)}/promote`);
export const saveBlocker = (id: string, blockerId: string, blocker: Partial<Blocker>) =>
  call<{ blocker: Blocker }>('PUT', `/${enc(id)}/blockers/${enc(blockerId)}`, blocker);
export const deleteBlocker = (id: string, blockerId: string) => call<null>('DELETE', `/${enc(id)}/blockers/${enc(blockerId)}`);
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
