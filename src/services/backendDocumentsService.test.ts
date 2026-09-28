import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeDoc } from '../test/fixtures';

vi.mock('./backendAuthService', () => ({ isBackendConfigured: vi.fn() }));
import { isBackendConfigured } from './backendAuthService';

async function load() {
  vi.resetModules();
  return import('./backendDocumentsService');
}

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:4000/');
});
afterEach(() => { fetchMock.mockReset(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.mocked(isBackendConfigured).mockReset(); });

describe('when no backend is configured', () => {
  it('every call is a no-op that never touches the network', async () => {
    vi.mocked(isBackendConfigured).mockReturnValue(false);
    const { fetchBackendDocuments, pushDocumentToBackend, deleteDocumentFromBackend } = await load();
    expect(await fetchBackendDocuments()).toEqual([]);
    expect(await pushDocumentToBackend(makeDoc('a'))).toBe(false);
    expect(await deleteDocumentFromBackend('a')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('fetchBackendDocuments', () => {
  beforeEach(() => vi.mocked(isBackendConfigured).mockReturnValue(true));

  it('returns the documents from the server', async () => {
    const doc = makeDoc('a');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ documents: [doc] }), { status: 200 }));
    const { fetchBackendDocuments } = await load();
    await expect(fetchBackendDocuments()).resolves.toEqual([doc]);
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:4000/api/documents');
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
  });

  it('returns an empty list rather than throwing on a server error or network failure', async () => {
    const { fetchBackendDocuments } = await load();
    fetchMock.mockResolvedValue(new Response('error', { status: 500 }));
    expect(await fetchBackendDocuments()).toEqual([]);
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await fetchBackendDocuments()).toEqual([]);
  });
});

describe('pushDocumentToBackend', () => {
  beforeEach(() => vi.mocked(isBackendConfigured).mockReturnValue(true));

  it('PUTs the document by id with the cookie included', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    const doc = makeDoc('doc-1');
    const { pushDocumentToBackend } = await load();
    expect(await pushDocumentToBackend(doc)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/documents/doc-1');
    expect(init.method).toBe('PUT');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body)).toEqual(doc);
  });

  it('returns false, not a throw, when the server rejects it or is unreachable', async () => {
    const { pushDocumentToBackend } = await load();
    fetchMock.mockResolvedValue(new Response('{}', { status: 403 }));
    expect(await pushDocumentToBackend(makeDoc('a'))).toBe(false);
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await pushDocumentToBackend(makeDoc('a'))).toBe(false);
  });

  it('does nothing for a document with no id', async () => {
    const { pushDocumentToBackend } = await load();
    expect(await pushDocumentToBackend(makeDoc(''))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('deleteDocumentFromBackend', () => {
  beforeEach(() => vi.mocked(isBackendConfigured).mockReturnValue(true));

  it('DELETEs by id', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const { deleteDocumentFromBackend } = await load();
    expect(await deleteDocumentFromBackend('doc-1')).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/documents/doc-1');
    expect(init.method).toBe('DELETE');
  });

  it('treats an already-gone document (404) as successfully deleted', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    const { deleteDocumentFromBackend } = await load();
    expect(await deleteDocumentFromBackend('doc-1')).toBe(true);
  });

  it('returns false on a permission error or network failure', async () => {
    const { deleteDocumentFromBackend } = await load();
    fetchMock.mockResolvedValue(new Response(null, { status: 403 }));
    expect(await deleteDocumentFromBackend('doc-1')).toBe(false);
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await deleteDocumentFromBackend('doc-1')).toBe(false);
  });
});
