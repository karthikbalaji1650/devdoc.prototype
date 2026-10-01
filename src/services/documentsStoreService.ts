import type { DocumentModel } from '../types/document';
import { safeSetItem } from './safeStorage';
import { deleteHistory, recordSnapshot } from './versionHistoryService';
import { deleteDocumentFromBackend, fetchBackendDocuments, pushDocumentToBackend, purgeDocumentFromBackend } from './backendDocumentsService';

const STORE_KEY = 'devdoc_studio_documents_v1';
const LEGACY_SINGLE_DOC_KEY = 'devdoc_studio_current_doc_v1';
const DOC_BIN_KEY = 'devdoc_studio_doc_bin_v1';

interface StoredEntry {
  doc: DocumentModel;
  updatedAt: string; // ISO
}

type Store = Record<string, StoredEntry>;

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

function readBin(): DocBinEntry[] {
  try {
    const raw = localStorage.getItem(DOC_BIN_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeBin(entries: DocBinEntry[]): boolean {
  return safeSetItem(DOC_BIN_KEY, JSON.stringify(entries));
}

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store): boolean {
  return safeSetItem(STORE_KEY, JSON.stringify(store));
}

/** One-time migration: bring the old single-document key in as the
 * first entry, so existing users don't lose their current work when
 * this multi-document store is introduced. */
let migrated = false;
function migrateLegacyDocumentIfNeeded(): void {
  if (migrated) return;
  migrated = true;
  const store = readStore();
  if (Object.keys(store).length > 0) return;
  const legacyRaw = localStorage.getItem(LEGACY_SINGLE_DOC_KEY);
  if (!legacyRaw) return;
  try {
    const legacyDoc: DocumentModel = JSON.parse(legacyRaw);
    if (legacyDoc?.metadata?.id) {
      store[legacyDoc.metadata.id] = { doc: legacyDoc, updatedAt: new Date().toISOString() };
      writeStore(store);
    }
  } catch {
    // ignore malformed legacy data
  }
}

export function listDocuments(): DocumentModel[] {
  migrateLegacyDocumentIfNeeded();
  return Object.values(readStore())
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((entry) => entry.doc);
}

export function getDocument(id: string): DocumentModel | null {
  migrateLegacyDocumentIfNeeded();
  return readStore()[id]?.doc ?? null;
}

/** Returns false when the document could not be persisted (storage full).
 * When a backend (server/) is configured, the save is also pushed there
 * in the background — this local write is never blocked or delayed by
 * the network, and its return value reflects local storage only.
 *
 * `skipBackendPush` is for the local demo-sample seed (see
 * sampleData.ts): that seed runs on every fresh browser, before sign-in
 * has happened, so pushing it would either 401 (no session yet) or,
 * once signed in, plant a fake document in a real shared backend for
 * every new visitor — neither of which is wanted for a sample that
 * exists purely to make the browser-only demo self-contained. */
export function saveDocument(doc: DocumentModel, opts: { skipBackendPush?: boolean } = {}): boolean {
  if (!doc?.metadata?.id) return false;
  const store = readStore();
  store[doc.metadata.id] = { doc, updatedAt: new Date().toISOString() };
  const ok = writeStore(store);
  if (!opts.skipBackendPush) void pushDocumentToBackend(doc);
  return ok;
}

export function deleteDocument(id: string): void {
  const store = readStore();
  delete store[id];
  writeStore(store);
}

export function listDocBin(): DocBinEntry[] {
  return readBin().sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

export function moveDocumentToBin(doc: DocumentModel): void {
  const bin = readBin();
  bin.push({
    id: `document:${doc.metadata.id}:${Date.now()}`,
    documentId: doc.metadata.id,
    documentTitle: doc.metadata.title || 'Untitled Document',
    itemType: 'document',
    deletedAt: new Date().toISOString(),
    document: doc,
  });
  writeBin(bin);
  deleteDocument(doc.metadata.id);
  void deleteDocumentFromBackend(doc.metadata.id);
}

export function moveSectionToBin(doc: DocumentModel, section: DocumentModel['sections'][number], sectionIndex: number): void {
  const bin = readBin();
  bin.push({
    id: `section:${doc.metadata.id}:${section.id}:${Date.now()}`,
    documentId: doc.metadata.id,
    documentTitle: doc.metadata.title || 'Untitled Document',
    itemType: 'section',
    deletedAt: new Date().toISOString(),
    section,
    sectionIndex,
  });
  writeBin(bin);
}

export function restoreFromDocBin(entryId: string): DocumentModel | null {
  const bin = readBin();
  const entry = bin.find((item) => item.id === entryId);
  if (!entry) return null;

  let restoredDocument: DocumentModel | null = null;
  if (entry.itemType === 'document' && entry.document) {
    restoredDocument = entry.document;
    saveDocument(restoredDocument);
  } else if (entry.itemType === 'section' && entry.section) {
    const doc = getDocument(entry.documentId);
    if (!doc) return null;
    const sections = [...doc.sections];
    if (!sections.some((section) => section.id === entry.section!.id)) {
      sections.splice(Math.min(entry.sectionIndex ?? sections.length, sections.length), 0, entry.section);
    }
    restoredDocument = { ...doc, sections };
    saveDocument(restoredDocument);
  }

  writeBin(bin.filter((item) => item.id !== entryId));
  return restoredDocument;
}

export function permanentlyDeleteFromDocBin(entryId: string): void {
  const bin = readBin();
  const entry = bin.find((item) => item.id === entryId);
  if (entry?.itemType === 'document') {
    deleteHistory(entry.documentId);
    // The document was already soft-deleted on the backend when it was
    // moved to the bin; this actually removes that copy too, rather than
    // leaving a soft-deleted row there forever with no local trace of it.
    void purgeDocumentFromBackend(entry.documentId);
  }
  writeBin(bin.filter((item) => item.id !== entryId));
}

export function generateDocumentId(): string {
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Pulls in documents from the backend (server/): new ones this browser
 * doesn't have yet, and - unlike a purely additive sync - updates to
 * ones it already does, so a colleague's later edit on another device
 * actually arrives here. A pulled update only replaces the local copy
 * when the server's own save timestamp is demonstrably newer than this
 * browser's; an edit made here that never reached the server (offline,
 * or the push failed) keeps the local timestamp ahead of the server's
 * stale one, so it's never clobbered by syncing. The local copy being
 * replaced is snapshotted first (version history), so a sync that
 * wasn't wanted can still be undone from there. Still not true
 * conflict resolution: if both sides changed the same document since
 * they last agreed, whichever save landed on the server more recently
 * wins. A no-op (resolves 0) when no backend is configured.
 *
 * Called once per sign-in / page load (see App.tsx), before any
 * document is open in the editor - if that ever changes, the active
 * document would need excluding here to avoid pulling a copy out from
 * under someone mid-edit. */
export async function syncFromBackend(): Promise<number> {
  const remote = await fetchBackendDocuments();
  if (remote.length === 0) return 0;
  const store = readStore();
  let changed = 0;
  for (const synced of remote) {
    const { updatedAt: remoteUpdatedAt, ...doc } = synced;
    const id = doc?.metadata?.id;
    if (!id) continue;
    const local = store[id];
    if (!local) {
      store[id] = { doc, updatedAt: new Date().toISOString() };
      changed++;
    } else if (remoteUpdatedAt && remoteUpdatedAt > local.updatedAt) {
      recordSnapshot(local.doc, 'Before syncing a newer version from another device');
      store[id] = { doc, updatedAt: remoteUpdatedAt };
      changed++;
    }
  }
  if (changed > 0) writeStore(store);
  return changed;
}
