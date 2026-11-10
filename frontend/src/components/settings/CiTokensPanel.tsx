import React, { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { apiBaseUrl, createCiToken, listCiTokens, pipelineCommands, revokeCiToken, type CiToken } from '../../services/ciTokensApiService';
import { isTestServersAvailable, listTestServers, type TestServer } from '../../services/testServersApiService';
import { loadTestManagement } from '../../services/testManagementApiService';

/** CI/CD integration (DDS-SRS-026/027): tokens for Jenkins, Bitbucket
 * Pipelines and other pipelines, and the commands to put in them. */

const inputCls = 'w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500';
const btnCls = 'px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold shadow-2xs disabled:opacity-50';

function CopyLine({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold text-slate-700">{label}</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 overflow-x-auto whitespace-nowrap border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--text)]">{text}</code>
        <button type="button" aria-label={`Copy ${label}`} className={`${btnCls} flex items-center gap-1 shrink-0`}
          onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>
          <Copy className="w-3.5 h-3.5" /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

export const CiTokensPanel: React.FC = () => {
  const available = isTestServersAvailable();
  const [tokens, setTokens] = useState<CiToken[] | null>(null);
  const [name, setName] = useState('');
  const [newToken, setNewToken] = useState<{ name: string; token: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [suites, setSuites] = useState<{ id: string; title: string }[]>([]);
  const [servers, setServers] = useState<TestServer[]>([]);
  const [suiteId, setSuiteId] = useState('');
  const [serverId, setServerId] = useState('');

  const load = useCallback(async () => {
    try {
      setTokens(await listCiTokens());
    } catch (err) {
      setTokens([]);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    if (!available) return;
    void load();
    loadTestManagement().then((d) => { setSuites(d.suites.map((s) => ({ id: s.id, title: s.title }))); setSuiteId((c) => c || d.suites[0]?.id || ''); }).catch(() => {});
    listTestServers().then((d) => { setServers(d.servers); setServerId((c) => c || d.servers[0]?.id || ''); }).catch(() => {});
  }, [available, load]);

  if (!available) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs text-xs text-slate-600">
        CI/CD integration runs on the server, so it needs the backend (VITE_API_BASE_URL).
      </div>
    );
  }

  const act = async (op: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try { await op(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
  };
  const commands = suiteId ? pipelineCommands(suiteId, serverId || undefined) : null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border)]">
        <div className="p-2 rounded-lg bg-blue-50 text-blue-600"><KeyRound className="w-4 h-4" /></div>
        <div>
          <div className="text-xs font-bold text-slate-900">CI/CD: Jenkins, Bitbucket and other pipelines</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            A pipeline uses a CI token to run a suite on a test server, or to record Robot results it ran itself. See docs/ci/README.md in the repository.
          </div>
        </div>
      </div>

      <form className="px-5 py-4 flex flex-wrap items-end gap-2 border-b border-[var(--border)]"
        onSubmit={(e) => { e.preventDefault(); void act(async () => { const res = await createCiToken(name); setNewToken({ name: res.record.name, token: res.token }); setName(''); await load(); }); }}>
        <label className="flex-1 min-w-48 space-y-1 text-[11px] font-semibold text-slate-700">New token for
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Jenkins – firmware" required maxLength={100} />
        </label>
        <button type="submit" disabled={busy || !name.trim()} className={`${btnCls} flex items-center gap-1.5`}><Plus className="w-3.5 h-3.5" /> Create token</button>
      </form>

      {newToken && (
        <div role="status" className="px-5 py-3 space-y-2 border-b border-[var(--border)] bg-[var(--panel-alt)]">
          <p className="text-[11px] text-[var(--amber)]">Copy the token for "{newToken.name}" now and store it as a secret in the CI system - it will not be shown again.</p>
          <CopyLine label="CI token" text={newToken.token} />
        </div>
      )}

      {tokens && tokens.length > 0 && (
        <ul aria-label="CI tokens" className="divide-y divide-[var(--border)]">
          {tokens.map((t) => (
            <li key={t.id} className="px-5 py-2.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-slate-900">{t.name} <span className="font-mono font-normal text-slate-500">{t.hint}</span></div>
                <div className="text-[10px] text-slate-500">
                  Created {new Date(t.createdAt).toLocaleDateString()} by {t.createdBy} · {t.lastUsedAt ? `last used ${new Date(t.lastUsedAt).toLocaleString()}` : 'never used'}
                </div>
              </div>
              <button type="button" disabled={busy} aria-label={`Revoke ${t.name}`}
                onClick={() => { if (window.confirm(`Revoke "${t.name}"? Pipelines using it stop working at once.`)) void act(async () => { await revokeCiToken(t.id); await load(); }); }}
                className={`${btnCls} text-[var(--danger)]`}><Trash2 className="w-3.5 h-3.5" /></button>
            </li>
          ))}
        </ul>
      )}

      <div className="px-5 py-4 space-y-3 border-t border-[var(--border)]">
        <div className="text-[11px] font-bold text-slate-900">Pipeline commands</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-[11px] font-semibold text-slate-700">Suite
            <select className={inputCls} value={suiteId} onChange={(e) => setSuiteId(e.target.value)}>
              {suites.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-[11px] font-semibold text-slate-700">Test server (to run on)
            <select className={inputCls} value={serverId} onChange={(e) => setServerId(e.target.value)}>
              <option value="">None - only record results</option>
              {servers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </div>
        <CopyLine label="DEVDOC_URL" text={apiBaseUrl()} />
        {commands?.run && <CopyLine label="Run on the test server, fail the build if tests fail" text={commands.run} />}
        {commands && <CopyLine label="Record Robot results the pipeline ran itself" text={commands.upload} />}
      </div>

      {error && <p role="alert" className="px-5 py-2 text-xs text-[var(--danger)] border-t border-[var(--border)]">{error}</p>}
    </div>
  );
};
