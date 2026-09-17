import React from 'react';
import {
  FileText,
  LayoutDashboard,
  Code2,
  FlaskConical,
  GitBranch,
  Settings,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import type { UserProfile } from '../types/auth';
import type { AppView, OperationsTab } from '../types/appState';

/* ─── Types ─── */
interface AppSidebarProps {
  user: UserProfile;
  activeView: AppView;
  activeOpsTab?: OperationsTab;
  onNavigate: (app: AppView, opsTab?: OperationsTab) => void;
  onLogout: () => void;
}

/* ─── Nav item definitions ─── */
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
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    app: 'settings' as AppView,
    opsTab: undefined as OperationsTab | undefined,
  },
] as const;

/* ─── Helper: is a nav item "active" ─── */
function isActive(
  item: (typeof NAV_ITEMS)[number],
  activeView: AppView,
  activeOpsTab?: OperationsTab
): boolean {
  if (item.app !== activeView) return false;
  // For operations items, also match the tab
  if (item.app === 'operations' && item.opsTab && activeOpsTab) {
    return item.opsTab === activeOpsTab;
  }
  return true;
}

/* ─── Component ─── */
export const AppSidebar: React.FC<AppSidebarProps> = ({
  user,
  activeView,
  activeOpsTab,
  onNavigate,
  onLogout,
}) => {
  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 select-none h-full shadow-xs">
      {/* Top: Brand + Nav */}
      <div>
        {/* Brand */}
        <div className="px-5 py-4 border-b border-slate-200/80 flex items-center gap-3">
          <img src="/logo.png" alt="DevDoc Studio Logo" className="w-9 h-9 object-contain shrink-0 rounded-lg shadow-2xs" />
          <div>
            <div className="text-[13px] font-extrabold tracking-tight text-slate-900 leading-tight">
              DevDoc Studio
            </div>
            <div className="text-[10px] text-slate-500 leading-tight">
              Engineering Suite Platform
            </div>
          </div>
        </div>

        {/* Nav Items */}
        <nav className="px-3 pt-4 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item, activeView, activeOpsTab);
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.app, item.opsTab)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-all group ${
                  active
                    ? 'bg-blue-50 border border-blue-200 text-blue-700 font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    active ? 'text-blue-600' : 'group-hover:text-blue-600 text-slate-400'
                  }`}
                />
                <span>{item.label}</span>
                {!active && (
                  <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-60 transition-opacity" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom: User profile + logout */}
      <div className="p-3 border-t border-slate-200 flex items-center justify-between bg-slate-50/80">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-8 h-8 rounded-lg bg-gradient-to-tr ${user.avatarBg} flex items-center justify-center text-xs font-bold text-white shadow-xs shrink-0`}
          >
            {user.initials}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-900 truncate">{user.name}</div>
            <div className="text-[10px] text-slate-500 truncate">{user.title}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          title="Sign Out"
          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
};
