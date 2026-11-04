// Documents live on the server only (Postgres, behind /api/documents, with
// Redis caching the list) - one copy for every user, nothing kept in this
// browser. They are loaded into memory so screens can keep reading them
// synchronously; `useDocuments` re-renders a screen when they load or change.
//
// Saves update memory at once and are sent to the server in order, one
// at a time per document (the latest edit always lands last). A refused or
// failed save is announced with DOCUMENT_SAVE_ERROR_EVENT.
//
// Without a backend (the browser-only demo) the sample documents are shown
// read-only and nothing is saved.
import { useEffect, useSyncExternalStore } from 'react';
import type { DocumentModel } from '../types/document';
import { isBackendConfigured } from './backendAuthService';
import { fetchWithTimeout } from './fetchWithTimeout';
import { createSharedCollection } from './sharedCollection';
import { sampleADRDoc } from '../templates/adrTemplate';

export const DOCUMENT_SAVE_ERROR_EVENT = 'devdoc:document-save-error';

export type DocumentsStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unavailable';

interface Entry { doc: DocumentModel; updatedAt: string }

let entries = new Map<string, Entry>();
let status: DocumentsStatus = 'idle';
let loadError = '';
let loading: Promise<void> | null = null;
let version = 0; // bumps on every change, for useSyncExternalStore
const listeners = new Set<() => void>();
const notify = () => { version++; for (const l of listeners) l(); };
const saveQueues = new Map<string, Promise<void>>();

function baseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL as string).replace(/\/$/, '');
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T | null> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`${baseUrl()}/api/documents${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      retries: method === 'GET' ? 1 : 0,
    });
  } catch {
    throw new Error('Could not reach the server.');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw Object.assign(new Error(typeof data?.error === 'string' ? data.error : `Server error (${res.status}).`), { status: res.status });
  }
  return res.status === 204 ? null : ((await res.json()) as T);
}

const enc = encodeURIComponent;

function reportSaveError(message: string): void {
  window.dispatchEvent(new CustomEvent(DOCUMENT_SAVE_ERROR_EVENT, { detail: message }));
}

/** The sample documents the browser-only demo shows (read-only). */
function demoDocuments(): Map<string, Entry> {
  const doc: DocumentModel = JSON.parse(JSON.stringify(sampleADRDoc));
  doc.metadata.status = 'IN_REVIEW';
  return new Map([[doc.metadata.id, { doc, updatedAt: new Date(0).toISOString() }]]);
}

/** Loads every document visible to the signed-in user (once; `force` reloads). */
export function loadDocuments(force = false): Promise<void> {
  if (!isBackendConfigured()) {
    if (status !== 'unavailable') { entries = demoDocuments(); status = 'unavailable'; notify(); }
    return Promise.resolve();
  }
  if (loading && !force) return loading;
  status = 'loading';
  notify();
  loading = call<{ documents: (DocumentModel & { updatedAt: string })[] }>('GET', '')
    .then((data) => {
      const next = new Map<string, Entry>();
      for (const { updatedAt, ...doc } of data?.documents ?? []) {
        if (doc?.metadata?.id) next.set(doc.metadata.id, { doc, updatedAt });
      }
      entries = next;
      status = 'ready';
      loadError = '';
    })
    .catch((err: unknown) => {
      status = 'error';
      loadError = err instanceof Error ? err.message : String(err);
    })
    .finally(notify);
  return loading;
}

/** Forget everything loaded (on sign-out, so the next user starts clean). */
export function resetDocuments(): void {
  entries = new Map();
  status = 'idle';
  loading = null;
  loadError = '';
  notify();
}

export function documentsStatus(): DocumentsStatus { return status; }
export function documentsLoadError(): string { return loadError; }

/** Re-renders on load and on every change; loads on first use. */
export function useDocuments(): { status: DocumentsStatus; version: number } {
  const v = useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => version,
  );
  useEffect(() => { void loadDocuments(); }, []);
  return { status, version: v };
}

/** Most recently saved first. */
export function listDocuments(): DocumentModel[] {
  return [...entries.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((e) => e.doc);
}

export function getDocument(id: string): DocumentModel | null {
  return entries.get(id)?.doc ?? null;
}

/** Updates the document at once and sends it to the server. Returns false
 * when it cannot be saved at all (no backend). The server's verdict
 * arrives later: a refusal fires DOCUMENT_SAVE_ERROR_EVENT. */
export function saveDocument(doc: DocumentModel): boolean {
  const id = doc?.metadata?.id;
  if (!id) return false;
  if (!isBackendConfigured()) {
    reportSaveError('Documents are stored on the server - this browser-only demo cannot save them.');
    return false;
  }
  entries.set(id, { doc, updatedAt: new Date().toISOString() });
  notify();
  const previous = saveQueues.get(id) ?? Promise.resolve();
  const next = previous.then(() => call('PUT', `/${enc(id)}`, doc)).then(
    () => undefined,
    (err: unknown) => reportSaveError(`Not saved: ${err instanceof Error ? err.message : String(err)}`),
  );
  saveQueues.set(id, next);
  return true;
}

/** Resolves once every save sent so far for `id` has finished. */
export function whenSaved(id: string): Promise<void> {
  return saveQueues.get(id) ?? Promise.resolve();
}

export function generateDocumentId(): string {
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Doc Bin ──────────────────────────────────────────────────────────────
// Deleted documents and sections, on the server: each user sees what they
// deleted, admins see everything. A deleted document is also soft-deleted
// on the server, so restoring it simply saves it again.

export interface DocBinEntry {
  id: string;
  documentId: string;
  documentTitle: string;
  itemType: 'document' | 'section';
  deletedAt: string;
  document?: DocumentModel;
  section?: DocumentModel['sections'][number];
  sectionIndex?: number;
}

export const docBin = createSharedCollection<DocBinEntry>('doc-bin');

/** Newest first. */
export function listDocBin(): DocBinEntry[] {
  return [...docBin.items()].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

export async function moveDocumentToBin(doc: DocumentModel): Promise<void> {
  const id = doc.metadata.id;
  await whenSaved(id);
  await docBin.put({
    id: `document:${id}:${Date.now()}`,
    documentId: id,
    documentTitle: doc.metadata.title || 'Untitled Document',
    itemType: 'document',
    deletedAt: new Date().toISOString(),
    document: doc,
  });
  if (docBin.error()) throw new Error(docBin.error());
  await call('DELETE', `/${enc(id)}`);
  entries.delete(id);
  notify();
}

export async function moveSectionToBin(doc: DocumentModel, section: DocumentModel['sections'][number], sectionIndex: number): Promise<void> {
  await docBin.put({
    id: `section:${doc.metadata.id}:${section.id}:${Date.now()}`,
    documentId: doc.metadata.id,
    documentTitle: doc.metadata.title || 'Untitled Document',
    itemType: 'section',
    deletedAt: new Date().toISOString(),
    section,
    sectionIndex,
  });
}

export async function restoreFromDocBin(entryId: string): Promise<DocumentModel | null> {
  const entry = docBin.items().find((item) => item.id === entryId);
  if (!entry) return null;
  let restored: DocumentModel | null = null;
  if (entry.itemType === 'document' && entry.document) {
    restored = entry.document;
  } else if (entry.itemType === 'section' && entry.section) {
    const doc = getDocument(entry.documentId);
    if (!doc) return null;
    const sections = [...doc.sections];
    if (!sections.some((s) => s.id === entry.section!.id)) {
      sections.splice(Math.min(entry.sectionIndex ?? sections.length, sections.length), 0, entry.section);
    }
    restored = { ...doc, sections };
  }
  if (!restored || !saveDocument(restored)) return null;
  await whenSaved(restored.metadata.id);
  await docBin.remove(entryId);
  return restored;
}

export async function permanentlyDeleteFromDocBin(entryId: string): Promise<void> {
  const entry = docBin.items().find((item) => item.id === entryId);
  if (entry?.itemType === 'document') {
    // Also removes the server's soft-deleted copy and its version history.
    await call('DELETE', `/${enc(entry.documentId)}/purge`).catch((err: { status?: number }) => {
      if (err?.status !== 404) throw err;
    });
  }
  await docBin.remove(entryId);
}

// ── Version history ──────────────────────────────────────────────────────
// Kept by the server: it snapshots the version a save replaces (at most
// every few minutes) and the version a restore replaces.

export interface Snapshot {
  id: string;
  savedAt: string;
  takenAt: string;
  label: string;
  doc: DocumentModel;
}

/** Newest first. */
export async function listSnapshots(docId: string): Promise<Snapshot[]> {
  const data = await call<{ snapshots: Snapshot[] }>('GET', `/${enc(docId)}/history`);
  return data?.snapshots ?? [];
}

/** Makes a snapshot current on the server (after any pending save) and
 * returns the restored document. */
export async function restoreSnapshot(docId: string, snapshotId: string): Promise<DocumentModel> {
  await whenSaved(docId);
  const data = await call<{ document: DocumentModel }>('POST', `/${enc(docId)}/history/${enc(snapshotId)}/restore`);
  const doc = data!.document;
  entries.set(docId, { doc, updatedAt: new Date().toISOString() });
  notify();
  return doc;
}
