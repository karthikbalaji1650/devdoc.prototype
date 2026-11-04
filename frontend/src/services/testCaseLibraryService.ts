// The reusable test case library - shared by every user on the server
// (see sharedCollection.ts), not kept in this browser.
import type { TestCaseItem } from '../types/operations';
import { normalizePriority } from './testCasePriority';
import { createSharedCollection } from './sharedCollection';

export const testCaseLibrary = createSharedCollection<TestCaseItem>('test-case-library');

/** Entries saved before the priority rename show the new names. */
export function loadLibrary(): TestCaseItem[] {
  return testCaseLibrary.items().map((tc) => ({ ...tc, priority: normalizePriority(tc.priority) }));
}

/** Saves a copy of a test case into the reusable library, keyed by its
 * customId (e.g. "TC-RTC-001") so saving the same one again updates the
 * existing entry instead of piling up duplicates. The copy is detached
 * from any suite/run state (isDeleted, status) so it reimports clean. */
export function saveToLibrary(testCase: TestCaseItem): Promise<void> {
  const { createdBy: _c, updatedAt: _u, ...rest } = testCase as TestCaseItem & { createdBy?: string; updatedAt?: string };
  return testCaseLibrary.put({
    ...rest,
    id: `lib-${testCase.customId}`,
    suiteId: '',
    sectionId: undefined,
    isDeleted: false,
    status: undefined,
  });
}

export function removeFromLibrary(customId: string): Promise<void> {
  return testCaseLibrary.remove(`lib-${customId}`);
}

export function searchLibrary(query: string): TestCaseItem[] {
  const q = query.trim().toLowerCase();
  const library = loadLibrary();
  if (!q) return library;
  return library.filter((tc) =>
    tc.customId.toLowerCase().includes(q) ||
    tc.title.toLowerCase().includes(q) ||
    (tc.preconditions || '').toLowerCase().includes(q));
}
