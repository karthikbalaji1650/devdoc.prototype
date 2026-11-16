import { describe, it, expect } from 'vitest';
import { countByStatus, filterByStatus } from './documentStats';
import { makeDoc } from '../test/fixtures';
import type { DocStatus } from '../types/document';

const doc = (id: string, status: DocStatus) => {
  const d = makeDoc(id);
  d.metadata.status = status;
  return d;
};
const docs = [doc('a', 'APPROVED'), doc('b', 'IN_REVIEW'), doc('c', 'DRAFT'), doc('d', 'APPROVED'), doc('e', 'PUBLISHED')];

// DDS-SRS-005: a document's own status decides where it counts.
describe('countByStatus', () => {
  it('counts documents by their own status, listing every status', () => {
    expect(countByStatus(docs)).toEqual({ total: 5, byStatus: { DRAFT: 1, IN_REVIEW: 1, APPROVED: 2, PUBLISHED: 1 } });
    expect(countByStatus([])).toEqual({ total: 0, byStatus: { DRAFT: 0, IN_REVIEW: 0, APPROVED: 0, PUBLISHED: 0 } });
  });
});

describe('filterByStatus', () => {
  it('keeps only documents with that status, or all of them without one', () => {
    expect(filterByStatus(docs, 'APPROVED').map((d) => d.metadata.id)).toEqual(['a', 'd']);
    expect(filterByStatus(docs, 'IN_REVIEW').map((d) => d.metadata.id)).toEqual(['b']);
    expect(filterByStatus(docs, null)).toHaveLength(5);
  });
});
