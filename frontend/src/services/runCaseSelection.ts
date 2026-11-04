// Which test cases a new test run includes (DDS-SRS-016): the whole suite,
// cases picked by hand (or whole sections / sub-sections), or the cases
// matching a filter. Cases in the bin are never included. The selection is
// fixed when the run is created; later cases are not added.
import type { TestCaseItem, TestSuiteItem } from '../types/operations';
import { sectionOfCase } from './testSections';

export type CaseMode = 'all' | 'specific' | 'dynamic';

export interface CaseFilter {
  /** Sections to include; each includes its sub-sections. Empty = any. */
  sectionIds: string[];
  priorities: TestCaseItem['priority'][];
  types: TestCaseItem['type'][];
}

/** A section and every section below it. */
export function withSubsections(suite: TestSuiteItem, sectionIds: string[]): Set<string> {
  const sections = suite.sections ?? [];
  const out = new Set(sectionIds);
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of sections) {
      if (s.parentId && out.has(s.parentId) && !out.has(s.id)) { out.add(s.id); grew = true; }
    }
  }
  return out;
}

export function selectRunCases(
  suite: TestSuiteItem | undefined,
  mode: CaseMode,
  selectedIds: ReadonlySet<string> = new Set(),
  filter: CaseFilter = { sectionIds: [], priorities: [], types: [] },
): TestCaseItem[] {
  const cases = (suite?.testCases ?? []).filter((tc) => !tc.isDeleted);
  if (!suite || mode === 'all') return cases;
  if (mode === 'specific') return cases.filter((tc) => selectedIds.has(tc.id));
  const sections = filter.sectionIds.length ? withSubsections(suite, filter.sectionIds) : null;
  return cases.filter((tc) =>
    (!sections || sections.has(sectionOfCase(tc, suite.sections) ?? '')) &&
    (!filter.priorities.length || filter.priorities.includes(tc.priority)) &&
    (!filter.types.length || filter.types.includes(tc.type)));
}
