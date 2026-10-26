import { describe, it, expect } from 'vitest';
import { buildTrackedDocuments, countTracked, filterTracked, findDocumentByNumber } from './documentStats';
import { makeDoc } from '../test/fixtures';
import type { ReviewerLogItem } from '../types/operations';

const entry = (docNumber: string, reviewStatus: ReviewerLogItem['reviewStatus'], docTitle = docNumber): ReviewerLogItem => ({
  id: `${docNumber}-${reviewStatus}-${Math.random()}`, docId: '', docTitle, docNumber,
  reviewerName: 'R', reviewerRole: 'Lead', reviewStatus, reviewDate: '2026-01-01', comments: '',
});

// Mirrors the demo data: three approvals for one document, one review row for another.
const log = [entry('WH3-1205', 'APPROVED'), entry('WH3-1205', 'APPROVED'), entry('WH3-1205', 'APPROVED'), entry('ADR-2026-042', 'IN_REVIEW')];

describe('buildTrackedDocuments', () => {
  it('counts each document once, however many reviewers signed off', () => {
    expect(countTracked(buildTrackedDocuments([], log, true))).toEqual({ total: 2, approved: 1, inReview: 1 });
  });

  it('lets sign-offs decide the status of a stored document they track', () => {
    const stored = [makeDoc('a', { docNumber: 'ADR-2026-042', status: 'DRAFT' })];
    const [doc] = buildTrackedDocuments(stored, [entry('ADR-2026-042', 'IN_REVIEW')], true);
    expect(doc.status).toBe('IN_REVIEW');
    expect(doc.stored?.metadata.id).toBe('a');
  });

  it('uses the document status when the log does not track it, and merges without duplicates', () => {
    const stored = [makeDoc('a', { docNumber: 'WH3-1205', status: 'APPROVED' }), makeDoc('b', { docNumber: 'NEW-1', status: 'IN_REVIEW' })];
    const tracked = buildTrackedDocuments(stored, log, true);
    expect(tracked).toHaveLength(3);
    expect(countTracked(tracked)).toEqual({ total: 3, approved: 1, inReview: 2 });
  });

  it('is not approved until every reviewer has approved', () => {
    const [d] = buildTrackedDocuments([], [entry('X', 'APPROVED'), entry('X', 'IN_REVIEW')], true);
    expect(d.status).toBe('IN_REVIEW');
  });

  it('hides log-only approved documents from non-admins', () => {
    expect(countTracked(buildTrackedDocuments([], log, false))).toEqual({ total: 1, approved: 0, inReview: 1 });
  });
});

describe('filterTracked', () => {
  it('matches the count for the same status, so a card and its list agree', () => {
    const tracked = buildTrackedDocuments([], log, true);
    expect(filterTracked(tracked, 'IN_REVIEW')).toHaveLength(countTracked(tracked).inReview);
    expect(filterTracked(tracked, null)).toHaveLength(2);
  });
});

describe('findDocumentByNumber', () => {
  const docs = [makeDoc('a', { docNumber: 'WH3-1205' })];
  it('finds a document ignoring case and spaces', () => {
    expect(findDocumentByNumber(docs, ' wh3-1205 ')?.metadata.id).toBe('a');
  });
  it('returns undefined for unknown or blank numbers', () => {
    expect(findDocumentByNumber(docs, 'nope')).toBeUndefined();
    expect(findDocumentByNumber(docs, '')).toBeUndefined();
  });
});
