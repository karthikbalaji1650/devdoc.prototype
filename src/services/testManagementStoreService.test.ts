import { describe, it, expect } from 'vitest';
import { loadSuites, saveSuites, loadRuns, saveRuns, loadMilestones, saveMilestones } from './testManagementStoreService';
import type { TestSuiteItem, TestRunItem, MilestoneItem } from '../types/operations';

const suite: TestSuiteItem = {
  id: 's1', title: 'Suite One', description: '', module: 'Custom', createdAt: '2026-01-01', testCases: [],
};
const run: TestRunItem = {
  id: 'r1', name: 'Run One', suiteId: 's1', environment: 'Staging', status: 'In Progress',
  passedCount: 0, failedCount: 0, blockedCount: 0, executedAt: '2026-01-01',
};
const milestone: MilestoneItem = {
  id: 'm1', name: 'Milestone One', status: 'open', passedCount: 0, failedCount: 0, blockedCount: 0, untestedCount: 0, totalCount: 0, testRunIds: [],
};

describe('testManagementStoreService', () => {
  it('returns null for each store when nothing has been saved yet', () => {
    expect(loadSuites()).toBeNull();
    expect(loadRuns()).toBeNull();
    expect(loadMilestones()).toBeNull();
  });

  it('round-trips suites, runs and milestones independently', () => {
    saveSuites([suite]);
    saveRuns([run]);
    saveMilestones([milestone]);

    expect(loadSuites()).toEqual([suite]);
    expect(loadRuns()).toEqual([run]);
    expect(loadMilestones()).toEqual([milestone]);
  });

  it('survives a reload (the point of persisting at all)', () => {
    saveSuites([suite]);
    const reloaded = loadSuites();
    expect(reloaded).toEqual([suite]);
  });
});
