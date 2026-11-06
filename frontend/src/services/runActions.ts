// The actions on a test run's page: close / reopen and rerun.
import type { TestRunItem, TestRunCaseResult } from '../types/operations';

const count = (results: TestRunCaseResult[], status: TestRunCaseResult['status']) => results.filter((r) => r.status === status).length;

/** Counts recomputed from the case results (runs without them keep theirs). */
export function withCounts(run: TestRunItem): TestRunItem {
  const r = run.caseResults;
  if (!r?.length) return run;
  return {
    ...run,
    passedCount: count(r, 'Passed'), failedCount: count(r, 'Failed'), blockedCount: count(r, 'Blocked'),
    skippedCount: count(r, 'Skipped'), untestedCount: count(r, 'Untested'),
  };
}

/** Finishes the run: Failed if any case failed or is blocked, else Completed. */
export function closeRun(run: TestRunItem, now = new Date()): TestRunItem {
  const counted = withCounts(run);
  return { ...counted, status: counted.failedCount + counted.blockedCount > 0 ? 'Failed' : 'Completed', endDate: now.toISOString() };
}

/** Opens a finished run again for testing. */
export function reopenRun(run: TestRunItem): TestRunItem {
  const { endDate: _endDate, ...rest } = run;
  return { ...rest, status: 'In Progress' };
}

/** A new run of the same cases, all Untested, with nothing carried over
 * (results, comments, defects, remote or CI details). */
export function rerunOf(run: TestRunItem, now = new Date()): TestRunItem {
  const caseResults = (run.caseResults ?? []).map(({ caseId, customId, title, assignedTo, labels }) =>
    ({ caseId, customId, title, assignedTo, labels, status: 'Untested' as const }));
  const fresh: TestRunItem = {
    id: `run-${now.getTime()}`,
    name: `${run.name.replace(/ \(rerun( \d+)?\)$/, '')} (rerun)`,
    suiteId: run.suiteId,
    environment: run.environment,
    milestone: run.milestone,
    assignedTo: run.assignedTo,
    description: run.description,
    status: 'In Progress',
    passedCount: 0, failedCount: 0, blockedCount: 0, skippedCount: 0,
    untestedCount: caseResults.length,
    executedAt: now.toISOString(),
    caseResults,
  };
  return fresh;
}
