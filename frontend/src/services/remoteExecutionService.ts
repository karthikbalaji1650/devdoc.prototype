// Talks to the remote test execution backend: push a suite's Robot
// script, start a run, poll for results. With a serverId the backend sends
// the run to that registered test server (DDS-SRS-020, see
// docs/test-pc-api.md); without one it uses its mock Test PC. Same
// optional, VITE_API_BASE_URL-gated pattern as the rest of the backend.
import type { TestSuiteItem } from '../types/operations';
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

export async function startRun(suiteId: string, serverId?: string): Promise<string> {
  const response = await fetchWithTimeout(`${baseUrl()}/api/test-exec/runs`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(serverId ? { suiteId, serverId } : { suiteId }),
    timeoutMs: 20_000,
  });
  if (!response.ok) throw await errorFromResponse(response, 'Failed to start the run');
  const data = await response.json();
  return data.jobId;
}

export type RunPollResult =
  | { status: 'running' }
  | { status: 'completed'; results: RobotResultsJson }
  | { status: 'failed'; error: string };

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
  | { state: 'running' }
  | { state: 'completed'; results: RobotResultsJson }
  | { state: 'error'; message: string };

/** Pushes the suite's current script, starts a run, then polls until it
 * completes, calling onUpdate at each transition. Polls every 30
 * minutes by default, matching how long a real remote Test PC run is
 * expected to take - pollIntervalMs exists so tests can inject a short
 * interval instead of waiting 30 minutes for real; production code
 * never overrides the default. */
export async function runRemoteExecution(
  suite: TestSuiteItem,
  onUpdate: (update: RemoteExecutionUpdate) => void,
  opts: { pollIntervalMs?: number; serverId?: string } = {},
): Promise<void> {
  const pollIntervalMs = opts.pollIntervalMs ?? 30 * 60 * 1000;
  try {
    await pushScript(suite);
    const jobId = await startRun(suite.id, opts.serverId);
    onUpdate({ state: 'running' });

    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      const result = await pollRunStatus(jobId);
      if (result.status === 'completed') {
        onUpdate({ state: 'completed', results: result.results });
        return;
      }
      if (result.status === 'failed') {
        onUpdate({ state: 'error', message: result.error || 'The test server reported the run failed.' });
        return;
      }
    }
  } catch (err) {
    onUpdate({ state: 'error', message: err instanceof Error ? err.message : 'Remote execution failed.' });
  }
}
