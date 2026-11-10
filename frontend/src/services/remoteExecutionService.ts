// Talks to the remote test execution backend: push a suite's Robot
// script, start a run, poll for results. With a serverId the backend sends
// the run to that registered test server (DDS-SRS-020, see
// docs/test-pc-api.md); without one it uses its mock Test PC. Same
// optional, VITE_API_BASE_URL-gated pattern as the rest of the backend.
import type { RemoteRunProgress, RemoteRunState, TestSuiteItem } from '../types/operations';
import { isBackendConfigured } from './backendAuthService';
import { fetchWithTimeout } from './fetchWithTimeout';
import { buildRobotSuiteText } from './robotSuiteBuilder';

export const isRemoteExecutionConfigured = isBackendConfigured;

function baseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL as string).replace(/\/$/, '');
}

interface RobotResultEntry {
  customId: string;
  title: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  elapsedTimeMs: number;
  failureMessage?: string;
}

export interface RobotResultsJson {
  _schema: 'devdoc-robot-results-v1';
  suiteTitle: string;
  executedAt: string;
  environment: string;
  summary: { total: number; passed: number; failed: number; skipped: number };
  results: RobotResultEntry[];
}

async function errorFromResponse(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => ({}));
  return new Error(body.error || `${fallback} (status ${response.status}).`);
}

export async function pushScript(suite: TestSuiteItem): Promise<void> {
  const robotCode = buildRobotSuiteText(suite);
  const response = await fetchWithTimeout(`${baseUrl()}/api/test-exec/scripts`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ suiteId: suite.id, suiteTitle: suite.title, robotCode }),
    timeoutMs: 20_000,
  });
  if (!response.ok) throw await errorFromResponse(response, 'Failed to push the script');
}

export async function startRun(suiteId: string, serverId?: string, runId?: string): Promise<string> {
  const response = await fetchWithTimeout(`${baseUrl()}/api/test-exec/runs`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(serverId ? { suiteId, serverId, ...(runId ? { runId } : {}) } : { suiteId }),
    timeoutMs: 20_000,
  });
  if (!response.ok) throw await errorFromResponse(response, 'Failed to start the run');
  const data = await response.json();
  return data.jobId;
}

/** Remote runs also carry what the server's background worker last polled
 * (DDS-SRS-021): phase, progress and any retried check failure. */
interface RemoteFields { phase?: RemoteRunState['phase']; server?: string; progress?: RemoteRunProgress; pollError?: string }
export type RunPollResult = RemoteFields & (
  | { status: 'running' }
  | { status: 'completed'; results: RobotResultsJson }
  | { status: 'failed'; error: string });

export async function pollRunStatus(jobId: string): Promise<RunPollResult> {
  const response = await fetchWithTimeout(`${baseUrl()}/api/test-exec/runs/${jobId}`, {
    credentials: 'include',
    retries: 1, // idempotent read, safe to retry unlike the writes above
    timeoutMs: 20_000,
  });
  if (!response.ok) throw await errorFromResponse(response, 'Failed to check run status');
  return response.json();
}

export type RemoteExecutionUpdate =
  | { state: 'running'; phase?: RemoteRunState['phase']; progress?: RemoteRunProgress; pollError?: string }
  | { state: 'completed'; results: RobotResultsJson }
  | { state: 'error'; message: string };

/** Applies one status to onUpdate; true once the run has finished. */
function report(result: RunPollResult, onUpdate: (update: RemoteExecutionUpdate) => void): boolean {
  if (result.status === 'completed') {
    onUpdate({ state: 'completed', results: result.results });
    return true;
  }
  if (result.status === 'failed') {
    onUpdate({ state: 'error', message: result.error || 'The test server reported the run failed.' });
    return true;
  }
  if (result.phase) onUpdate({ state: 'running', phase: result.phase, progress: result.progress, pollError: result.pollError });
  return false;
}

/** Live updates for a run on a registered test server (DDS-SRS-022): the
 * server pushes each status change over server-sent events. Resolves true
 * once the run has finished, or false if the stream could not be used -
 * the caller then falls back to polling. */
function listenForUpdates(jobId: string, onUpdate: (update: RemoteExecutionUpdate) => void): Promise<boolean> {
  if (typeof EventSource === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    const source = new EventSource(`${baseUrl()}/api/test-exec/runs/${encodeURIComponent(jobId)}/events`, { withCredentials: true });
    source.addEventListener('status', (event) => {
      let result: RunPollResult;
      try {
        result = JSON.parse((event as MessageEvent<string>).data);
      } catch {
        return;
      }
      if (report(result, onUpdate)) {
        source.close();
        resolve(true);
      }
    });
    // Closed before the run finished (network, proxy, server restart):
    // stop the browser's own reconnect loop and let the caller poll.
    source.onerror = () => {
      source.close();
      resolve(false);
    };
  });
}

/** Pushes the suite's current script, starts a run, then follows it until
 * it finishes, calling onUpdate at each transition. Runs on a registered
 * test server get pushed updates (DDS-SRS-022); otherwise - and whenever
 * the stream drops - it checks every 5 seconds, which only reads what the
 * backend's worker last polled (DDS-SRS-021), never the Test PC itself. */
export async function runRemoteExecution(
  suite: TestSuiteItem,
  onUpdate: (update: RemoteExecutionUpdate) => void,
  opts: { pollIntervalMs?: number; serverId?: string; runId?: string; live?: boolean } = {},
): Promise<void> {
  const pollIntervalMs = opts.pollIntervalMs ?? 5_000;
  try {
    await pushScript(suite);
    const jobId = await startRun(suite.id, opts.serverId, opts.runId);
    onUpdate({ state: 'running' });

    if (opts.serverId && opts.live !== false && await listenForUpdates(jobId, onUpdate)) return;

    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      if (report(await pollRunStatus(jobId), onUpdate)) return;
    }
  } catch (err) {
    onUpdate({ state: 'error', message: err instanceof Error ? err.message : 'Remote execution failed.' });
  }
}
