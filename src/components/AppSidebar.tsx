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

interface AppSidebarProps {
  user: UserProfile;
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
  activeView,
  activeOpsTab,
  onNavigate,
  onLogout,
}) => {
  return (
    <aside className="w-64 bg-[#0f0f0f] border-r border-[#242424] flex flex-col justify-between shrink-0 select-none h-full">
      <div>
        <div className="px-5 py-4 border-b border-[#242424] flex items-center gap-3">
          <img src="/logo.png" alt="DevDoc Studio Logo" className="w-9 h-9 object-contain shrink-0 border border-[#242424] bg-[#0a0a0a] p-1" />
          <div>
            <div className="text-[13px] font-bold tracking-[0.12em] text-[#ededed] uppercase leading-tight">
              DevDoc
            </div>
            <div className="text-[9px] text-[#8a8a8a] uppercase font-mono tracking-[0.14em] leading-tight">
              Studio
            </div>
          </div>
        </div>

        <nav className="px-3 pt-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item, activeView, activeOpsTab);
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.app, item.opsTab)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border border-transparent ${
                  active
                    ? 'bg-[#131313] text-[#ededed] border-l-2 border-l-[#4ade80] border-r border-[#242424]'
                    : 'text-[#8a8a8a] hover:text-[#ededed] hover:bg-[#131313] border-[#1a1a1a]'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#4ade80]' : 'text-[#8a8a8a]'}`} />
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] font-mono">{item.label}</span>
                {!active && <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-50" />}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="p-3 border-t border-[#242424] bg-[#0d0d0d] flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-8 h-8 border border-[#242424] bg-[#131313] flex items-center justify-center text-[10px] font-bold text-[#ededed] font-mono uppercase shrink-0`}>
            {user.initials}
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold text-[#ededed] uppercase tracking-[0.08em] truncate font-mono">{user.name}</div>
            <div className="text-[9px] text-[#8a8a8a] uppercase tracking-[0.1em] truncate font-mono">{user.title}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          title="Sign Out"
          className="p-1.5 border border-[#242424] bg-[#111111] text-[#f87171] hover:bg-[#171717] transition-colors shrink-0"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
};
