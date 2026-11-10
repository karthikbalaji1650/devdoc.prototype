import React from 'react';
import { FileText, History, Database, ShieldCheck, X } from 'lucide-react';
import type { UserProfile } from '../../types/auth';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { isAdmin } from '../../services/permissions';
import { isBackendConfigured } from '../../services/backendAuthService';

interface WelcomeModalProps {
  user: UserProfile;
  onClose: () => void;
}

const STEPS: { icon: React.ElementType; title: string; body: string }[] = [
  {
    icon: FileText,
    title: 'Create or open a document',
    body: 'Document Editor takes you to your documents. New Document starts one from a template; edits save automatically as you type.',
  },
  {
    icon: History,
    title: 'Nothing is destroyed by accident',
    body: 'Deleting a document or section sends it to the Doc Bin, and History keeps earlier saved versions - both are one click away to restore.',
  },
];

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ user, onClose }) => {
  const dialogRef = useDialogA11y<HTMLElement>(onClose);
  const steps = isAdmin(user)
    ? [...STEPS, {
        icon: Database,
        title: 'You can see everything, as an admin',
        body: "You see every document, not just your own. Back up or clear local data, and review the session audit log, under Settings → System & Storage.",
      }]
    : STEPS;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="welcome-title" className="flex max-h-[85vh] w-full max-w-lg flex-col border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] shadow-2xl">
        <header className="flex items-start justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 id="welcome-title" className="text-base font-semibold">Welcome to DevDoc Studio, {user.name.split(' ')[0]}</h2>
            <p className="mt-1 text-xs text-[var(--text-dim)]">A quick orientation before you dive in.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close welcome guide" className="rounded p-1.5 text-[var(--text-dim)] hover:bg-[var(--panel-alt)] hover:text-[var(--text)]"><X className="h-4 w-4" /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="flex gap-3 border border-[var(--border)] bg-[var(--panel-alt)] p-3.5">
                <Icon className="h-5 w-5 shrink-0 text-[var(--success)]" />
                <div>
                  <div className="text-sm font-semibold text-[var(--text)]">{step.title}</div>
                  <div className="mt-1 text-xs leading-relaxed text-[var(--text-dim)]">{step.body}</div>
                </div>
              </div>
            );
          })}

          <div className="flex gap-3 border border-[var(--border)] bg-[var(--panel-alt)] p-3.5">
            <ShieldCheck className="h-5 w-5 shrink-0 text-[var(--blue)]" />
            <div>
              {isBackendConfigured() ? (
                <>
                  <div className="text-sm font-semibold text-[var(--text)]">Your work is saved on the server</div>
                  <div className="mt-1 text-xs leading-relaxed text-[var(--text-dim)]">
                    Sign in from any device to pick up where you left off. Teammates see what their role allows.
                  </div>
                </>
              ) : (
                <>
                  <div className="text-sm font-semibold text-[var(--text)]">This is a demo environment</div>
                  <div className="mt-1 text-xs leading-relaxed text-[var(--text-dim)]">
                    Everything you do here is stored in this browser only, so it won't appear on another device unless this deployment is connected to the shared backend.
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <footer className="border-t border-[var(--border)] px-5 py-4">
          <button type="button" onClick={onClose} className="btn-primary w-full px-3.5 py-2.5 text-xs font-semibold">
            Got it, let's go
          </button>
        </footer>
      </section>
    </div>
  );
};
