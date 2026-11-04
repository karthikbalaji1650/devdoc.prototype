import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { TestCaseItem } from '../types/operations';
import { installFakeCollectionsApi } from '../test/fakeCollectionsApi';

function makeCase(overrides: Partial<TestCaseItem> = {}): TestCaseItem {
  return {
    id: 'tc-1', suiteId: 's1', customId: 'TC-001', title: 'Verify RTC drift',
    preconditions: 'Board powered on', steps: [{ step: 1, action: 'Run test', expected: 'Passes' }],
    expectedResult: 'No drift', priority: 'P2', type: 'Manual', createdAt: '2026-01-01',
    ...overrides,
  };
}

// A fresh module (and so a fresh in-memory collection) per test.
let lib: typeof import('./testCaseLibraryService');
let api: ReturnType<typeof installFakeCollectionsApi>;
beforeEach(async () => {
  api = installFakeCollectionsApi();
  vi.resetModules();
  lib = await import('./testCaseLibraryService');
  await lib.testCaseLibrary.load();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('testCaseLibraryService (shared on the server)', () => {
  it('starts empty', () => {
    expect(lib.loadLibrary()).toEqual([]);
  });

  it('saves a test case to the server and finds it by id, title or precondition text', async () => {
    await lib.saveToLibrary(makeCase());
    expect(api.data.get('test-case-library')?.has('lib-TC-001')).toBe(true);
    expect(lib.searchLibrary('TC-001')).toHaveLength(1);
    expect(lib.searchLibrary('rtc drift')).toHaveLength(1);
    expect(lib.searchLibrary('powered on')).toHaveLength(1);
    expect(lib.searchLibrary('no such thing')).toHaveLength(0);
  });

  it('detaches a saved copy from its originating suite, section and run state', async () => {
    await lib.saveToLibrary(makeCase({ suiteId: 's1', sectionId: 'sec', isDeleted: true, status: 'Failed' }));
    const [entry] = lib.loadLibrary();
    expect(entry.suiteId).toBe('');
    expect(entry.sectionId).toBeUndefined();
    expect(entry.isDeleted).toBe(false);
    expect(entry.status).toBeUndefined();
  });

  it('saving the same customId again updates the entry instead of duplicating it', async () => {
    await lib.saveToLibrary(makeCase({ title: 'Original title' }));
    await lib.saveToLibrary(makeCase({ title: 'Updated title' }));
    const results = lib.searchLibrary('TC-001');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Updated title');
    expect(api.data.get('test-case-library')?.size).toBe(1);
  });

  it('removes an entry by customId, on the server too', async () => {
    await lib.saveToLibrary(makeCase());
    await lib.removeFromLibrary('TC-001');
    expect(lib.loadLibrary()).toEqual([]);
    expect(api.data.get('test-case-library')?.size).toBe(0);
  });

  it('returns everything when the query is empty', async () => {
    await lib.saveToLibrary(makeCase({ customId: 'TC-001' }));
    await lib.saveToLibrary(makeCase({ id: 'tc-2', customId: 'TC-002' }));
    expect(lib.searchLibrary('')).toHaveLength(2);
  });

  it('writes nothing to browser storage', async () => {
    await lib.saveToLibrary(makeCase());
    expect(localStorage.length).toBe(0);
  });
});
