// Jira / GitHub connections for release blockers (DDS-SRS-044): /api/trackers.
// Tokens are sent once and stored encrypted; the server never returns them.
import { fetchWithTimeout, type FetchWithTimeoutOptions } from './fetchWithTimeout';

export interface JiraConnection { kind: 'jira'; baseUrl: string; deployment: 'cloud' | 'server'; email?: string; tokenSet: boolean; updatedBy: string; updatedAt: string }
export interface GithubConnection { kind: 'github'; apiUrl: string; tokenSet: boolean; updatedBy: string; updatedAt: string }
export interface TrackersConfig {
  jira: JiraConnection | null;
  github: GithubConnection | null;
  /** Admins only. */
  secretsAvailable?: boolean;
  /** Non-admins: whether each is connected. */
  jiraConfigured?: boolean;
  githubConfigured?: boolean;
}

const base = () => `${(import.meta.env.VITE_API_BASE_URL as string).replace(/\/$/, '')}/api/trackers`;

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

export const loadTrackers = () => call<TrackersConfig>('', { retries: 1 });
export const saveTracker = (kind: 'jira' | 'github', body: Record<string, unknown>) => call<{ tracker: unknown }>(`/${kind}`, { method: 'PUT', body: JSON.stringify(body) });
export const disconnectTracker = (kind: 'jira' | 'github') => call<void>(`/${kind}`, { method: 'DELETE' });
export const checkTracker = (kind: 'jira' | 'github') => call<{ ok: boolean; account?: string; error?: string }>(`/${kind}/check`, { method: 'POST', timeoutMs: 30_000 });

/** Whether each tracker is connected, for admins and everyone else alike. */
export function connected(config: TrackersConfig | null): { jira: boolean; github: boolean } {
  return { jira: Boolean(config?.jira ?? config?.jiraConfigured), github: Boolean(config?.github ?? config?.githubConfigured) };
}
