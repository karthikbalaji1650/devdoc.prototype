import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Server, Trash2, Pencil, Plug, Lock } from 'lucide-react';
import {
  AUTH_TYPE_LABELS,
  SECRET_FIELD,
  checkTestServer,
  deleteTestServer,
  isTestServersAvailable,
  listTestServers,
  saveTestServer,
  type ConnectionCheck,
  type TestServer,
  type TestServerAuthType,
  type TestServerInput,
} from '../../services/testServersApiService';

/** Admin registration of remote test execution servers (DDS-SRS-019).
 * Credentials go to the server once and are stored encrypted (DDS-SRS-075). */

interface Draft {
  id?: string;
  name: string;
  endpointUrl: string;
  authType: TestServerAuthType;
  headerName: string;
  username: string;
  tokenUrl: string;
  clientId: string;
  scope: string;
  secret: string;
  payloadText: string;
  /** A secret is already stored for this auth method. */
  secretStored: boolean;
  storedAuthType?: TestServerAuthType;
}

const EMPTY: Draft = {
  name: '', endpointUrl: '', authType: 'apiKey', headerName: 'X-API-Key', username: '', tokenUrl: '',
  clientId: '', scope: '', secret: '', payloadText: '{\n  \n}', secretStored: false,
};

const SECRET_LABEL: Record<string, string> = { apiKey: 'API key', password: 'Password', clientSecret: 'Client secret' };

function draftFrom(s: TestServer): Draft {
  return {
    id: s.id,
    name: s.name,
    endpointUrl: s.endpointUrl,
    authType: s.authType ?? 'none',
    headerName: s.auth?.headerName ?? 'X-API-Key',
    username: s.auth?.username ?? '',
    tokenUrl: s.auth?.tokenUrl ?? '',
    clientId: s.auth?.clientId ?? '',
    scope: s.auth?.scope ?? '',
    secret: '',
    payloadText: JSON.stringify(s.payload ?? {}, null, 2),
    secretStored: Boolean(s.secretSet),
    storedAuthType: s.authType,
  };
}

function inputFrom(d: Draft): TestServerInput {
  let payload: unknown;
  try {
    payload = d.payloadText.trim() ? JSON.parse(d.payloadText) : {};
  } catch {
    throw new Error('Payload parameters must be valid JSON.');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Payload parameters must be a JSON object, e.g. {"bmcIp": "192.168.1.100"}.');
  }
  const auth: TestServerInput['auth'] = {};
  if (d.authType === 'apiKey') auth.headerName = d.headerName.trim() || 'X-API-Key';
  if (d.authType === 'basic') auth.username = d.username.trim();
  if (d.authType === 'oauth2') {
    auth.tokenUrl = d.tokenUrl.trim();
    auth.clientId = d.clientId.trim();
    auth.scope = d.scope.trim() || null;
  }
  const field = SECRET_FIELD[d.authType];
  if (field && d.secret) auth[field] = d.secret;
  return { name: d.name.trim(), endpointUrl: d.endpointUrl.trim(), authType: d.authType, auth, payload: payload as Record<string, unknown> };
}

const inputCls = 'w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500';
const btnCls = 'px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold shadow-2xs disabled:opacity-50';

function Field({ id, label, children, hint }: { id: string; label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-[11px] font-semibold text-slate-700">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-slate-500">{hint}</p>}
    </div>
  );
}

