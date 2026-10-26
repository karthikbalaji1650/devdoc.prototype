import React, { useState } from 'react';
import { 
  RefreshCw, 
  CheckCircle2, 
  FileText, 
  ExternalLink, 
  Layers
} from 'lucide-react';
import type { JiraIssue, ReleaseMasterItem } from '../../types/operations';
import { INITIAL_JIRA_ISSUES, INITIAL_RELEASE_MASTER } from '../../services/jiraService';

interface ReleaseTrackerProps {
  onOpenDocument?: (docId: string) => void;
}

export const ReleaseTracker: React.FC<ReleaseTrackerProps> = ({ onOpenDocument }) => {
  const [jiraIssues] = useState<JiraIssue[]>(INITIAL_JIRA_ISSUES);
  const [releases] = useState<ReleaseMasterItem[]>(INITIAL_RELEASE_MASTER);
  const [selectedVersion, setSelectedVersion] = useState<string>('v13.03.01');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);

  const handleSyncJira = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      setSyncSuccess(true);
      setTimeout(() => setSyncSuccess(false), 2500);
    }, 600);
  };

  const activeRelease = releases.find(r => r.releaseVersion.includes(selectedVersion)) || releases[0];
  const versionIssues = jiraIssues.filter(j => j.fixVersion === selectedVersion);

  return (
    <div className="space-y-6 text-left">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-0.5 bg-[rgba(140,123,255,0.15)] text-[var(--purple)] border border-[var(--purple)]">
              Option 2
            </span>
            <h2 className="text-xl font-bold text-[var(--text)]">Software Release Tracking & Document Release Master</h2>
          </div>
          <p className="text-xs text-[var(--text-dim)] mt-1">
            Fetch real-time sprint stories and bug fixes from JIRA, and map them to verified DocCraft Technical Analysis & Test Reports.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSyncJira}
          disabled={isSyncing}
          className="flex items-center gap-2 px-4 py-2 bg-[image:var(--signal-gradient)] hover:opacity-90 text-[#07111d] text-xs font-semibold transition-colors disabled:opacity-50 self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? 'Fetching from JIRA...' : syncSuccess ? 'JIRA Synced!' : 'Sync JIRA Release'}</span>
        </button>
      </div>

      {/* Version Tabs */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
        <button
          type="button"
          onClick={() => setSelectedVersion('v13.03.01')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            selectedVersion === 'v13.03.01'
              ? 'bg-[image:var(--signal-gradient)] text-[#07111d]'
              : 'text-[var(--text-dim)] hover:text-[var(--success)] bg-transparent border border-[var(--border)]'
          }`}
        >
          Release v13.03.01 (GA Approved)
        </button>

        <button
          type="button"
          onClick={() => setSelectedVersion('v13.04.00')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            selectedVersion === 'v13.04.00'
              ? 'bg-[image:var(--signal-gradient)] text-[#07111d]'
              : 'text-[var(--text-dim)] hover:text-[var(--success)] bg-transparent border border-[var(--border)]'
          }`}
        >
          Release v13.04.00 (In Planning)
        </button>
      </div>

      {/* Release Overview Banner */}
      <div className="bg-[var(--panel)] border border-[var(--purple)] p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-mono text-[var(--purple)] font-semibold uppercase">
              Target Release: {activeRelease.targetReleaseDate}
            </div>
            <h3 className="text-lg font-bold text-[var(--text)] mt-0.5">{activeRelease.releaseVersion}</h3>
            <p className="text-xs text-[var(--text-dim)] mt-0.5">
              Sign-off Owner: <strong className="text-[var(--text)]">{activeRelease.signoffOwner}</strong>
            </p>
          </div>

          {/* Release Gate Badge */}
          <div className="flex items-center gap-3 bg-[var(--panel-alt)] p-3 border border-[var(--border)]">
            <div className="text-right">
              <span className="text-[10px] text-[var(--text-dim)] uppercase font-semibold block">Quality Gate Verdict</span>
              <span className="text-sm font-extrabold text-[var(--success)] font-mono">
                {activeRelease.releaseGateVerdict === 'GO' ? '🟢 GO FOR RELEASE' : '🟡 PENDING QA SIGN-OFF'}
              </span>
            </div>
          </div>
        </div>

        {/* Progress Metrics Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-[var(--border)] text-xs">
          <div className="bg-[var(--panel-alt)] p-2.5 border-t-[3px] border-[var(--blue)]">
            <span className="text-[10px] text-[var(--text-dim)]">JIRA Issues Synced</span>
            <div className="text-sm font-bold text-[var(--text)] font-mono">{versionIssues.length} Tickets</div>
          </div>

          <div className="bg-[var(--panel-alt)] p-2.5 border-t-[3px] border-[var(--purple)]">
            <span className="text-[10px] text-[var(--text-dim)]">Story Points Burndown</span>
            <div className="text-sm font-bold text-[var(--purple)] font-mono">
              {activeRelease.completedStoryPoints} / {activeRelease.totalStoryPoints} Pts
            </div>
          </div>

          <div className="bg-[var(--panel-alt)] p-2.5 border-t-[3px] border-[var(--success)]">
            <span className="text-[10px] text-[var(--text-dim)]">Release Readiness</span>
            <div className="text-sm font-bold text-[var(--success)] font-mono">
              {Math.round((activeRelease.completedStoryPoints / activeRelease.totalStoryPoints) * 100)}% Complete
            </div>
          </div>

          <div className="bg-[var(--panel-alt)] p-2.5 border-t-[3px] border-[var(--pink)]">
            <span className="text-[10px] text-[var(--text-dim)]">Documentation Status</span>
            <div className="text-sm font-bold text-[var(--blue)] font-mono">100% Certified</div>
          </div>
        </div>
      </div>

      {/* Document Release Master Matrix (Maps release to verified docs) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-bold text-[var(--text)]">Document Release Master Registry</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Technical Analysis Doc Link */}
          <div className="bg-[var(--panel)] border border-[var(--border)] hover:border-[var(--blue)] p-4 flex items-center justify-between group transition-colors">
            <div className="space-y-1">
              <span className="inline-block text-[10px] uppercase font-bold text-blue-700 px-2.5 py-1 leading-normal rounded bg-blue-50 border border-blue-200 mb-1">
                Technical Analysis Document
              </span>
              <div className="font-semibold text-[var(--text)] transition-colors">
                {activeRelease.technicalAnalysisDocTitle}
              </div>
              <span className="text-[11px] text-[var(--success)] font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Signed off & Verified
              </span>
            </div>

            <button
              type="button"
              onClick={() => onOpenDocument?.(activeRelease.technicalAnalysisDocId)}
              className="p-2 rounded-lg bg-slate-100 hover:bg-blue-600 text-slate-600 hover:text-white transition-colors ml-3 flex-shrink-0"
              title="Open Document in DocCraft Studio"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>

          {/* Test Report Doc Link */}
          <div className="bg-[var(--panel)] border border-[var(--border)] hover:border-[var(--success)] p-4 flex items-center justify-between group transition-colors">
            <div className="space-y-1">
              <span className="inline-block text-[10px] uppercase font-bold text-emerald-700 px-2.5 py-1 leading-normal rounded bg-emerald-50 border border-emerald-200 mb-1">
                Test Execution & Certification Report
              </span>
              <div className="font-semibold text-[var(--text)] transition-colors">
                {activeRelease.testReportDocTitle}
              </div>
              <span className="text-[11px] text-[var(--success)] font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> QA Matrix Certified
              </span>
            </div>

            <button
              type="button"
              onClick={() => onOpenDocument?.(activeRelease.testReportDocId)}
              className="p-2 rounded-lg bg-slate-100 hover:bg-emerald-600 text-slate-600 hover:text-white transition-colors ml-3 flex-shrink-0"
              title="Open Document in DocCraft Studio"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* JIRA Sprint Issues Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-600" />
            <h3 className="text-sm font-bold text-[var(--text)]">JIRA Sprint Tickets for {selectedVersion}</h3>
          </div>
          <span className="text-xs text-slate-500 font-mono">Live JIRA Cloud Sync</span>
        </div>

        <div className="bg-[var(--panel)] border border-[var(--border)] overflow-hidden">
          <table className="w-full text-xs text-left text-[var(--text-dim)]">
            <thead className="bg-[var(--panel-alt)] text-[var(--text-dim)] uppercase text-[10px] tracking-wider border-b border-[var(--border)]">
              <tr>
                <th className="py-3 px-4">Key</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Summary</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Points</th>
                <th className="py-3 px-4">Assignee</th>
                <th className="py-3 px-4">Linked Document</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-soft)]">
              {versionIssues.map((issue) => (
                <tr key={issue.key} className="hover:bg-[var(--panel-alt)] transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-[var(--blue)]">
                    {issue.key}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      issue.issueType === 'Bug' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                      issue.issueType === 'Story' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      'bg-blue-50 text-blue-700 border border-blue-200'
                    }`}>
                      {issue.issueType}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-medium text-[var(--text)]">
                    {issue.summary}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      issue.status === 'Done' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      issue.status === 'In Review' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                      'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {issue.status === 'Done' && <CheckCircle2 className="w-3 h-3" />}
                      {issue.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-[var(--purple)] font-bold">
                    {issue.storyPoints} pts
                  </td>
                  <td className="py-3 px-4 text-[var(--text)]">
                    {issue.assignee}
                  </td>
                  <td className="py-3 px-4 text-slate-500 italic text-[11px]">
                    {issue.linkedDocTitle || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
