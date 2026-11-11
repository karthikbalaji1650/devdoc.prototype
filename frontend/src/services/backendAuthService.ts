// Talks to the optional API in server/ for real, server-checked sign-in.
// The app runs perfectly well without it (see authService.ts) — this is
// only used when VITE_API_BASE_URL is set at build time, e.g. when the
// docker-compose `api` service is deployed alongside the frontend.
import type { UserProfile } from '../types/auth';
import { fetchWithTimeout } from './fetchWithTimeout';

export function isBackendConfigured(): boolean {
  return Boolean(import.meta.env.VITE_API_BASE_URL);
}

function baseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL as string).replace(/\/$/, '');
}

interface BackendUser {
  id: string;
  name: string;
  email: string;
  title: string | null;
  department: string | null;
  role: string;
  avatarBg: string | null;
  initials: string | null;
}

function toProfile(user: BackendUser): UserProfile {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    title: user.title ?? '',
    department: user.department ?? '',
    role: user.role as UserProfile['role'],
    avatarBg: user.avatarBg ?? 'from-blue-600 to-indigo-600',
    initials: user.initials ?? user.name.slice(0, 2).toUpperCase(),
  };
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return typeof body?.error === 'string' ? body.error : `Sign-in failed (${res.status}).`;
  } catch {
    return `Sign-in failed (${res.status}).`;
  }
}

/** Throws with the server's own message (invalid credentials, network
 * failure, ...) — the caller shows it as-is. */
export async function loginWithBackend(email: string, password: string): Promise<UserProfile> {
  const res = await fetchWithTimeout(`${baseUrl()}/api/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const { user } = await res.json();
  return toProfile(user);
}

/** Best-effort: the local session is cleared either way by authService.logout(). */
export async function logoutBackend(): Promise<void> {
  try {
    await fetchWithTimeout(`${baseUrl()}/api/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch {
    // offline or the API is unreachable — nothing more to do here
  }
}

// ── single sign-on and JWT access tokens (DDS-SRS-076) ──────────────────

export interface SsoConfig { enabled: boolean; providerName: string | null }

export async function fetchSsoConfig(): Promise<SsoConfig> {
  try {
    const res = await fetchWithTimeout(`${baseUrl()}/api/auth/sso/config`, { retries: 1 });
    return res.ok ? await res.json() : { enabled: false, providerName: null };
  } catch {
    return { enabled: false, providerName: null };
  }
}

/** The browser goes here to sign in with the provider; it comes back with ?sso=1 or ?sso_error=. */
export const ssoLoginUrl = () => `${baseUrl()}/api/auth/sso/login`;

/** The user of the session cookie, after an SSO sign-in sets it. */
export async function fetchBackendUser(): Promise<UserProfile> {
  const res = await fetchWithTimeout(`${baseUrl()}/api/auth/me`, { credentials: 'include' });
  if (!res.ok) throw new Error(await readError(res));
  return toProfile((await res.json()).user);
}

/** Whether the server still has this browser's session. The app keeps the
 * signed-in user in localStorage, but the server's session ends after 12
 * hours (or when it is signed out elsewhere). 'signed-out' only on a 401:
 * an unreachable server or any other error gives 'unknown', so a network
 * blip never signs anyone out. */
export async function checkBackendSession(): Promise<'valid' | 'signed-out' | 'unknown'> {
  try {
    const res = await fetchWithTimeout(`${baseUrl()}/api/auth/me`, { credentials: 'include', retries: 1 });
    if (res.ok) return 'valid';
    return res.status === 401 ? 'signed-out' : 'unknown';
  } catch {
    return 'unknown';
  }
}

export interface AccessToken { accessToken: string; tokenType: 'Bearer'; expiresIn: number }

/** A JWT for scripts and tools: valid for an hour, and only while this session is. */
export async function createAccessToken(): Promise<AccessToken> {
  const res = await fetchWithTimeout(`${baseUrl()}/api/auth/token`, { method: 'POST', credentials: 'include' });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}
