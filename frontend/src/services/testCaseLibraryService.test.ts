import { describe, it, expect } from 'vitest';
import { loadLibrary, saveToLibrary, removeFromLibrary, searchLibrary } from './testCaseLibraryService';
import type { TestCaseItem } from '../types/operations';

function makeCase(overrides: Partial<TestCaseItem> = {}): TestCaseItem {
  return {
    id: 'tc-1', suiteId: 's1', customId: 'TC-001', title: 'Verify RTC drift',
    preconditions: 'Board powered on', steps: [{ step: 1, action: 'Run test', expected: 'Passes' }],
    expectedResult: 'No drift', priority: 'P2', type: 'Manual', createdAt: '2026-01-01',
    ...overrides,
  };
}

describe('testCaseLibraryService', () => {
  it('starts empty', () => {
    expect(loadLibrary()).toEqual([]);
  });

  it('saves a test case and finds it by id, title or precondition text', () => {
    saveToLibrary(makeCase());
    expect(searchLibrary('TC-001')).toHaveLength(1);
    expect(searchLibrary('rtc drift')).toHaveLength(1);
    expect(searchLibrary('powered on')).toHaveLength(1);
    expect(searchLibrary('no such thing')).toHaveLength(0);
  });

  it('detaches a saved copy from its originating suite and run state', () => {
    saveToLibrary(makeCase({ suiteId: 's1', isDeleted: true, status: 'Failed' }));
    const [entry] = loadLibrary();
    expect(entry.suiteId).toBe('');
    expect(entry.isDeleted).toBe(false);
    expect(entry.status).toBeUndefined();
  });

  it('saving the same customId again updates the entry instead of duplicating it', () => {
    saveToLibrary(makeCase({ title: 'Original title' }));
    saveToLibrary(makeCase({ title: 'Updated title' }));
    const results = searchLibrary('TC-001');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Updated title');
  });

  it('removes an entry by customId', () => {
    saveToLibrary(makeCase());
    removeFromLibrary('TC-001');
    expect(loadLibrary()).toEqual([]);
  });

  it('returns everything when the query is empty', () => {
    saveToLibrary(makeCase({ customId: 'TC-001' }));
    saveToLibrary(makeCase({ id: 'tc-2', customId: 'TC-002' }));
    expect(searchLibrary('')).toHaveLength(2);
  });
});
