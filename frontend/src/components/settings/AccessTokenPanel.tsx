import React, { useState } from 'react';
import { Copy, KeyRound } from 'lucide-react';
import { createAccessToken, type AccessToken } from '../../services/backendAuthService';

/** A JWT access token for scripts and tools (DDS-SRS-076): sent as
 * `Authorization: Bearer <token>` to any API route, valid for an hour and
 * only while this session is - signing out revokes it. */
export const AccessTokenPanel: React.FC = () => {
  const [token, setToken] = useState<(AccessToken & { at: number }) | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600"><KeyRound className="w-4 h-4" /></div>
          <div>
            <div className="text-xs font-bold text-slate-900">API access token (JWT)</div>
            <div className="text-[11px] text-slate-500 mt-0.5">For scripts and tools: send it as <code className="font-mono">Authorization: Bearer …</code>. Valid for an hour, and only while you stay signed in.</div>
          </div>
        </div>
        <button type="button" className="ui-button shrink-0" onClick={() => {
          setError('');
          createAccessToken().then((t) => setToken({ ...t, at: Date.now() })).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
        }}>Create token</button>
      </div>
      {token && (
        <div role="status" className="space-y-1">
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 overflow-x-auto whitespace-nowrap border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--text)]">{token.accessToken}</code>
            <button type="button" aria-label="Copy access token" className="ui-button shrink-0"
              onClick={() => { void navigator.clipboard?.writeText(token.accessToken).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>
              <Copy className="w-3.5 h-3.5" /> {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-[10px] text-slate-500">Expires {new Date(token.at + token.expiresIn * 1000).toLocaleTimeString()}.</p>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
};
