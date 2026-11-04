// Test Management's data lives on the server (Redis, behind
// /api/test-management) - not in the browser. Server-only by design:
// there is no local fallback, so every user sees the same suites, cases,
// runs and milestones.
//
// The screen keeps its usual in-memory shape (suites carrying their
// sections and testCases). `syncTestManagement` diffs the previous state
// against the new one and sends only what changed, item by item - which
// is also what lets the server apply its per-item ownership rules.
import type { MilestoneItem, ProjectItem, TestCaseItem, TestRunItem, TestSuiteItem } from '../types/operations';
import { isBackendConfigured } from './backendAuthService';
import { fetchWithTimeout } from './fetchWithTimeout';
import { sectionTree } from './testSections';

export interface TestManagementData {
  projects: ProjectItem[];
  suites: TestSuiteItem[];
  runs: TestRunItem[];
  milestones: MilestoneItem[];
}

export interface TestManagementSnapshot extends TestManagementData {
  /** Whether sample data has ever been loaded on this server. */
  seeded: boolean;
}

export class TestManagementApiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
    this.name = 'TestManagementApiError';
  }
}

export { isBackendConfigured as isTestManagementAvailable };

function url(path: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string).replace(/\/$/, '');
  return `${base}/api/test-management${path}`;
}

const enc = encodeURIComponent;

async function request<T>(method: string, path: string, body?: unknown): Promise<T | null> {
  let res: Response;
  try {
    res = await fetchWithTimeout(url(path), {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      retries: method === 'GET' ? 1 : 0, // only reads are safe to repeat
    });
  } catch {
    throw new TestManagementApiError('Could not reach the server.');
  }
  if (!res.ok) {
    let message = `Server error (${res.status}).`;
    try {
      const data = await res.json();
      if (typeof data?.error === 'string') message = data.error;
    } catch { /* keep the generic message */ }
    throw new TestManagementApiError(message, res.status);
  }
  return res.status === 204 ? null : ((await res.json()) as T);
}

export async function loadTestManagement(): Promise<TestManagementSnapshot> {
  const data = await request<TestManagementSnapshot>('GET', '');
  return {
    projects: Array.isArray(data?.projects) ? data.projects : [],
    suites: Array.isArray(data?.suites) ? data.suites : [],
    runs: Array.isArray(data?.runs) ? data.runs : [],
    milestones: Array.isArray(data?.milestones) ? data.milestones : [],
    seeded: Boolean(data?.seeded),
  };
}

/** Loads sample data the first time anyone opens the screen. If another
 * user got there first (409), just returns what the server has. */
export async function seedTestManagement(sample: TestManagementData): Promise<TestManagementSnapshot> {
  try {
    await request('POST', '/seed', sample);
  } catch (err) {
    if (!(err instanceof TestManagementApiError && err.status === 409)) throw err;
  }
  return loadTestManagement();
}

// ── diffing ──────────────────────────────────────────────────────────────

type Op = () => Promise<unknown>;

function byId<T extends { id: string }>(items: readonly T[] | undefined): Map<string, T> {
  return new Map((items ?? []).map((item) => [item.id, item]));
}

function same(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/** A suite's own fields: its sections and cases are saved separately. */
function suiteFields(suite: TestSuiteItem): Omit<TestSuiteItem, 'sections' | 'testCases'> {
  const { sections: _s, testCases: _c, ...fields } = suite;
  return fields;
}

/** Puts for items added or changed, deletes for items removed. */
function diff<T extends { id: string }>(
  prev: readonly T[] | undefined,
  next: readonly T[] | undefined,
  put: (item: T) => Op,
  del: (id: string) => Op,
  compare: (a: T, b: T) => boolean = same,
): { puts: Op[]; deletes: Op[] } {
  const before = byId(prev);
  const after = byId(next);
  const puts: Op[] = [];
  const deletes: Op[] = [];
  for (const [id, item] of after) {
    const old = before.get(id);
    if (!old || !compare(old, item)) puts.push(put(item));
  }
  for (const id of before.keys()) if (!after.has(id)) deletes.push(del(id));
  return { puts, deletes };
}

/** Runs ops a few at a time (a bulk import can touch hundreds of cases),
 * collecting failures instead of stopping at the first. */
async function runAll(ops: Op[], errors: TestManagementApiError[], concurrency = 6): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < ops.length) {
      const op = ops[next++];
      try {
        await op();
      } catch (err) {
        errors.push(err instanceof TestManagementApiError ? err : new TestManagementApiError(String(err)));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, ops.length) }, worker));
}

/** Runs ops one after another (where order matters, e.g. a parent
 * section before its sub-section), collecting failures. */
async function runInOrder(ops: Op[], errors: TestManagementApiError[]): Promise<void> {
  await runAll(ops, errors, 1);
}

/** Saves the difference between two states. Resolves with every error
 * (empty when everything was saved) - never throws.
 *
 * Order matters to the server's integrity checks: projects before the
 * suites that name them, suites before their contents, parent sections
 * before sub-sections - and deletes in reverse (cases, then sub-sections,
 * sections, suites, projects). */
