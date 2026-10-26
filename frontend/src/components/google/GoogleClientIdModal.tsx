import React, { useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { getStoredClientId, saveStoredClientId } from '../../services/googleAuthService';

interface GoogleClientIdModalProps {
  onClose: () => void;
  /** Called after a non-empty id is saved, so the caller can retry the export immediately. */
  onSaved: () => void;
}

export const GoogleClientIdModal: React.FC<GoogleClientIdModalProps> = ({ onClose, onSaved }) => {
  const [clientId, setClientId] = useState(() => getStoredClientId() ?? '');
  const dialogRef = useDialogA11y<HTMLElement>(onClose);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = clientId.trim();
    if (!trimmed) return;
    saveStoredClientId(trimmed);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="google-client-id-title" className="flex w-full max-w-md flex-col border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] shadow-2xl">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <KeyRound className="h-5 w-5 text-[var(--blue)]" />
            <div>
              <h2 id="google-client-id-title" className="text-base font-semibold">Google Docs export isn't set up yet</h2>
              <p className="mt-0.5 text-xs text-[var(--text-dim)]">Paste a Google Client ID to turn it on in this browser.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1.5 text-[var(--text-dim)] hover:bg-[var(--panel-alt)] hover:text-[var(--text)]"><X className="h-4 w-4" /></button>
        </header>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-xs leading-relaxed text-[var(--text-dim)]">
            This isn't a secret — it's a public Client ID from Google Cloud Console, safe to paste here. It's saved only in this browser and is never sent anywhere except Google's own sign-in.
            Get one at <span className="text-[var(--blue)]">console.cloud.google.com</span> → APIs &amp; Services → Credentials → OAuth client ID (type: Web application, scope: <code className="text-[11px]">drive.file</code>).
          </p>

          <div className="space-y-1.5">
            <label htmlFor="google-client-id-input" className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-dim)]">Client ID</label>
            <input
              id="google-client-id-input"
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com"
              autoFocus
              className="w-full border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--text)] placeholder-[var(--text-faint)] focus:outline-none focus:border-[var(--blue)]"
            />
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={!clientId.trim()} className="btn-primary flex-1 px-3.5 py-2.5 text-xs font-semibold disabled:opacity-50">
              Save &amp; try export again
            </button>
            <button type="button" onClick={onClose} className="border border-[var(--border)] px-3.5 py-2.5 text-xs font-semibold text-[var(--text-dim)] hover:border-[var(--text-dim)]">
              Cancel
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};
