import React, { useMemo } from 'react';
import {
  FileText,
  Bell,
  LogOut,
  CheckCircle2,
  Clock,
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
            <button type="button" className="ui-button ui-button-icon relative" title="Notifications">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#4ade80]" />
            </button>
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
