import { describe, it, expect } from 'vitest';
import type { TestCaseItem, TestSection } from '../types/operations';
import { isSectionEmpty, nextSectionOrder, sectionOfCase, sectionTree } from './testSections';

const sec = (id: string, order: number, parentId?: string, title = id): TestSection => ({ id, suiteId: 's', title, order, parentId });
const tc = (id: string, type: 'Manual' | 'Automated', sectionId?: string) => ({ id, type, sectionId }) as TestCaseItem;

describe('sectionTree', () => {
  it('nests sub-sections under their parent, siblings by order', () => {
    const tree = sectionTree([sec('b', 1), sec('a', 0), sec('a2', 1, 'a'), sec('a1', 0, 'a'), sec('a1x', 0, 'a1')]);
    expect(tree.map((n) => `${'-'.repeat(n.depth)}${n.section.id}`)).toEqual(['a', '-a1', '--a1x', '-a2', 'b']);
  });

  it('keeps sections with a missing parent or in a loop, at the top level', () => {
    const tree = sectionTree([sec('orphan', 0, 'gone'), sec('x', 1, 'y'), sec('y', 2, 'x')]);
    expect(tree.map((n) => n.section.id).sort()).toEqual(['orphan', 'x', 'y']);
    expect(tree.find((n) => n.section.id === 'orphan')!.depth).toBe(0);
  });
});

describe('sectionOfCase', () => {
  const sections = [sec('m', 0, undefined, 'Manual Tests'), sec('auto', 1, undefined, 'Automated Tests (Robot)'), sec('sub', 0, 'auto')];

  it('uses the case\'s own section', () => {
    expect(sectionOfCase(tc('1', 'Manual', 'sub'), sections)).toBe('sub');
  });

  it('places older cases by type, as the screen always did', () => {
    expect(sectionOfCase(tc('1', 'Manual'), sections)).toBe('m');
    expect(sectionOfCase(tc('2', 'Automated'), sections)).toBe('auto');
    expect(sectionOfCase(tc('3', 'Automated', 'deleted'), sections)).toBe('auto');
  });

  it('is null without sections', () => {
    expect(sectionOfCase(tc('1', 'Manual'), [])).toBeNull();
  });
});

describe('nextSectionOrder / isSectionEmpty', () => {
  const sections = [sec('a', 0), sec('b', 3), sec('a1', 0, 'a')];
  it('places a new section last among its siblings', () => {
    expect(nextSectionOrder(sections)).toBe(4);
    expect(nextSectionOrder(sections, 'a')).toBe(1);
    expect(nextSectionOrder(sections, 'b')).toBe(0);
  });
  it('is empty only with no sub-sections and no cases', () => {
    expect(isSectionEmpty('a', sections, [])).toBe(false);
    expect(isSectionEmpty('a1', sections, [tc('1', 'Manual', 'a1')])).toBe(false);
    expect(isSectionEmpty('b', sections, [tc('1', 'Manual', 'a1')])).toBe(true);
  });
});
