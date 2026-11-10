import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TestSuiteItem } from '../types/operations';

async function load() {
  vi.resetModules();
  return import('./remoteExecutionService');
}

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:4000/');
});
afterEach(() => { fetchMock.mockReset(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const suite: TestSuiteItem = {
  id: 's1', title: 'RTC Suite', description: '', module: 'Firmware', createdAt: '2026-01-01',
  testCases: [{
    id: 'tc-1', suiteId: 's1', customId: 'TC-001', title: 'Drift check', preconditions: '', steps: [],
    expectedResult: 'OK', priority: 'High', type: 'Automated', createdAt: '2026-01-01',
  }],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe('isRemoteExecutionConfigured', () => {
  it('tracks VITE_API_BASE_URL, same as the rest of the optional backend', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    const { isRemoteExecutionConfigured } = await load();
    expect(isRemoteExecutionConfigured()).toBe(false);
  });

  it('is true once VITE_API_BASE_URL is set', async () => {
    const { isRemoteExecutionConfigured } = await load();
    expect(isRemoteExecutionConfigured()).toBe(true);
  });
});

describe('pushScript', () => {
  it('posts the assembled robot text to /api/test-exec/scripts', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const { pushScript } = await load();
    await pushScript(suite);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/test-exec/scripts');
    const body = JSON.parse(init.body);
    expect(body.suiteId).toBe('s1');
    expect(body.suiteTitle).toBe('RTC Suite');
    expect(body.robotCode).toContain('TC-001');
  });

  it('throws the server\'s own error message on failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'robotCode is required.' }, 400));
    const { pushScript } = await load();
    await expect(pushScript(suite)).rejects.toThrow('robotCode is required.');
  });
});

describe('startRun', () => {
  it('posts suiteId and returns the jobId', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ jobId: 'job-123' }));
    const { startRun } = await load();
    await expect(startRun('s1')).resolves.toBe('job-123');
  });
});

describe('pollRunStatus', () => {
  it('returns running while the mock job is still in progress', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'running' }));
    const { pollRunStatus } = await load();
    await expect(pollRunStatus('job-123')).resolves.toEqual({ status: 'running' });
  });

  it('returns results once completed', async () => {
    const results = { _schema: 'devdoc-robot-results-v1', suiteTitle: 'RTC Suite', executedAt: '2026-01-01', environment: 'Mock', summary: { total: 1, passed: 1, failed: 0, skipped: 0 }, results: [] };
    fetchMock.mockResolvedValue(jsonResponse({ status: 'completed', results }));
    const { pollRunStatus } = await load();
    await expect(pollRunStatus('job-123')).resolves.toEqual({ status: 'completed', results });
  });
});

describe('runRemoteExecution', () => {
  it('pushes, starts, polls (on the injected short interval), and reports completion', async () => {
    const results = { _schema: 'devdoc-robot-results-v1', suiteTitle: 'RTC Suite', executedAt: '2026-01-01', environment: 'Mock', summary: { total: 1, passed: 1, failed: 0, skipped: 0 }, results: [] };
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ok: true })) // push
      .mockResolvedValueOnce(jsonResponse({ jobId: 'job-123' })) // start
      .mockResolvedValueOnce(jsonResponse({ status: 'running' })) // first poll
      .mockResolvedValueOnce(jsonResponse({ status: 'completed', results })); // second poll

    const { runRemoteExecution } = await load();
    const updates: unknown[] = [];
    await runRemoteExecution(suite, (u) => updates.push(u), { pollIntervalMs: 1 });

    expect(updates[0]).toEqual({ state: 'running' });
    expect(updates[1]).toEqual({ state: 'completed', results });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('passes the run id and reports polled progress from the server', async () => {
    const progress = { total: 4, completed: 2, passed: 2, failed: 0, percent: 50 };
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ jobId: 'job-9' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'running', phase: 'RUNNING', server: 'Lab PC', progress }))
      .mockResolvedValueOnce(jsonResponse({ status: 'failed', phase: 'FAILED', error: 'stopped' }));

    const { runRemoteExecution } = await load();
    const updates: unknown[] = [];
    await runRemoteExecution(suite, (u) => updates.push(u), { pollIntervalMs: 1, serverId: 'srv-1', runId: 'run-7' });

    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ suiteId: 's1', serverId: 'srv-1', runId: 'run-7' });
    expect(updates).toEqual([
      { state: 'running' },
      { state: 'running', phase: 'RUNNING', progress, pollError: undefined },
      { state: 'error', message: 'stopped' },
    ]);
  });

  it('sends the run to a registered test server and reports its failure', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ok: true })) // push
      .mockResolvedValueOnce(jsonResponse({ jobId: 'job-9' })) // start
      .mockResolvedValueOnce(jsonResponse({ status: 'failed', error: 'BMC unreachable' }));

    const { runRemoteExecution } = await load();
    const updates: unknown[] = [];
    await runRemoteExecution(suite, (u) => updates.push(u), { pollIntervalMs: 1, serverId: 'srv-1' });

    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ suiteId: 's1', serverId: 'srv-1' });
    expect(updates).toEqual([{ state: 'running' }, { state: 'error', message: 'BMC unreachable' }]);
  });

  it('reports a failure via onUpdate instead of throwing, if pushing the script fails', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'suiteId is required.' }, 400));
    const { runRemoteExecution } = await load();
    const updates: unknown[] = [];
    await runRemoteExecution(suite, (u) => updates.push(u), { pollIntervalMs: 1 });

    expect(updates).toEqual([{ state: 'error', message: 'suiteId is required.' }]);
  });
});

