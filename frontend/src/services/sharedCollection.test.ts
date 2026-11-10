import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { API_BASE, installFakeCollectionsApi } from '../test/fakeCollectionsApi';
import { createSharedCollection } from './sharedCollection';

type Item = { id: string; title: string };
let api: ReturnType<typeof installFakeCollectionsApi>;
beforeEach(() => { api = installFakeCollectionsApi(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('createSharedCollection', () => {
  it('loads once, seeding sample data only on a never-seeded server', async () => {
    const c = createSharedCollection<Item>('notes', { seed: () => [{ id: 'a', title: 'Sample' }] });
    await Promise.all([c.load(), c.load()]);
    expect(c.items()).toEqual([{ id: 'a', title: 'Sample' }]);
    expect(c.status()).toBe('ready');
    const gets = api.fetchMock.mock.calls.filter(([, init]) => !init?.method || init.method === 'GET');
    expect(gets).toHaveLength(1);

    api.data.get('notes')!.clear(); // emptied later - but already seeded: stays empty
    const again = createSharedCollection<Item>('notes', { seed: () => [{ id: 'a', title: 'Sample' }] });
    await again.load();
    expect(again.items()).toEqual([]);
  });

  it('loads again after a failed load, e.g. one made before sign-in', async () => {
    api.data.set('notes', new Map([['a', { id: 'a', title: 'A' }]]));
    const c = createSharedCollection<Item>('notes');
    api.fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ error: 'Not signed in.' }), { status: 401 }));
    await c.load();
    expect(c.status()).toBe('error');
    await c.load();
    expect(c.status()).toBe('ready');
    expect(c.items()).toEqual([{ id: 'a', title: 'A' }]);
  });

  it('replaceAll sends only what changed, and notifies subscribers', async () => {
    const c = createSharedCollection<Item>('notes');
    await c.load();
    await c.replaceAll([{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]);
    const listener = vi.fn();
    c.subscribe(listener);
    api.fetchMock.mockClear();
    await c.replaceAll([{ id: 'a', title: 'A' }, { id: 'c', title: 'C' }]);
    const sent = api.fetchMock.mock.calls.map(([u, init]) => `${init?.method} ${String(u).replace(`${API_BASE}/api/collections/`, '')}`);
    expect(sent.sort()).toEqual(['DELETE notes/b', 'PUT notes/c']);
    expect(listener).toHaveBeenCalled();
  });

  it('a refused write reloads what the server holds and reports why', async () => {
    const c = createSharedCollection<Item>('notes');
    await c.load();
    api.fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ error: 'You can only edit a note you created.' }), { status: 403 }));
    await c.put({ id: 'x', title: 'X' });
    expect(c.error()).toBe('You can only edit a note you created.');
    expect(c.items()).toEqual([]);
  });

  it('without a backend it is unavailable and sends nothing', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    const c = createSharedCollection<Item>('notes');
    await c.load();
    await c.put({ id: 'x', title: 'X' });
    expect(c.status()).toBe('unavailable');
    expect(api.fetchMock).not.toHaveBeenCalled();
  });
});

describe('without a backend', () => {
  it('shows read-only demo items, stores nothing and refuses writes', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    const c = createSharedCollection<Item>('notes', { demo: () => [{ id: 'd', title: 'Demo' }] });
    await c.load();
    expect(c.items()).toEqual([{ id: 'd', title: 'Demo' }]);
    await c.replaceAll([]);
    expect(c.error()).toMatch(/stored on the server/);
    expect(localStorage.length).toBe(0);
  });
});
