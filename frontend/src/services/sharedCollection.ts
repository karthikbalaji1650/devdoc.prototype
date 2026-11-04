// A shared collection on the server (/api/collections/{name}, Redis): data
// that used to live in each browser's localStorage - libraries, logs - now
// one copy for every user. Server-only: nothing is written to the browser.
//
// The collection is loaded once into memory, so screens keep reading it
// synchronously (`items()`), and `useSharedCollection` re-renders them
// when it loads or changes. Writes update memory at once and go to the
// server; if the server refuses one, the collection reloads what the
// server holds and `error()` says why.
import { useEffect, useSyncExternalStore } from 'react';
import { isBackendConfigured } from './backendAuthService';
import { fetchWithTimeout } from './fetchWithTimeout';

export type CollectionStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unavailable';

export interface SharedCollection<T extends { id: string }> {
  readonly name: string;
  /** Loads from the server once (later calls reuse it); `force` reloads. */
  load(force?: boolean): Promise<void>;
  items(): T[];
  status(): CollectionStatus;
  /** The last load or save error, or ''. */
  error(): string;
  put(item: T): Promise<void>;
  remove(id: string): Promise<void>;
  /** Saves the difference between the current items and `next`. */
  replaceAll(next: T[]): Promise<void>;
  subscribe(listener: () => void): () => void;
}

class CollectionError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

async function call<R>(method: string, path: string, body?: unknown): Promise<R | null> {
  const base = (import.meta.env.VITE_API_BASE_URL as string).replace(/\/$/, '');
  let res: Response;
  try {
    res = await fetchWithTimeout(`${base}/api/collections/${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      retries: method === 'GET' ? 1 : 0,
    });
  } catch {
    throw new CollectionError('Could not reach the server.');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new CollectionError(typeof data?.error === 'string' ? data.error : `Server error (${res.status}).`, res.status);
  }
  return res.status === 204 ? null : ((await res.json()) as R);
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

export function createSharedCollection<T extends { id: string }>(
  name: string,
  /** seed: sample data loaded once into a new server's collection.
   * demo: read-only items shown when the app runs without a backend
   * (the browser-only demo) - never stored anywhere; writes are refused. */
  opts: { seed?: () => T[]; demo?: () => T[] } = {},
): SharedCollection<T> {
  let items: T[] = [];
  let status: CollectionStatus = 'idle';
  let error = '';
  let loading: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const notify = () => { for (const l of listeners) l(); };
  const enc = encodeURIComponent;

  const fetchAll = async () => {
    let data = await call<{ items: T[]; seeded: boolean }>('GET', enc(name));
    if (data && !data.seeded && !data.items.length && opts.seed) {
      try {
        data = await call<{ items: T[]; seeded: boolean }>('POST', `${enc(name)}/seed`, { items: opts.seed() });
      } catch (err) {
        if (!(err instanceof CollectionError && err.status === 409)) throw err; // someone else seeded it
        data = await call<{ items: T[]; seeded: boolean }>('GET', enc(name));
      }
    }
    items = Array.isArray(data?.items) ? data.items : [];
  };

  const load = (force = false): Promise<void> => {
    if (!isBackendConfigured()) {
      if (status !== 'unavailable') { status = 'unavailable'; items = opts.demo?.() ?? []; notify(); }
      return Promise.resolve();
    }
    if (loading && !force) return loading;
    status = 'loading';
    notify();
    loading = fetchAll()
      .then(() => { status = 'ready'; })
      .catch((err: unknown) => { status = 'error'; error = err instanceof Error ? err.message : String(err); })
      .finally(notify);
    return loading;
  };

  /** Runs a write; on failure shows the server's state and its reason. */
  const write = async (op: () => Promise<unknown>) => {
    try {
      await op();
      if (error) { error = ''; notify(); }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      await load(true);
      status = 'ready';
      notify();
    }
  };

  const replaceAll = async (next: T[]) => {
    if (!isBackendConfigured()) {
      error = 'This is stored on the server: run the app with VITE_API_BASE_URL set.';
      status = 'unavailable';
      notify();
      return;
    }
    const before = new Map(items.map((i) => [i.id, i]));
    const after = new Map(next.map((i) => [i.id, i]));
    items = next;
    notify();
    const ops: (() => Promise<unknown>)[] = [];
    for (const [id, item] of after) if (!before.has(id) || !same(before.get(id), item)) ops.push(() => call('PUT', `${enc(name)}/${enc(id)}`, item));
    for (const id of before.keys()) if (!after.has(id)) ops.push(() => call('DELETE', `${enc(name)}/${enc(id)}`));
    await write(async () => { for (const op of ops) await op(); });
  };

  return {
    name,
    load,
    items: () => items,
    status: () => status,
    error: () => error,
    // Loaded first, so the change is made against what the server holds.
    put: async (item) => {
      await load();
      return replaceAll(items.some((i) => i.id === item.id) ? items.map((i) => (i.id === item.id ? item : i)) : [...items, item]);
    },
    remove: async (id) => {
      await load();
      return replaceAll(items.filter((i) => i.id !== id));
    },
    replaceAll,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

/** The collection's items, loading it on first use and re-rendering on change. */
export function useSharedCollection<T extends { id: string }>(collection: SharedCollection<T>) {
  const items = useSyncExternalStore(collection.subscribe, collection.items);
  const status = useSyncExternalStore(collection.subscribe, collection.status);
  const error = useSyncExternalStore(collection.subscribe, collection.error);
  useEffect(() => { void collection.load(); }, [collection]);
  return { items, status, error };
}
