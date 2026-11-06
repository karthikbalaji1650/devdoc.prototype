// Remote test execution servers (DDS-SRS-019) on the server: /api/test-servers.
// Credentials are sent once and stored encrypted (DDS-SRS-075); the server
// never returns them, only whether one is set. Admins manage servers.
// Every call throws with the server's message on failure.
import { isBackendConfigured } from './backendAuthService';
import { fetchWithTimeout, type FetchWithTimeoutOptions } from './fetchWithTimeout';

export type TestServerAuthType = 'none' | 'apiKey' | 'basic' | 'oauth2';
export const AUTH_TYPE_LABELS: Record<TestServerAuthType, string> = {
  none: 'None',
  apiKey: 'API key',
  basic: 'Basic (username / password)',
  oauth2: 'OAuth2 client credentials',
};
/** The one secret field each auth method has. */
export const SECRET_FIELD: Partial<Record<TestServerAuthType, 'apiKey' | 'password' | 'clientSecret'>> = {
  apiKey: 'apiKey',
  basic: 'password',
  oauth2: 'clientSecret',
};

export interface TestServerAuth {
  headerName?: string;
  username?: string;
  tokenUrl?: string;
  clientId?: string;
  scope?: string | null;
}

export interface TestServer {
  id: string;
  name: string;
  endpointUrl: string;
  /** The fields below are only sent to admins. */
  authType?: TestServerAuthType;
  auth?: TestServerAuth;
  payload?: Record<string, unknown>;
  secretSet?: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface TestServerInput {
  name: string;
  endpointUrl: string;
  authType: TestServerAuthType;
  /** Include the secret field only to set or replace it. */
  auth: TestServerAuth & { apiKey?: string; password?: string; clientSecret?: string };
  payload: Record<string, unknown>;
}

export interface ConnectionCheck { ok: boolean; status: number | null; latencyMs: number | null; error: string | null }

export { isBackendConfigured as isTestServersAvailable };

const base = () => `${(import.meta.env.VITE_API_BASE_URL as string).replace(/\/$/, '')}/api/test-servers`;

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

export function listTestServers(): Promise<{ servers: TestServer[]; secretsAvailable: boolean }> {
  return call('', { retries: 1 });
}

export async function saveTestServer(input: TestServerInput, id?: string): Promise<TestServer> {
  const data = await call<{ server: TestServer }>(id ? `/${encodeURIComponent(id)}` : '', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(input),
  });
  return data.server;
}

export function deleteTestServer(id: string): Promise<void> {
  return call(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function checkTestServer(id: string): Promise<ConnectionCheck> {
  return call(`/${encodeURIComponent(id)}/check`, { method: 'POST', timeoutMs: 30_000 });
}
