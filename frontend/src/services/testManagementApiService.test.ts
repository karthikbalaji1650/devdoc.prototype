import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TestCaseItem, TestSuiteItem } from '../types/operations';
import {
  loadTestManagement, seedTestManagement, syncTestManagement, TestManagementApiError, type TestManagementData,
} from './testManagementApiService';

const API = 'http://localhost:4000/api/test-management';
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:4000/');
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({}), { status: 200 }));
});
afterEach(() => { fetchMock.mockReset(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function tc(id: string, title = id): TestCaseItem {
  return { id, suiteId: 's1', customId: id, title, preconditions: '', steps: [], expectedResult: '', priority: 'P2', type: 'Manual', createdAt: 'x' };
}
function suite(id: string, cases: TestCaseItem[] = [], title = id): TestSuiteItem {
  return { id, title, description: '', module: 'M', createdAt: 'x', sections: [], testCases: cases };
}
const data = (suites: TestSuiteItem[], extra: Partial<TestManagementData> = {}): TestManagementData =>
  ({ suites, runs: [], milestones: [], ...extra });

/** "METHOD path" for every request made, in order. */
function calls(): string[] {
  return fetchMock.mock.calls.map(([u, init]) => `${init?.method ?? 'GET'} ${String(u).replace(API, '')}`);
}

describe('loadTestManagement', () => {
  it('returns the snapshot, sending the session cookie', async () => {
    const body = { suites: [suite('s1')], runs: [], milestones: [], seeded: true };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 }));
    await expect(loadTestManagement()).resolves.toEqual(body);
    expect(fetchMock.mock.calls[0][0]).toBe(API);
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
  });

  it('throws the server message on an error', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Not signed in.' }), { status: 401 }));
    await expect(loadTestManagement()).rejects.toMatchObject({ message: 'Not signed in.', status: 401 });
  });

  it('throws a readable error when the server is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(loadTestManagement()).rejects.toThrow('Could not reach the server.');
  });
});

describe('seedTestManagement', () => {
  it('treats "already seeded" (409) as success and returns the server state', async () => {
    const snapshot = { suites: [], runs: [], milestones: [], seeded: true };
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'already' }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(snapshot), { status: 200 }));
    await expect(seedTestManagement(data([]))).resolves.toEqual(snapshot);
    expect(calls()).toEqual(['POST /seed', 'GET ']);
  });
});

describe('syncTestManagement', () => {
  it('sends nothing when nothing changed', async () => {
    const state = data([suite('s1', [tc('c1')])]);
    expect(await syncTestManagement(state, structuredClone(state))).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('saves only the changed case, not the whole suite', async () => {
    const before = data([suite('s1', [tc('c1'), tc('c2')])]);
    const after = data([suite('s1', [tc('c1'), tc('c2', 'Edited')])]);
    await syncTestManagement(before, after);
    expect(calls()).toEqual(['PUT /suites/s1/cases/c2']);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).title).toBe('Edited');
  });

  it('saves a suite without its nested sections and cases', async () => {
    await syncTestManagement(data([]), data([suite('s1', [tc('c1')])]));
    expect(calls()).toEqual(['PUT /suites/s1', 'PUT /suites/s1/cases/c1']); // suite first
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).not.toHaveProperty('testCases');
    expect(body).not.toHaveProperty('sections');
  });

  it('a deleted suite is one request: the server removes its cases', async () => {
    await syncTestManagement(data([suite('s1', [tc('c1'), tc('c2')])]), data([]));
    expect(calls()).toEqual(['DELETE /suites/s1']);
  });

  it('syncs removed cases, runs and milestones', async () => {
    const run = { id: 'r1', name: 'R', suiteId: 's1', environment: 'e', status: 'Completed' as const, passedCount: 0, failedCount: 0, blockedCount: 0, executedAt: 'x' };
    const ms = { id: 'm1', name: 'M', status: 'open' as const, passedCount: 0, failedCount: 0, blockedCount: 0, untestedCount: 0, totalCount: 0, testRunIds: [] };
    await syncTestManagement(
      data([suite('s1', [tc('c1')])], { milestones: [ms] }),
      data([suite('s1', [])], { runs: [run] }),
    );
    expect(calls().sort()).toEqual(['DELETE /milestones/m1', 'DELETE /suites/s1/cases/c1', 'PUT /runs/r1']);
  });

  it('keeps going after a failure and reports every error', async () => {
    fetchMock.mockImplementation(async (u: string) =>
      u.endsWith('/c1')
        ? new Response(JSON.stringify({ error: 'You can only edit test cases of test suites you created.' }), { status: 403 })
        : new Response('{}', { status: 200 }));
    const errors = await syncTestManagement(data([suite('s1')]), data([suite('s1', [tc('c1'), tc('c2')])]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(TestManagementApiError);
    expect(errors[0]).toMatchObject({ status: 403, message: 'You can only edit test cases of test suites you created.' });
  });

  it('url-encodes ids', async () => {
    await syncTestManagement(data([]), data([suite('a/b c')]));
    expect(calls()).toEqual(['PUT /suites/a%2Fb%20c']);
  });
});
