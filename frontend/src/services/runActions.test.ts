import { describe, it, expect } from 'vitest';
import type { TestRunItem } from '../types/operations';
import { closeRun, reopenRun, rerunOf } from './runActions';

const now = new Date('2026-11-06T10:00:00Z');
const run: TestRunItem = {
  id: 'run-1', name: 'Regression', suiteId: 's1', environment: 'Lab', status: 'In Progress',
  passedCount: 0, failedCount: 0, blockedCount: 0, executedAt: '2026-11-05T10:00:00Z', milestone: 'v2.4',
  caseResults: [
    { caseId: 'a', customId: 'TC-1', title: 'A', status: 'Passed', comment: 'ok', testedBy: 'QA' },
    { caseId: 'b', customId: 'TC-2', title: 'B', status: 'Failed', defects: ['WH3-1'] },
    { caseId: 'c', customId: 'TC-3', title: 'C', status: 'Untested' },
  ],
  remote: { server: 'Lab PC', phase: 'COMPLETED' },
};

describe('closeRun / reopenRun', () => {
  it('a run with a failure closes as Failed, with counts from its results', () => {
    const closed = closeRun(run, now);
    expect([closed.status, closed.passedCount, closed.failedCount, closed.untestedCount, closed.endDate])
      .toEqual(['Failed', 1, 1, 1, now.toISOString()]);
  });

  it('a run with no failed or blocked case closes as Completed', () => {
    const ok = { ...run, caseResults: run.caseResults!.map((r) => ({ ...r, status: 'Passed' as const })) };
    expect(closeRun(ok, now).status).toBe('Completed');
    const blocked = { ...run, caseResults: [{ ...run.caseResults![0], status: 'Blocked' as const }] };
    expect(closeRun(blocked, now).status).toBe('Failed');
  });

  it('reopening puts it back in progress and clears the end date', () => {
    const reopened = reopenRun(closeRun(run, now));
    expect(reopened.status).toBe('In Progress');
    expect(reopened.endDate).toBeUndefined();
    expect(reopened.caseResults).toEqual(run.caseResults);
  });
});

describe('rerunOf', () => {
  it('is a new run of the same cases, all untested, with nothing carried over', () => {
    const again = rerunOf(run, now);
    expect(again.id).toBe(`run-${now.getTime()}`);
    expect(again.name).toBe('Regression (rerun)');
    expect([again.status, again.suiteId, again.environment, again.milestone]).toEqual(['In Progress', 's1', 'Lab', 'v2.4']);
    expect(again.caseResults!.map((r) => [r.customId, r.status])).toEqual([['TC-1', 'Untested'], ['TC-2', 'Untested'], ['TC-3', 'Untested']]);
    expect(again.caseResults!.some((r) => r.comment || r.defects || r.testedBy)).toBe(false);
    expect([again.passedCount, again.failedCount, again.untestedCount]).toEqual([0, 0, 3]);
    expect(again.remote).toBeUndefined();
  });

  it('a rerun of a rerun is not named "(rerun) (rerun)"', () => {
    expect(rerunOf(rerunOf(run, now), now).name).toBe('Regression (rerun)');
  });
});
