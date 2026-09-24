import React, { useEffect, useState } from 'react';
import { ArchiveRestore, FileText, RotateCcw, Trash2, X } from 'lucide-react';
import type { DocumentModel } from '../../types/document';
import {
  listDocBin,
  permanentlyDeleteFromDocBin,
  restoreFromDocBin,
  type DocBinEntry,
} from '../../services/documentsStoreService';

interface DocBinModalProps {
  onClose: () => void;
  onRestore?: (document: DocumentModel) => void;
}

export const DocBinModal: React.FC<DocBinModalProps> = ({ onClose, onRestore }) => {
  const [entries, setEntries] = useState<DocBinEntry[]>([]);
  const [message, setMessage] = useState('');

  const refresh = () => setEntries(listDocBin());
  useEffect(() => { refresh(); }, []);

  const handleRestore = (entry: DocBinEntry) => {
    const restored = restoreFromDocBin(entry.id);
    if (!restored) {
      setMessage('Restore failed. The original document may have been deleted permanently.');
      return;
    }
    refresh();
    setMessage(`${entry.itemType === 'document' ? 'Document' : 'Section'} restored.`);
    onRestore?.(restored);
  };

  const handlePermanentDelete = (entry: DocBinEntry) => {
    const label = entry.itemType === 'document' ? entry.documentTitle : entry.section?.title || 'section';
    if (!window.confirm(`Permanently delete "${label}"? This cannot be undone.`)) return;
    permanentlyDeleteFromDocBin(entry.id);
    refresh();
    setMessage('Item permanently deleted.');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="doc-bin-title" className="flex max-h-[85vh] w-full max-w-2xl flex-col border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] shadow-2xl">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <ArchiveRestore className="h-5 w-5 text-[var(--success)]" />
            <div>
              <h2 id="doc-bin-title" className="text-base font-semibold">Doc Bin</h2>
              <p className="text-xs text-[var(--text-dim)]">Deleted documents and sections can be restored here.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close Doc Bin" className="rounded p-1.5 text-[var(--text-dim)] hover:bg-[var(--panel-alt)] hover:text-[var(--text)]"><X className="h-4 w-4" /></button>
        </header>

        {message && <p role="status" className="border-b border-[var(--border)] px-5 py-2 text-xs text-[var(--success)]">{message}</p>}
        <div className="flex-1 overflow-y-auto p-4">
          {entries.length === 0 ? (
            <div className="border border-dashed border-[var(--border)] p-10 text-center">
              <FileText className="mx-auto mb-2 h-7 w-7 text-[var(--text-faint)]" />
              <p className="text-sm text-[var(--text-dim)]">Doc Bin is empty.</p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border)] border border-[var(--border)]">
              {entries.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-4 bg-[var(--bg)] px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{entry.itemType === 'document' ? entry.documentTitle : entry.section?.title || 'Untitled section'}</span>
                      <span className="border border-[var(--border)] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[var(--text-dim)]">{entry.itemType}</span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--text-dim)]">
                      {entry.itemType === 'section' && `${entry.documentTitle} · `}Deleted {new Date(entry.deletedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button type="button" onClick={() => handleRestore(entry)} className="inline-flex items-center gap-1.5 border border-emerald-500/50 px-2.5 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/10">
                      <RotateCcw className="h-3.5 w-3.5" /> Restore
                    </button>
                    <button type="button" onClick={() => handlePermanentDelete(entry)} aria-label={`Permanently delete ${entry.itemType === 'document' ? entry.documentTitle : entry.section?.title || 'section'}`} title="Permanently delete" className="rounded p-1.5 text-[var(--text-dim)] hover:bg-red-500/10 hover:text-red-300">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
};
