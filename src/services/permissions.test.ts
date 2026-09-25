import { describe, it, expect } from 'vitest';
import { makeDoc, makeUser } from '../test/fixtures';
import {
  isAdmin, canEditDocument, canDeleteDocument, canAccessDataManagement, visibleDocumentsFor,
} from './permissions';

const admin = makeUser({ name: 'Root Admin', role: 'admin' });
const author = makeUser({ name: 'Ada Author', role: 'firmware-lead' });
const other = makeUser({ name: 'Bob Other', role: 'release-manager' });

describe('isAdmin', () => {
  it('is true only for the admin role', () => {
    expect(isAdmin(admin)).toBe(true);
    expect(isAdmin(author)).toBe(false);
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });
});

describe('canEditDocument (#2 / #4)', () => {
  const doc = makeDoc('d1', { author: 'Ada Author' });

  it('lets the author edit their own document', () => {
    expect(canEditDocument(author, doc)).toBe(true);
  });
  it('blocks a different non-admin user', () => {
    expect(canEditDocument(other, doc)).toBe(false);
  });
  it('lets an admin edit any document', () => {
    expect(canEditDocument(admin, doc)).toBe(true);
  });
  it('blocks when nobody is logged in', () => {
    expect(canEditDocument(null, doc)).toBe(false);
  });
  it('does not match authors by partial name', () => {
    expect(canEditDocument(makeUser({ name: 'Ada' }), doc)).toBe(false);
  });
  it('delete follows exactly the same rule as edit', () => {
    for (const u of [admin, author, other, null]) {
      expect(canDeleteDocument(u, doc)).toBe(canEditDocument(u, doc));
    }
  });
});

describe('canAccessDataManagement (#8)', () => {
  it('is admin-only', () => {
    expect(canAccessDataManagement(admin)).toBe(true);
    expect(canAccessDataManagement(author)).toBe(false);
    expect(canAccessDataManagement(null)).toBe(false);
  });
});

describe('visibleDocumentsFor (#1 / #3)', () => {
  const docs = [
    makeDoc('draft', { status: 'DRAFT' }),
    makeDoc('review', { status: 'IN_REVIEW' }),
    makeDoc('approved', { status: 'APPROVED' }),
    makeDoc('published', { status: 'PUBLISHED' }),
  ];

  it('shows non-admins only in-progress documents', () => {
    expect(visibleDocumentsFor(author, docs).map((d) => d.metadata.id)).toEqual(['draft', 'review']);
  });
  it('shows admins every document', () => {
    expect(visibleDocumentsFor(admin, docs)).toHaveLength(4);
  });
  it('treats a logged-out user like a non-admin', () => {
    expect(visibleDocumentsFor(null, docs)).toHaveLength(2);
  });
});
