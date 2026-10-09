import type { TestSuiteItem, TestRunItem, MilestoneItem } from '../types/operations';
import { safeSetItem } from './safeStorage';

const SUITES_KEY = 'devdoc_studio_test_suites_v1';
const RUNS_KEY = 'devdoc_studio_test_runs_v1';
const MILESTONES_KEY = 'devdoc_studio_test_milestones_v1';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Returns null (not []) when nothing has been saved yet, so callers can
 * fall back to their own sample data on a fresh browser instead of
 * mistaking "never saved" for "saved as empty". */
export function loadSuites(): TestSuiteItem[] | null {
  return read<TestSuiteItem[]>(SUITES_KEY);
}

export function saveSuites(suites: TestSuiteItem[]): void {
  safeSetItem(SUITES_KEY, JSON.stringify(suites));
}

export function loadRuns(): TestRunItem[] | null {
  return read<TestRunItem[]>(RUNS_KEY);
}

export function saveRuns(runs: TestRunItem[]): void {
  safeSetItem(RUNS_KEY, JSON.stringify(runs));
}

export function loadMilestones(): MilestoneItem[] | null {
  return read<MilestoneItem[]>(MILESTONES_KEY);
}

export function saveMilestones(milestones: MilestoneItem[]): void {
  safeSetItem(MILESTONES_KEY, JSON.stringify(milestones));
}
