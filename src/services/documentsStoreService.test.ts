import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeDoc, makeSection } from '../test/fixtures';
import * as store from './documentsStoreService';

describe('document store', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-25T10:00:00Z')); });
  afterEach(() => { vi.useRealTimers(); });

  it('saves and reads a document back', () => {
    const doc = makeDoc('a');
    store.saveDocument(doc);
    expect(store.getDocument('a')).toEqual(doc);
  });

  it('returns null for an unknown id', () => {
    expect(store.getDocument('nope')).toBeNull();
  });

  it('ignores a document that has no id', () => {
    store.saveDocument(makeDoc(''));
    expect(store.listDocuments()).toHaveLength(0);
  });

  it('overwrites (not duplicates) when the same id is saved again', () => {
    store.saveDocument(makeDoc('a', { title: 'First' }));
    store.saveDocument(makeDoc('a', { title: 'Second' }));
    expect(store.listDocuments()).toHaveLength(1);
    expect(store.getDocument('a')?.metadata.title).toBe('Second');
  });

  it('lists the most recently saved document first', () => {
    store.saveDocument(makeDoc('old'));
    vi.advanceTimersByTime(60_000);
    store.saveDocument(makeDoc('new'));
    expect(store.listDocuments().map((d) => d.metadata.id)).toEqual(['new', 'old']);
  });

  it('deletes a document', () => {
    store.saveDocument(makeDoc('a'));
    store.deleteDocument('a');
    expect(store.getDocument('a')).toBeNull();
  });

  it('survives corrupt storage without throwing', () => {
    localStorage.setItem('devdoc_studio_documents_v1', '{not json');
    expect(store.listDocuments()).toEqual([]);
  });

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => store.generateDocumentId()));
    expect(ids.size).toBe(50);
    expect([...ids][0]).toMatch(/^doc-/);
  });
});

describe('legacy single-document migration', () => {
  // The migration runs once per module load, so each case needs a fresh module.
  const fresh = async () => { vi.resetModules(); return import('./documentsStoreService'); };

  it('brings the old single document in as the first entry', async () => {
    localStorage.setItem('devdoc_studio_current_doc_v1', JSON.stringify(makeDoc('legacy')));
    const s = await fresh();
    expect(s.listDocuments().map((d) => d.metadata.id)).toEqual(['legacy']);
  });

  it('does not overwrite an existing store', async () => {
    localStorage.setItem('devdoc_studio_current_doc_v1', JSON.stringify(makeDoc('legacy')));
    localStorage.setItem('devdoc_studio_documents_v1', JSON.stringify({
      real: { doc: makeDoc('real'), updatedAt: '2026-09-25T00:00:00Z' },
    }));
    const s = await fresh();
    expect(s.listDocuments().map((d) => d.metadata.id)).toEqual(['real']);
  });

  it('ignores malformed legacy data', async () => {
    localStorage.setItem('devdoc_studio_current_doc_v1', 'garbage');
    const s = await fresh();
    expect(s.listDocuments()).toEqual([]);
  });
});

describe('Doc Bin — documents', () => {
  it('moves a document out of the store and into the bin', () => {
    const doc = makeDoc('a');
    store.saveDocument(doc);
    store.moveDocumentToBin(doc);
    expect(store.getDocument('a')).toBeNull();
    const bin = store.listDocBin();
    expect(bin).toHaveLength(1);
    expect(bin[0]).toMatchObject({ itemType: 'document', documentId: 'a', documentTitle: 'Doc a' });
  });

  it('restores a binned document exactly and empties the bin', () => {
    const doc = makeDoc('a');
    store.saveDocument(doc);
    store.moveDocumentToBin(doc);
    const restored = store.restoreFromDocBin(store.listDocBin()[0].id);
    expect(restored).toEqual(doc);
    expect(store.getDocument('a')).toEqual(doc);
    expect(store.listDocBin()).toHaveLength(0);
  });

  it('returns null when restoring an id that is not in the bin', () => {
    expect(store.restoreFromDocBin('missing')).toBeNull();
  });

  it('permanently deleting removes it from the bin and never restores it', () => {
    const doc = makeDoc('a');
    store.saveDocument(doc);
    store.moveDocumentToBin(doc);
    const id = store.listDocBin()[0].id;
    store.permanentlyDeleteFromDocBin(id);
    expect(store.listDocBin()).toHaveLength(0);
    expect(store.restoreFromDocBin(id)).toBeNull();
    expect(store.getDocument('a')).toBeNull();
  });

  it('lists the most recently deleted item first', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-25T10:00:00Z'));
    store.moveDocumentToBin(makeDoc('first'));
    vi.advanceTimersByTime(60_000);
    store.moveDocumentToBin(makeDoc('second'));
    expect(store.listDocBin().map((e) => e.documentId)).toEqual(['second', 'first']);
    vi.useRealTimers();
  });
});

