import React, { useEffect, useState } from 'react';
import { History, RotateCcw, X } from 'lucide-react';
import type { TestCaseItem } from '../../types/operations';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { loadCaseRevisions, restoreCaseRevision, type CaseRevision } from '../../services/testManagementApiService';

// DDS-SRS-014: a test case's saved versions, what changed in each, and
// restoring one (which saves it as a new revision, so nothing is lost).

const FIELD_LABELS: Record<string, string> = {
  customId: 'ID', title: 'Title', type: 'Type', priority: 'Priority', sectionId: 'Section',
  preconditions: 'Pre-conditions', steps: 'Steps', expectedResult: 'Expected result',
  postconditions: 'Post-conditions', attachments: 'Attachments', labels: 'Labels',
  references: 'References', estimateMin: 'Estimate (min)', automationCandidate: 'Automation candidate',
  robotCode: 'Robot code', isFlagged: 'Flagged', isDeleted: 'In the bin', status: 'Status',
  evidenceImageName: 'Screenshot', evidenceImageHash: 'Screenshot',
};

const label = (field: string) => FIELD_LABELS[field] ?? field;

function show(field: string, value: unknown, sectionTitle: (id: string) => string): string {
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) return '—';
  if (field === 'steps' && Array.isArray(value)) {
    return value.map((s: { step?: number; action?: string; expected?: string }, i) =>
      `${s.step ?? i + 1}. ${s.action ?? ''}${s.expected ? ` → ${s.expected}` : ''}`).join('\n');
  }
  if (field === 'attachments' && Array.isArray(value)) {
    return value.map((a: { name?: string; size?: number }) => `${a.name ?? 'file'}${a.size ? ` (${Math.ceil(a.size / 1024)} KB)` : ''}`).join(', ');
  }
  if (field === 'evidenceImageHash') return `image ${String(value).slice(0, 6)}`;
  if (field === 'sectionId') return sectionTitle(String(value));
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

interface CaseHistoryModalProps {
  suiteId: string;
  testCase: TestCaseItem;
  sectionTitle: (sectionId: string) => string;
  onRestore: (restored: TestCaseItem, revision: number) => void;
  onClose: () => void;
}

export const CaseHistoryModal: React.FC<CaseHistoryModalProps> = ({ suiteId, testCase, sectionTitle, onRestore, onClose }) => {
  const dialogRef = useDialogA11y<HTMLElement>(onClose);
  const [revisions, setRevisions] = useState<CaseRevision[] | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(0); // index into revisions (newest first)

  useEffect(() => {
    let cancelled = false;
    loadCaseRevisions(suiteId, testCase.id)
      .then((r) => { if (!cancelled) setRevisions(r); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [suiteId, testCase.id]);

  const rev = revisions?.[selected];
  const previous = revisions?.[selected + 1];
  const fields = rev ? (rev.changes.includes('evidenceImageHash') ? rev.changes.filter((f) => f !== 'evidenceImageName') : rev.changes) : [];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="case-history-title"
        className="flex max-h-[85vh] w-full max-w-3xl flex-col border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] shadow-2xl">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <History className="h-5 w-5 text-[var(--blue)]" />
            <div>
              <h2 id="case-history-title" className="text-base font-semibold">History of {testCase.customId}</h2>
              <p className="text-xs text-[var(--text-dim)]">Every saved change, newest first. Restoring saves that version as a new revision; current attachments and screenshot are kept.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close history" className="rounded p-1.5 text-[var(--text-dim)] hover:bg-[var(--panel-alt)] hover:text-[var(--text)]"><X className="h-4 w-4" /></button>
        </header>

        {error ? (
          <p role="alert" className="p-6 text-sm text-rose-600">{error}</p>
        ) : revisions === null ? (
          <p role="status" className="p-6 text-sm text-[var(--text-dim)]">Loading history…</p>
        ) : revisions.length === 0 ? (
          <p className="p-6 text-sm text-[var(--text-dim)]">No history yet - it starts with the case's first save to the server.</p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
            <ul aria-label="Revisions" className="max-h-48 shrink-0 overflow-y-auto border-b border-[var(--border)] sm:max-h-none sm:w-60 sm:border-b-0 sm:border-r">
              {revisions.map((r, i) => (
                <li key={r.revision}>
                  <button type="button" onClick={() => setSelected(i)} aria-current={i === selected}
                    className={`w-full px-4 py-2.5 text-left text-xs ${i === selected ? 'bg-[var(--panel-alt)] font-semibold' : 'hover:bg-[var(--panel-alt)]'}`}>
                    <span className="block">Revision {r.revision}{i === 0 ? ' (current)' : ''}</span>
                    <span className="block text-[11px] text-[var(--text-dim)]">{r.savedBy} · {new Date(r.savedAt).toLocaleString()}</span>
                    <span className="block truncate text-[11px] text-[var(--text-dim)]">
                      {r.changes.length ? r.changes.map(label).filter((v, j, a) => a.indexOf(v) === j).join(', ') : 'Created'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {rev && (
              <div className="min-w-0 flex-1 overflow-y-auto p-4 text-xs">
                {!previous && !rev.changes.length ? (
                  <p className="text-[var(--text-dim)]">The case as first saved{revisions.length === 50 ? ' (or the oldest kept revision - history keeps the latest 50)' : ''}.</p>
                ) : !previous ? (
                  <p className="text-[var(--text-dim)]">Older revisions are no longer kept (history keeps the latest 50).</p>
                ) : (
                  <table className="w-full border-collapse" aria-label={`Changes in revision ${rev.revision}`}>
                    <thead>
                      <tr className="text-left text-[10px] uppercase text-[var(--text-dim)]">
                        <th className="w-28 py-1 pr-2">Field</th><th className="py-1 pr-2">Before</th><th className="py-1">After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fields.map((f) => (
                        <tr key={f} className="border-t border-[var(--border)] align-top">
                          <th scope="row" className="py-2 pr-2 text-left font-semibold">{label(f)}</th>
                          <td className="whitespace-pre-wrap py-2 pr-2 text-rose-700 line-through decoration-rose-300">{show(f, (previous.case as Record<string, unknown>)[f], sectionTitle)}</td>
                          <td className="whitespace-pre-wrap py-2 text-emerald-700">{show(f, (rev.case as Record<string, unknown>)[f], sectionTitle)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {selected > 0 && (
                  <button type="button" onClick={() => onRestore(restoreCaseRevision(testCase, rev), rev.revision)}
                    className="mt-4 flex items-center gap-1.5 border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-dim)] hover:border-[var(--success)] hover:text-[var(--success)]">
                    <RotateCcw className="h-3.5 w-3.5" /> Restore revision {rev.revision}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
