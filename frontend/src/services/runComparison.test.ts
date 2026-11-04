import { describe, it, expect } from 'vitest';
import type { TestCaseStatus, TestRunItem, TestSuiteItem } from '../types/operations';
import { comparableRuns, compareRuns, executionTypeOf, previousRun } from './runComparison';

function run(id: string, executedAt: string, results: [string, TestCaseStatus][], suiteId = 's1'): TestRunItem {
  return {
    id, name: id, suiteId, environment: 'e', status: 'Completed', passedCount: 0, failedCount: 0, blockedCount: 0, executedAt,
    caseResults: results.map(([customId, status], i) => ({ caseId: `${id}-${i}`, customId, title: `Case ${customId}`, status })),
  };
}

describe('compareRuns', () => {
  const before = run('r1', '2026-10-01', [['TC-1', 'Passed'], ['TC-2', 'Failed'], ['TC-3', 'Blocked'], ['TC-4', 'Passed'], ['TC-5', 'Passed'], ['TC-6', 'Passed']]);
  const after = run('r2', '2026-10-02', [['TC-1', 'Failed'], ['TC-2', 'Passed'], ['TC-3', 'Failed'], ['TC-4', 'Passed'], ['tc-5', 'Skipped'], ['TC-7', 'Passed']]);
  const cmp = compareRuns(before, after);

  it('classifies every case, matching by case ID (case-insensitive), not internal ids', () => {
    expect(Object.fromEntries(cmp.changes.map((c) => [c.customId, c.kind]))).toEqual({
      'TC-1': 'regression', 'TC-2': 'fixed', 'TC-3': 'still-failing', 'TC-7': 'new', 'TC-6': 'removed', 'tc-5': 'changed', 'TC-4': 'unchanged',
    });
  });

  it('lists regressions first and counts each kind', () => {
    expect(cmp.changes[0]).toMatchObject({ customId: 'TC-1', before: 'Passed', after: 'Failed' });
    expect(cmp.counts).toEqual({ regression: 1, fixed: 1, 'still-failing': 1, new: 1, removed: 1, changed: 1, unchanged: 1 });
  });

  it('reports the pass rate of each run (of executed cases)', () => {
    expect(cmp.passRate).toEqual({ before: 67, after: 50 }); // 4/6; 3/6 executed (skipped counts as executed)
  });
});

describe('previousRun / comparableRuns', () => {
  const older = run('old', '2026-09-01', [['TC-1', 'Passed']]);
  const prev = run('prev', '2026-10-01', [['TC-1', 'Passed']]);
  const empty = run('empty', '2026-10-05', []);
  const otherSuite = run('other', '2026-10-06', [['TC-1', 'Passed']], 's2');
  const current = run('cur', '2026-10-10', [['TC-1', 'Failed']]);
  const later = run('later', '2026-10-20', [['TC-1', 'Passed']]);
  const runs = [older, current, later, prev, empty, otherSuite];

  it('offers earlier runs of the same suite with results, newest first', () => {
    expect(comparableRuns(runs, current).map((r) => r.id)).toEqual(['prev', 'old']);
    expect(previousRun(runs, current)?.id).toBe('prev');
    expect(previousRun(runs, older)).toBeUndefined();
  });
});

describe('executionTypeOf', () => {
  const suite = {
    id: 's1', testCases: [
      { id: 'c1', customId: 'TC-1', type: 'Manual' },
      { id: 'c2', customId: 'TC-2', type: 'Automated' },
    ],
  } as unknown as TestSuiteItem;

  it('looks the case up by id, then by its visible ID', () => {
    expect(executionTypeOf({ caseId: 'c1', customId: 'x', title: '', status: 'Passed' }, suite)).toBe('Manual');
    expect(executionTypeOf({ caseId: 'tc-0', customId: 'tc-2', title: '', status: 'Passed' }, suite)).toBe('Automated');
    expect(executionTypeOf({ caseId: 'zz', customId: 'TC-9', title: '', status: 'Passed' }, suite)).toBe('Unknown');
    expect(executionTypeOf({ caseId: 'c1', customId: 'TC-1', title: '', status: 'Passed' })).toBe('Unknown');
  });
});
