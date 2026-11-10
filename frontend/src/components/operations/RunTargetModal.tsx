import React, { useEffect, useState } from 'react';
import { Play, Server, X } from 'lucide-react';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { listTestServers, type TestServer } from '../../services/testServersApiService';

// DDS-SRS-020: choose where "Run Test" sends the suite - a registered
// remote test server, or the backend's simulated Test PC (random results).

export interface RunTarget {
  /** Undefined runs on the simulated Test PC. */
  serverId?: string;
  name: string;
}

export const SIMULATED_TARGET = 'Simulated Test PC';

interface RunTargetModalProps {
  suiteTitle: string;
  onRun: (target: RunTarget) => void;
  onClose: () => void;
}

export const RunTargetModal: React.FC<RunTargetModalProps> = ({ suiteTitle, onRun, onClose }) => {
  const dialogRef = useDialogA11y<HTMLElement>(onClose);
  const [servers, setServers] = useState<TestServer[] | null>(null);
  const [error, setError] = useState('');
  const [choice, setChoice] = useState<string>(''); // server id, '' = simulated

  useEffect(() => {
    let cancelled = false;
    listTestServers()
      .then((data) => {
        if (cancelled) return;
        setServers(data.servers);
        if (data.servers.length) setChoice(data.servers[0].id);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setServers([]);
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => { cancelled = true; };
  }, []);

  const run = () => {
    const server = servers?.find((s) => s.id === choice);
    onRun(server ? { serverId: server.id, name: server.name } : { name: SIMULATED_TARGET });
  };

  const option = (id: string, title: string, detail: string) => (
    <label key={id || 'simulated'} className={`flex cursor-pointer items-start gap-3 border px-3 py-2.5 ${choice === id ? 'border-[var(--blue)] bg-[var(--panel-alt)]' : 'border-[var(--border)]'}`}>
      <input type="radio" name="run-target" value={id} checked={choice === id} onChange={() => setChoice(id)} className="mt-0.5" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block truncate font-mono text-[11px] text-[var(--text-dim)]">{detail}</span>
      </span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="run-target-title"
        className="flex max-h-[85vh] w-full max-w-lg flex-col border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] shadow-2xl">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Server className="h-5 w-5 text-[var(--blue)]" />
            <div>
              <h2 id="run-target-title" className="text-base font-semibold">Run {suiteTitle}</h2>
              <p className="text-xs text-[var(--text-dim)]">Choose the test server to run the suite's Robot script on.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1.5 text-[var(--text-dim)] hover:bg-[var(--panel-alt)] hover:text-[var(--text)]"><X className="h-4 w-4" /></button>
        </header>

        <fieldset className="space-y-2 overflow-y-auto px-5 py-4">
          <legend className="sr-only">Test server</legend>
          {servers === null ? (
            <p className="text-xs text-[var(--text-dim)]">Loading test servers…</p>
          ) : (
            <>
              {servers.map((s) => option(s.id, s.name, s.endpointUrl))}
              {servers.length === 0 && !error && (
                <p className="text-xs text-[var(--text-dim)]">No test servers are registered yet. An admin can add one under Data Management.</p>
              )}
              {error && <p role="alert" className="text-xs text-[var(--danger)]">Could not load test servers: {error}</p>}
              {option('', SIMULATED_TARGET, 'Demo only: random results, no real hardware')}
            </>
          )}
        </fieldset>

        <footer className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs font-semibold text-[var(--text-dim)] hover:text-[var(--text)]">Cancel</button>
          <button type="button" onClick={run} disabled={servers === null}
            className="flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-[#07111d]! hover:bg-amber-300 disabled:opacity-50">
            <Play className="h-3.5 w-3.5" /> Start run
          </button>
        </footer>
      </section>
    </div>
  );
};
