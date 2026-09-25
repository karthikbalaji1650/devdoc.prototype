import { describe, it, expect } from 'vitest';
import { recordDriveExport, getDriveExportLog, getLatestDriveExport } from './googleDriveStatusService';

const rec = (n: number) => ({ docTitle: `Doc ${n}`, docNumber: `D-${n}`, driveUrl: `https://docs.google.com/d/${n}` });

describe('Google Drive export log (#5)', () => {
  it('reports no exports before anything is exported', () => {
    expect(getLatestDriveExport()).toBeNull();
    expect(getDriveExportLog()).toEqual([]);
  });

  it('records an export with a timestamp', () => {
    recordDriveExport(rec(1));
    const latest = getLatestDriveExport();
    expect(latest).toMatchObject(rec(1));
    expect(new Date(latest!.exportedAt).toString()).not.toBe('Invalid Date');
  });

  it('returns the most recent export as latest', () => {
    recordDriveExport(rec(1));
    recordDriveExport(rec(2));
    expect(getLatestDriveExport()?.docTitle).toBe('Doc 2');
    expect(getDriveExportLog()).toHaveLength(2);
  });

  it('keeps only the 50 most recent exports', () => {
    for (let i = 1; i <= 60; i++) recordDriveExport(rec(i));
    const log = getDriveExportLog();
    expect(log).toHaveLength(50);
    expect(log[0].docTitle).toBe('Doc 60');
  });

  it('survives corrupt storage', () => {
    localStorage.setItem('devdoc_studio_drive_export_log_v1', '<<<');
    expect(getDriveExportLog()).toEqual([]);
  });
});
