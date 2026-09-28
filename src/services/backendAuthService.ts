// Talks to the optional API in server/ for real, server-checked sign-in.
// The app runs perfectly well without it (see authService.ts) — this is
// only used when VITE_API_BASE_URL is set at build time, e.g. when the
// docker-compose `api` service is deployed alongside the frontend.
import type { UserProfile } from '../types/auth';

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
  const res = await fetch(`${baseUrl()}/api/auth/login`, {
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
    await fetch(`${baseUrl()}/api/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch {
    // offline or the API is unreachable — nothing more to do here
  }
}
