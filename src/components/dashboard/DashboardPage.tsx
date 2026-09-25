import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText,
  Bell,
  LogOut,
  CheckCircle2,
  Clock,
  UploadCloud,
} from 'lucide-react';
import type { UserProfile } from '../../types/auth';
import type { AppView, OperationsTab } from '../../types/appState';
import { getStoredReviewersLog } from '../../services/reviewersLogService';
import { getLatestDriveExport } from '../../services/googleDriveStatusService';
import { AppSidebar } from '../AppSidebar';

interface DashboardPageProps {
  user: UserProfile;
  onNavigate: (app: AppView, opsTab?: OperationsTab) => void;
  onLogout: () => void;
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

const STATUS_STYLES: Record<ActivityItem['type'], { bg: string; dot: string; label: string }> = {
  APPROVED: { bg: 'bg-[#142b1d] text-[#4ade80] border border-[#1f5d39]', dot: 'bg-[#4ade80]', label: 'Approved' },
  IN_REVIEW: { bg: 'bg-[#111d2f] text-[#a78bfa] border border-[#304c7d]', dot: 'bg-[#a78bfa]', label: 'In Review' },
  PENDING: { bg: 'bg-[#2a220b] text-[#fbbf24] border border-[#6a4d12]', dot: 'bg-[#fbbf24]', label: 'Pending' },
  CHANGES_REQUESTED: { bg: 'bg-[#2a1212] text-[#f87171] border border-[#7d2d2d]', dot: 'bg-[#f87171]', label: 'Changes Req.' },
};

export const DashboardPage: React.FC<DashboardPageProps> = ({ user, onNavigate, onLogout }) => {
  const [notifOpen, setNotifOpen] = useState(false);
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

  const reviewers = useMemo(() => getStoredReviewersLog(), []);
  const totalDocs = reviewers.length;
  const approvedDocs = reviewers.filter(r => r.reviewStatus === 'APPROVED').length;
  const inReviewDocs = reviewers.filter(r => r.reviewStatus === 'IN_REVIEW').length;
  const latestDriveExport = useMemo(() => getLatestDriveExport(), []);
  const reviewedDocs = approvedDocs + inReviewDocs;
  const approvalRate = reviewedDocs > 0 ? Math.round((approvedDocs / reviewedDocs) * 100) : 0;
  const inReviewRate = reviewedDocs > 0 ? Math.round((inReviewDocs / reviewedDocs) * 100) : 0;
  const testProgress = reviewedDocs > 0 ? Math.round((approvedDocs / reviewedDocs) * 100) : 0;
  const chartRadius = 46;
  const chartCircumference = 2 * Math.PI * chartRadius;
  const approvedArc = (approvedDocs / (reviewedDocs || 1)) * chartCircumference;
  const reviewArc = (inReviewDocs / (reviewedDocs || 1)) * chartCircumference;

  const STATS = [
    { label: 'total docs', value: totalDocs, icon: FileText, valueColor: 'text-[#ededed]' },
    { label: 'approved', value: approvedDocs, icon: CheckCircle2, valueColor: 'text-[#4ade80]' },
    { label: 'in review', value: inReviewDocs, icon: Clock, valueColor: 'text-[#fbbf24]' },
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

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-[#ededed] overflow-hidden">
      <AppSidebar user={user} activeView="dashboard" onNavigate={onNavigate} onLogout={onLogout} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-24 flex items-center justify-between px-7 border-b border-[#242424] bg-[#0d0d0d] shrink-0">
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-[#8a8a8a] font-mono">Dashboard overview</div>
            <h1 className="text-xl font-bold text-[#ededed] mt-1">{getGreeting()}, {user.name.split(' ')[0]}</h1>
          </div>

          <div className="flex items-center gap-3">
            <div ref={notifRef} className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((o) => !o)}
                className="ui-button ui-button-icon relative"
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                {recentActivity.length > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#4ade80]" />
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 border border-[#242424] bg-[#111111] shadow-lg z-50">
                  <div className="px-3 py-2.5 border-b border-[#242424] text-[10px] uppercase tracking-[0.16em] text-[#8a8a8a] font-mono">
                    Notifications
                  </div>
                  {recentActivity.length === 0 ? (
                    <div className="px-3 py-6 text-center text-[11px] text-[#8a8a8a] font-mono">
                      No recent activity.
                    </div>
                  ) : (
                    <div className="max-h-80 overflow-y-auto divide-y divide-[#242424]">
                      {recentActivity.map((item) => {
                        const ss = STATUS_STYLES[item.type];
                        return (
                          <div key={item.id} className="px-3 py-2.5">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-[10px] uppercase tracking-[0.1em] text-[#8a8a8a] font-mono truncate">{item.docNumber}</div>
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-[0.1em] font-mono shrink-0 ${ss.bg}`}>
                                <span className={`w-1 h-1 rounded-full ${ss.dot}`} />
                                {ss.label}
                              </span>
                            </div>
                            <div className="mt-1 text-xs font-medium text-[#ededed] truncate">{item.docTitle}</div>
                            <div className="mt-1 text-[10px] text-[#8a8a8a] font-mono">{item.reviewer} · {item.date}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="border-l border-[#242424] h-6 ml-1" />
            <div className="ui-panel flex items-center gap-3 px-2 py-1.5">
              <div className="w-8 h-8 border border-[#242424] bg-[#131313] flex items-center justify-center text-[10px] font-bold text-[#ededed] font-mono uppercase">
                {user.initials}
              </div>
              <div className="hidden sm:block text-right">
                <div className="text-[10px] font-bold text-[#ededed] uppercase tracking-[0.08em] font-mono">{user.name}</div>
                <div className="text-[9px] text-[#8a8a8a] uppercase tracking-[0.12em] font-mono">{user.title}</div>
              </div>
            </div>
            <button type="button" onClick={onLogout} className="ui-button ui-button-danger">
              <LogOut className="w-3.5 h-3.5" />
              Logout
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-7 bg-[#0a0a0a]">
          <div className="border border-[#242424] bg-[#0f0f0f]">
            <section className="p-6">
              <div className="border-b border-[#242424] pb-5 mb-5">
                <div className="text-[10px] uppercase tracking-[0.16em] text-[#8a8a8a] font-mono mb-3">System overview</div>
                <div className="text-[28px] font-bold text-[#ededed] leading-none">Engineering workspace</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 border border-[#242424] bg-[#111111]">
                {STATS.map((stat) => (
                  <div key={stat.label} className="border-r border-[#242424] last:border-r-0 p-5">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-[#8a8a8a] font-mono mb-3">{stat.label}</div>
                    <div className={`text-3xl font-bold ${stat.valueColor} font-mono`}>{stat.value}</div>
                  </div>
                ))}
                <div className="p-5">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-[#8a8a8a] font-mono mb-3">
                    <UploadCloud className="w-3 h-3" /> google drive
                  </div>
                  {latestDriveExport ? (
                    <>
                      <div className="text-lg font-bold text-[#4ade80] font-mono leading-tight">Synced {formatRelativeTime(latestDriveExport.exportedAt)}</div>
                      <div className="text-[10px] text-[#8a8a8a] mt-1 truncate">{latestDriveExport.docTitle}</div>
                    </>
                  ) : (
                    <div className="text-lg font-bold text-[#8a8a8a] font-mono leading-tight">Not synced yet</div>
                  )}
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.75fr)] items-start border-t border-[#242424]">
              <aside className="p-6 border-b xl:border-b-0 xl:border-r border-[#242424]">
                <div className="text-[10px] uppercase tracking-[0.16em] text-[#8a8a8a] font-mono mb-3">Recent activity</div>
                <div className="space-y-3">
                  {recentActivity.map((item) => {
                    const ss = STATUS_STYLES[item.type];
                    return (
                      <div key={item.id} className="border border-[#242424] bg-[#111111] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[10px] uppercase tracking-[0.12em] text-[#8a8a8a] font-mono">{item.docNumber}</div>
                          <span className={`inline-flex items-center gap-1.5 px-2 py-1 text-[9px] font-medium uppercase tracking-[0.12em] font-mono ${ss.bg}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${ss.dot}`} />
                            {ss.label}
                          </span>
                        </div>
                        <div className="mt-3 text-sm font-medium text-[#ededed]">{item.docTitle}</div>
                        <div className="mt-2 text-[10px] uppercase tracking-[0.12em] text-[#8a8a8a] font-mono">{item.reviewer}</div>
                        <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[#8a8a8a] font-mono">{item.date}</div>
                      </div>
                    );
                  })}
                </div>
              </aside>

              <aside className="self-start w-full p-5 bg-[#0d0d0d]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-[#8a8a8a] font-mono">Review results</div>
                    <div className="mt-1 text-sm font-semibold text-[#ededed]">Approval progress</div>
                  </div>
                  <div className="text-[10px] text-[#8a8a8a] font-mono">LIVE DATA</div>
                </div>

                <div className="mt-4 flex flex-col sm:flex-row xl:flex-col 2xl:flex-row items-center gap-4">
                  <div className="relative shrink-0 w-28 h-28">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120" role="img" aria-label={`${approvalRate}% approved, ${inReviewDocs} in review`}>
                      <circle cx="60" cy="60" r={chartRadius} fill="none" stroke="#242424" strokeWidth="13" />
                      {reviewedDocs > 0 && (
                        <>
                          <circle
                            cx="60" cy="60" r={chartRadius} fill="none" stroke="#4ade80" strokeWidth="13" strokeLinecap="butt"
                            strokeDasharray={`${Math.max(approvedArc - 4, 0)} ${chartCircumference}`}
                            className="cursor-pointer"
                            tabIndex={0}
                            onMouseEnter={() => setChartHover('approved')}
                            onMouseLeave={() => setChartHover(null)}
                            onFocus={() => setChartHover('approved')}
                            onBlur={() => setChartHover(null)}
                          />
                          {inReviewDocs > 0 && (
                            <circle
                              cx="60" cy="60" r={chartRadius} fill="none" stroke="#fbbf24" strokeWidth="13" strokeLinecap="butt"
                              strokeDasharray={`${Math.max(reviewArc - 4, 0)} ${chartCircumference}`}
                              strokeDashoffset={-approvedArc}
                              className="cursor-pointer"
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
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xl font-bold text-[#ededed] font-mono">{approvalRate}%</span>
                      <span className="text-[8px] uppercase tracking-[0.13em] text-[#8a8a8a] font-mono">approved</span>
                    </div>
                    {chartHover && (
                      <div role="status" className="absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 whitespace-nowrap border border-[#303030] bg-[#171717] px-2.5 py-1.5 text-[10px] text-[#ededed] shadow-lg font-mono">
                        <span className={chartHover === 'approved' ? 'text-[#4ade80]' : 'text-[#fbbf24]'}>
                          {chartHover === 'approved' ? 'Approved' : 'In review'}
                        </span>
                        {' — '}{chartHover === 'approved' ? approvedDocs : inReviewDocs} documents ({chartHover === 'approved' ? approvalRate : inReviewRate}%)
                      </div>
                    )}
                  </div>

                  <div className="w-full space-y-2.5">
                    <div className="flex items-center justify-between gap-3 border-b border-[#242424] pb-2.5">
                      <div className="flex items-center gap-2 text-xs text-[#bdbdbd]">
                        <span className="w-2 h-2 rounded-full bg-[#4ade80]" />
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#4ade80]" /> Approved
                      </div>
                      <span className="text-base font-bold text-[#4ade80] font-mono">{approvedDocs}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs text-[#bdbdbd]">
                        <span className="w-2 h-2 rounded-full bg-[#fbbf24]" />
                        <Clock className="w-3.5 h-3.5 text-[#fbbf24]" /> In review
                      </div>
                      <span className="text-base font-bold text-[#fbbf24] font-mono">{inReviewDocs}</span>
                    </div>
                    <div className="pt-1 text-[9px] text-[#8a8a8a] font-mono">{reviewedDocs} DOCUMENTS IN REVIEW PIPELINE</div>
                  </div>
                </div>

                <div className="mt-5 border-t border-[#242424] pt-4">
                  <div className="text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a] font-mono">Delivery forecast</div>
                  <div className="mt-3">
                    <div className="border border-[#242424] bg-[#111111] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[10px] text-[#bdbdbd]">Live test cases</div>
                        <span className="text-xs font-bold text-[#a78bfa] font-mono">{reviewedDocs}</span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden bg-[#242424]">
                        <div className="h-full bg-[#4ade80]" style={{ width: `${testProgress}%` }} />
                      </div>
                      <div className="mt-2 flex justify-between text-[9px] text-[#8a8a8a] font-mono">
                        <span>{approvedDocs} PASSED</span>
                        <span className="text-[#fbbf24]">{inReviewDocs} RUNNING</span>
                      </div>
                    </div>
                  </div>
                </div>
              </aside>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
};
