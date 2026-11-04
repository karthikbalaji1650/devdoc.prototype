import React, { useState } from 'react';
import {
  FileText,
  LayoutDashboard,
  Code2,
  FlaskConical,
  GitBranch,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldAlert,
  ClipboardCheck,
  Database,
} from 'lucide-react';
import type { UserProfile } from '../types/auth';
import type { AppView, OperationsTab } from '../types/appState';
import { isAdmin } from '../services/permissions';

interface AppSidebarProps {
  user: UserProfile;
  compact?: boolean;
  activeView: AppView;
  activeOpsTab?: OperationsTab;
  onNavigate: (app: AppView, opsTab?: OperationsTab) => void;
  onLogout: () => void;
}

const NAV_ITEMS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    app: 'dashboard' as AppView,
    opsTab: undefined as OperationsTab | undefined,
  },
  {
    id: 'doceditor',
    label: 'Document Editor',
    icon: FileText,
    app: 'doccraft' as AppView,
    opsTab: undefined as OperationsTab | undefined,
  },
  {
    id: 'coder',
    label: 'Coder',
    icon: Code2,
    app: 'coder' as AppView,
    opsTab: undefined as OperationsTab | undefined,
  },
  {
    id: 'testcases',
    label: 'Test Management',
    icon: FlaskConical,
    app: 'operations' as AppView,
    opsTab: 'test-cases' as OperationsTab,
  },
  {
    id: 'release',
    label: 'Release Master',
    icon: GitBranch,
    app: 'operations' as AppView,
    opsTab: 'releases' as OperationsTab,
  },
  {
    id: 'incidents',
    label: 'Incident Tracker',
    icon: ShieldAlert,
    app: 'operations' as AppView,
    opsTab: 'incidents' as OperationsTab,
  },
  {
    id: 'reviewers',
    label: 'Reviewers Log',
    icon: ClipboardCheck,
    app: 'operations' as AppView,
    opsTab: 'reviewers' as OperationsTab,
  },
  {
    id: 'data-management',
    label: 'Data Management',
    icon: Database,
    app: 'data-management' as AppView,
    opsTab: undefined as OperationsTab | undefined,
    adminOnly: true,
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    app: 'settings' as AppView,
    opsTab: undefined as OperationsTab | undefined,
  },
] as const;

function isActive(item: (typeof NAV_ITEMS)[number], activeView: AppView, activeOpsTab?: OperationsTab): boolean {
  if (item.app !== activeView) return false;
  if (item.app === 'operations' && item.opsTab && activeOpsTab) {
    return item.opsTab === activeOpsTab;
  }
  return true;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  user,
  compact = false,
  activeView,
  activeOpsTab,
  onNavigate,
  onLogout,
}) => {
  // Defaults to collapsed (icon-only) on a narrow viewport: expanded by
  // default left almost no room for content on a phone (the sidebar
  // alone took most of the screen width, pushing everything else into
  // a sliver that needed horizontal scrolling to read). The user can
  // still toggle either way with the button below.
  const [expanded, setExpanded] = useState(() => typeof window === 'undefined' || window.innerWidth >= 768);

  return (
    <aside className={`relative z-40 h-full shrink-0 select-none transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${expanded ? 'w-64' : 'w-14'}`}>
      <div className={`h-full ${expanded ? 'w-64' : 'w-14'} bg-[var(--panel)] border-r border-[var(--border-soft)] flex flex-col justify-between transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]`}>
      <div>
        <div className={`${compact ? 'h-16' : 'h-24'} border-b border-[var(--border-soft)] flex items-center ${expanded ? 'justify-between px-4' : 'justify-center px-2'}`}>
          {expanded && <div className="flex items-center gap-3 min-w-0">
            {/* The Viking mark alone: the full logo is a wordmark on white
                and unreadable at this size. */}
            <div className="w-8 h-8 shrink-0 rounded-md bg-[rgb(255,255,255)] flex items-center justify-center">
              <div className="w-[18px] h-[22px] overflow-hidden">
                <img src="/logo.png" alt="" className="h-[22px] max-w-none" />
              </div>
            </div>
            <span className="text-[15px] font-medium text-[var(--text)] truncate">DevDoc Studio</span>
          </div>}
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            title={expanded ? 'Minimize sidebar' : 'Maximize sidebar'}
            aria-label={expanded ? 'Minimize sidebar' : 'Maximize sidebar'}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-md text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--panel-alt)] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--success)]"
          >
            {expanded ? <PanelLeftClose className="w-4 h-4" strokeWidth={1.5} /> : <PanelLeftOpen className="w-4 h-4" strokeWidth={1.5} />}
          </button>
        </div>

        <nav className="px-2 pt-4 space-y-0.5">
          {NAV_ITEMS.filter((item) => !('adminOnly' in item) || isAdmin(user)).map((item) => {
            const active = isActive(item, activeView, activeOpsTab);
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.app, item.opsTab)}
                aria-label={!expanded ? item.label : undefined}
                aria-current={active ? 'page' : undefined}
                title={!expanded ? item.label : undefined}
                className={`relative w-full h-9 flex items-center gap-2.5 ${expanded ? 'px-3' : 'justify-center px-2'} rounded-md text-left text-[14px] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--success)] ${
                  active
                    ? 'bg-[var(--panel-alt)] text-[var(--text)] font-medium'
                    : 'text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--panel-alt)]'
                }`}
              >
                {active && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-[var(--success)]" />}
                <Icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
                {expanded && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>
      </div>

      <div className={`p-3 border-t border-[var(--border-soft)] flex ${expanded ? 'items-center justify-between gap-2' : 'flex-col items-center gap-2'}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={`${user.name} profile`}
              className="w-8 h-8 rounded-md object-cover shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-md bg-[var(--panel-alt)] flex items-center justify-center text-[12px] font-medium text-[var(--text)] font-mono shrink-0" title={!expanded ? user.name : undefined}>
              {user.initials}
            </div>
          )}
          {expanded && <div className="min-w-0">
            <div className="text-[13px] font-medium text-[var(--text)] truncate leading-5">{user.name}</div>
            <div className="text-[12px] text-[var(--text-faint)] truncate leading-4">{user.title}</div>
          </div>}
        </div>
        <button
          type="button"
          onClick={onLogout}
          title="Log out"
          aria-label="Log out"
          className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--panel-alt)] transition-colors shrink-0 focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--success)]"
        >
          <LogOut className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>
      </div>
    </aside>
  );
};
