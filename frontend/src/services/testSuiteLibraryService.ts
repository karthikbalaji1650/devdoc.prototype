// The reusable test suite library - shared by every user on the server
// (see sharedCollection.ts), not kept in this browser.
import type { TestSuiteItem } from '../types/operations';
import { normalizePriority } from './testCasePriority';
import { createSharedCollection } from './sharedCollection';

export const testSuiteLibrary = createSharedCollection<TestSuiteItem>('test-suite-library');

const keyOf = (title: string) => title.trim().toLowerCase();
const idOf = (title: string) => `lib-suite-${keyOf(title).replace(/\s+/g, '-')}`;

export function loadLibrary(): TestSuiteItem[] {
  return testSuiteLibrary.items();
}

/** Suites have no human-assigned id like a test case's customId, so
 * entries are keyed by title (case-insensitive) - saving a suite again
 * under the same title updates the template instead of duplicating it.
 * The template is not tied to any project. */
export function saveToLibrary(suite: TestSuiteItem): Promise<void> {
  const { projectId: _p, createdBy: _c, updatedAt: _u, ...rest } = suite as TestSuiteItem & { createdBy?: string; updatedAt?: string };
  return testSuiteLibrary.put({ ...rest, id: idOf(suite.title) });
}

export function removeFromLibrary(title: string): Promise<void> {
  return testSuiteLibrary.remove(idOf(title));
}

export function searchLibrary(query: string): TestSuiteItem[] {
  const q = query.trim().toLowerCase();
  const library = loadLibrary();
  if (!q) return library;
  return library.filter((s) =>
    s.title.toLowerCase().includes(q) ||
    (s.description || '').toLowerCase().includes(q) ||
    (s.module || '').toLowerCase().includes(q));
}

/** Instantiates a fresh, independent suite from a library template: new
 * suite id, new section ids, new test case ids - all remapped so it
 * never collides with the template or any existing suite. */
export function instantiateSuiteFromLibrary(template: TestSuiteItem): TestSuiteItem {
  const now = new Date().toISOString();
  const newSuiteId = `suite-${Date.now()}`;
  const sectionIdMap = new Map<string, string>();
  const sections = (template.sections || []).map((sec, i) => {
    const newId = `sec-${newSuiteId}-${i}`;
    sectionIdMap.set(sec.id, newId);
    return { ...sec, id: newId, suiteId: newSuiteId };
  });
  const testCases = (template.testCases || []).map((tc, i) => ({
    ...tc,
    priority: normalizePriority(tc.priority),
    id: `tc-${Date.now()}-${i}`,
    suiteId: newSuiteId,
    createdAt: now,
    isDeleted: false,
  }));
  return {
    ...template,
    id: newSuiteId,
    createdAt: now,
    sections,
    testCases,
  };
}
