import React, { useMemo } from 'react';
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

/* ─── Types ─── */
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

/* ─── Helpers ─── */
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

const STATUS_STYLES: Record<ActivityItem['type'], { bg: string; dot: string; label: string }> = {
  APPROVED:          { bg: 'bg-emerald-500/15 text-emerald-400', dot: 'bg-emerald-400', label: 'Approved' },
  IN_REVIEW:         { bg: 'bg-blue-500/15 text-blue-400',       dot: 'bg-blue-400',    label: 'In Review' },
  PENDING:           { bg: 'bg-amber-500/15 text-amber-400',     dot: 'bg-amber-400',   label: 'Pending' },
  CHANGES_REQUESTED: { bg: 'bg-rose-500/15 text-rose-400',       dot: 'bg-rose-400',    label: 'Changes Req.' },
};

const ROLE_BADGE_COLORS: Record<string, string> = {
  'Lead Architect':   'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'Security Officer': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  'QA Director':      'bg-teal-500/20 text-teal-300 border-teal-500/30',
  'Firmware Engineer':'bg-orange-500/20 text-orange-300 border-orange-500/30',
  'Product Owner':    'bg-pink-500/20 text-pink-300 border-pink-500/30',
};

/* ─── Component ─── */
export const DashboardPage: React.FC<DashboardPageProps> = ({ user, onNavigate, onLogout }) => {

  /* smart access cards */
  const SMART_ACCESS = [
    { id: 'doceditor', label: 'Document Editor',  desc: 'Create & edit engineering docs',    icon: FileText,    iconBg: 'bg-blue-500/15',   iconColor: 'text-blue-400',   hoverBorder: 'hover:border-blue-500/50',   app: 'doccraft'   as AppView, opsTab: undefined as OperationsTab | undefined },
    { id: 'coder',     label: 'Coder',            desc: 'AI-powered code workspace',         icon: Activity,    iconBg: 'bg-violet-500/15', iconColor: 'text-violet-400', hoverBorder: 'hover:border-violet-500/50', app: 'coder'      as AppView, opsTab: undefined as OperationsTab | undefined },
    { id: 'testcases', label: 'Test Case Manager',desc: 'AI test suites & Robot Framework',  icon: Eye,         iconBg: 'bg-teal-500/15',   iconColor: 'text-teal-400',   hoverBorder: 'hover:border-teal-500/50',   app: 'operations' as AppView, opsTab: 'test-cases' as OperationsTab },
    { id: 'release',   label: 'Release Master',   desc: 'JIRA sync & release gates',         icon: ArrowUpRight,iconBg: 'bg-purple-500/15', iconColor: 'text-purple-400', hoverBorder: 'hover:border-purple-500/50', app: 'operations' as AppView, opsTab: 'releases'   as OperationsTab },
    { id: 'settings',  label: 'Settings',          desc: 'Platform preferences & config',     icon: CheckCircle2,iconBg: 'bg-slate-600/30',  iconColor: 'text-slate-400',  hoverBorder: 'hover:border-slate-500/50',  app: 'settings'   as AppView, opsTab: undefined as OperationsTab | undefined },
  ];

  /* derived stats */
  const reviewers    = useMemo(() => getStoredReviewersLog(), []);
  const totalDocs    = reviewers.length;
  const approvedDocs = reviewers.filter(r => r.reviewStatus === 'APPROVED').length;
  const inReviewDocs = reviewers.filter(r => r.reviewStatus === 'IN_REVIEW').length;

  const STATS = [
    { label: 'Total Documents',     value: totalDocs,    icon: FileText,    iconBg: 'bg-blue-500/15',    iconColor: 'text-blue-400',    borderAccent: 'border-blue-500/25' },
    { label: 'Documents Approved',  value: approvedDocs, icon: CheckCircle2,iconBg: 'bg-emerald-500/15', iconColor: 'text-emerald-400', borderAccent: 'border-emerald-500/25' },
    { label: 'Documents In Review', value: inReviewDocs, icon: Clock,       iconBg: 'bg-amber-500/15',   iconColor: 'text-amber-400',   borderAccent: 'border-amber-500/25' },
  ];

  /* recent activity */
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

  /* ── render: sidebar (shared component) ── */
  const sidebar = (
    <AppSidebar
      user={user}
      activeView="dashboard"
      onNavigate={onNavigate}
      onLogout={onLogout}
    />
  );

  /* ── render: stat cards ── */
  const statCards = (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {STATS.map(stat => (
        <div key={stat.label} className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 hover:bg-slate-50/80 transition-colors shadow-xs">
          <div className={`w-12 h-12 rounded-xl ${stat.iconBg} flex items-center justify-center shrink-0`}>
            <stat.icon className={`w-6 h-6 ${stat.iconColor}`} />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest leading-tight">{stat.label}</p>
            <p className="text-3xl font-extrabold text-slate-900 mt-1 leading-none">{stat.value}</p>
          </div>
        </div>
      ))}
    </div>
  );

  /* ── render: smart access ── */
  const smartAccess = (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-600" />
          Smart Access
        </h3>
        <span className="text-[11px] text-slate-500">Quick launch any module</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {SMART_ACCESS.map(card => (
          <button key={card.id} type="button" onClick={() => onNavigate(card.app, card.opsTab)}
            className={`flex flex-col items-center gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200 ${card.hoverBorder} hover:bg-slate-100 transition-all text-center group shadow-xs`}>
            <div className={`w-11 h-11 rounded-xl ${card.iconBg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
              <card.icon className={`w-5 h-5 ${card.iconColor}`} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-800 group-hover:text-blue-600 transition-colors leading-tight">{card.label}</p>
              <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{card.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  /* ── render: recent activity ── */
  const activityTable = (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Eye className="w-4 h-4 text-slate-500" />
          Recent Activity
        </h3>
        <button type="button" onClick={() => onNavigate('operations', 'reviewers')} className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors">
          View All <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>
      {recentActivity.length === 0 ? (
        <div className="px-5 py-10 text-center text-slate-500 text-sm">No recent activity to display.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {['Type', 'Document', 'Reviewer', 'Date', 'Status', 'Action'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentActivity.map((item, idx) => {
                const ss = STATUS_STYLES[item.type];
                const rb = ROLE_BADGE_COLORS[item.reviewerRole] ?? 'bg-slate-100 text-slate-700 border-slate-200';
                return (
                  <tr key={item.id} className={`border-b border-slate-200 hover:bg-slate-50 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/50' : ''}`}>
                    <td className="px-5 py-3.5">
                      <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider ${rb}`}>
                        {item.reviewerRole.slice(0, 4).toUpperCase()}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 max-w-[200px]">
                      <div className="font-semibold text-slate-900 truncate leading-tight">{item.docTitle}</div>
                      <div className="text-slate-500 font-mono text-[10px] mt-0.5">{item.docNumber}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="text-slate-800 font-medium">{item.reviewer}</div>
                      <div className="text-slate-500 text-[10px]">{item.reviewerRole}</div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 font-mono whitespace-nowrap">{item.date}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${ss.bg}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${ss.dot}`} />
                        {ss.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <button type="button" onClick={() => onNavigate('operations', 'reviewers')} className="flex items-center gap-1 text-blue-600 hover:text-blue-700 transition-colors font-medium">
                        <Eye className="w-3.5 h-3.5" />
                        <span className="text-[10px]">View</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  /* ── render: header ── */
  const topHeader = (
    <header className="bg-white/95 border-b border-slate-200 px-7 py-3.5 flex items-center justify-between shrink-0 backdrop-blur-md shadow-xs">
      <h1 className="text-base font-bold text-slate-900 tracking-tight">Dashboard Overview</h1>
      <div className="flex items-center gap-4">
        <button type="button" className="relative p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors" title="Notifications">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-blue-600" />
        </button>
        <div className="w-px h-6 bg-slate-200" />
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-bold text-slate-900 leading-tight">{user.name}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider leading-tight">{user.title}</div>
          </div>
          <div className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${user.avatarBg} flex items-center justify-center text-xs font-bold text-white shadow-xs`}>
            {user.initials}
          </div>
        </div>
        <button type="button" onClick={onLogout} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 transition-all">
          <LogOut className="w-3.5 h-3.5" />
          <span>Logout</span>
        </button>
      </div>
    </header>
  );

  /* ── final render ── */
  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {sidebar}

      <div className="flex-1 flex flex-col overflow-hidden">
        {topHeader}

        <main className="flex-1 overflow-y-auto p-7 space-y-7 bg-slate-50">
          {/* Greeting */}
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {getGreeting()}, {user.name.split(' ')[0]}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Here's what's happening with your documents today.
            </p>
          </div>

          {statCards}
          {smartAccess}
          {activityTable}

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 pb-1 text-[10px] text-slate-500 border-t border-slate-200">
            <span>Version 1.0.0</span>
            <span>© 2026 DevDoc Studio. All rights reserved.</span>
          </div>
        </main>
      </div>
    </div>
  );
};
