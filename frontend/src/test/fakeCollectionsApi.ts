// An in-memory stand-in for the server's /api/collections routes
// (backend app/services/collections.py), for unit tests of services built
// on sharedCollection.ts. Mirrors the rules that matter to the client:
// insertion order, 50-entry append-only drive-exports, seed once.
import { vi } from 'vitest';

export const API_BASE = 'http://api.test';

export function installFakeCollectionsApi() {
  const data = new Map<string, Map<string, Record<string, unknown>>>();
  const seeded = new Set<string>();
  const coll = (name: string) => { if (!data.has(name)) data.set(name, new Map()); return data.get(name)!; };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = url.replace(`${API_BASE}/api/collections/`, '').split('/').map(decodeURIComponent);
    const [name, second] = path;
    const method = init.method ?? 'GET';
    const items = coll(name);
    if (method === 'GET') return json({ items: [...items.values()], seeded: seeded.has(name) });
    if (method === 'POST' && second === 'seed') {
      if (seeded.has(name)) return json({ error: 'already' }, 409);
      seeded.add(name);
      for (const item of JSON.parse(String(init.body)).items) items.set(item.id, item);
      return json({ items: [...items.values()], seeded: true });
    }
    if (method === 'PUT') {
      if (name === 'drive-exports' && items.has(second)) return json({ error: 'append only' }, 409);
      if (name === 'drive-exports' && items.size >= 50) items.delete(items.keys().next().value!);
      const item = { ...JSON.parse(String(init.body)), id: second };
      items.set(second, item);
      return json({ item });
    }
    if (method === 'DELETE') {
      return items.delete(second) ? new Response(null, { status: 204 }) : json({ error: 'Item not found.' }, 404);
    }
    return json({ error: 'unexpected' }, 500);
  });

  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VITE_API_BASE_URL', API_BASE);
  return { fetchMock, data };
}
