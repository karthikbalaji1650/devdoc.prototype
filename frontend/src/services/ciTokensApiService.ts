// CI tokens (DDS-SRS-026/027) on the server: /api/ci/tokens. Admins only.
// A token is returned once, when created; the server keeps only its hash.
import { fetchWithTimeout, type FetchWithTimeoutOptions } from './fetchWithTimeout';

export interface CiToken {
  id: string;
  name: string;
  /** The token's first characters, to tell tokens apart. */
  hint: string;
  createdBy: string;
  createdAt: string;
  lastUsedAt: string | null;
}

const base = () => `${(import.meta.env.VITE_API_BASE_URL as string).replace(/\/$/, '')}/api/ci/tokens`;

/** The API address pipelines should use. */
export const apiBaseUrl = () => (import.meta.env.VITE_API_BASE_URL as string).replace(/\/$/, '');

async function call<T>(path: string, init: FetchWithTimeoutOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`${base()}${path}`, {
      credentials: 'include',
      ...init,
      headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
    });
  } catch {
    throw new Error('Could not reach the server.');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : `Server error (${res.status}).`);
  return data as T;
}

export async function listCiTokens(): Promise<CiToken[]> {
  return (await call<{ tokens: CiToken[] }>('', { retries: 1 })).tokens;
}

export function createCiToken(name: string): Promise<{ token: string; record: CiToken }> {
  return call('', { method: 'POST', body: JSON.stringify({ name }) });
}

export function revokeCiToken(id: string): Promise<void> {
  return call(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** The pipeline commands for a suite (and, for `run`, a test server). */
export function pipelineCommands(suiteId: string, serverId?: string): { run?: string; upload: string } {
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
  return {
    ...(serverId ? { run: `ci/devdoc-ci.sh run ${q(suiteId)} ${q(serverId)}` } : {}),
    upload: `ci/devdoc-ci.sh upload ${q(suiteId)} results/output.xml`,
  };
}
