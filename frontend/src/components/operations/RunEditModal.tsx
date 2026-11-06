import React, { useState } from 'react';
import { Edit3, X } from 'lucide-react';
import type { TestRunItem } from '../../types/operations';
import { useDialogA11y } from '../../hooks/useDialogA11y';

/** Edit a test run's details (the run page's Edit button). Results are
 * changed on the run page itself, not here. */
export const RunEditModal: React.FC<{ run: TestRunItem; onSave: (run: TestRunItem) => void; onClose: () => void }> = ({ run, onSave, onClose }) => {
  const dialogRef = useDialogA11y<HTMLElement>(onClose);
  const [form, setForm] = useState({
    name: run.name, environment: run.environment, milestone: run.milestone ?? '',
    assignedTo: run.assignedTo ?? '', description: run.description ?? '',
  });
  const input = 'w-full border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-xs text-[var(--text)] focus:border-[var(--blue)] focus:outline-none';
  const label = 'block space-y-1 text-[11px] font-semibold';
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="run-edit-title"
        className="w-full max-w-lg border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] shadow-2xl">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Edit3 className="h-5 w-5 text-[var(--blue)]" />
            <h2 id="run-edit-title" className="text-base font-semibold">Edit run</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1.5 text-[var(--text-dim)] hover:bg-[var(--panel-alt)] hover:text-[var(--text)]"><X className="h-4 w-4" /></button>
        </header>
        <form className="space-y-3 px-5 py-4" onSubmit={(e) => {
          e.preventDefault();
          onSave({
            ...run, name: form.name.trim(), environment: form.environment.trim(),
            milestone: form.milestone.trim() || undefined, assignedTo: form.assignedTo.trim() || undefined,
            description: form.description.trim() || undefined,
          });
        }}>
          <label className={label}>Name<input className={input} required value={form.name} onChange={set('name')} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>Environment<input className={input} required value={form.environment} onChange={set('environment')} /></label>
            <label className={label}>Milestone<input className={input} value={form.milestone} onChange={set('milestone')} /></label>
          </div>
          <label className={label}>Assigned to<input className={input} value={form.assignedTo} onChange={set('assignedTo')} /></label>
          <label className={label}>Description<textarea className={input} rows={3} value={form.description} onChange={set('description')} /></label>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs font-semibold text-[var(--text-dim)] hover:text-[var(--text)]">Cancel</button>
            <button type="submit" className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">Save</button>
          </div>
        </form>
      </section>
    </div>
  );
};
