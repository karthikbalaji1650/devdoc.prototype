import React, { useCallback, useEffect, useState } from 'react';
import { Bug, Plug, Unplug } from 'lucide-react';
import { isTestServersAvailable } from '../../services/testServersApiService';
import { checkTracker, disconnectTracker, loadTrackers, saveTracker, type TrackersConfig } from '../../services/trackersApiService';

/** Jira and GitHub connections, so release blockers are read from the
 * trackers (DDS-SRS-044). Tokens are encrypted on the server. */

const inputCls = 'w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500';
const btnCls = 'px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold shadow-2xs disabled:opacity-50';
const label = 'space-y-1 text-[11px] font-semibold text-slate-700';

export const TrackersPanel: React.FC = () => {
  const available = isTestServersAvailable();
  const [config, setConfig] = useState<TrackersConfig | null>(null);
  const [jira, setJira] = useState({ baseUrl: '', deployment: 'cloud' as 'cloud' | 'server', email: '', token: '' });
  const [github, setGithub] = useState({ apiUrl: 'https://api.github.com', token: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const c = await loadTrackers();
      setConfig(c);
      if (c.jira) setJira((j) => ({ ...j, baseUrl: c.jira!.baseUrl, deployment: c.jira!.deployment, email: c.jira!.email ?? '' }));
      if (c.github) setGithub((g) => ({ ...g, apiUrl: c.github!.apiUrl }));
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : String(err), error: true });
    }
  }, []);
  useEffect(() => { if (available) void load(); }, [available, load]);

  if (!available) return null;

  const run = async (key: string, op: () => Promise<string>) => {
    setBusy(key);
    setMessage(null);
    try { setMessage({ text: await op(), error: false }); await load(); } catch (err) { setMessage({ text: err instanceof Error ? err.message : String(err), error: true }); } finally { setBusy(null); }
  };
  const test = (kind: 'jira' | 'github') => run(`check-${kind}`, async () => {
    const r = await checkTracker(kind);
    if (!r.ok) throw new Error(r.error);
    return `${kind === 'jira' ? 'Jira' : 'GitHub'}: signed in as ${r.account}.`;
  });

  const status = (on: boolean, tokenSet?: boolean) => (
    <span className={`text-[10px] font-semibold ${on ? 'text-[var(--success)]' : 'text-slate-500'}`}>{on ? `Connected${tokenSet ? ' · token stored' : ''}` : 'Not connected'}</span>
  );

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border)]">
        <div className="p-2 rounded-lg bg-blue-50 text-blue-600"><Bug className="w-4 h-4" /></div>
        <div>
          <div className="text-xs font-bold text-slate-900">Issue trackers: Jira and GitHub</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Release blockers are read from these: by key, or from each release's blocker query, synced every 5 minutes. Tokens are encrypted on the server and never shown again.</div>
        </div>
      </div>

      <form aria-label="Jira connection" className="px-5 py-4 space-y-3 border-b border-[var(--border)]"
        onSubmit={(e) => { e.preventDefault(); void run('jira', async () => { await saveTracker('jira', { ...jira, token: jira.token || undefined }); setJira((j) => ({ ...j, token: '' })); return 'Jira connection saved.'; }); }}>
        <div className="flex items-center justify-between"><div className="text-xs font-bold text-slate-900">Jira</div>{status(Boolean(config?.jira), config?.jira?.tokenSet)}</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>Site URL<input className={`${inputCls} font-mono`} value={jira.baseUrl} onChange={(e) => setJira({ ...jira, baseUrl: e.target.value })} placeholder="https://acme.atlassian.net" required /></label>
          <label className={label}>Deployment
            <select className={inputCls} value={jira.deployment} onChange={(e) => setJira({ ...jira, deployment: e.target.value as 'cloud' | 'server' })}>
              <option value="cloud">Jira Cloud (email + API token)</option>
              <option value="server">Jira Server / Data Center (personal access token)</option>
            </select>
          </label>
          {jira.deployment === 'cloud' && (
            <label className={label}>Account email<input type="email" className={inputCls} value={jira.email} onChange={(e) => setJira({ ...jira, email: e.target.value })} required /></label>
          )}
          <label className={label}>{jira.deployment === 'cloud' ? 'API token' : 'Personal access token'}
            <input type="password" autoComplete="new-password" className={`${inputCls} font-mono`} value={jira.token} onChange={(e) => setJira({ ...jira, token: e.target.value })}
              placeholder={config?.jira?.tokenSet ? '•••••••• (stored, leave blank to keep)' : ''} required={!config?.jira?.tokenSet} />
          </label>
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={busy !== null} className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50">{busy === 'jira' ? 'Saving…' : 'Save Jira'}</button>
          {config?.jira && <>
            <button type="button" disabled={busy !== null} onClick={() => void test('jira')} className={`${btnCls} flex items-center gap-1`}><Plug className="w-3.5 h-3.5" /> Test</button>
            <button type="button" disabled={busy !== null} onClick={() => { if (window.confirm('Disconnect Jira? Blockers already read stay, but are no longer kept current.')) void run('dj', async () => { await disconnectTracker('jira'); return 'Jira disconnected.'; }); }} className={`${btnCls} flex items-center gap-1 text-[var(--danger)]`}><Unplug className="w-3.5 h-3.5" /> Disconnect</button>
          </>}
        </div>
      </form>

      <form aria-label="GitHub connection" className="px-5 py-4 space-y-3"
        onSubmit={(e) => { e.preventDefault(); void run('github', async () => { await saveTracker('github', { ...github, token: github.token || undefined }); setGithub((g) => ({ ...g, token: '' })); return 'GitHub connection saved.'; }); }}>
        <div className="flex items-center justify-between"><div className="text-xs font-bold text-slate-900">GitHub</div>{status(Boolean(config?.github), config?.github?.tokenSet)}</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>API URL<input className={`${inputCls} font-mono`} value={github.apiUrl} onChange={(e) => setGithub({ ...github, apiUrl: e.target.value })} required />
            <span className="block font-normal text-[10px] text-slate-500">https://api.github.com, or https://github.example.com/api/v3 for Enterprise Server</span>
          </label>
          <label className={label}>Token (issues: read)
            <input type="password" autoComplete="new-password" className={`${inputCls} font-mono`} value={github.token} onChange={(e) => setGithub({ ...github, token: e.target.value })}
              placeholder={config?.github?.tokenSet ? '•••••••• (stored, leave blank to keep)' : ''} required={!config?.github?.tokenSet} />
          </label>
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={busy !== null} className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50">{busy === 'github' ? 'Saving…' : 'Save GitHub'}</button>
          {config?.github && <>
            <button type="button" disabled={busy !== null} onClick={() => void test('github')} className={`${btnCls} flex items-center gap-1`}><Plug className="w-3.5 h-3.5" /> Test</button>
            <button type="button" disabled={busy !== null} onClick={() => { if (window.confirm('Disconnect GitHub? Blockers already read stay, but are no longer kept current.')) void run('dg', async () => { await disconnectTracker('github'); return 'GitHub disconnected.'; }); }} className={`${btnCls} flex items-center gap-1 text-[var(--danger)]`}><Unplug className="w-3.5 h-3.5" /> Disconnect</button>
          </>}
        </div>
      </form>

      {message && <p role={message.error ? 'alert' : 'status'} className={`px-5 py-2 text-xs border-t border-[var(--border)] ${message.error ? 'text-[var(--danger)]' : 'text-slate-600'}`}>{message.text}</p>}
    </div>
  );
};
