// The session audit log (DDS-SRS-011) is recorded by the server at every
// sign-in and sign-out, for every user on every machine - not kept in this
// browser. Admins only; see backend app/routers/audit.py.
import { isBackendConfigured } from './backendAuthService';
import { fetchWithTimeout } from './fetchWithTimeout';

export interface SessionAuditEntry {
  id: string;
  userId: string;
  userName: string;
  role: string;
  loginTime: string;
  logoutTime: string | null;
  expiresAt: string;
  status: 'active' | 'signed-out' | 'expired';
}

export { isBackendConfigured as isSessionAuditAvailable };

/** Newest first. Throws with the server's message (e.g. not an admin). */
export async function fetchSessionAudit(): Promise<SessionAuditEntry[]> {
  const base = (import.meta.env.VITE_API_BASE_URL as string).replace(/\/$/, '');
  let res: Response;
  try {
    res = await fetchWithTimeout(`${base}/api/audit/sessions`, { credentials: 'include', retries: 1 });
  } catch {
    throw new Error('Could not reach the server.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : `Server error (${res.status}).`);
  return Array.isArray(data?.sessions) ? data.sessions : [];
}
