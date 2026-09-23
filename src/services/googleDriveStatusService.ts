// Tracks Google Drive export history so the dashboard can show a real
// "Google Drive upload status" instead of nothing. Until the app has a
// real multi-document store, this logs every successful export (by
// document title/number) rather than a true per-document flag.
const DRIVE_LOG_KEY = 'devdoc_studio_drive_export_log_v1';

export interface DriveExportRecord {
  docTitle: string;
  docNumber: string;
  driveUrl: string;
  exportedAt: string; // ISO timestamp
}

function readLog(): DriveExportRecord[] {
  try {
    const raw = localStorage.getItem(DRIVE_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function recordDriveExport(record: Omit<DriveExportRecord, 'exportedAt'>): void {
  const log = readLog();
  log.unshift({ ...record, exportedAt: new Date().toISOString() });
  localStorage.setItem(DRIVE_LOG_KEY, JSON.stringify(log.slice(0, 50)));
}

export function getDriveExportLog(): DriveExportRecord[] {
  return readLog();
}

export function getLatestDriveExport(): DriveExportRecord | null {
  const log = readLog();
  return log[0] ?? null;
}
