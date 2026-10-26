import type { TestSuiteItem } from '../types/operations';
import { safeSetItem } from './safeStorage';

const LIBRARY_KEY = 'devdoc_studio_test_suite_library_v1';

function load(): TestSuiteItem[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persist(entries: TestSuiteItem[]): void {
  safeSetItem(LIBRARY_KEY, JSON.stringify(entries));
}

export function loadLibrary(): TestSuiteItem[] {
  return load();
}

/** Suites have no human-assigned id like a test case's customId, so
 * entries are keyed by title (case-insensitive) - saving a suite again
 * under the same title updates the template instead of duplicating it. */
export function saveToLibrary(suite: TestSuiteItem): void {
  const library = load();
  const key = suite.title.trim().toLowerCase();
  const entry: TestSuiteItem = { ...suite, id: `lib-suite-${key.replace(/\s+/g, '-')}` };
  const existingIndex = library.findIndex((s) => s.title.trim().toLowerCase() === key);
  if (existingIndex >= 0) {
    library[existingIndex] = entry;
  } else {
    library.push(entry);
  }
  persist(library);
}

export function removeFromLibrary(title: string): void {
  const key = title.trim().toLowerCase();
  persist(load().filter((s) => s.title.trim().toLowerCase() !== key));
}

export function searchLibrary(query: string): TestSuiteItem[] {
  const q = query.trim().toLowerCase();
  const library = load();
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
