// Admin data management (DDS-SRS-008): everything is stored on the server,
// so the backup and the reset are server operations. Admins only - the
// server checks; see backend app/routers/admin.py.
import { isBackendConfigured } from './backendAuthService';
import { fetchWithTimeout } from './fetchWithTimeout';

export const RESET_CONFIRMATION = 'DELETE ALL DATA';

export { isBackendConfigured as isAdminDataAvailable };

const base = () => (import.meta.env.VITE_API_BASE_URL as string).replace(/\/$/, '');

async function errorOf(res: Response): Promise<string> {
  const data = await res.json().catch(() => null);
  return typeof data?.error === 'string' ? data.error : `Server error (${res.status}).`;
}

/** Downloads one JSON file with every document and all app data. */
export async function downloadServerBackup(): Promise<void> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`${base()}/api/admin/backup`, { credentials: 'include', timeoutMs: 120_000 });
  } catch {
    throw new Error('Could not reach the server.');
  }
  if (!res.ok) throw new Error(await errorOf(res));
  const disposition = res.headers.get('content-disposition') ?? '';
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `devdoc-studio-server-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const url = URL.createObjectURL(await res.blob());
  const a = window.document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Deletes all documents and app data on the server (users, sessions and
 * the session audit log are kept). `confirmation` must be RESET_CONFIRMATION. */
export async function resetServerData(confirmation: string): Promise<void> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`${base()}/api/admin/reset`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: confirmation }),
    });
  } catch {
    throw new Error('Could not reach the server.');
  }
  if (!res.ok) throw new Error(await errorOf(res));
}
