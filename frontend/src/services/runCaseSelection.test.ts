import { describe, it, expect } from 'vitest';
import type { TestCaseItem, TestSuiteItem } from '../types/operations';
import { selectRunCases, withSubsections } from './runCaseSelection';

const tc = (id: string, sectionId: string, extra: Partial<TestCaseItem> = {}) =>
  ({ id, sectionId, customId: id, title: id, type: 'Manual', priority: 'Medium', ...extra }) as TestCaseItem;
const suite = {
  id: 's', title: 'S',
  sections: [
    { id: 'a', suiteId: 's', title: 'A', order: 0 },
    { id: 'a1', suiteId: 's', title: 'A1', order: 0, parentId: 'a' },
    { id: 'a1x', suiteId: 's', title: 'A1x', order: 0, parentId: 'a1' },
    { id: 'b', suiteId: 's', title: 'B', order: 1 },
  ],
  testCases: [
    tc('c1', 'a', { priority: 'Critical' }), tc('c2', 'a1x', { type: 'Automated' }),
    tc('c3', 'b', { priority: 'Critical', type: 'Automated' }), tc('gone', 'a', { isDeleted: true }),
  ],
} as unknown as TestSuiteItem;
const ids = (cases: TestCaseItem[]) => cases.map((c) => c.id);

describe('selectRunCases (DDS-SRS-016)', () => {
  it('whole suite: every case except those in the bin', () => {
    expect(ids(selectRunCases(suite, 'all'))).toEqual(['c1', 'c2', 'c3']);
  });

  it('specific: only the picked cases, never one in the bin', () => {
    expect(ids(selectRunCases(suite, 'specific', new Set(['c3', 'gone'])))).toEqual(['c3']);
  });

  it('dynamic: a section includes its sub-sections; filters combine', () => {
    expect(ids(selectRunCases(suite, 'dynamic', undefined, { sectionIds: ['a'], priorities: [], types: [] }))).toEqual(['c1', 'c2']);
    expect(ids(selectRunCases(suite, 'dynamic', undefined, { sectionIds: [], priorities: ['Critical'], types: ['Automated'] }))).toEqual(['c3']);
    expect(ids(selectRunCases(suite, 'dynamic', undefined, { sectionIds: ['a1'], priorities: ['Critical'], types: [] }))).toEqual([]);
  });

  it('finds every sub-section of a section', () => {
    expect([...withSubsections(suite, ['a'])].sort()).toEqual(['a', 'a1', 'a1x']);
  });
});
