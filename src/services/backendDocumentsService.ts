// Talks to the optional API in server/ so documents can be shared
// across users and devices instead of living only in this browser.
// Every call here fails soft (never throws to the caller) so a
// missing or unreachable API degrades to "stays local-only", not a
// broken app — see documentsStoreService.ts for how these are used.
import type { DocumentModel } from '../types/document';
import { isBackendConfigured } from './backendAuthService';

function baseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL as string).replace(/\/$/, '');
}

export async function fetchBackendDocuments(): Promise<DocumentModel[]> {
  if (!isBackendConfigured()) return [];
  try {
    const res = await fetch(`${baseUrl()}/api/documents`, { credentials: 'include' });
    if (!res.ok) return [];
    const { documents } = await res.json();
    return Array.isArray(documents) ? documents : [];
  } catch {
    return [];
  }
}

/** Returns whether it actually reached the server and was accepted;
 * the local save this backs onto has already happened either way. */
export async function pushDocumentToBackend(doc: DocumentModel): Promise<boolean> {
  if (!isBackendConfigured() || !doc?.metadata?.id) return false;
  try {
    const res = await fetch(`${baseUrl()}/api/documents/${encodeURIComponent(doc.metadata.id)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteDocumentFromBackend(id: string): Promise<boolean> {
  if (!isBackendConfigured() || !id) return false;
  try {
    const res = await fetch(`${baseUrl()}/api/documents/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    return res.ok || res.status === 404; // already gone counts as deleted
  } catch {
    return false;
  }
}
