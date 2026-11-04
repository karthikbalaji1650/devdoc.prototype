import React, { useEffect, useState } from 'react';
import { History, RotateCcw, X } from 'lucide-react';
import type { DocumentModel } from '../../types/document';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { listSnapshots, type Snapshot } from '../../services/documentsStoreService';

interface VersionHistoryModalProps {
  documentId: string;
  canRestore: boolean;
  onClose: () => void;
  onRestore: (snapshot: Snapshot) => void;
}

function summarise(doc: DocumentModel): string {
  const words = doc.sections.reduce((n, s) => n + (typeof s.content === 'string' ? s.content.split(/\s+/).filter(Boolean).length : 0), 0);
  return `${doc.sections.length} sections · ~${words} words · v${doc.metadata.version || '1.0'}`;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({ documentId, canRestore, onClose, onRestore }) => {
  // Kept by the server, for everyone who can see the document.
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    listSnapshots(documentId).then(
      (s) => { if (!cancelled) setSnapshots(s); },
      (err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); },
    );
    return () => { cancelled = true; };
  }, [documentId]);
  const dialogRef = useDialogA11y<HTMLElement>(onClose);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="version-history-title" className="flex max-h-[85vh] w-full max-w-xl flex-col border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] shadow-2xl">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <History className="h-5 w-5 text-[var(--blue)]" />
            <div>
              <h2 id="version-history-title" className="text-base font-semibold">Version history</h2>
              <p className="text-xs text-[var(--text-dim)]">Earlier saved versions of this document. Restoring keeps your current version in the list.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close version history" className="rounded p-1.5 text-[var(--text-dim)] hover:bg-[var(--panel-alt)] hover:text-[var(--text)]"><X className="h-4 w-4" /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          {error ? (
            <p role="alert" className="p-4 text-sm text-red-400">{error}</p>
          ) : snapshots === null ? (
            <p role="status" className="p-4 text-sm text-[var(--text-dim)]">Loading history…</p>
          ) : snapshots.length === 0 ? (
            <div className="border border-dashed border-[var(--border)] p-10 text-center text-sm text-[var(--text-dim)]">
              No earlier versions yet. A restore point is saved automatically every few minutes while you edit.
            </div>
          ) : (
            <ul className="space-y-2">
              {snapshots.map((snap) => (
                <li key={snap.id} className="flex items-center gap-3 border border-[var(--border)] bg-[var(--panel-alt)] px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-[var(--text)]">{new Date(snap.savedAt).toLocaleString()}</div>
                    <div className="truncate text-[11px] text-[var(--text-dim)]">{snap.label} · {summarise(snap.doc)}</div>
                  </div>
                  {canRestore && (
                    <button type="button" onClick={() => onRestore(snap)} className="flex items-center gap-1.5 border border-[var(--border)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-dim)] hover:border-[var(--success)] hover:text-[var(--success)]">
                      <RotateCcw className="h-3.5 w-3.5" /> Restore
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
};
