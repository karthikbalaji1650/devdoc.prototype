import type { DocumentModel } from '../types/document';
import { safeSetItem } from './safeStorage';
import { deleteHistory } from './versionHistoryService';

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

/** Returns false when the document could not be persisted (storage full). */
export function saveDocument(doc: DocumentModel): boolean {
  if (!doc?.metadata?.id) return false;
  const store = readStore();
  store[doc.metadata.id] = { doc, updatedAt: new Date().toISOString() };
  return writeStore(store);
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
  if (entry?.itemType === 'document') deleteHistory(entry.documentId);
  writeBin(bin.filter((item) => item.id !== entryId));
}

export function generateDocumentId(): string {
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