export async function syncTestManagement(
  prev: TestManagementData,
  next: TestManagementData,
): Promise<TestManagementApiError[]> {
  const errors: TestManagementApiError[] = [];

  const projects = diff(
    prev.projects, next.projects,
    (p) => () => request('PUT', `/projects/${enc(p.id)}`, p),
    (id) => () => request('DELETE', `/projects/${enc(id)}`),
  );
  const suites = diff(
    prev.suites, next.suites,
    (s) => () => request('PUT', `/suites/${enc(s.id)}`, suiteFields(s)),
    (id) => () => request('DELETE', `/suites/${enc(id)}`),
    (a, b) => same(suiteFields(a), suiteFields(b)),
  );

  // Children of every suite that still exists; a deleted suite takes its
  // sections and cases with it on the server.
  const prevSuites = byId(prev.suites);
  const sectionPuts: Op[] = [];
  const sectionDeletes: Op[] = [];
  const casePuts: Op[] = [];
  const caseDeletes: Op[] = [];
  for (const suite of next.suites) {
    const old = prevSuites.get(suite.id);
    const base = `/suites/${enc(suite.id)}`;
    const oldSections = byId(old?.sections);
    for (const { section } of sectionTree(suite.sections)) { // parents first
      const before = oldSections.get(section.id);
      if (!before || !same(before, section)) {
        sectionPuts.push(() => request('PUT', `${base}/sections/${enc(section.id)}`, section));
      }
    }
    const kept = new Set((suite.sections ?? []).map((s) => s.id));
    for (const { section } of sectionTree(old?.sections).reverse()) { // sub-sections first
      if (!kept.has(section.id)) sectionDeletes.push(() => request('DELETE', `${base}/sections/${enc(section.id)}`));
    }
    const cases = diff<TestCaseItem>(
      old?.testCases, suite.testCases,
      (tc) => () => request('PUT', `${base}/cases/${enc(tc.id)}`, tc),
      (id) => () => request('DELETE', `${base}/cases/${enc(id)}`),
    );
    casePuts.push(...cases.puts);
    caseDeletes.push(...cases.deletes);
  }

  const runs = diff(
    prev.runs, next.runs,
    (r) => () => request('PUT', `/runs/${enc(r.id)}`, r),
    (id) => () => request('DELETE', `/runs/${enc(id)}`),
  );
  const milestones = diff(
    prev.milestones, next.milestones,
    (m) => () => request('PUT', `/milestones/${enc(m.id)}`, m),
    (id) => () => request('DELETE', `/milestones/${enc(id)}`),
  );

  await runAll(projects.puts, errors);
  await runAll(suites.puts, errors);
  await runInOrder(sectionPuts, errors);
  await runAll([...casePuts, ...caseDeletes], errors);
  await runInOrder(sectionDeletes, errors);
  await runAll(suites.deletes, errors);
  await runAll(projects.deletes, errors);
  await runAll([...runs.puts, ...runs.deletes, ...milestones.puts, ...milestones.deletes], errors);
  return errors;
}

// ── revision history (DDS-SRS-014) ───────────────────────────────────────

/** A saved version of a test case. Files are kept as name, size and a
 * fingerprint (`hash`, `evidenceImageHash`), not their contents. */
export interface CaseRevision {
  revision: number;
  savedAt: string;
  savedBy: string;
  /** Fields that differ from the revision before; empty for the first. */
  changes: string[];
  case: Partial<TestCaseItem> & { evidenceImageHash?: string };
}

/** Newest first. Empty for a case the server doesn't have yet. */
export async function loadCaseRevisions(suiteId: string, caseId: string): Promise<CaseRevision[]> {
  try {
    const data = await request<{ revisions: CaseRevision[] }>('GET', `/suites/${enc(suiteId)}/cases/${enc(caseId)}/revisions`);
    return Array.isArray(data?.revisions) ? data.revisions : [];
  } catch (err) {
    if (err instanceof TestManagementApiError && err.status === 404) return [];
    throw err;
  }
}

/** The case as it would be after restoring `revision`: its tracked fields
 * come back, while the current files (which history only fingerprints)
 * and the case's identity stay as they are now. */
export function restoreCaseRevision(current: TestCaseItem, revision: CaseRevision): TestCaseItem {
  const { attachments: _a, evidenceImageName: _n, evidenceImageHash: _h, ...fields } = revision.case;
  const restored: TestCaseItem = { ...current };
  // Fields the old version didn't have are removed, not kept from now.
  for (const key of Object.keys(restored) as (keyof TestCaseItem)[]) {
    if (!['id', 'suiteId', 'attachments', 'evidenceImage', 'evidenceImageName', 'createdBy', 'updatedAt'].includes(key) && !(key in fields)) {
      delete restored[key];
    }
  }
  return { ...restored, ...fields, id: current.id, suiteId: current.suiteId } as TestCaseItem;
}
