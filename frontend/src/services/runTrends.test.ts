import { describe, it, expect } from 'vitest';
import type { TestRunItem } from '../types/operations';
import { countTicks, executedCount, passRateTrend, velocity } from './runTrends';

const now = new Date(2026, 10, 6, 15, 0); // 6 Nov 2026, local time
const at = (day: number, hour = 10) => new Date(2026, 10, day, hour).toISOString();

function run(id: string, executedAt: string, counts: Partial<TestRunItem> = {}): TestRunItem {
  return {
    id, name: `Run ${id}`, suiteId: 's1', environment: 'Lab', status: 'Completed',
    passedCount: 8, failedCount: 2, blockedCount: 0, executedAt, ...counts,
  };
}

describe('executedCount', () => {
  it('counts passed, failed, blocked and skipped, not untested', () => {
    expect(executedCount(run('a', at(1), { passedCount: 3, failedCount: 1, blockedCount: 2, skippedCount: 1, untestedCount: 9 }))).toBe(7);
  });
});

describe('velocity', () => {
  it('sums executed cases per local day, zero-filled, today last', () => {
    const days = velocity([run('a', at(6)), run('b', at(6, 14)), run('c', at(4)), run('old', at(1))], 3, now);
    expect(days).toEqual([
      { date: '2026-11-04', executed: 10, runs: 1 },
      { date: '2026-11-05', executed: 0, runs: 0 },
      { date: '2026-11-06', executed: 20, runs: 2 },
    ]);
  });

  it('filters by suite', () => {
    const days = velocity([run('a', at(6)), { ...run('b', at(6)), suiteId: 's2' }], 1, now, 's2');
    expect(days[0]).toEqual({ date: '2026-11-06', executed: 10, runs: 1 });
  });
});

describe('passRateTrend', () => {
  it('lists finished runs with results in range, oldest first', () => {
    const points = passRateTrend([
      run('late', at(5), { passedCount: 9, failedCount: 1 }),
      run('early', at(3), { passedCount: 1, failedCount: 2 }),
      run('running', at(5), { status: 'In Progress' }),
      run('empty', at(5), { passedCount: 0, failedCount: 0 }),
      run('old', at(1)),
    ], 4, now);
    expect(points.map((p) => [p.id, p.rate])).toEqual([['early', 33.3], ['late', 90]]);
  });
});

describe('countTicks', () => {
  it('rounds to clean steps that reach the maximum', () => {
    expect(countTicks(0)).toEqual([0, 1]);
    expect(countTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(countTicks(37)).toEqual([0, 10, 20, 30, 40]);
    expect(countTicks(1234)).toEqual([0, 500, 1000, 1500]);
  });
});
