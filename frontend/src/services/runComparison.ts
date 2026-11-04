// Historical trends (DDS-SRS-025): compare a test run with an earlier run
// of the same suite and classify every case - regressions first.
import type { TestCaseItem, TestCaseStatus, TestRunCaseResult, TestRunItem, TestSuiteItem } from '../types/operations';

export type ChangeKind = 'regression' | 'fixed' | 'still-failing' | 'new' | 'removed' | 'changed' | 'unchanged';

export const CHANGE_KINDS: ChangeKind[] = ['regression', 'fixed', 'still-failing', 'new', 'removed', 'changed', 'unchanged'];

export const CHANGE_LABELS: Record<ChangeKind, string> = {
  regression: 'Regression', fixed: 'Fixed', 'still-failing': 'Still failing',
  new: 'New', removed: 'Not in this run', changed: 'Changed', unchanged: 'Unchanged',
};

export interface CaseChange {
  key: string;
  customId: string;
  title: string;
  before?: TestCaseStatus;
  after?: TestCaseStatus;
  kind: ChangeKind;
}

export interface RunComparison {
  baseline: TestRunItem;
  current: TestRunItem;
  /** Every case in either run, most important first (regressions, fixed, ...). */
  changes: CaseChange[];
  counts: Record<ChangeKind, number>;
  /** Pass rate of executed cases, 0-100, for each run. */
  passRate: { before: number; after: number };
}

const failing = (s?: TestCaseStatus) => s === 'Failed' || s === 'Blocked';

/** Results are matched by the case's ID as users see it (customId): automated
 * imports give results their own internal caseIds, so those differ between runs. */
const keyOf = (r: TestRunCaseResult) => (r.customId || r.caseId).trim().toLowerCase();

function classify(before?: TestCaseStatus, after?: TestCaseStatus): ChangeKind {
  if (!before) return 'new';
  if (!after) return 'removed';
  if (before === 'Passed' && failing(after)) return 'regression';
  if (failing(before) && after === 'Passed') return 'fixed';
  if (failing(before) && failing(after)) return 'still-failing';
  return before === after ? 'unchanged' : 'changed';
}

function passRate(results: TestRunCaseResult[]): number {
  const executed = results.filter((r) => r.status !== 'Untested');
  return executed.length ? Math.round((executed.filter((r) => r.status === 'Passed').length / executed.length) * 100) : 0;
}

export function compareRuns(baseline: TestRunItem, current: TestRunItem): RunComparison {
  const before = new Map((baseline.caseResults ?? []).map((r) => [keyOf(r), r]));
  const after = new Map((current.caseResults ?? []).map((r) => [keyOf(r), r]));
  const changes: CaseChange[] = [];
  for (const key of new Set([...after.keys(), ...before.keys()])) {
    const b = before.get(key);
    const a = after.get(key);
    const shown = a ?? b!;
    changes.push({ key, customId: shown.customId, title: shown.title, before: b?.status, after: a?.status, kind: classify(b?.status, a?.status) });
  }
  const rank = (k: ChangeKind) => CHANGE_KINDS.indexOf(k);
  changes.sort((x, y) => rank(x.kind) - rank(y.kind) || x.customId.localeCompare(y.customId, undefined, { numeric: true }));
  const counts = Object.fromEntries(CHANGE_KINDS.map((k) => [k, 0])) as Record<ChangeKind, number>;
  for (const c of changes) counts[c.kind] += 1;
  return {
    baseline, current, changes, counts,
    passRate: { before: passRate(baseline.caseResults ?? []), after: passRate(current.caseResults ?? []) },
  };
}

const time = (run: TestRunItem) => Date.parse(run.executedAt) || 0;

/** Earlier runs of the same suite that have results, newest first: the
 * runs `run` can be compared against. */
export function comparableRuns(runs: readonly TestRunItem[], run: TestRunItem): TestRunItem[] {
  return runs
    .filter((r) => r.id !== run.id && r.suiteId === run.suiteId && (r.caseResults?.length ?? 0) > 0 && time(r) <= time(run))
    .sort((a, b) => time(b) - time(a));
}

/** The run to compare against by default: the latest earlier run of the suite. */
export function previousRun(runs: readonly TestRunItem[], run: TestRunItem): TestRunItem | undefined {
  return comparableRuns(runs, run)[0];
}

// ── manual vs automated (DDS-SRS-031) ────────────────────────────────────

export type ExecutionType = 'Manual' | 'Automated' | 'Unknown';

/** Whether each result came from a manual or an automated test case, by
 * looking the case up in its suite (by id, then by the visible case ID). */
export function executionTypeOf(result: TestRunCaseResult, suite?: TestSuiteItem): ExecutionType {
  const cases: TestCaseItem[] = suite?.testCases ?? [];
  const tc = cases.find((c) => c.id === result.caseId)
    ?? cases.find((c) => c.customId.toLowerCase() === (result.customId || '').toLowerCase());
  return tc?.type ?? 'Unknown';
}
