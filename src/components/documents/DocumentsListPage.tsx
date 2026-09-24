import React, { useState } from 'react';
import { FileText, Plus, ChevronRight, Trash2, ArchiveRestore } from 'lucide-react';
import type { DocumentModel, DocStatus } from '../../types/document';
import type { AppView, OperationsTab } from '../../types/appState';
import type { UserProfile } from '../../types/auth';
import { AppSidebar } from '../AppSidebar';
import { DocBinModal } from './DocBinModal';

interface DocumentsListPageProps {
  user: UserProfile;
  documents: DocumentModel[];
  scopeLabel: string; // e.g. "My in-progress documents" or "All documents"
  onOpen: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRestore: () => void;
  onNavigate: (app: AppView, opsTab?: OperationsTab) => void;
  onLogout: () => void;
}

const STATUS_STYLES: Record<DocStatus, { bg: string; text: string; dot: string }> = {
  DRAFT: { bg: 'bg-[#2a220b]', text: 'text-[var(--amber)]', dot: 'bg-[var(--amber)]' },
  IN_REVIEW: { bg: 'bg-[#111d2f]', text: 'text-[var(--purple)]', dot: 'bg-[var(--purple)]' },
  APPROVED: { bg: 'bg-[#142b1d]', text: 'text-[var(--success)]', dot: 'bg-[var(--success)]' },
  PUBLISHED: { bg: 'bg-[#0e2233]', text: 'text-[var(--blue)]', dot: 'bg-[var(--blue)]' },
};

export const DocumentsListPage: React.FC<DocumentsListPageProps> = ({
  user, documents, scopeLabel, onOpen, onCreate, onDelete, onRestore, onNavigate, onLogout,
}) => {
  const [docBinOpen, setDocBinOpen] = useState(false);
  return (
    <div className="flex h-screen bg-[var(--bg)] text-[var(--text)] font-sans overflow-hidden">
      <AppSidebar user={user} compact activeView="doccraft" onNavigate={onNavigate} onLogout={onLogout} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="px-6 py-5 border-b border-[var(--border)] flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-lg font-bold text-[var(--text)]">Documents</h1>
            <p className="text-xs text-[var(--text-dim)] mt-0.5">{scopeLabel}</p>
          </div>
          <div className="flex items-center gap-2">
          <button type="button" onClick={() => setDocBinOpen(true)} className="flex items-center gap-1.5 border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-dim)] hover:border-[var(--success)] hover:text-[var(--success)]">
            <ArchiveRestore className="h-3.5 w-3.5" /> Doc Bin
          </button>
          <button
            type="button"
            onClick={onCreate}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold btn-primary"
          >
            <Plus className="w-3.5 h-3.5" /> New Document
          </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {documents.length === 0 ? (
            <div className="border border-dashed border-[var(--border)] rounded-xl p-12 text-center">
              <FileText className="w-8 h-8 text-[var(--text-faint)] mx-auto mb-3" />
              <p className="text-sm text-[var(--text-dim)]">No documents yet.</p>
              <p className="text-xs text-[var(--text-faint)] mt-1">Click "New Document" to start one.</p>
            </div>
          ) : (
            <div className="border border-[var(--border)] rounded-xl overflow-hidden divide-y divide-[var(--border)]">
              {documents.map((doc) => {
                const ss = STATUS_STYLES[doc.metadata.status] ?? STATUS_STYLES.DRAFT;
                return (
                  <div
                    key={doc.metadata.id}
                    className="w-full flex items-center gap-4 px-5 py-4 text-left bg-[var(--panel)] hover:bg-[var(--panel-alt)] transition-colors"
                  >
                    <button type="button" onClick={() => onOpen(doc.metadata.id)} className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-[var(--text-faint)] uppercase">{doc.metadata.docNumber || 'N/A'}</span>
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${ss.bg} ${ss.text}`}>
                          <span className={`w-1 h-1 rounded-full ${ss.dot}`} />
                          {doc.metadata.status}
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-[var(--text)] truncate mt-1">{doc.metadata.title || 'Untitled Document'}</div>
                      <div className="text-[11px] text-[var(--text-dim)] mt-0.5">
                        {doc.metadata.author || 'Unknown author'} · v{doc.metadata.version || '1.0'} · {doc.metadata.date}
                      </div>
                    </button>
                    <button type="button" onClick={() => onDelete(doc.metadata.id)} aria-label={`Move ${doc.metadata.title || 'document'} to Doc Bin`} title="Move to Doc Bin" className="rounded p-2 text-[var(--text-faint)] hover:bg-red-500/10 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
                    <ChevronRight className="w-4 h-4 text-[var(--text-faint)] shrink-0" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {docBinOpen && <DocBinModal onClose={() => setDocBinOpen(false)} onRestore={onRestore} />}
    </div>
  );
};
