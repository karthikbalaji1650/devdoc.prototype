// Google Drive export history, so the dashboard can show the latest
// upload. Shared by every user on the server (see sharedCollection.ts);
// the server keeps the latest 50 and never changes an entry.
import { createSharedCollection } from './sharedCollection';

export interface DriveExportRecord {
  id: string;
  docTitle: string;
  docNumber: string;
  driveUrl: string;
  exportedAt: string; // ISO timestamp
}

export const driveExportLog = createSharedCollection<DriveExportRecord>('drive-exports');

export function recordDriveExport(record: Omit<DriveExportRecord, 'id' | 'exportedAt'>): Promise<void> {
  const exportedAt = new Date().toISOString();
  // Random suffix: two exports in the same millisecond must not share an id
  // (the server never overwrites a log entry).
  return driveExportLog.put({ ...record, id: `export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, exportedAt });
}

/** Newest first. */
export function getDriveExportLog(): DriveExportRecord[] {
  return [...driveExportLog.items()].reverse();
}

export function getLatestDriveExport(): DriveExportRecord | null {
  const items = driveExportLog.items();
  return items[items.length - 1] ?? null;
}
