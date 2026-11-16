import React, { useEffect, useMemo, useState } from 'react';
import { Activity, FileText, GitBranch, HelpCircle, UploadCloud } from 'lucide-react';
import type { UserProfile } from '../../types/auth';
import type { AppView, OperationsTab } from '../../types/appState';
import type { DocStatus } from '../../types/document';
import { useSharedCollection } from '../../services/sharedCollection';
import { getDocumentUpdatedAt, listDocuments, loadDocumentStats, useDocuments } from '../../services/documentsStoreService';
import { DOC_STATUSES, type DocumentFilter, type DocumentStats } from '../../services/documentStats';
import { isAdmin, visibleDocumentsFor } from '../../services/permissions';
import { driveExportLog, getLatestDriveExport } from '../../services/googleDriveStatusService';
import { isReleasesAvailable, loadReleaseActivity } from '../../services/releasesApiService';
import { navigateTo, releasesPath } from '../../services/releasesRoute';
import { mergeActivity, type ReleaseActivityEntry } from '../../services/recentActivity';
import { AppSidebar } from '../AppSidebar';
import { WelcomeModal } from '../onboarding/WelcomeModal';
import { hasSeenWelcome, markWelcomeSeen } from '../../services/onboardingService';

// The landing page after sign-in (DDS-SRS-005): how many documents exist,
// how many are approved and under review, and the Google Drive upload status.
// Counts are team-wide numbers from the server. Recent activity mixes document
// updates (only those this user may open, DDS-SRS-001 to 004) with release
// events from the release audit log, which anyone signed in can read.

interface DashboardPageProps {
  user: UserProfile;
  onNavigate: (app: AppView, opsTab?: OperationsTab) => void;
  onLogout: () => void;
  /** Opens the documents list, optionally narrowed to one status. */
  onOpenDocuments: (status: DocumentFilter | null) => void;
  onOpenDocument: (id: string) => void;
}

const ACTIVITY_LIMIT = 8;

const STATUS: Record<DocStatus, { label: string; color: string; badge: string }> = {
  DRAFT: { label: 'Draft', color: 'var(--text-faint)', badge: 'text-[var(--text-dim)] border-[var(--border)]' },
  IN_REVIEW: { label: 'In review', color: 'var(--amber)', badge: 'status-warning' },
  APPROVED: { label: 'Approved', color: 'var(--success)', badge: 'status-success' },
  PUBLISHED: { label: 'Published', color: 'var(--blue)', badge: 'text-[var(--blue)] border-[var(--blue)] bg-[rgba(62,199,255,0.12)]' },
};

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const panel = 'rounded-xl border border-[var(--border)] bg-[var(--panel)]';
const eyebrow = 'text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-dim)]';

