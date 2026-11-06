import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkTestServer, deleteTestServer, listTestServers, saveTestServer, type TestServerInput } from './testServersApiService';

const API = 'http://localhost:4000/api/test-servers';
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:4000/');
});
afterEach(() => { fetchMock.mockReset(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const input: TestServerInput = {
  name: 'Lab PC', endpointUrl: 'https://pc.example.com/api', authType: 'apiKey',
  auth: { headerName: 'X-API-Key', apiKey: 'k' }, payload: { bmcIp: '10.0.0.5' }, pollIntervalSeconds: 10,
};

describe('testServersApiService', () => {
  it('lists servers with the session cookie', async () => {
    fetchMock.mockResolvedValueOnce(json({ servers: [], secretsAvailable: true }));
    await expect(listTestServers()).resolves.toEqual({ servers: [], secretsAvailable: true });
    expect(fetchMock.mock.calls[0][0]).toBe(API);
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
  });

  it('creates with POST and updates with PUT, sending JSON', async () => {
    fetchMock.mockImplementation(async () => json({ server: { id: 'a', name: 'Lab PC', endpointUrl: input.endpointUrl } }));
    await saveTestServer(input);
    await saveTestServer(input, 'a b');
    const [[u1, i1], [u2, i2]] = fetchMock.mock.calls;
    expect([i1.method, u1]).toEqual(['POST', API]);
    expect([i2.method, u2]).toEqual(['PUT', `${API}/a%20b`]);
    expect(i1.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(i1.body)).toEqual(input);
  });

  it('deletes and checks', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(deleteTestServer('a')).resolves.toBeUndefined();
    const result = { ok: true, status: 200, latencyMs: 12, error: null };
    fetchMock.mockResolvedValueOnce(json(result));
    await expect(checkTestServer('a')).resolves.toEqual(result);
    expect(fetchMock.mock.calls[1][0]).toBe(`${API}/a/check`);
    expect(fetchMock.mock.calls[1][1].method).toBe('POST');
  });

  it('throws the server message on an error', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'The server has no SECRETS_KEY set.' }, 503));
    await expect(saveTestServer(input)).rejects.toThrow('The server has no SECRETS_KEY set.');
  });

  it('reports an unreachable server', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(saveTestServer(input)).rejects.toThrow('Could not reach the server.');
  });
});
