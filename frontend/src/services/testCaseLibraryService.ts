import type { TestCaseItem } from '../types/operations';
import { safeSetItem } from './safeStorage';

const LIBRARY_KEY = 'devdoc_studio_test_case_library_v1';

function load(): TestCaseItem[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persist(entries: TestCaseItem[]): void {
  safeSetItem(LIBRARY_KEY, JSON.stringify(entries));
}

export function loadLibrary(): TestCaseItem[] {
  return load();
}

/** Saves a copy of a test case into the reusable library, keyed by its
 * customId (e.g. "TC-RTC-001") so saving the same one again updates the
 * existing entry instead of piling up duplicates. The copy is detached
 * from any suite/run state (isDeleted, status) so it reimports clean. */
export function saveToLibrary(testCase: TestCaseItem): void {
  const library = load();
  const entry: TestCaseItem = {
    ...testCase,
    id: `lib-${testCase.customId}`,
    suiteId: '',
    isDeleted: false,
    status: undefined,
  };
  const existingIndex = library.findIndex((tc) => tc.customId === testCase.customId);
  if (existingIndex >= 0) {
    library[existingIndex] = entry;
  } else {
    library.push(entry);
  }
  persist(library);
}

export function removeFromLibrary(customId: string): void {
  persist(load().filter((tc) => tc.customId !== customId));
}

export function searchLibrary(query: string): TestCaseItem[] {
  const q = query.trim().toLowerCase();
  const library = load();
  if (!q) return library;
  return library.filter((tc) =>
    tc.customId.toLowerCase().includes(q) ||
    tc.title.toLowerCase().includes(q) ||
    (tc.preconditions || '').toLowerCase().includes(q));
}
