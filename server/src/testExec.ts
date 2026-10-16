// Stands in for a real remote Test PC: the frontend pushes a suite's
// Robot Framework script, starts a run, and polls for results. State is
// an in-memory Map, not a DB table - this is an explicit mock with
// nothing yet depending on it surviving a server restart.

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

interface PushedScript {
  suiteId: string;
  suiteTitle: string;
  robotCode: string;
}

interface Job {
  suiteId: string;
  status: 'running' | 'completed';
  results?: RobotResultsJson;
}

const scripts = new Map<string, PushedScript>();
const jobs = new Map<string, Job>();

// How long the mock pretends the remote Test PC takes to finish a run.
// Real hardware takes much longer (hence the frontend's 30-minute poll
// interval) - this only needs to be long enough that a poll can
// observe "running" at least once, short enough that tests stay fast.
export const MOCK_RUN_DELAY_MS = 300;

export function pushScript(suiteId: string, suiteTitle: string, robotCode: string): void {
  scripts.set(suiteId, { suiteId, suiteTitle, robotCode });
}

export function hasScript(suiteId: string): boolean {
  return scripts.has(suiteId);
}

// Pulls test case names out of the suite's Robot source the same way
// the frontend's own .robot parser does, so the mock's fake results
// line up with real test case ids instead of being generic placeholders.
function extractTestNames(robotCode: string): { customId: string; title: string }[] {
  const names: { customId: string; title: string }[] = [];
  let inTestCases = false;
  for (const rawLine of robotCode.split('\n')) {
    if (/^\*\*\*\s*Test Cases\s*\*\*\*/i.test(rawLine)) { inTestCases = true; continue; }
    if (rawLine.startsWith('***')) { inTestCases = false; continue; }
    if (inTestCases && rawLine.length > 0 && !/^[ \t]/.test(rawLine)) {
      const title = rawLine.trim();
      const match = title.match(/^(TC[_\-A-Z0-9]+)[\s_-]/i);
      const customId = match ? match[1].replace(/_/g, '-') : `TC-${names.length + 1}`;
      names.push({ customId, title });
    }
  }
  return names;
}

function randomResult(customId: string, title: string): RobotResultEntry {
  const status: 'PASS' | 'FAIL' = Math.random() < 0.85 ? 'PASS' : 'FAIL';
  return {
    customId,
    title,
    status,
    elapsedTimeMs: Math.floor(Math.random() * 800) + 120,
    failureMessage: status === 'FAIL' ? 'Mock remote execution reported a failure.' : undefined,
  };
}

/** Returns null when no script has been pushed for this suite yet. */
export function startRun(suiteId: string, delayMs: number = MOCK_RUN_DELAY_MS): string | null {
  const script = scripts.get(suiteId);
  if (!script) return null;

  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  jobs.set(jobId, { suiteId, status: 'running' });

  setTimeout(() => {
    const names = extractTestNames(script.robotCode);
    const results = names.length > 0
      ? names.map((n) => randomResult(n.customId, n.title))
      : [randomResult('TC-1', 'Automated test')];
    const passed = results.filter((r) => r.status === 'PASS').length;
    const failed = results.filter((r) => r.status === 'FAIL').length;
    jobs.set(jobId, {
      suiteId,
      status: 'completed',
      results: {
        _schema: 'devdoc-robot-results-v1',
        suiteTitle: script.suiteTitle,
        executedAt: new Date().toISOString(),
        environment: 'Mock Remote Test PC',
        summary: { total: results.length, passed, failed, skipped: 0 },
        results,
      },
    });
  }, delayMs);

  return jobId;
}

export function getJob(jobId: string): Job | undefined {
  return jobs.get(jobId);
}