const StatusBadge: React.FC<{ status: DocStatus }> = ({ status }) => (
  <span className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${STATUS[status].badge}`}>{STATUS[status].label}</span>
);

/** A headline number. A button when it opens a list, plain text when it can't. */
const StatCard: React.FC<{ label: string; value: React.ReactNode; note: string; tone?: string; onOpen?: () => void }> = ({ label, value, note, tone = 'text-[var(--text)]', onOpen }) => {
  const body = (
    <>
      <span className={`block ${eyebrow}`}>{label}</span>
      <span className={`mt-2 block text-3xl font-bold tabular-nums ${tone}`}>{value}</span>
      <span className="mt-1 block text-[11px] text-[var(--text-dim)]">{note}</span>
    </>
  );
  return onOpen ? (
    <button type="button" onClick={onOpen} className={`${panel} flex flex-col justify-start p-5 text-left transition-colors hover:border-[var(--text-faint)] hover:bg-[var(--panel-alt)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue)]`}>{body}</button>
  ) : (
    <div className={`${panel} flex flex-col justify-start p-5`}>{body}</div>
  );
};

/** Documents by status as a ring, with the numbers beside it. */
const StatusRing: React.FC<{ stats: DocumentStats }> = ({ stats }) => {
  const r = 46;
  const circumference = 2 * Math.PI * r;
  const summary = `${stats.total} documents: ${DOC_STATUSES.map((s) => `${stats.byStatus[s]} ${STATUS[s].label.toLowerCase()}`).join(', ')}`;
  let offset = 0;
  return (
    <div className="flex flex-col sm:flex-row xl:flex-col 2xl:flex-row items-center gap-6">
      <div className="relative h-32 w-32 shrink-0">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120" role="img" aria-label={summary}>
          <circle cx="60" cy="60" r={r} fill="none" strokeWidth="14" style={{ stroke: 'var(--border-soft)' }} />
          {stats.total > 0 && DOC_STATUSES.map((s) => {
            const length = (stats.byStatus[s] / stats.total) * circumference;
            const segment = (
              <circle key={s} cx="60" cy="60" r={r} fill="none" strokeWidth="14"
                strokeDasharray={`${length} ${circumference}`} strokeDashoffset={-offset} style={{ stroke: STATUS[s].color }} />
            );
            offset += length;
            return length > 0 ? segment : null;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums text-[var(--text)]">{stats.total}</span>
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">documents</span>
        </div>
      </div>
      <ul className="w-full space-y-2" aria-label="Status counts">
        {DOC_STATUSES.map((s) => (
          <li key={s} className="flex items-center justify-between gap-3 border-b border-[var(--border-soft)] pb-2 last:border-b-0 last:pb-0 text-xs">
            <span className="flex items-center gap-2 text-[var(--text-dim)]"><span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS[s].color }} />{STATUS[s].label}</span>
            <span className="font-semibold tabular-nums text-[var(--text)]">{stats.byStatus[s]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const DashboardPage: React.FC<DashboardPageProps> = ({ user, onNavigate, onLogout, onOpenDocuments, onOpenDocument }) => {
  const [welcomeOpen, setWelcomeOpen] = useState(() => !hasSeenWelcome());
  const [stats, setStats] = useState<DocumentStats | null>(null);
  const [statsError, setStatsError] = useState('');
  const admin = isAdmin(user);

  // Re-count whenever the documents change (a save, a delete, the first load).
  const { version: documentsVersion } = useDocuments();
  useEffect(() => {
    let current = true;
    loadDocumentStats().then(
      (s) => { if (current) { setStats(s); setStatsError(''); } },
      (err: Error) => { if (current) setStatsError(err.message); },
    );
    return () => { current = false; };
  }, [documentsVersion]);

  // Release events: read once on arrival (they change on the Release Master screen).
  const [releaseEvents, setReleaseEvents] = useState<ReleaseActivityEntry[]>([]);
  const [releaseEventsError, setReleaseEventsError] = useState(false);
  useEffect(() => {
    if (!isReleasesAvailable()) return;
    let current = true;
    loadReleaseActivity(ACTIVITY_LIMIT).then(
      (entries) => { if (current) setReleaseEvents(entries); },
      () => { if (current) setReleaseEventsError(true); },
    );
    return () => { current = false; };
  }, []);

  const activity = useMemo(
    () => mergeActivity(
      visibleDocumentsFor(user, listDocuments()).map((doc) => ({ doc, updatedAt: getDocumentUpdatedAt(doc.metadata.id) })),
      releaseEvents,
      ACTIVITY_LIMIT,
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, documentsVersion, releaseEvents],
  );

  const { items: driveExports } = useSharedCollection(driveExportLog);
  const latestDriveExport = useMemo(() => getLatestDriveExport(), [driveExports]);

  const count = (n: number | undefined) => (stats ? n : '–');

  return (
    <div className="flex h-screen bg-[var(--bg)] text-[var(--text)] overflow-hidden">
      <AppSidebar user={user} activeView="dashboard" onNavigate={onNavigate} onLogout={onLogout} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-4 px-7 py-5 border-b border-[var(--border)] bg-[var(--panel)] shrink-0">
          <div>
            <div className={eyebrow}>Dashboard</div>
            <h1 className="text-xl font-bold text-[var(--text)] mt-1">{getGreeting()}, {user.name.split(' ')[0]}</h1>
          </div>
          <button type="button" onClick={() => setWelcomeOpen(true)} className="ui-button ui-button-icon" title="Show the welcome guide again" aria-label="Help">
            <HelpCircle className="w-4 h-4" />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-6 md:p-7 space-y-6">
          {statsError && <p role="alert" className="rounded-lg border border-[var(--danger)] bg-[rgba(255,84,112,0.12)] px-3 py-2 text-xs text-[var(--danger)]">Could not load the document counts: {statsError}</p>}

          <section aria-label="Document counts" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard label="Total documents" value={count(stats?.total)} note="Every document created, except those in the Doc Bin" onOpen={() => onOpenDocuments(null)} />
            <StatCard label="Approved" value={count(stats?.byStatus.APPROVED)} tone="text-[var(--success)]"
              note={admin ? 'Approved by their reviewers' : 'Approved documents open for admins only'}
              onOpen={admin ? () => onOpenDocuments('APPROVED') : undefined} />
            <StatCard label="Under review" value={count(stats?.byStatus.IN_REVIEW)} tone="text-[var(--amber)]" note="Waiting on a review" onOpen={() => onOpenDocuments('IN_REVIEW')} />
            <div className={`${panel} p-5`}>
              <span className={`flex items-center gap-1.5 ${eyebrow}`}><UploadCloud aria-hidden className="w-3.5 h-3.5" /> Google Drive</span>
              {latestDriveExport ? (
                <>
                  <span className="mt-2 block text-lg font-bold text-[var(--success)] leading-tight">Synced {formatRelativeTime(latestDriveExport.exportedAt)}</span>
                  <span className="mt-1 block truncate text-[11px] text-[var(--text-dim)]">{latestDriveExport.docTitle}</span>
                </>
              ) : (
                <>
                  <span className="mt-2 block text-lg font-bold text-[var(--text-dim)] leading-tight">Not synced yet</span>
                  <span className="mt-1 block text-[11px] text-[var(--text-dim)]">No document uploaded to Google Drive</span>
                </>
              )}
            </div>
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)] gap-6 items-start">
            <section aria-label="Recent activity" className={`${panel} p-5 space-y-4`}>
              <div>
                <h2 className="text-sm font-semibold text-[var(--text)]">Recent activity</h2>
                <p className="mt-0.5 text-[11px] text-[var(--text-dim)]">Document updates and release events, newest first.</p>
              </div>
              {releaseEventsError && <p className="text-[11px] text-[var(--amber)]">Release events could not be loaded; showing documents only.</p>}
              {activity.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--border)] p-8 text-center">
                  <Activity aria-hidden className="w-6 h-6 text-[var(--text-faint)] mx-auto mb-2" />
                  <p className="text-xs text-[var(--text-dim)]">Nothing yet. New and updated documents and release changes show up here.</p>
                </div>
              ) : (
                <ul className="divide-y divide-[var(--border-soft)] rounded-lg border border-[var(--border-soft)]">
                  {activity.map((item) => (
                    <li key={item.key}>
                      <button type="button"
                        onClick={() => (item.kind === 'document'
                          ? onOpenDocument(item.docId)
                          : navigateTo(releasesPath({ view: 'release', releaseId: item.releaseId, tab: 'overview', buildId: null })))}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--panel-alt)]">
                        <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-dim)]">
                          {item.kind === 'document' ? <FileText className="w-4 h-4" /> : <GitBranch className="w-4 h-4" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-[var(--text)]">
                            {item.kind === 'document' ? item.title : <>{item.version} <span className="text-[var(--text-dim)]">·</span> {item.title}</>}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-[var(--text-dim)]">
                            {item.kind === 'document'
                              ? ['Document', item.docNumber, item.author ? `by ${item.author}` : ''].filter(Boolean).join(' · ')
                              : `Release · ${item.line}`}
                          </div>
                        </div>
                        {item.kind === 'document' && <StatusBadge status={item.status} />}
                        <span className="hidden sm:block w-16 shrink-0 text-right text-[11px] text-[var(--text-dim)]">{formatRelativeTime(item.at)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-label="Documents by status" className={`${panel} p-5 space-y-4`}>
              <div>
                <h2 className="text-sm font-semibold text-[var(--text)]">Documents by status</h2>
                <p className="mt-0.5 text-[11px] text-[var(--text-dim)]">Every document, team-wide.</p>
              </div>
              {stats ? <StatusRing stats={stats} /> : !statsError && <p role="status" className="text-xs text-[var(--text-dim)]">Loading counts…</p>}
            </section>
          </div>
        </main>
      </div>
      {welcomeOpen && (
        <WelcomeModal
          user={user}
          onClose={() => { markWelcomeSeen(); setWelcomeOpen(false); }}
        />
      )}
    </div>
  );
};
