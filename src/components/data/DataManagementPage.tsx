import React from 'react';
import { Database, Download, Trash2, FileText, ShieldCheck } from 'lucide-react';
import type { AppView, OperationsTab } from '../../types/appState';
import type { UserProfile } from '../../types/auth';
import { AppSidebar } from '../AppSidebar';
import { getStoredReviewersLog } from '../../services/reviewersLogService';
import { getDriveExportLog } from '../../services/googleDriveStatusService';
import { getSessionAuditLog } from '../../services/sessionAuditService';

interface DataManagementPageProps {
  user: UserProfile;
  onNavigate: (app: AppView, opsTab?: OperationsTab) => void;
  onLogout: () => void;
}

import { getStorageUsage } from '../../services/safeStorage';

function bytesForKey(key: string): number {
  const val = localStorage.getItem(key);
  return val ? new Blob([val]).size : 0;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDuration(loginIso: string, logoutIso: string | null): string {
  const end = logoutIso ? new Date(logoutIso).getTime() : Date.now();
  const minutes = Math.max(0, Math.round((end - new Date(loginIso).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export const DataManagementPage: React.FC<DataManagementPageProps> = ({ user, onNavigate, onLogout }) => {
  const reviewers = getStoredReviewersLog();
  const driveExports = getDriveExportLog();
  const sessionLog = getSessionAuditLog();

  const storageKeys = Object.keys(localStorage);
  const totalBytes = storageKeys.reduce((sum, k) => sum + bytesForKey(k), 0);
  const usage = getStorageUsage();

  const handleExportData = () => {
    const data: Record<string, unknown> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      try { data[k] = JSON.parse(localStorage.getItem(k)!); }
      catch { data[k] = localStorage.getItem(k); }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `devdoc-studio-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearLocalStorage = () => {
    if (window.confirm('This will clear all local app data (AI config, documents, session). You will be logged out. Continue?')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      <AppSidebar user={user} activeView="data-management" onNavigate={onNavigate} onLogout={onLogout} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-8 space-y-6">
          <div className="flex items-center gap-3 pb-2 border-b border-slate-200">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
              <Database className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 leading-tight">Data Management</h2>
              <p className="text-[11px] text-slate-500">Storage summary, backups, and full local data reset.</p>
            </div>
          </div>

          {/* Storage summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-2">Storage keys</div>
              <div className="text-2xl font-black text-slate-900">{storageKeys.length}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-2">Local data size</div>
              <div className="text-2xl font-black text-slate-900">{(totalBytes / 1024).toFixed(1)} KB</div>
              <div className="mt-3 h-1.5 w-full rounded-full bg-slate-200" role="progressbar" aria-label="Browser storage used" aria-valuenow={Math.round(usage.fraction * 100)} aria-valuemin={0} aria-valuemax={100}>
                <div
                  className={`h-full rounded-full ${usage.fraction >= 0.9 ? 'bg-red-500' : usage.fraction >= 0.7 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(100, usage.fraction * 100)}%` }}
                />
              </div>
              <div className="mt-1.5 text-[10px] text-slate-500">
                ~{Math.round(usage.fraction * 100)}% of the browser's ~5 MB limit{usage.fraction >= 0.7 ? ' - export a backup and clear space soon' : ''}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-2">Drive exports logged</div>
              <div className="text-2xl font-black text-slate-900">{driveExports.length}</div>
            </div>
          </div>

          {/* Actions */}
          <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden shadow-xs">
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <div className="text-xs font-bold text-slate-900">Export All Local Data</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Download a JSON backup of all locally stored data.</div>
              </div>
              <button type="button" onClick={handleExportData}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-colors shrink-0 shadow-2xs">
                <Download className="w-3.5 h-3.5" />Export
              </button>
            </div>
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <div className="text-xs font-bold text-[var(--danger)]">Clear All Local Data</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Wipes all stored documents, settings, and session. You will be logged out.</div>
              </div>
              <button type="button" onClick={handleClearLocalStorage}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-semibold transition-colors shrink-0 shadow-2xs">
                <Trash2 className="w-3.5 h-3.5" />Clear
              </button>
            </div>
          </div>

          {/* Reviewer log records (read-only preview of stored data) */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Document review records ({reviewers.length})</span>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
              {reviewers.slice(0, 10).map((r) => (
                <div key={r.id} className="flex items-center justify-between px-5 py-2.5 text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-800 truncate">{r.docTitle}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{r.docNumber}</div>
                  </div>
                  <span className="text-[10px] font-bold uppercase text-slate-500 shrink-0 ml-3">{r.reviewStatus}</span>
                </div>
              ))}
              {reviewers.length === 0 && (
                <div className="px-5 py-6 text-center text-xs text-slate-400">No records stored.</div>
              )}
            </div>
          </div>

          {/* Session audit log (admin-only) */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">User session audit log ({sessionLog.length})</span>
            </div>
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                    <th className="text-left font-bold px-5 py-2">User</th>
                    <th className="text-left font-bold px-3 py-2">Role</th>
                    <th className="text-left font-bold px-3 py-2">Login</th>
                    <th className="text-left font-bold px-3 py-2">Logout</th>
                    <th className="text-left font-bold px-3 py-2">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sessionLog.map((s) => (
                    <tr key={s.id}>
                      <td className="px-5 py-2.5 font-semibold text-slate-800">{s.userName}</td>
                      <td className="px-3 py-2.5 text-slate-500 capitalize">{s.role.replace('-', ' ')}</td>
                      <td className="px-3 py-2.5 text-slate-500 font-mono">{formatTimestamp(s.loginTime)}</td>
                      <td className="px-3 py-2.5 font-mono">
                        {s.logoutTime ? (
                          <span className="text-slate-500">{formatTimestamp(s.logoutTime)}</span>
                        ) : (
                          <span className="text-emerald-600 font-semibold">Active now</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 font-mono">{formatDuration(s.loginTime, s.logoutTime)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sessionLog.length === 0 && (
                <div className="px-5 py-6 text-center text-xs text-slate-400">No session activity recorded yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
