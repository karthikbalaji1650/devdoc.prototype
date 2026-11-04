import React, { useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { downloadServerBackup, isAdminDataAvailable, resetServerData, RESET_CONFIRMATION } from '../../services/adminDataService';

/** Admin backup and reset of the server's data (DDS-SRS-008). */
export const ServerDataPanel: React.FC = () => {
  const available = isAdminDataAvailable();
  const [busy, setBusy] = useState<'backup' | 'reset' | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [confirmText, setConfirmText] = useState('');

  const run = async (kind: 'backup' | 'reset', op: () => Promise<void>, done: string) => {
    setBusy(kind);
    setMessage(null);
    try {
      await op();
      setMessage({ text: done, error: false });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : String(err), error: true });
    } finally {
      setBusy(null);
    }
  };

  if (!available) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs text-xs text-slate-600">
        All data is stored on the server, so backups and resets need the backend (VITE_API_BASE_URL).
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden shadow-xs">
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600"><Download className="w-4 h-4" /></div>
          <div>
            <div className="text-xs font-bold text-slate-900">Download server backup</div>
            <div className="text-[11px] text-slate-500 mt-0.5">One JSON file with every document (deleted ones too), test management, libraries, logs, Doc Bin, version history and the session audit log.</div>
          </div>
        </div>
        <button type="button" disabled={busy !== null} onClick={() => void run('backup', downloadServerBackup, 'Backup downloaded.')}
          className="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold shrink-0 shadow-2xs disabled:opacity-50">
          {busy === 'backup' ? 'Preparing…' : 'Download'}
        </button>
      </div>
      <div className="px-5 py-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-rose-50 text-rose-600"><Trash2 className="w-4 h-4" /></div>
          <div>
            <div className="text-xs font-bold text-[var(--danger)]">Reset all data</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Permanently deletes every document and all test management, library, log and Doc Bin data on the server, for every user.
              Users, sign-ins and the session audit log are kept. Download a backup first.
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="reset-confirm" className="text-[11px] text-slate-600">Type <code className="font-mono font-bold">{RESET_CONFIRMATION}</code> to confirm</label>
          <input id="reset-confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off"
            className="flex-1 min-w-40 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-900 focus:outline-none focus:border-rose-500" />
          <button type="button" disabled={busy !== null || confirmText !== RESET_CONFIRMATION}
            onClick={() => void run('reset', async () => {
              await resetServerData(confirmText);
              setConfirmText('');
              setTimeout(() => window.location.reload(), 1500); // reload so every screen starts from the empty server
            }, 'All data deleted. Reloading…')}
            className="px-3.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-semibold shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed">
            {busy === 'reset' ? 'Deleting…' : 'Reset all data'}
          </button>
        </div>
      </div>
      {message && (
        <p role={message.error ? 'alert' : 'status'} className={`px-5 py-2 text-xs ${message.error ? 'text-rose-600' : 'text-slate-600'}`}>{message.text}</p>
      )}
    </div>
  );
};