export const TestServersPanel: React.FC = () => {
  const available = isTestServersAvailable();
  const [servers, setServers] = useState<TestServer[]>([]);
  const [secretsAvailable, setSecretsAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [checks, setChecks] = useState<Record<string, ConnectionCheck>>({});

  const load = useCallback(async () => {
    try {
      const data = await listTestServers();
      setServers(data.servers);
      setSecretsAvailable(data.secretsAvailable);
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : String(err), error: true });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (available) void load(); }, [available, load]);

  const run = async (key: string, op: () => Promise<void>) => {
    setBusy(key);
    setMessage(null);
    try {
      await op();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : String(err), error: true });
    } finally {
      setBusy(null);
    }
  };

  if (!available) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs text-xs text-slate-600">
        Remote test servers are stored on the server, so registering them needs the backend (VITE_API_BASE_URL).
      </div>
    );
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const secretField = draft ? SECRET_FIELD[draft.authType] : undefined;
  const keepsSecret = Boolean(draft?.secretStored && draft.storedAuthType === draft.authType);

  const save = () => draft && run('save', async () => {
    const saved = await saveTestServer(inputFrom(draft), draft.id);
    setDraft(null);
    setMessage({ text: `Saved "${saved.name}".`, error: false });
    await load();
  });

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600"><Server className="w-4 h-4" /></div>
          <div>
            <div className="text-xs font-bold text-slate-900">Remote test servers</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Test PCs that runs can be sent to: API endpoint, credentials and payload parameters. Credentials are encrypted on the server (AES-256) and never shown again.
            </div>
          </div>
        </div>
        {!draft && (
          <button type="button" onClick={() => { setDraft({ ...EMPTY }); setMessage(null); }} className={`${btnCls} flex items-center gap-1.5 shrink-0`}>
            <Plus className="w-3.5 h-3.5" /> Add server
          </button>
        )}
      </div>

      {!secretsAvailable && (
        <p className="px-5 py-2 text-[11px] text-[var(--amber)] border-b border-[var(--border)]">
          The server has no SECRETS_KEY set, so only servers without credentials can be saved. See backend/.env.example.
        </p>
      )}

      {draft && (
        <form className="px-5 py-4 space-y-3 border-b border-[var(--border)] bg-[var(--panel-alt)]" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="ts-name" label="Name">
              <input id="ts-name" className={inputCls} value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Lab Test PC 1" required />
            </Field>
            <Field id="ts-url" label="API endpoint URL">
              <input id="ts-url" className={`${inputCls} font-mono`} value={draft.endpointUrl} onChange={(e) => set({ endpointUrl: e.target.value })}
                placeholder="https://testpc.example.com/api/v1" required />
            </Field>
            <Field id="ts-auth" label="Authentication">
              <select id="ts-auth" className={inputCls} value={draft.authType} onChange={(e) => set({ authType: e.target.value as TestServerAuthType, secret: '' })}>
                {(Object.keys(AUTH_TYPE_LABELS) as TestServerAuthType[]).map((t) => <option key={t} value={t}>{AUTH_TYPE_LABELS[t]}</option>)}
              </select>
            </Field>
            {draft.authType === 'apiKey' && (
              <Field id="ts-header" label="Header name">
                <input id="ts-header" className={`${inputCls} font-mono`} value={draft.headerName} onChange={(e) => set({ headerName: e.target.value })} />
              </Field>
            )}
            {draft.authType === 'basic' && (
              <Field id="ts-user" label="Username">
                <input id="ts-user" className={inputCls} value={draft.username} onChange={(e) => set({ username: e.target.value })} autoComplete="off" required />
              </Field>
            )}
            {draft.authType === 'oauth2' && (
              <>
                <Field id="ts-token" label="Token URL">
                  <input id="ts-token" className={`${inputCls} font-mono`} value={draft.tokenUrl} onChange={(e) => set({ tokenUrl: e.target.value })} required />
                </Field>
                <Field id="ts-client" label="Client ID">
                  <input id="ts-client" className={inputCls} value={draft.clientId} onChange={(e) => set({ clientId: e.target.value })} autoComplete="off" required />
                </Field>
                <Field id="ts-scope" label="Scope (optional)">
                  <input id="ts-scope" className={inputCls} value={draft.scope} onChange={(e) => set({ scope: e.target.value })} />
                </Field>
              </>
            )}
            {secretField && (
              <Field id="ts-secret" label={SECRET_LABEL[secretField]} hint={keepsSecret ? 'A value is stored. Leave blank to keep it.' : undefined}>
                <input id="ts-secret" type="password" className={`${inputCls} font-mono`} value={draft.secret} onChange={(e) => set({ secret: e.target.value })}
                  placeholder={keepsSecret ? '•••••••• (stored)' : ''} autoComplete="new-password" required={!keepsSecret} />
              </Field>
            )}
          </div>
          <Field id="ts-payload" label="Payload parameters (JSON)" hint="Sent with every run request to this server.">
            <textarea id="ts-payload" rows={4} className={`${inputCls} font-mono`} value={draft.payloadText} onChange={(e) => set({ payloadText: e.target.value })} />
          </Field>
          <div className="flex gap-2">
            <button type="submit" disabled={busy !== null} className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs disabled:opacity-50">
              {busy === 'save' ? 'Saving…' : draft.id ? 'Save changes' : 'Register server'}
            </button>
            <button type="button" onClick={() => setDraft(null)} className={btnCls}>Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="px-5 py-4 text-xs text-slate-500">Loading…</p>
      ) : servers.length === 0 ? (
        !draft && <p className="px-5 py-4 text-xs text-slate-500">No test servers registered yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {servers.map((s) => {
            const check = checks[s.id];
            return (
              <li key={s.id} className="px-5 py-3 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-900">{s.name}</div>
                  <div className="text-[11px] font-mono text-slate-500 truncate">{s.endpointUrl}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                    {s.authType && s.authType !== 'none' && <Lock className="w-3 h-3" aria-hidden />}
                    {AUTH_TYPE_LABELS[s.authType ?? 'none']}
                    {s.payload && Object.keys(s.payload).length > 0 && ` · ${Object.keys(s.payload).length} payload parameter${Object.keys(s.payload).length === 1 ? '' : 's'}`}
                  </div>
                  {check && (
                    <div role="status" className={`text-[11px] mt-1 ${check.ok ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                      {check.ok ? `Connected · HTTP ${check.status} in ${check.latencyMs} ms` : check.error}
                    </div>
                  )}
                </div>
                <div className="flex gap-1.5">
                  <button type="button" disabled={busy !== null} aria-label={`Test connection to ${s.name}`}
                    onClick={() => void run(`check-${s.id}`, async () => {
                      const result = await checkTestServer(s.id);
                      setChecks((c) => ({ ...c, [s.id]: result }));
                    })}
                    className={`${btnCls} flex items-center gap-1`}>
                    <Plug className="w-3.5 h-3.5" /> {busy === `check-${s.id}` ? 'Testing…' : 'Test'}
                  </button>
                  <button type="button" disabled={busy !== null} aria-label={`Edit ${s.name}`} onClick={() => { setDraft(draftFrom(s)); setMessage(null); }} className={btnCls}>
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" disabled={busy !== null} aria-label={`Delete ${s.name}`}
                    onClick={() => {
                      if (!window.confirm(`Delete test server "${s.name}"? Its stored credentials are removed too.`)) return;
                      void run(`delete-${s.id}`, async () => {
                        await deleteTestServer(s.id);
                        if (draft?.id === s.id) setDraft(null);
                        await load();
                      });
                    }}
                    className={`${btnCls} text-[var(--danger)]`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {message && (
        <p role={message.error ? 'alert' : 'status'} className={`px-5 py-2 text-xs border-t border-[var(--border)] ${message.error ? 'text-[var(--danger)]' : 'text-slate-600'}`}>{message.text}</p>
      )}
    </div>
  );
};
