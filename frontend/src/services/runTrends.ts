// Metrics dashboard trends (DDS-SRS-023): execution velocity (test cases
// executed per day) and the pass-rate trend across finished runs.
import type { TestRunItem } from '../types/operations';

export interface VelocityDay {
  /** Local date, YYYY-MM-DD. */
  date: string;
  executed: number;
  runs: number;
}

export interface PassRatePoint {
  id: string;
  name: string;
  at: string;
  /** Passed / executed * 100, one decimal. */
  rate: number;
  executed: number;
  passed: number;
}

/** Cases that got a result: passed, failed, blocked or skipped. */
export function executedCount(run: TestRunItem): number {
  return run.passedCount + run.failedCount + run.blockedCount + (run.skippedCount ?? 0);
}

function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function inScope(runs: TestRunItem[], suiteId: string | null): TestRunItem[] {
  return suiteId ? runs.filter((r) => r.suiteId === suiteId) : runs;
}

/** One entry per day for the last `days` days (today last), zeros included,
 * so gaps in testing show as gaps. */
export function velocity(runs: TestRunItem[], days: number, now: Date, suiteId: string | null = null): VelocityDay[] {
  const out: VelocityDay[] = [];
  const index = new Map<string, VelocityDay>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const day = { date: localDate(d), executed: 0, runs: 0 };
    out.push(day);
    index.set(day.date, day);
  }
  for (const run of inScope(runs, suiteId)) {
    const at = new Date(run.executedAt);
    if (Number.isNaN(at.getTime())) continue;
    const day = index.get(localDate(at));
    if (!day) continue;
    day.executed += executedCount(run);
    day.runs += 1;
  }
  return out;
}

/** Finished runs with at least one result in the last `days` days, oldest first. */
export function passRateTrend(runs: TestRunItem[], days: number, now: Date, suiteId: string | null = null): PassRatePoint[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1)).getTime();
  return inScope(runs, suiteId)
    .filter((r) => r.status !== 'In Progress')
    .map((r) => ({ run: r, t: new Date(r.executedAt).getTime(), executed: executedCount(r) }))
    .filter(({ t, executed }) => !Number.isNaN(t) && t >= start && t <= now.getTime() && executed > 0)
    .sort((a, b) => a.t - b.t)
    .map(({ run, executed }) => ({
      id: run.id,
      name: run.name,
      at: run.executedAt,
      executed,
      passed: run.passedCount,
      rate: Math.round((run.passedCount / executed) * 1000) / 10,
    }));
}

/** Clean axis maximum and ticks for a count axis: 0 and 3-5 round steps. */
export function countTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step - 1e-9; v += step) ticks.push(Math.round(v));
  return ticks;
}
