// Connect existing code (DDS-SRS-030): /api/repos. The server clones each
// repository into the code editor's workspace (repos/<name>); an access
// token is sent once and stored encrypted. Throws with the server's message.
import { isBackendConfigured } from './backendAuthService';
import { fetchWithTimeout, type FetchWithTimeoutOptions } from './fetchWithTimeout';

export interface WorkspaceState { name: string; path: string; branch: string | null; commit: string | null; committedAt: string | null; subject: string | null; remote: string }
export interface ConnectedRepo {
  name: string; url: string; branch: string | null; username: string | null; tokenSet: boolean;
  connectedBy: string; connectedAt: string; pulledAt?: string;
  /** Null when the clone is missing from the workspace. */
  workspace: WorkspaceState | null;
}
export interface RepoInput { url: string; name?: string; branch?: string; username?: string; token?: string }

export { isBackendConfigured as isReposAvailable };

const base = () => `${(import.meta.env.VITE_API_BASE_URL as string).replace(/\/$/, '')}/api/repos`;

async function call<T>(path: string, init: FetchWithTimeoutOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`${base()}${path}`, { credentials: 'include', ...init, headers: init.body ? { 'Content-Type': 'application/json' } : undefined });
  } catch {
    throw new Error('Could not reach the server.');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : `Server error (${res.status}).`);
  return data as T;
}

export const listRepos = () => call<{ repos: ConnectedRepo[]; workspaceError: string | null; available: boolean }>('', { retries: 1 });
// Clones can take minutes; the server allows git 10 minutes.
export const connectRepo = (input: RepoInput) => call<{ repo: ConnectedRepo }>('', { method: 'POST', body: JSON.stringify(input), timeoutMs: 11 * 60_000 });
export const pullRepo = (name: string) => call<{ repo: ConnectedRepo }>(`/${encodeURIComponent(name)}/pull`, { method: 'POST', timeoutMs: 11 * 60_000 });
export const removeRepo = (name: string) => call<void>(`/${encodeURIComponent(name)}`, { method: 'DELETE' });
