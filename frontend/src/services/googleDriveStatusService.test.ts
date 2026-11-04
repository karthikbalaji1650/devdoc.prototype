import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installFakeCollectionsApi } from '../test/fakeCollectionsApi';

const rec = (n: number) => ({ docTitle: `Doc ${n}`, docNumber: `D-${n}`, driveUrl: `https://docs.google.com/d/${n}` });

let svc: typeof import('./googleDriveStatusService');
beforeEach(async () => {
  installFakeCollectionsApi();
  vi.resetModules();
  svc = await import('./googleDriveStatusService');
  await svc.driveExportLog.load();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Google Drive export log (#5), shared on the server', () => {
  it('reports no exports before anything is exported', () => {
    expect(svc.getLatestDriveExport()).toBeNull();
    expect(svc.getDriveExportLog()).toEqual([]);
  });

  it('records an export with a timestamp', async () => {
    await svc.recordDriveExport(rec(1));
    const latest = svc.getLatestDriveExport();
    expect(latest).toMatchObject(rec(1));
    expect(new Date(latest!.exportedAt).toString()).not.toBe('Invalid Date');
  });

  it('returns the most recent export as latest, and the log newest first', async () => {
    await svc.recordDriveExport(rec(1));
    await svc.recordDriveExport(rec(2));
    expect(svc.getLatestDriveExport()?.docTitle).toBe('Doc 2');
    expect(svc.getDriveExportLog().map((r) => r.docTitle)).toEqual(['Doc 2', 'Doc 1']);
  });

  it('keeps the 50 most recent exports (the server drops the oldest)', async () => {
    for (let i = 1; i <= 60; i++) await svc.recordDriveExport(rec(i));
    await svc.driveExportLog.load(true);
    const log = svc.getDriveExportLog();
    expect(log).toHaveLength(50);
    expect(log[0].docTitle).toBe('Doc 60');
    expect(log[49].docTitle).toBe('Doc 11');
  });
});
