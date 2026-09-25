import { describe, it, expect } from 'vitest';
import { seedSampleDocumentsIfNeeded } from './sampleData';
import { listDocuments, deleteDocument, saveDocument } from './documentsStoreService';
import { makeDoc } from '../test/fixtures';

describe('seedSampleDocumentsIfNeeded', () => {
  it('adds the ADR sample as an in-review document, once', () => {
    expect(seedSampleDocumentsIfNeeded()).toBe(true);
    const adr = listDocuments().find((d) => d.metadata.docNumber === 'ADR-2026-042');
    expect(adr?.metadata.status).toBe('IN_REVIEW');
    expect(seedSampleDocumentsIfNeeded()).toBe(false);
    expect(listDocuments().filter((d) => d.metadata.docNumber === 'ADR-2026-042')).toHaveLength(1);
  });

  it('does not bring it back after the user deletes it', () => {
    seedSampleDocumentsIfNeeded();
    const id = listDocuments().find((d) => d.metadata.docNumber === 'ADR-2026-042')!.metadata.id;
    deleteDocument(id);
    seedSampleDocumentsIfNeeded();
    expect(listDocuments().some((d) => d.metadata.docNumber === 'ADR-2026-042')).toBe(false);
  });

  it('leaves an existing document with that number alone', () => {
    saveDocument(makeDoc('mine', { docNumber: 'ADR-2026-042', title: 'My own ADR' }));
    expect(seedSampleDocumentsIfNeeded()).toBe(false);
    expect(listDocuments().map((d) => d.metadata.title)).toEqual(['My own ADR']);
  });
});
