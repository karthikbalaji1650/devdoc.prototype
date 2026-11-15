// People search for pickers: GET /api/users?q= (any signed-in user).
// Only what a picker shows comes back: id, name, title and department.
import { fetchWithTimeout } from './fetchWithTimeout';

export interface PersonOption { id: string; name: string; title: string | null; department: string | null }

export async function searchUsers(query: string): Promise<PersonOption[]> {
  const base = (import.meta.env.VITE_API_BASE_URL as string).replace(/\/$/, '');
  let res: Response;
  try {
    res = await fetchWithTimeout(`${base}/api/users?q=${encodeURIComponent(query)}`, { credentials: 'include', retries: 1 });
  } catch {
    throw new Error('Could not reach the server.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : `Server error (${res.status}).`);
  return (data as { users: PersonOption[] }).users;
}

/** "Technical lead · SW engineering", or nothing if neither is known. */
export const describePerson = (p: { title: string | null; department: string | null }): string =>
  [p.title, p.department].filter(Boolean).join(' · ');
