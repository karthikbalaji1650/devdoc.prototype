import { describe, it, expect, vi, afterEach } from 'vitest';
import { safeSetItem, getStorageUsage, STORAGE_ERROR_EVENT, APPROX_QUOTA_CHARS, type StorageErrorDetail } from './safeStorage';

function failWith(err: unknown) {
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw err; });
}
const quotaError = () => new DOMException('full', 'QuotaExceededError');

function captureEvents(): StorageErrorDetail[] {
  const seen: StorageErrorDetail[] = [];
  window.addEventListener(STORAGE_ERROR_EVENT, (e) => seen.push((e as CustomEvent<StorageErrorDetail>).detail), { once: false });
  return seen;
}

afterEach(() => vi.restoreAllMocks());

describe('safeSetItem', () => {
  it('stores the value and returns true', () => {
    expect(safeSetItem('k', 'v')).toBe(true);
    expect(localStorage.getItem('k')).toBe('v');
  });

  it('returns false and reports a quota error instead of throwing', () => {
    failWith(quotaError());
    const seen = captureEvents();
    expect(safeSetItem('k', 'v')).toBe(false);
    expect(seen.at(-1)).toEqual({ key: 'k', reason: 'quota' });
  });

  it('reports other failures as unavailable', () => {
    failWith(new Error('blocked'));
    const seen = captureEvents();
    expect(safeSetItem('k2', 'v')).toBe(false);
    expect(seen.at(-1)).toEqual({ key: 'k2', reason: 'unavailable' });
  });

  it('stays silent when notify is false', () => {
    failWith(quotaError());
    const seen = captureEvents();
    const before = seen.length;
    expect(safeSetItem('quiet', 'v', { notify: false })).toBe(false);
    expect(seen.length).toBe(before);
  });
});

describe('getStorageUsage', () => {
  it('counts keys and values and reports a fraction of the quota', () => {
    localStorage.setItem('abc', '12345');
    const u = getStorageUsage();
    expect(u.usedChars).toBe(8);
    expect(u.quotaChars).toBe(APPROX_QUOTA_CHARS);
    expect(u.fraction).toBeCloseTo(8 / APPROX_QUOTA_CHARS);
  });
});
