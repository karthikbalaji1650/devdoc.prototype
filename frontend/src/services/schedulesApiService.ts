// Scheduled test runs (DDS-SRS-028) on the server: /api/test-schedules.
// The server's background worker fires them, runs them on a registered
// test server and fills in the resulting test run - no browser needed.
// Every call throws with the server's message on failure.
import { fetchWithTimeout, type FetchWithTimeoutOptions } from './fetchWithTimeout';

export type ScheduleFrequency = 'once' | 'daily' | 'weekly';
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface ScheduleInput {
  suiteId: string;
  serverId: string;
  frequency: ScheduleFrequency;
  /** HH:MM, 24-hour, in `timezone`. */
  time: string;
  timezone: string;
  /** YYYY-MM-DD, for `once`. */
  date?: string | null;
  /** For `weekly`. */
  weekdays?: Weekday[];
  enabled?: boolean;
}

export interface Schedule extends Required<Omit<ScheduleInput, 'date'>> {
  id: string;
  date: string | null;
  nextRunAt: string | null;
  lastRunAt?: string;
  lastRunId?: string;
  lastError?: string;
  createdBy: string;
  createdAt: string;
}

/** The browser's time zone, e.g. "Asia/Kolkata" - schedules run in it. */
export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

const base = () => `${(import.meta.env.VITE_API_BASE_URL as string).replace(/\/$/, '')}/api/test-schedules`;

async function call<T>(path: string, init: FetchWithTimeoutOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`${base()}${path}`, {
      credentials: 'include',
      ...init,
      headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
    });
  } catch {
    throw new Error('Could not reach the server.');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : `Server error (${res.status}).`);
  return data as T;
}

export async function listSchedules(suiteId: string): Promise<Schedule[]> {
  const data = await call<{ schedules: Schedule[] }>(`?suiteId=${encodeURIComponent(suiteId)}`, { retries: 1 });
  return data.schedules;
}

export async function saveSchedule(input: ScheduleInput, id?: string): Promise<Schedule> {
  const data = await call<{ schedule: Schedule }>(id ? `/${encodeURIComponent(id)}` : '', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(input),
  });
  return data.schedule;
}

export function deleteSchedule(id: string): Promise<void> {
  return call(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** "Daily at 09:30", "Mon, Thu at 09:30", "Once on 2026-12-01 at 09:30". */
export function describeSchedule(s: Pick<Schedule, 'frequency' | 'time' | 'date' | 'weekdays' | 'timezone'>): string {
  const when = s.frequency === 'daily' ? 'Daily' : s.frequency === 'weekly' ? s.weekdays.join(', ') : `Once on ${s.date}`;
  return `${when} at ${s.time}${s.timezone !== localTimeZone() ? ` (${s.timezone})` : ''}`;
}
