import React, { useCallback, useEffect, useState } from 'react';
import { GitBranch, RefreshCw, Trash2, X } from 'lucide-react';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { connectRepo, listRepos, pullRepo, removeRepo, type ConnectedRepo } from '../../services/reposApiService';

// DDS-SRS-030: connect existing Git repositories to the code editor - the
// server clones them into the workspace's repos/ folder.

const input = 'w-full border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-xs text-[var(--text)] focus:border-[var(--blue)] focus:outline-none';
const lbl = 'space-y-1 text-[11px] font-semibold text-[var(--text)]';

export const ReposModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const dialogRef = useDialogA11y<HTMLElement>(onClose);
  const [repos, setRepos] = useState<ConnectedRepo[] | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [form, setForm] = useState({ url: '', branch: '', name: '', username: '', token: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await listRepos();
      setRepos(data.repos);
      setWorkspaceError(data.workspaceError);
    } catch (err) {
      setRepos([]);
      setMessage({ text: err instanceof Error ? err.message : String(err), error: true });
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async (key: string, op: () => Promise<string>) => {
    setBusy(key);
    setMessage(null);
    try { setMessage({ text: await op(), error: false }); await load(); } catch (err) { setMessage({ text: err instanceof Error ? err.message : String(err), error: true }); } finally { setBusy(null); }
  };
  const isHttps = /^https?:\/\//i.test(form.url.trim());

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="repos-title"
        className="flex max-h-[85vh] w-full max-w-2xl flex-col border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] shadow-2xl">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <GitBranch className="h-5 w-5 text-[var(--blue)]" />
            <div>
              <h2 id="repos-title" className="text-base font-semibold">Repositories</h2>
              <p className="text-xs text-[var(--text-dim)]">Existing code, cloned into the code editor's workspace under <code className="font-mono">repos/</code>.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1.5 text-[var(--text-dim)] hover:bg-[var(--panel-alt)] hover:text-[var(--text)]"><X className="h-4 w-4" /></button>
        </header>

        <div className="overflow-y-auto">
          {workspaceError && <p role="alert" className="px-5 py-2 text-xs text-[var(--amber)] border-b border-[var(--border)]">Workspace: {workspaceError}</p>}
          {repos === null ? (
            <p className="px-5 py-4 text-xs text-[var(--text-dim)]">Loading…</p>
          ) : repos.length === 0 ? (
            <p className="px-5 py-4 text-xs text-[var(--text-dim)]">No repositories connected yet.</p>
          ) : (
            <ul aria-label="Connected repositories" className="divide-y divide-[var(--border)]">
              {repos.map((r) => (
                <li key={r.name} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{r.name} <span className="font-mono text-[11px] font-normal text-[var(--text-dim)]">repos/{r.name}</span></div>
                    <div className="truncate font-mono text-[11px] text-[var(--text-dim)]">{r.url}</div>
                    <div className="text-[11px] text-[var(--text-dim)]" data-testid="repo-state">
                      {r.workspace
                        ? <>{r.workspace.branch} @ <span className="font-mono">{r.workspace.commit}</span>{r.workspace.subject && ` · ${r.workspace.subject}`}</>
                        : <span className="text-[var(--amber)]">Not in the workspace</span>}
                      {` · by ${r.connectedBy}`}{r.tokenSet && ' · token stored'}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button type="button" disabled={busy !== null} aria-label={`Pull ${r.name}`}
                      onClick={() => void run(`pull-${r.name}`, async () => { const { repo } = await pullRepo(r.name); return `${r.name} is at ${repo.workspace?.commit ?? 'the latest commit'}.`; })}
                      className="flex items-center gap-1 border border-[var(--border)] px-2.5 py-1.5 text-xs disabled:opacity-50 hover:bg-[var(--panel-alt)]">
                      <RefreshCw className={`h-3.5 w-3.5 ${busy === `pull-${r.name}` ? 'animate-spin' : ''}`} /> Pull
                    </button>
                    <button type="button" disabled={busy !== null} aria-label={`Remove ${r.name}`}
                      onClick={() => { if (window.confirm(`Remove ${r.name}? Its folder repos/${r.name} is deleted from the workspace, with any uncommitted changes in it.`)) void run(`rm-${r.name}`, async () => { await removeRepo(r.name); return `${r.name} removed.`; }); }}
                      className="border border-[var(--border)] px-2.5 py-1.5 text-[var(--danger)] disabled:opacity-50 hover:bg-[var(--panel-alt)]"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form aria-label="Connect repository" className="space-y-3 border-t border-[var(--border)] bg-[var(--panel-alt)] px-5 py-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run('connect', async () => {
                const { repo } = await connectRepo({ url: form.url.trim(), branch: form.branch.trim() || undefined, name: form.name.trim() || undefined, username: form.username.trim() || undefined, token: form.token || undefined });
                setForm({ url: '', branch: '', name: '', username: '', token: '' });
                return `Cloned into repos/${repo.name}.`;
              });
            }}>
            <h3 className="text-xs font-semibold">Connect a repository</h3>
            <label className={`block ${lbl}`}>Repository URL
              <input className={`${input} font-mono`} required value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://github.com/acme/bmc-firmware.git" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={lbl}>Branch (optional)<input className={`${input} font-mono`} value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} placeholder="default branch" /></label>
              <label className={lbl}>Folder name (optional)<input className={`${input} font-mono`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="from the URL" /></label>
            </div>
            {isHttps && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={lbl}>Username (private repositories)<input className={input} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="x-access-token" autoComplete="off" /></label>
                <label className={lbl}>Access token<input type="password" autoComplete="new-password" className={`${input} font-mono`} value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} /></label>
                <p className="sm:col-span-2 text-[10px] font-normal text-[var(--text-dim)]">GitHub: leave the username empty. Bitbucket: your username and an app password. GitLab: username <code>oauth2</code>. The token is stored encrypted and not written into the clone.</p>
              </div>
            )}
            <button type="submit" disabled={busy !== null} className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {busy === 'connect' ? 'Cloning…' : 'Connect and clone'}
            </button>
            {message && <p role={message.error ? 'alert' : 'status'} className={`text-xs ${message.error ? 'text-[var(--danger)]' : 'text-[var(--text-dim)]'}`}>{message.text}</p>}
          </form>
        </div>
      </section>
    </div>
  );
};