describe('live updates (DDS-SRS-022)', () => {
  class FakeEventSource {
    static last: FakeEventSource | null = null;
    listeners: Record<string, ((e: { data: string }) => void)[]> = {};
    onerror: (() => void) | null = null;
    closed = false;
    url: string;
    init: { withCredentials?: boolean };
    constructor(url: string, init: { withCredentials?: boolean }) { this.url = url; this.init = init; FakeEventSource.last = this; }
    addEventListener(type: string, fn: (e: { data: string }) => void) { (this.listeners[type] ??= []).push(fn); }
    emit(data: unknown) { for (const fn of this.listeners.status ?? []) fn({ data: JSON.stringify(data) }); }
    close() { this.closed = true; }
  }
  beforeEach(() => { FakeEventSource.last = null; vi.stubGlobal('EventSource', FakeEventSource); });

  const started = () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ jobId: 'job 9' }));
  };
  const opened = async () => { await vi.waitFor(() => expect(FakeEventSource.last).not.toBeNull()); return FakeEventSource.last!; };

  it('follows pushed status events, with no polling', async () => {
    started();
    const { runRemoteExecution } = await load();
    const updates: unknown[] = [];
    const done = runRemoteExecution(suite, (u) => updates.push(u), { serverId: 'srv-1' });
    const source = await opened();
    expect(source.url).toBe('http://localhost:4000/api/test-exec/runs/job%209/events');
    expect(source.init.withCredentials).toBe(true);

    const progress = { total: 2, completed: 1, passed: 1, failed: 0, percent: 50 };
    source.emit({ status: 'running', phase: 'RUNNING', progress });
    const results = { _schema: 'devdoc-robot-results-v1', suiteTitle: 'RTC Suite', executedAt: 'x', environment: 'Lab PC', summary: { total: 2, passed: 2, failed: 0, skipped: 0 }, results: [] };
    source.emit({ status: 'completed', phase: 'COMPLETED', results });
    await done;

    expect(updates).toEqual([
      { state: 'running' },
      { state: 'running', phase: 'RUNNING', progress, pollError: undefined },
      { state: 'completed', results },
    ]);
    expect(source.closed).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2); // push + start only
  });

  it('falls back to polling if the stream drops', async () => {
    started();
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'failed', phase: 'FAILED', error: 'stopped' }));
    const { runRemoteExecution } = await load();
    const updates: unknown[] = [];
    const done = runRemoteExecution(suite, (u) => updates.push(u), { serverId: 'srv-1', pollIntervalMs: 1 });
    const source = await opened();
    source.onerror!();
    await done;
    expect(source.closed).toBe(true);
    expect(fetchMock.mock.calls[2][0]).toBe('http://localhost:4000/api/test-exec/runs/job 9');
    expect(updates).toEqual([{ state: 'running' }, { state: 'error', message: 'stopped' }]);
  });

  it('runs on the simulated Test PC keep polling', async () => {
    started();
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'failed', error: 'x' }));
    const { runRemoteExecution } = await load();
    await runRemoteExecution(suite, () => {}, { pollIntervalMs: 1 });
    expect(FakeEventSource.last).toBeNull();
  });
});
