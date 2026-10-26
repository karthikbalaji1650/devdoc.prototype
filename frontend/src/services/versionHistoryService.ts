import type { DocumentModel } from '../types/document';
import { safeSetItem } from './safeStorage';

const HISTORY_KEY = 'devdoc_studio_doc_history_v1';

/** Minimum gap between automatic snapshots of one document. */
export const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
/** Snapshots kept per document (oldest are dropped). */
export const MAX_SNAPSHOTS = 10;

export interface Snapshot {
  id: string;
  savedAt: string; // ISO
  label: string;
  doc: DocumentModel;
}

type History = Record<string, Snapshot[]>; // newest first

function readHistory(): History {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Snapshots are a convenience: if storage is full, shed the older half
 * of every document's history and retry once, then give up quietly
 * (the real document save reports its own quota failure). */
function writeHistory(history: History): void {
  if (safeSetItem(HISTORY_KEY, JSON.stringify(history), { notify: false })) return;
  const trimmed: History = {};
  for (const [id, list] of Object.entries(history)) trimmed[id] = list.slice(0, Math.ceil(list.length / 2));
  safeSetItem(HISTORY_KEY, JSON.stringify(trimmed), { notify: false });
}

// In-memory record of when each document was last snapshotted, so the
// (frequent) autosave path only touches storage once per interval.
const lastSnapshotAt = new Map<string, number>();

export function listSnapshots(docId: string): Snapshot[] {
  return readHistory()[docId] ?? [];
}

/** Adds a snapshot unless it is identical to the newest one. Returns
 * whether one was added. */
export function recordSnapshot(doc: DocumentModel, label = 'Auto-saved version', now = Date.now()): boolean {
  const id = doc?.metadata?.id;
  if (!id) return false;
  const history = readHistory();
  const list = history[id] ?? [];
  if (list[0] && JSON.stringify(list[0].doc) === JSON.stringify(doc)) {
    lastSnapshotAt.set(id, now);
    return false;
  }
  list.unshift({ id: `${id}-${now}`, savedAt: new Date(now).toISOString(), label, doc });
  history[id] = list.slice(0, MAX_SNAPSHOTS);
  writeHistory(history);
  lastSnapshotAt.set(id, now);
  return true;
}

/** Called by autosave with the copy that is about to be overwritten.
 * Snapshots it at most once per SNAPSHOT_INTERVAL_MS per document, so
 * history holds meaningful restore points rather than every keystroke. */
export function snapshotIfDue(getPrevious: () => DocumentModel | null, docId: string, now = Date.now()): boolean {
  if (!lastSnapshotAt.has(docId)) {
    const newest = listSnapshots(docId)[0];
    lastSnapshotAt.set(docId, newest ? new Date(newest.savedAt).getTime() : 0);
  }
  if (now - (lastSnapshotAt.get(docId) ?? 0) < SNAPSHOT_INTERVAL_MS) return false;
  const previous = getPrevious();
  if (!previous) return false;
  return recordSnapshot(previous, 'Auto-saved version', now);
}

export function deleteHistory(docId: string): void {
  const history = readHistory();
  if (!(docId in history)) return;
  delete history[docId];
  lastSnapshotAt.delete(docId);
  writeHistory(history);
}

/** Test hook: forget the in-memory throttle. */
export function _resetSnapshotThrottle(): void {
  lastSnapshotAt.clear();
}
