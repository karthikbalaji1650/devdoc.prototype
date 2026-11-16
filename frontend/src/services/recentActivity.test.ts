import { describe, it, expect } from 'vitest';
import { describeReleaseEvent, mergeActivity, type ReleaseActivityEntry } from './recentActivity';
import { makeDoc } from '../test/fixtures';

const event = (action: string, at: string, details: Record<string, unknown> = {}, version = 'v2.4.0'): ReleaseActivityEntry => ({
  releaseId: 'rel-1', version, seq: 1, at, actorId: 'u1', actor: 'Judia Lumina', action, details,
});

describe('describeReleaseEvent', () => {
  it('says what happened, in words', () => {
    expect(describeReleaseEvent(event('signed-off', '', { build: 'v2.4.0-RC100', decision: 'Approved' }))).toEqual({
      title: 'Signed off', line: 'Judia Lumina approved v2.4.0-RC100',
    });
    expect(describeReleaseEvent(event('signed-off', '', { build: 'v2.4.0-RC100', decision: 'Rejected' })).line).toBe('Judia Lumina rejected v2.4.0-RC100');
    expect(describeReleaseEvent(event('build-registered', '', { build: 'v2.4.0-RC101' })).line).toBe('Judia Lumina registered v2.4.0-RC101');
    expect(describeReleaseEvent(event('status-changed', '', { from: 'Planned', to: 'In Progress' })).line).toBe('Judia Lumina changed the status from Planned to In Progress');
    expect(describeReleaseEvent(event('blocker-logged', '', { key: 'WH3-1300', severity: 'Critical' })).line).toBe('Judia Lumina logged blocker WH3-1300 (Critical)');
    expect(describeReleaseEvent(event('promoted-to-final', '', { build: 'v2.4.0-RC100' })).line).toBe('Judia Lumina promoted v2.4.0-RC100 to Final');
  });

  it('still reads for an action it does not know', () => {
    expect(describeReleaseEvent(event('something-new', ''))).toEqual({ title: 'something-new', line: 'Judia Lumina: something-new' });
  });
});

describe('mergeActivity', () => {
  it('mixes document updates and release events, newest first, up to the limit', () => {
    const docs = [
      { doc: makeDoc('d1', { title: 'Design', docNumber: 'DD-7', status: 'DRAFT' }), updatedAt: '2026-11-15T10:00:00.000Z' },
      { doc: makeDoc('d2', { title: 'Plan', status: 'IN_REVIEW' }), updatedAt: '2026-11-15T08:00:00.000Z' },
    ];
    const releases = [
      event('signed-off', '2026-11-15T11:00:00.000Z', { build: 'v2.4.0-RC100', decision: 'Approved' }),
      event('release-created', '2026-11-15T09:00:00.000Z'),
    ];
    const items = mergeActivity(docs, releases, 3);
    expect(items.map((i) => (i.kind === 'document' ? i.title : `${i.version} ${i.title}`))).toEqual([
      'v2.4.0 Signed off', 'Design', 'v2.4.0 Release created',
    ]);
    expect(items[1]).toMatchObject({ kind: 'document', docId: 'd1', docNumber: 'DD-7', status: 'DRAFT' });
  });

  it('leaves out documents with no known save time', () => {
    const items = mergeActivity([{ doc: makeDoc('d1'), updatedAt: new Date(0).toISOString() }, { doc: makeDoc('d2'), updatedAt: undefined }], [], 5);
    expect(items).toEqual([]);
  });
});
