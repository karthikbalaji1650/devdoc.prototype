import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  UploadCloud,
  HelpCircle,
} from 'lucide-react';
import type { UserProfile } from '../../types/auth';
import type { AppView, OperationsTab } from '../../types/appState';
import { getStoredReviewersLog, reviewersLog } from '../../services/reviewersLogService';
import { useSharedCollection } from '../../services/sharedCollection';
import { listDocuments, useDocuments } from '../../services/documentsStoreService';
import { visibleDocumentsFor } from '../../services/permissions';
import { buildTrackedDocuments, countTracked, findDocumentByNumber, type TrackedStatus } from '../../services/documentStats';
import { isAdmin } from '../../services/permissions';
import { driveExportLog, getLatestDriveExport } from '../../services/googleDriveStatusService';
import { AppSidebar } from '../AppSidebar';
import { WelcomeModal } from '../onboarding/WelcomeModal';
import { hasSeenWelcome, markWelcomeSeen } from '../../services/onboardingService';

interface DashboardPageProps {
  user: UserProfile;
  onNavigate: (app: AppView, opsTab?: OperationsTab) => void;
  onLogout: () => void;
  /** Opens the documents list, optionally narrowed to one status. */
  onOpenDocuments: (status: Exclude<TrackedStatus, 'OTHER'> | null) => void;
  onOpenDocument: (id: string) => void;
}

type ActivityItem = {
  id: string;
  type: 'APPROVED' | 'IN_REVIEW' | 'PENDING' | 'CHANGES_REQUESTED';
  docNumber: string;
  docTitle: string;
  reviewer: string;
  reviewerRole: string;
  date: string;
};

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

// One dot per status; the label stays neutral so color only marks state.
const STATUS_STYLES: Record<ActivityItem['type'], { dot: string; label: string }> = {
  APPROVED: { dot: 'bg-[var(--success)]', label: 'Approved' },
  IN_REVIEW: { dot: 'bg-[var(--amber)]', label: 'In review' },
  PENDING: { dot: 'bg-[var(--text-faint)]', label: 'Pending' },
  CHANGES_REQUESTED: { dot: 'bg-[var(--danger)]', label: 'Changes requested' },
};

/** A document number, set the same way everywhere it names a document. */
const DocTag: React.FC<{ value: string }> = ({ value }) => (
  <span className="inline-flex items-center h-5 px-1.5 rounded border border-[var(--border-soft)] font-mono text-[12px] leading-none text-[var(--text-dim)] whitespace-nowrap">
    {value}
  </span>
);

