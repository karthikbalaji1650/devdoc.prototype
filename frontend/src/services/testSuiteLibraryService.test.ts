import { describe, it, expect } from 'vitest';
import { loadLibrary, saveToLibrary, removeFromLibrary, searchLibrary, instantiateSuiteFromLibrary } from './testSuiteLibraryService';
import type { TestSuiteItem } from '../types/operations';

function makeSuite(overrides: Partial<TestSuiteItem> = {}): TestSuiteItem {
  return {
    id: 's1', title: 'RTC Clock Suite', description: 'Covers RTC drift', module: 'Firmware',
    createdAt: '2026-01-01',
    sections: [{ id: 'sec-1', suiteId: 's1', title: 'Manual Tests', order: 0 }],
    testCases: [{
      id: 'tc-1', suiteId: 's1', customId: 'TC-001', title: 'Drift check', preconditions: '', steps: [],
      expectedResult: 'OK', priority: 'P2', type: 'Manual', createdAt: '2026-01-01',
    }],
    ...overrides,
  };
}

describe('testSuiteLibraryService', () => {
  it('starts empty', () => {
    expect(loadLibrary()).toEqual([]);
  });

  it('saves a suite and finds it by title, description or module', () => {
    saveToLibrary(makeSuite());
    expect(searchLibrary('RTC Clock')).toHaveLength(1);
    expect(searchLibrary('drift')).toHaveLength(1);
    expect(searchLibrary('firmware')).toHaveLength(1);
    expect(searchLibrary('no such thing')).toHaveLength(0);
  });

  it('saving the same title again (any case) updates instead of duplicating', () => {
    saveToLibrary(makeSuite({ description: 'Original' }));
    saveToLibrary(makeSuite({ title: 'rtc clock suite', description: 'Updated' }));
    const results = searchLibrary('clock');
    expect(results).toHaveLength(1);
    expect(results[0].description).toBe('Updated');
  });

  it('removes an entry by title', () => {
    saveToLibrary(makeSuite());
    removeFromLibrary('RTC Clock Suite');
    expect(loadLibrary()).toEqual([]);
  });

  it('instantiates a fresh, independent copy with no id collisions against the template', () => {
    const template = makeSuite();
    const instance = instantiateSuiteFromLibrary(template);

    expect(instance.id).not.toBe(template.id);
    expect(instance.sections![0].id).not.toBe(template.sections![0].id);
    expect(instance.testCases![0].id).not.toBe(template.testCases![0].id);

    // Every section and test case points back at the NEW suite id, consistently.
    expect(instance.sections![0].suiteId).toBe(instance.id);
    expect(instance.testCases![0].suiteId).toBe(instance.id);

    // Content is preserved.
    expect(instance.testCases![0].customId).toBe('TC-001');
    expect(instance.title).toBe('RTC Clock Suite');

    // The template itself is untouched.
    expect(template.id).toBe('s1');
  });
});
