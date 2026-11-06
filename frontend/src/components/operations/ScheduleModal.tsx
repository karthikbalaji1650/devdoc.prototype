import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Trash2, X } from 'lucide-react';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { listTestServers, type TestServer } from '../../services/testServersApiService';
import {
  WEEKDAYS, deleteSchedule, describeSchedule, listSchedules, localTimeZone, saveSchedule,
  type Schedule, type ScheduleFrequency, type Weekday,
} from '../../services/schedulesApiService';

// DDS-SRS-028: scheduled runs of one suite on a registered test server.
// The server fires them and fills in the run; this only manages them.

interface ScheduleModalProps {
  suiteId: string;
  suiteTitle: string;
  onClose: () => void;
}

const inputCls = 'w-full border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-xs text-[var(--text)] focus:border-[var(--blue)] focus:outline-none';
const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

export const ScheduleModal: React.FC<ScheduleModalProps> = ({ suiteId, suiteTitle, onClose }) => {
  const dialogRef = useDialogA11y<HTMLElement>(onClose);
  const [schedules, setSchedules] = useState<Schedule[] | null>(null);
  const [servers, setServers] = useState<TestServer[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [serverId, setServerId] = useState('');
  const [frequency, setFrequency] = useState<ScheduleFrequency>('daily');
  const [time, setTime] = useState('02:00');
  const [date, setDate] = useState(tomorrow);
  const [weekdays, setWeekdays] = useState<Weekday[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);

  const load = useCallback(async () => {
    try {
      const [list, srv] = await Promise.all([listSchedules(suiteId), listTestServers()]);
      setSchedules(list);
      setServers(srv.servers);
      setServerId((cur) => cur || srv.servers[0]?.id || '');
    } catch (err) {
      setSchedules([]);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [suiteId]);
  useEffect(() => { void load(); }, [load]);

  const act = async (op: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try { await op(); await load(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
  };

  const add = () => act(() => saveSchedule({
    suiteId, serverId, frequency, time, timezone: localTimeZone(),
    date: frequency === 'once' ? date : null, weekdays: frequency === 'weekly' ? weekdays : [],
  }));

  const toggle = (s: Schedule) => act(() => saveSchedule({ ...s, enabled: !s.enabled }, s.id));
  const serverName = (id: string) => servers.find((s) => s.id === id)?.name ?? 'a removed server';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="schedule-title"
        className="flex max-h-[85vh] w-full max-w-2xl flex-col border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] shadow-2xl">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <CalendarClock className="h-5 w-5 text-[var(--blue)]" />
            <div>
              <h2 id="schedule-title" className="text-base font-semibold">Scheduled runs: {suiteTitle}</h2>
              <p className="text-xs text-[var(--text-dim)]">The server starts these by itself and fills in the run - this page does not need to be open.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1.5 text-[var(--text-dim)] hover:bg-[var(--panel-alt)] hover:text-[var(--text)]"><X className="h-4 w-4" /></button>
        </header>

        <div className="overflow-y-auto">
          {schedules === null ? (
            <p className="px-5 py-4 text-xs text-[var(--text-dim)]">Loading…</p>
          ) : schedules.length === 0 ? (
            <p className="px-5 py-4 text-xs text-[var(--text-dim)]">No scheduled runs for this suite yet.</p>
          ) : (
            <ul aria-label="Schedules" className="divide-y divide-[var(--border)]">
              {schedules.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{describeSchedule(s)} on {serverName(s.serverId)}</div>
                    <div className="text-[11px] text-[var(--text-dim)]">
                      {s.enabled && s.nextRunAt ? `Next: ${new Date(s.nextRunAt).toLocaleString()}` : 'Off'}
                      {s.lastRunAt && ` · Last: ${new Date(s.lastRunAt).toLocaleString()}`}
                      {` · by ${s.createdBy}`}
                    </div>
                    {s.lastError && <div className="text-[11px] text-[var(--danger)]">Last attempt failed: {s.lastError}</div>}
                  </div>
                  {/* Only the creator or an admin can change it; the server says so otherwise. */}
                  {(
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-dim)]">
                        <input type="checkbox" checked={s.enabled} disabled={busy || (!s.enabled && s.frequency === 'once' && !s.nextRunAt && !!s.lastRunAt)}
                          onChange={() => void toggle(s)} aria-label={`Enabled: ${describeSchedule(s)}`} /> On
                      </label>
                      <button type="button" disabled={busy} aria-label={`Delete schedule ${describeSchedule(s)}`}
                        onClick={() => { if (window.confirm('Delete this schedule?')) void act(() => deleteSchedule(s.id)); }}
                        className="rounded p-1.5 text-[var(--danger)] hover:bg-[var(--panel-alt)] disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form className="space-y-3 border-t border-[var(--border)] bg-[var(--panel-alt)] px-5 py-4" onSubmit={(e) => { e.preventDefault(); void add(); }}>
            <h3 className="text-xs font-semibold">Add a schedule</h3>
            {servers.length === 0 && schedules !== null ? (
              <p className="text-xs text-[var(--text-dim)]">Scheduled runs need a registered test server. An admin can add one under Data Management.</p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="space-y-1 text-[11px] font-semibold">Test server
                    <select className={inputCls} value={serverId} onChange={(e) => setServerId(e.target.value)}>
                      {servers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1 text-[11px] font-semibold">Repeat
                    <select className={inputCls} value={frequency} onChange={(e) => setFrequency(e.target.value as ScheduleFrequency)}>
                      <option value="once">Once</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-[11px] font-semibold">Time ({localTimeZone()})
                    <input type="time" required className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} />
                  </label>
                </div>
                {frequency === 'once' && (
                  <label className="block space-y-1 text-[11px] font-semibold sm:w-1/3">Date
                    <input type="date" required className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
                  </label>
                )}
                {frequency === 'weekly' && (
                  <fieldset className="flex flex-wrap gap-2">
                    <legend className="mb-1 text-[11px] font-semibold">On</legend>
                    {WEEKDAYS.map((d) => (
                      <label key={d} className="flex items-center gap-1 text-[11px]">
                        <input type="checkbox" checked={weekdays.includes(d)}
                          onChange={(e) => setWeekdays((cur) => e.target.checked ? [...cur, d] : cur.filter((x) => x !== d))} /> {d}
                      </label>
                    ))}
                  </fieldset>
                )}
                <button type="submit" disabled={busy || !serverId}
                  className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                  {busy ? 'Saving…' : 'Add schedule'}
                </button>
              </>
            )}
            {error && <p role="alert" className="text-xs text-[var(--danger)]">{error}</p>}
          </form>
        </div>
      </section>
    </div>
  );
};
