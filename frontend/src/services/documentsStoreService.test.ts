import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DocumentModel } from '../types/document';
import { makeDoc } from '../test/fixtures';
import { API_BASE, installFakeCollectionsApi } from '../test/fakeCollectionsApi';

// A fake /api/documents (plus the collections fake for the Doc Bin).
function installFakeDocumentsApi() {
  const { fetchMock: collectionsFetch } = installFakeCollectionsApi();
  const docs = new Map<string, { doc: DocumentModel; updatedAt: string; deleted: boolean }>();
  const snapshots = new Map<string, { id: string; savedAt: string; takenAt: string; label: string; doc: DocumentModel }[]>();
  let refuse: string | null = null;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const calls: string[] = [];

  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    if (url.includes('/api/collections/')) return collectionsFetch(url, init);
    const method = init.method ?? 'GET';
    const path = url.replace(`${API_BASE}/api/documents`, '');
    calls.push(`${method} ${path}`);
    const [, id, sub, snapId] = path.split('/').map(decodeURIComponent);
    if (method === 'GET' && !id) {
      return json({ documents: [...docs.values()].filter((d) => !d.deleted).map((d) => ({ ...d.doc, updatedAt: d.updatedAt })) });
    }
    if (method === 'PUT') {
      if (refuse) return json({ error: refuse }, 403);
      const doc = JSON.parse(String(init.body));
      const prev = docs.get(id);
      if (prev) snapshots.set(id, [{ id: `snap-${(snapshots.get(id)?.length ?? 0) + 1}`, savedAt: prev.updatedAt, takenAt: 'now', label: 'Auto-saved version', doc: prev.doc }, ...(snapshots.get(id) ?? [])]);
      docs.set(id, { doc, updatedAt: new Date().toISOString(), deleted: false });
      return json({ document: doc });
    }
    if (method === 'DELETE' && sub === 'purge') { docs.delete(id); return new Response(null, { status: 204 }); }
    if (method === 'DELETE') { const d = docs.get(id); if (d) d.deleted = true; return new Response(null, { status: 204 }); }
    if (method === 'GET' && sub === 'history') return json({ snapshots: snapshots.get(id) ?? [] });
    if (method === 'POST' && sub === 'history') {
      const snap = snapshots.get(id)!.find((s) => s.id === snapId)!;
      docs.set(id, { doc: snap.doc, updatedAt: new Date().toISOString(), deleted: false });
      return json({ document: snap.doc });
    }
    return json({ error: 'unexpected' }, 500);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { docs, calls, refuseWith: (m: string | null) => { refuse = m; } };
}

let store: typeof import('./documentsStoreService');
let api: ReturnType<typeof installFakeDocumentsApi>;
beforeEach(async () => {
  api = installFakeDocumentsApi();
  vi.resetModules();
  store = await import('./documentsStoreService');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('documents (server-only)', () => {
  it('loads every visible document from the server, newest first', async () => {
    api.docs.set('a', { doc: makeDoc('a'), updatedAt: '2026-01-01T00:00:00.000Z', deleted: false });
    api.docs.set('b', { doc: makeDoc('b'), updatedAt: '2026-02-01T00:00:00.000Z', deleted: false });
    await store.loadDocuments();
    expect(store.documentsStatus()).toBe('ready');
    expect(store.listDocuments().map((d) => d.metadata.id)).toEqual(['b', 'a']);
    expect(store.getDocument('a')?.metadata.id).toBe('a');
  });

  it('saves to the server, in order, and nothing to browser storage', async () => {
    await store.loadDocuments();
    store.saveDocument(makeDoc('d1', { title: 'First' }));
    store.saveDocument(makeDoc('d1', { title: 'Second' }));
    expect(store.getDocument('d1')?.metadata.title).toBe('Second'); // memory is immediate
    await store.whenSaved('d1');
    expect(api.calls.filter((c) => c.startsWith('PUT'))).toEqual(['PUT /d1', 'PUT /d1']);
    expect(api.docs.get('d1')?.doc.metadata.title).toBe('Second');
    expect(localStorage.length).toBe(0);
  });

  it('announces a save the server refused', async () => {
    const onError = vi.fn();
    window.addEventListener(store.DOCUMENT_SAVE_ERROR_EVENT, onError);
    api.refuseWith('You can only edit documents you authored.');
    store.saveDocument(makeDoc('d1'));
    await store.whenSaved('d1');
    expect((onError.mock.calls[0][0] as CustomEvent).detail).toBe('Not saved: You can only edit documents you authored.');
    window.removeEventListener(store.DOCUMENT_SAVE_ERROR_EVENT, onError);
  });

  it('without a backend shows the read-only sample and refuses to save', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    await store.loadDocuments();
    expect(store.documentsStatus()).toBe('unavailable');
    expect(store.listDocuments().map((d) => d.metadata.docNumber)).toEqual(['ADR-2026-042']);
    expect(store.saveDocument(makeDoc('d1'))).toBe(false);
    expect(api.calls).toEqual([]);
  });

  it('forgets everything on sign-out', async () => {
    api.docs.set('a', { doc: makeDoc('a'), updatedAt: 'x', deleted: false });
    await store.loadDocuments();
    store.resetDocuments();
    expect(store.listDocuments()).toEqual([]);
  });
});

describe('Doc Bin (on the server)', () => {
  it('moving a document to the bin soft-deletes it, and restoring saves it again', async () => {
    await store.loadDocuments();
    store.saveDocument(makeDoc('d1', { title: 'Mine' }));
    await store.moveDocumentToBin(makeDoc('d1', { title: 'Mine' }));
    expect(store.getDocument('d1')).toBeNull();
    expect(api.docs.get('d1')?.deleted).toBe(true);
    const [entry] = store.listDocBin();
    expect(entry).toMatchObject({ documentId: 'd1', itemType: 'document', documentTitle: 'Mine' });

    const restored = await store.restoreFromDocBin(entry.id);
    expect(restored?.metadata.title).toBe('Mine');
    expect(api.docs.get('d1')?.deleted).toBe(false);
    expect(store.listDocBin()).toEqual([]);
  });

  it('restores a section into its document at its old position', async () => {
    const doc = makeDoc('d1');
    const section = { id: 'gone', title: 'Gone', level: 1 as const, type: 'richText' as const, content: '' };
    await store.loadDocuments();
    store.saveDocument(doc);
    await store.moveSectionToBin(doc, section, 0);
    const restored = await store.restoreFromDocBin(store.listDocBin()[0].id);
    expect(restored?.sections[0].id).toBe('gone');
  });

  it('permanently deleting a document purges it on the server', async () => {
    await store.loadDocuments();
    store.saveDocument(makeDoc('d1'));
    await store.moveDocumentToBin(makeDoc('d1'));
    await store.permanentlyDeleteFromDocBin(store.listDocBin()[0].id);
    expect(api.docs.has('d1')).toBe(false);
    expect(store.listDocBin()).toEqual([]);
  });
});

describe('version history (kept by the server)', () => {
  it('lists snapshots and restores one, after pending saves', async () => {
    await store.loadDocuments();
    store.saveDocument(makeDoc('d1', { title: 'v1' }));
    store.saveDocument(makeDoc('d1', { title: 'v2' }));
    await store.whenSaved('d1');
    const [snap] = await store.listSnapshots('d1');
    expect(snap.doc.metadata.title).toBe('v1');
    const doc = await store.restoreSnapshot('d1', snap.id);
    expect(doc.metadata.title).toBe('v1');
    expect(store.getDocument('d1')?.metadata.title).toBe('v1');
  });
});
