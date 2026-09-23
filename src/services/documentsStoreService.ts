import type { DocumentModel } from '../types/document';

const STORE_KEY = 'devdoc_studio_documents_v1';
const LEGACY_SINGLE_DOC_KEY = 'devdoc_studio_current_doc_v1';

interface StoredEntry {
  doc: DocumentModel;
  updatedAt: string; // ISO
}

type Store = Record<string, StoredEntry>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
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

export function saveDocument(doc: DocumentModel): void {
  if (!doc?.metadata?.id) return;
  const store = readStore();
  store[doc.metadata.id] = { doc, updatedAt: new Date().toISOString() };
  writeStore(store);
}

export function deleteDocument(id: string): void {
  const store = readStore();
  delete store[id];
  writeStore(store);
}

export function generateDocumentId(): string {
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