const StatusLabel: React.FC<{ type: ActivityItem['type'] }> = ({ type }) => (
  <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text-dim)] shrink-0">
    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_STYLES[type].dot}`} />
    {STATUS_STYLES[type].label}
  </span>
);

export const DashboardPage: React.FC<DashboardPageProps> = ({ user, onNavigate, onLogout, onOpenDocuments, onOpenDocument }) => {
  const [notifOpen, setNotifOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(() => !hasSeenWelcome());
  const [chartHover, setChartHover] = useState<'approved' | 'in-review' | null>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!notifOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [notifOpen]);

  // Shared on the server: these re-render once loaded.
  const { items: reviewerItems } = useSharedCollection(reviewersLog);
  const reviewers = useMemo(() => getStoredReviewersLog(), [reviewerItems]);
  const approvedDocs = reviewers.filter(r => r.reviewStatus === 'APPROVED').length;
  const inReviewDocs = reviewers.filter(r => r.reviewStatus === 'IN_REVIEW').length;
  const { items: driveExports } = useSharedCollection(driveExportLog);
  const latestDriveExport = useMemo(() => getLatestDriveExport(), [driveExports]);
  const reviewedDocs = approvedDocs + inReviewDocs;
  const approvalRate = reviewedDocs > 0 ? Math.round((approvedDocs / reviewedDocs) * 100) : 0;
  const inReviewRate = reviewedDocs > 0 ? Math.round((inReviewDocs / reviewedDocs) * 100) : 0;
  const chartRadius = 46;
  const chartCircumference = 2 * Math.PI * chartRadius;
  const approvedArc = (approvedDocs / (reviewedDocs || 1)) * chartCircumference;
  const reviewArc = (inReviewDocs / (reviewedDocs || 1)) * chartCircumference;

  // The headline cards count distinct documents (stored documents merged
  // with reviewer sign-offs), so they agree with Recent Activity and
  // with the list each card opens.
  const { version: documentsVersion } = useDocuments();
  const visibleDocs = useMemo(() => visibleDocumentsFor(user, listDocuments()), [user, documentsVersion]);
  const docCounts = countTracked(buildTrackedDocuments(visibleDocs, reviewers, isAdmin(user)));

  const STATS: { label: string; value: number; status: Exclude<TrackedStatus, 'OTHER'> | null; dot: string | null }[] = [
    { label: 'Total docs', value: docCounts.total, status: null, dot: null },
    { label: 'Approved', value: docCounts.approved, status: 'APPROVED', dot: 'bg-[var(--success)]' },
    { label: 'In review', value: docCounts.inReview, status: 'IN_REVIEW', dot: 'bg-[var(--amber)]' },
  ];

  const recentActivity: ActivityItem[] = useMemo(
    () => reviewers.slice(0, 5).map(r => ({
      id: r.id,
      type: r.reviewStatus,
      docNumber: r.docNumber,
      docTitle: r.docTitle,
      reviewer: r.reviewerName,
      reviewerRole: r.reviewerRole,
      date: r.reviewDate,
    })),
    [reviewers]
  );

  const focusRing = 'focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-1px] focus-visible:outline-[var(--success)]';

  return (
    <div className="flex h-screen bg-[var(--bg)] text-[var(--text)] overflow-hidden">
      <AppSidebar user={user} compact activeView="dashboard" onNavigate={onNavigate} onLogout={onLogout} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 flex items-center justify-between gap-4 px-4 sm:px-8 border-b border-[var(--border-soft)] bg-[var(--panel)] shrink-0">
          <h1 className="text-[17px] sm:text-[20px] font-medium text-[var(--text)] truncate">Engineering workspace</h1>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setWelcomeOpen(true)}
              className={`w-8 h-8 flex items-center justify-center rounded-md text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--panel-alt)] transition-colors ${focusRing}`}
              title="Show the welcome guide again"
              aria-label="Help"
            >
              <HelpCircle className="w-4 h-4" strokeWidth={1.5} />
            </button>
            <div ref={notifRef} className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((o) => !o)}
                className={`relative w-8 h-8 flex items-center justify-center rounded-md text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--panel-alt)] transition-colors ${focusRing}`}
                title="Notifications"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4" strokeWidth={1.5} />
                {recentActivity.length > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border border-[var(--border-soft)] bg-[var(--panel)] shadow-[0_8px_24px_rgba(0,0,0,0.3)] z-50 overflow-hidden">
                  <div className="px-4 h-10 flex items-center border-b border-[var(--border-soft)] text-[13px] font-medium text-[var(--text)]">
                    Notifications
                  </div>
                  {recentActivity.length === 0 ? (
                    <div className="px-4 py-6 text-center text-[13px] text-[var(--text-faint)]">
                      No recent activity
                    </div>
                  ) : (
                    <div className="max-h-80 overflow-y-auto divide-y divide-[var(--border-soft)]">
                      {recentActivity.map((item) => (
                        <div key={item.id} className="px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <DocTag value={item.docNumber} />
                            <StatusLabel type={item.type} />
                          </div>
                          <div className="mt-2 text-[13px] text-[var(--text)] truncate">{item.docTitle}</div>
                          <div className="mt-1 text-[12px] text-[var(--text-faint)]">{item.reviewer} · <span className="font-mono">{item.date}</span></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-8 bg-[var(--bg)]">
          <div className="max-w-[1440px] space-y-4 sm:space-y-6">
            <section aria-label="Document counts" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 rounded-lg border border-[var(--border-soft)] bg-[var(--panel)] overflow-hidden">
              {STATS.map((stat) => (
                <button
                  key={stat.label}
                  type="button"
                  onClick={() => onOpenDocuments(stat.status)}
                  title={`View ${stat.status ? `${stat.label.toLowerCase()} documents` : 'all documents'}`}
                  className={`p-6 text-left border-b sm:border-r xl:border-b-0 border-[var(--border-soft)] transition-colors hover:bg-[var(--panel-alt)] ${focusRing}`}
                >
                  <div className="flex items-center gap-2 text-[13px] text-[var(--text-dim)]">
                    {stat.dot && <span className={`w-1.5 h-1.5 rounded-full ${stat.dot}`} />}
                    {stat.label}
                  </div>
                  <div className="mt-3 text-[32px] leading-none font-medium font-mono tabular-nums text-[var(--text)]">{stat.value}</div>
                </button>
              ))}
              <div className="p-6">
                <div className="flex items-center gap-2 text-[13px] text-[var(--text-dim)]">
                  <UploadCloud className="w-4 h-4" strokeWidth={1.5} /> Google Drive
                </div>
                {latestDriveExport ? (
                  <>
                    <div className="mt-3 text-[15px] font-medium text-[var(--text)]">Synced {formatRelativeTime(latestDriveExport.exportedAt)}</div>
                    <div className="mt-1 text-[12px] text-[var(--text-faint)] truncate">{latestDriveExport.docTitle}</div>
                  </>
                ) : (
                  <div className="mt-3 text-[15px] text-[var(--text-faint)]">Not synced yet</div>
                )}
              </div>
            </section>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 sm:gap-6 items-start">
              <section className="rounded-lg border border-[var(--border-soft)] bg-[var(--panel)] p-4 sm:p-6">
                <h2 className="text-[15px] font-medium text-[var(--text)]">Recent activity</h2>
                <div className="mt-4 space-y-2">
                  {recentActivity.map((item) => {
                    const linked = findDocumentByNumber(visibleDocs, item.docNumber);
                    const Wrapper = (linked ? 'button' : 'div') as React.ElementType;
                    return (
                      <Wrapper
                        key={item.id}
                        {...(linked ? { type: 'button', onClick: () => onOpenDocument(linked.metadata.id), title: 'Open this document' } : {})}
                        className={`block w-full text-left rounded-md border border-[var(--border-soft)] bg-[var(--bg)] px-4 py-3 ${linked ? `transition-colors hover:border-[var(--border)] hover:bg-[var(--panel-alt)] ${focusRing}` : ''}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <DocTag value={item.docNumber} />
                          <StatusLabel type={item.type} />
                        </div>
                        <div className="mt-2 text-[14px] text-[var(--text)]">{item.docTitle}</div>
                        <div className="mt-1 text-[12px] text-[var(--text-faint)]">
                          {item.reviewer}{item.reviewerRole ? `, ${item.reviewerRole}` : ''} · <span className="font-mono tabular-nums">{item.date}</span>
                        </div>
                      </Wrapper>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-lg border border-[var(--border-soft)] bg-[var(--panel)] p-4 sm:p-6">
                <h2 className="text-[15px] font-medium text-[var(--text)]">Sign-offs</h2>
                <p className="mt-1 text-[12px] text-[var(--text-faint)]">From the reviewers log, one per reviewer</p>

                <div className="mt-6 flex justify-center">
                  <div className="relative shrink-0 w-36 h-36">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120" role="img" aria-label={`${approvalRate}% approved, ${inReviewDocs} in review`}>
                      <circle cx="60" cy="60" r={chartRadius} fill="none" stroke="var(--panel-alt)" strokeWidth="10" />
                      {reviewedDocs > 0 && (
                        <>
                          <circle
                            cx="60" cy="60" r={chartRadius} fill="none" stroke="var(--success)" strokeWidth="10" strokeLinecap="butt"
                            strokeDasharray={`${Math.max(approvedArc - 3, 0)} ${chartCircumference}`}
                            className="cursor-pointer outline-none"
                            tabIndex={0}
                            onMouseEnter={() => setChartHover('approved')}
                            onMouseLeave={() => setChartHover(null)}
                            onFocus={() => setChartHover('approved')}
                            onBlur={() => setChartHover(null)}
                          />
                          {inReviewDocs > 0 && (
                            <circle
                              cx="60" cy="60" r={chartRadius} fill="none" stroke="var(--amber)" strokeWidth="10" strokeLinecap="butt"
                              strokeDasharray={`${Math.max(reviewArc - 3, 0)} ${chartCircumference}`}
                              strokeDashoffset={-approvedArc}
                              className="cursor-pointer outline-none"
                              tabIndex={0}
                              onMouseEnter={() => setChartHover('in-review')}
                              onMouseLeave={() => setChartHover(null)}
                              onFocus={() => setChartHover('in-review')}
                              onBlur={() => setChartHover(null)}
                            />
                          )}
                        </>
                      )}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-[28px] leading-none font-medium font-mono tabular-nums text-[var(--text)]">{approvalRate}%</span>
                      <span className="mt-1 text-[12px] text-[var(--text-faint)]">approved</span>
                    </div>
                    {chartHover && (
                      <div role="status" className="absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--border-soft)] bg-[var(--panel-alt)] px-2.5 py-1.5 text-[12px] text-[var(--text)] shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
                        {chartHover === 'approved' ? 'Approved' : 'In review'}: <span className="font-mono tabular-nums">{chartHover === 'approved' ? approvedDocs : inReviewDocs}</span> ({chartHover === 'approved' ? approvalRate : inReviewRate}%)
                      </div>
                    )}
                  </div>
                </div>

                <dl className="mt-6 divide-y divide-[var(--border-soft)] border-t border-[var(--border-soft)]">
                  <div className="h-10 flex items-center justify-between">
                    <dt className="flex items-center gap-2 text-[13px] text-[var(--text-dim)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" /> Approved
                    </dt>
                    <dd className="text-[14px] font-mono tabular-nums text-[var(--text)]">{approvedDocs}</dd>
                  </div>
                  <div className="h-10 flex items-center justify-between">
                    <dt className="flex items-center gap-2 text-[13px] text-[var(--text-dim)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--amber)]" /> In review
                    </dt>
                    <dd className="text-[14px] font-mono tabular-nums text-[var(--text)]">{inReviewDocs}</dd>
                  </div>
                  <div className="h-10 flex items-center justify-between">
                    <dt className="text-[13px] text-[var(--text-faint)]">Total sign-offs</dt>
                    <dd className="text-[14px] font-mono tabular-nums text-[var(--text-dim)]">{reviewedDocs}</dd>
                  </div>
                </dl>
              </section>
            </div>
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
