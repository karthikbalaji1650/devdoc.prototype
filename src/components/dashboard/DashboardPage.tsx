import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText,
  Bell,
  LogOut,
  Eye,
  CheckCircle2,
  Clock,
  Activity,
  ArrowUpRight,
} from 'lucide-react';
import type { UserProfile } from '../../types/auth';
import type { AppView, OperationsTab } from '../../types/appState';
import { getStoredReviewersLog } from '../../services/reviewersLogService';
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

const STATUS_STYLES: Record<ActivityItem['type'], { bg: string; dot: string; label: string }> = {
  APPROVED: { bg: 'bg-[#142b1d] text-[#4ade80] border border-[#1f5d39]', dot: 'bg-[#4ade80]', label: 'Approved' },
  IN_REVIEW: { bg: 'bg-[#111d2f] text-[#a78bfa] border border-[#304c7d]', dot: 'bg-[#a78bfa]', label: 'In Review' },
  PENDING: { bg: 'bg-[#2a220b] text-[#fbbf24] border border-[#6a4d12]', dot: 'bg-[#fbbf24]', label: 'Pending' },
  CHANGES_REQUESTED: { bg: 'bg-[#2a1212] text-[#f87171] border border-[#7d2d2d]', dot: 'bg-[#f87171]', label: 'Changes Req.' },
};

export const DashboardPage: React.FC<DashboardPageProps> = ({ user, onNavigate, onLogout }) => {
  const SMART_ACCESS = [
    { id: 'doceditor', label: 'Document Editor', desc: 'Create & edit engineering docs', icon: FileText, iconColor: 'text-[#4ade80]', bg: 'bg-[#111111]', app: 'doccraft' as AppView, opsTab: undefined as OperationsTab | undefined },
    { id: 'coder', label: 'Coder', desc: 'AI-powered code workspace', icon: Activity, iconColor: 'text-[#a78bfa]', bg: 'bg-[#111111]', app: 'coder' as AppView, opsTab: undefined as OperationsTab | undefined },
    { id: 'testcases', label: 'Test Case Manager', desc: 'AI test suites & Robot Framework', icon: Eye, iconColor: 'text-[#4ade80]', bg: 'bg-[#111111]', app: 'operations' as AppView, opsTab: 'test-cases' as OperationsTab },
    { id: 'release', label: 'Release Master', desc: 'JIRA sync & release gates', icon: ArrowUpRight, iconColor: 'text-[#fbbf24]', bg: 'bg-[#111111]', app: 'operations' as AppView, opsTab: 'releases' as OperationsTab },
    { id: 'settings', label: 'Settings', desc: 'Platform preferences & config', icon: CheckCircle2, iconColor: 'text-[#ededed]', bg: 'bg-[#111111]', app: 'settings' as AppView, opsTab: undefined as OperationsTab | undefined },
  ];

  const [notifOpen, setNotifOpen] = useState(false);
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

              <div className="grid grid-cols-1 sm:grid-cols-3 border border-[#242424] bg-[#111111]">
                {STATS.map((stat) => (
                  <div key={stat.label} className="border-r border-[#242424] last:border-r-0 p-5">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-[#8a8a8a] font-mono mb-3">{stat.label}</div>
                    <div className={`text-3xl font-bold ${stat.valueColor} font-mono`}>{stat.value}</div>
                  </div>
                ))}
              </div>

              <div className="mt-6 border border-[#242424] bg-[#111111]">
                <div className="border-b border-[#242424] px-4 py-3 flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[#8a8a8a] font-mono">Smart access</div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[#4ade80] font-mono">Live</div>
                </div>
                <div className="grid grid-cols-2 xl:grid-cols-5 border-b border-[#242424] last:border-b-0">
                  {SMART_ACCESS.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => onNavigate(card.app, card.opsTab)}
                      className="flex flex-col items-start gap-3 p-4 border-r border-[#242424] last:border-r-0 text-left bg-[#111111] hover:bg-[#131313] transition-colors"
                    >
                      <div className={`w-10 h-10 border border-[#242424] ${card.bg} flex items-center justify-center`}>
                        <card.icon className={`w-4 h-4 ${card.iconColor}`} />
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.12em] text-[#ededed] font-mono leading-tight">{card.label}</div>
                        <div className="text-[10px] text-[#8a8a8a] mt-2 leading-relaxed font-sans">{card.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <aside className="p-6">
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
          </div>
        </main>
      </div>
    </div>
  );
};
