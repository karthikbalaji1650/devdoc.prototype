import { describe, it, expect } from 'vitest';
import { countByStatus, filterByStatus, findDocumentByNumber } from './documentStats';
import { makeDoc } from '../test/fixtures';

const docs = [
  makeDoc('a', { status: 'APPROVED', docNumber: 'WH3-1205' }),
  makeDoc('b', { status: 'APPROVED', docNumber: 'X-2' }),
  makeDoc('c', { status: 'IN_REVIEW', docNumber: 'ADR-042' }),
  makeDoc('d', { status: 'DRAFT', docNumber: '' }),
];

describe('countByStatus', () => {
  it('counts totals, approved and in review', () => {
    expect(countByStatus(docs)).toEqual({ total: 4, approved: 2, inReview: 1 });
  });
  it('handles no documents', () => {
    expect(countByStatus([])).toEqual({ total: 0, approved: 0, inReview: 0 });
  });
});

describe('filterByStatus', () => {
  it('returns the matching documents, and everything for null', () => {
    expect(filterByStatus(docs, 'APPROVED').map((d) => d.metadata.id)).toEqual(['a', 'b']);
    expect(filterByStatus(docs, null)).toHaveLength(4);
  });
  it('matches what countByStatus reports, so a card and its list always agree', () => {
    expect(filterByStatus(docs, 'IN_REVIEW')).toHaveLength(countByStatus(docs).inReview);
  });
});

describe('findDocumentByNumber', () => {
  it('finds a document ignoring case and spaces', () => {
    expect(findDocumentByNumber(docs, ' wh3-1205 ')?.metadata.id).toBe('a');
  });
  it('returns undefined for unknown or blank numbers', () => {
    expect(findDocumentByNumber(docs, 'nope')).toBeUndefined();
    expect(findDocumentByNumber(docs, '')).toBeUndefined();
  });
});
