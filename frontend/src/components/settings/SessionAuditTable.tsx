import React, { useCallback, useEffect, useState } from 'react';
import { Clock, RefreshCw } from 'lucide-react';
import { fetchSessionAudit, isSessionAuditAvailable, type SessionAuditEntry } from '../../services/sessionAuditApiService';

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDuration(loginIso: string, endIso: string | null): string {
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const minutes = Math.max(0, Math.round((end - new Date(loginIso).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** DDS-SRS-011: every sign-in, as the server recorded it. */
export const SessionAuditTable: React.FC = () => {
  const available = isSessionAuditAvailable();
  const [sessions, setSessions] = useState<SessionAuditEntry[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setSessions(await fetchSessionAudit());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => { if (available) void load(); }, [available, load]);

  const message = !available
    ? 'The session audit log is recorded by the server. Run the app with VITE_API_BASE_URL set (docker compose up does this).'
    : error || (sessions === null ? 'Loading…' : sessions.length === 0 ? 'No session activity recorded yet.' : '');

  return (
    <>
      {available && (
        <div className="px-5 py-2 flex justify-end border-b border-slate-100">
          <button type="button" onClick={() => void load()} className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800">
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-100">
            <tr>
              <th className="px-5 py-2 font-bold">User</th>
              <th className="px-3 py-2 font-bold">Role</th>
              <th className="px-3 py-2 font-bold">Login</th>
              <th className="px-3 py-2 font-bold">Logout</th>
              <th className="px-3 py-2 font-bold">Duration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(sessions ?? []).map((s) => {
              const end = s.logoutTime ?? (s.status === 'expired' ? s.expiresAt : null);
              return (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-2.5 font-semibold text-slate-800">{s.userName}</td>
                  <td className="px-3 py-2.5 text-slate-500 capitalize">{s.role.replace('-', ' ')}</td>
                  <td className="px-3 py-2.5 text-slate-500 font-mono">{formatTimestamp(s.loginTime)}</td>
                  <td className="px-3 py-2.5 font-mono">
                    {s.status === 'active' ? (
                      <span className="text-emerald-600 font-semibold flex items-center gap-1"><Clock className="w-3 h-3" /> Active</span>
                    ) : s.status === 'expired' ? (
                      <span className="text-amber-700">Expired {formatTimestamp(s.expiresAt)}</span>
                    ) : (
                      <span className="text-slate-500">{formatTimestamp(s.logoutTime!)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 font-mono">{formatDuration(s.loginTime, end)}</td>
                </tr>
              );
            })}
            {message && (
              <tr>
                <td colSpan={5} role={error ? 'alert' : undefined} className={`px-5 py-6 text-center text-xs ${error ? 'text-rose-600' : 'text-slate-400'}`}>{message}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
};