describe('Doc Bin — sections', () => {
  const sections = [makeSection('s1'), makeSection('s2'), makeSection('s3')];

  it('binning a section leaves its document in the store', () => {
    const doc = makeDoc('a', {}, sections);
    store.saveDocument(doc);
    store.moveSectionToBin(doc, sections[1], 1);
    expect(store.getDocument('a')).not.toBeNull();
    expect(store.listDocBin()[0]).toMatchObject({ itemType: 'section', documentId: 'a', sectionIndex: 1 });
  });

  it('restores a section at its original position', () => {
    const doc = makeDoc('a', {}, sections);
    store.moveSectionToBin(doc, sections[1], 1);
    store.saveDocument({ ...doc, sections: [sections[0], sections[2]] }); // as if it was deleted
    const restored = store.restoreFromDocBin(store.listDocBin()[0].id);
    expect(restored?.sections.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    expect(store.getDocument('a')?.sections.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
  });

  it('does not duplicate a section that already exists', () => {
    const doc = makeDoc('a', {}, sections);
    store.saveDocument(doc);
    store.moveSectionToBin(doc, sections[1], 1); // still present in the stored doc
    const restored = store.restoreFromDocBin(store.listDocBin()[0].id);
    expect(restored?.sections.filter((s) => s.id === 's2')).toHaveLength(1);
  });

  it('clamps an out-of-range position to the end', () => {
    const doc = makeDoc('a', {}, [sections[0]]);
    store.saveDocument(doc);
    store.moveSectionToBin(doc, sections[2], 99);
    const restored = store.restoreFromDocBin(store.listDocBin()[0].id);
    expect(restored?.sections.map((s) => s.id)).toEqual(['s1', 's3']);
  });

  it('cannot restore a section whose parent document is gone', () => {
    const doc = makeDoc('a', {}, sections);
    store.moveSectionToBin(doc, sections[0], 0); // doc never saved to the store
    expect(store.restoreFromDocBin(store.listDocBin()[0].id)).toBeNull();
    expect(store.listDocBin()).toHaveLength(1); // stays in the bin, not lost
  });
});

vi.mock('./backendDocumentsService', () => ({
  fetchBackendDocuments: vi.fn(async () => []),
  pushDocumentToBackend: vi.fn(async () => false),
  deleteDocumentFromBackend: vi.fn(async () => false),
}));

describe('syncFromBackend', () => {
  const fresh = async () => { vi.resetModules(); return import('./documentsStoreService'); };

  it('adds documents that exist on the backend but not locally', async () => {
    const backend = await import('./backendDocumentsService');
    const s = await fresh();
    s.saveDocument(makeDoc('local-only', { title: 'Mine' }));
    vi.mocked(backend.fetchBackendDocuments).mockResolvedValue([
      makeDoc('local-only', { title: 'Should not overwrite' }),
      makeDoc('from-colleague', { title: "Colleague's doc" }),
    ]);

    const added = await s.syncFromBackend();

    expect(added).toBe(1);
    expect(s.getDocument('local-only')?.metadata.title).toBe('Mine'); // not clobbered
    expect(s.getDocument('from-colleague')?.metadata.title).toBe("Colleague's doc");
  });

  it('is a no-op when the backend has nothing new (or is not configured)', async () => {
    const backend = await import('./backendDocumentsService');
    const s = await fresh();
    vi.mocked(backend.fetchBackendDocuments).mockResolvedValue([]);
    expect(await s.syncFromBackend()).toBe(0);
    expect(s.listDocuments()).toHaveLength(0);
  });
});
