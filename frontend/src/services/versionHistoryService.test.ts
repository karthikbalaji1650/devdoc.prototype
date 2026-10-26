import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordSnapshot, snapshotIfDue, listSnapshots, deleteHistory, _resetSnapshotThrottle,
  MAX_SNAPSHOTS, SNAPSHOT_INTERVAL_MS,
} from './versionHistoryService';
import { makeDoc } from '../test/fixtures';

beforeEach(() => _resetSnapshotThrottle());

describe('recordSnapshot', () => {
  it('stores newest first and skips an identical copy', () => {
    expect(recordSnapshot(makeDoc('a', { title: 'v1' }), 'x', 1000)).toBe(true);
    expect(recordSnapshot(makeDoc('a', { title: 'v1' }), 'x', 2000)).toBe(false);
    expect(recordSnapshot(makeDoc('a', { title: 'v2' }), 'x', 3000)).toBe(true);
    expect(listSnapshots('a').map((s) => s.doc.metadata.title)).toEqual(['v2', 'v1']);
  });

  it('keeps only the newest MAX_SNAPSHOTS', () => {
    for (let i = 0; i < MAX_SNAPSHOTS + 4; i++) recordSnapshot(makeDoc('a', { title: `v${i}` }), 'x', i);
    const list = listSnapshots('a');
    expect(list).toHaveLength(MAX_SNAPSHOTS);
    expect(list[0].doc.metadata.title).toBe(`v${MAX_SNAPSHOTS + 3}`);
  });

  it('keeps documents separate', () => {
    recordSnapshot(makeDoc('a', { title: 'A' }));
    recordSnapshot(makeDoc('b', { title: 'B' }));
    expect(listSnapshots('a')).toHaveLength(1);
    expect(listSnapshots('b')[0].doc.metadata.title).toBe('B');
  });
});

describe('snapshotIfDue', () => {
  it('snapshots the previous copy once per interval', () => {
    const prev = makeDoc('a', { title: 'old' });
    expect(snapshotIfDue(() => prev, 'a', SNAPSHOT_INTERVAL_MS)).toBe(true);
    expect(snapshotIfDue(() => makeDoc('a', { title: 'newer' }), 'a', SNAPSHOT_INTERVAL_MS + 1000)).toBe(false);
    expect(snapshotIfDue(() => makeDoc('a', { title: 'newer' }), 'a', SNAPSHOT_INTERVAL_MS * 2 + 1)).toBe(true);
    expect(listSnapshots('a').map((s) => s.doc.metadata.title)).toEqual(['newer', 'old']);
  });

  it('does not read the stored copy while throttled', () => {
    snapshotIfDue(() => makeDoc('a'), 'a', SNAPSHOT_INTERVAL_MS);
    let read = false;
    snapshotIfDue(() => { read = true; return null; }, 'a', SNAPSHOT_INTERVAL_MS + 5);
    expect(read).toBe(false);
  });

  it('does nothing when there is no previous copy (first save of a new doc)', () => {
    expect(snapshotIfDue(() => null, 'new', SNAPSHOT_INTERVAL_MS)).toBe(false);
    expect(listSnapshots('new')).toEqual([]);
  });

  it('respects history that already exists after a reload', () => {
    recordSnapshot(makeDoc('a', { title: 'saved' }), 'x', 10_000_000);
    _resetSnapshotThrottle(); // simulates a fresh page load
    expect(snapshotIfDue(() => makeDoc('a', { title: 'other' }), 'a', 10_000_000 + 1000)).toBe(false);
  });
});

describe('deleteHistory', () => {
  it('removes one document\'s snapshots only', () => {
    recordSnapshot(makeDoc('a')); recordSnapshot(makeDoc('b'));
    deleteHistory('a');
    expect(listSnapshots('a')).toEqual([]);
    expect(listSnapshots('b')).toHaveLength(1);
  });
});
