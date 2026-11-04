import React from 'react';
import { 
  FileText, 
  Layers, 
  Container, 
  ArrowRight, 
  Sparkles, 
  Server, 
  LogOut
} from 'lucide-react';
import type { UserProfile } from '../../types/auth';
import type { AppView, OperationsTab } from '../../types/appState';
import { INITIAL_INCIDENTS, INITIAL_RELEASE_MASTER } from '../../services/jiraService';
import { getStoredReviewersLog, reviewersLog } from '../../services/reviewersLogService';
import { useSharedCollection } from '../../services/sharedCollection';

interface LandingHubProps {
  user: UserProfile;
  onLaunchApp: (app: AppView, opsTab?: OperationsTab) => void;
  onLogout: () => void;
}

export const LandingHub: React.FC<LandingHubProps> = ({
  user,
  onLaunchApp,
  onLogout
}) => {
  const incidents = INITIAL_INCIDENTS;
  const releases = INITIAL_RELEASE_MASTER;
  useSharedCollection(reviewersLog); // re-render once the shared log loads
  const reviewers = getStoredReviewersLog();

  const openIncidents = incidents.filter(i => i.status !== 'Resolved').length;
  const approvedDocs = reviewers.filter(r => r.reviewStatus === 'APPROVED').length;
  const currentRelease = releases[0];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans relative overflow-x-hidden">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="DevDoc Studio Logo" className="w-9 h-9 object-contain shrink-0 rounded-lg shadow-2xs" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm tracking-tight text-slate-900">
                Engineering Suite Platform
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                Hub Portal
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Containerized Developer & Release Operations Dashboard
            </p>
          </div>
        </div>

        {/* User Profile & Logout */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
            <div className={`w-7 h-7 rounded-lg bg-gradient-to-tr ${user.avatarBg} flex items-center justify-center text-xs font-bold text-white shadow-xs`}>
              {user.initials}
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-xs font-bold text-slate-900 leading-tight">{user.name}</div>
              <div className="text-[10px] text-slate-500">{user.title}</div>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            title="Sign Out"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Main Hub Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-10 space-y-8">
        
        {/* Welcome Banner & Quick Summary Metrics */}
        <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-slate-100 border border-blue-200 rounded-3xl p-6 md:p-8 relative overflow-hidden space-y-6 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold mb-2">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Active Workspace: iXsystem BMC Firmware Engineering</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
                Welcome back, {user.name}
              </h1>
              <p className="text-xs md:text-sm text-slate-600 mt-1 max-w-2xl">
                All application services are running in live Docker containers. Select an application card below to launch its workspace.
              </p>
            </div>

            {/* Quick Gate Verdict Pill */}
            <div className="flex flex-col items-end justify-center bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Current Release Gate</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                <span className="text-base font-extrabold text-emerald-700 font-mono">
                  {currentRelease.releaseGateVerdict} (GA Ready)
                </span>
              </div>
              <span className="text-[11px] text-slate-500 mt-0.5">{currentRelease.releaseVersion}</span>
            </div>
          </div>

          {/* KPI Snapshot Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-200">
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">Active Firmware Build</span>
              <span className="text-sm font-bold text-slate-900 font-mono mt-0.5 block">v13.03.01 Patch</span>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">Open P1/P2 Incidents</span>
              <span className="text-sm font-bold text-emerald-700 font-mono mt-0.5 block">
                {openIncidents} Active ({incidents.length} Total)
              </span>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">Document Peer Sign-offs</span>
              <span className="text-sm font-bold text-blue-700 font-mono mt-0.5 block">
                {approvedDocs} / {reviewers.length} Approved (100%)
              </span>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">JIRA Sprint Progress</span>
              <span className="text-sm font-bold text-purple-700 font-mono mt-0.5 block">
                16 / 16 Story Pts (100%)
              </span>
            </div>
          </div>
        </div>

        {/* Application Cards Grid */}
        <div className="space-y-4 text-left">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Container className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-bold text-slate-900">Containerized Applications & Workspaces</h2>
            </div>
            <span className="text-xs text-slate-500 font-mono">2 Applications Active</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* CARD 1: DocCraft Studio */}
            <div className="bg-white border border-slate-200 hover:border-blue-500 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group relative overflow-hidden">
              <div className="space-y-4">
                {/* Header with Icon, Title, and Container Tag */}
                <div className="flex items-start justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-600/20">
                    <FileText className="w-6 h-6 text-white" />
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Docker: Running (Port 5173)</span>
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                    DocCraft Studio (Document Automation)
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Interactive Word (`.docx`), Google Docs, and Excel document builder. Select engineering headers, input code diffs & tables, and export executive technical reports in seconds.
                  </p>
                </div>

                {/* Modules Pill Grid */}
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-700">
                    📄 <strong className="text-slate-900">Technical Analysis</strong> (WH3-1205)
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-700">
                    📊 <strong className="text-slate-900">Test Execution Reports</strong> & QA
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-700">
                    ⚡ <strong className="text-slate-900">Excel Test Spreadsheet</strong> Import/Export
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-700">
                    ✨ <strong className="text-slate-900">AI Writing Assistant</strong> & Rephraser
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-6 border-t border-slate-200 mt-6 flex items-center justify-between">
                <span className="text-[11px] text-slate-500 font-mono">Image: devdoc-studio:latest</span>
                <button
                  type="button"
                  onClick={() => onLaunchApp('doccraft')}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl btn-primary text-xs font-semibold shadow-md group-hover:scale-105 transition-transform"
                >
                  <span>Launch DocCraft Studio</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* CARD 2: Engineering Operations & Release Hub */}
            <div className="bg-white border border-slate-200 hover:border-purple-500 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group relative overflow-hidden">
              <div className="space-y-4">
                {/* Header with Icon, Title, and Container Tag */}
                <div className="flex items-start justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-cyan-500 flex items-center justify-center shadow-md shadow-purple-600/20">
                    <Layers className="w-6 h-6 text-white" />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Docker: Running (Port 5174)</span>
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 group-hover:text-purple-600 transition-colors">
                    Engineering Operations & Release Hub
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Integrated management suite featuring sidebar navigation for Incident Reporting, JIRA Release Tracking, and Document Reviewers Log with Google Spreadsheet sync.
                  </p>
                </div>

                {/* Options Navigation Direct Links */}
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => onLaunchApp('operations', 'incidents')}
                    className="p-2 rounded-lg bg-slate-50 border border-slate-200 hover:border-purple-500 text-left text-slate-700 hover:text-purple-700 transition-colors"
                  >
                    🚨 <strong className="text-slate-900">Option 1: Incidents</strong> (P1-P4 RCA)
                  </button>
                  <button
                    type="button"
                    onClick={() => onLaunchApp('operations', 'releases')}
                    className="p-2 rounded-lg bg-slate-50 border border-slate-200 hover:border-purple-500 text-left text-slate-700 hover:text-purple-700 transition-colors"
                  >
                    🚀 <strong className="text-slate-900">Option 2: JIRA Releases</strong> & Master
                  </button>
                  <button
                    type="button"
                    onClick={() => onLaunchApp('operations', 'reviewers')}
                    className="p-2 rounded-lg bg-slate-50 border border-slate-200 hover:border-purple-500 text-left text-slate-700 hover:text-purple-700 transition-colors"
                  >
                    📋 <strong className="text-slate-900">Option 3: Reviewers Log</strong> & Sheets
                  </button>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-6 border-t border-slate-200 mt-6 flex items-center justify-between">
                <span className="text-[11px] text-slate-500 font-mono">Image: ops-hub:latest</span>
                <button
                  type="button"
                  onClick={() => onLaunchApp('operations')}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-md group-hover:scale-105 transition-transform"
                >
                  <span>Launch Operations Hub</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* Microservices & Infrastructure HUD */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 text-left shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-blue-600" />
              <span>Container Cluster Infrastructure</span>
            </span>
            <span className="font-mono text-emerald-700 font-bold">All 3 Nodes Online</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-slate-900 font-semibold block">devdoc-studio</span>
                <span className="text-[10px] text-slate-500 font-mono">Port 5173 • CPU: 0.8%</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">HEALTHY</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-slate-900 font-semibold block">operations-hub</span>
                <span className="text-[10px] text-slate-500 font-mono">Port 5174 • CPU: 1.2%</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">HEALTHY</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-slate-900 font-semibold block">jira-sync-gateway</span>
                <span className="text-[10px] text-slate-500 font-mono">Port 8080 • CPU: 0.4%</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">HEALTHY</span>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
};
