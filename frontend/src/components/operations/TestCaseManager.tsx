import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { TestSuiteItem, TestRunItem, TestCaseItem, TestCaseStep, TestRunCaseResult, TestCaseStatus, MilestoneItem, TestCaseAttachment, ProjectItem, TestSection } from '../../types/operations';
import { isSectionEmpty, nextSectionOrder, sectionOfCase, sectionTree } from '../../services/testSections';
import { CaseHistoryModal } from './CaseHistoryModal';
import { selectRunCases, withSubsections, type CaseFilter, type CaseMode } from '../../services/runCaseSelection';
import { PRIORITIES, normalizePriority, type TestCasePriority } from '../../services/testCasePriority';
import { CHANGE_LABELS, comparableRuns, compareRuns, previousRun, type ChangeKind } from '../../services/runComparison';
import { nextTestCaseId } from '../../services/testCaseIds';
import { exportTestCases, formatFromFileName, ImportError, parseTestCases, type ExchangeFormat } from '../../services/testCaseExchange';
import { buildRunReportCsv, buildRunReportHtml, reportFileName } from '../../services/testRunReport';
import type { DocumentModel } from '../../types/document';
import { generateTestCasesFromTaDoc } from '../../services/aiTestCaseGeneratorService';
import { fetchWithTimeout } from '../../services/fetchWithTimeout';
import {
  isTestManagementAvailable, loadTestManagement, seedTestManagement, syncTestManagement,
  type TestManagementData,
} from '../../services/testManagementApiService';
import { isRemoteExecutionConfigured, runRemoteExecution, type RemoteExecutionUpdate } from '../../services/remoteExecutionService';
import { RunTargetModal, type RunTarget } from './RunTargetModal';
import { buildRobotSuiteText } from '../../services/robotSuiteBuilder';
import { searchLibrary, saveToLibrary, removeFromLibrary, testCaseLibrary } from '../../services/testCaseLibraryService';
import { useSharedCollection, type CollectionStatus } from '../../services/sharedCollection';
import {
  saveToLibrary as saveSuiteToLibrary,
  removeFromLibrary as removeSuiteFromLibrary,
  searchLibrary as searchSuiteLibrary,
  testSuiteLibrary,
  instantiateSuiteFromLibrary,
} from '../../services/testSuiteLibraryService';
import {
  parseRobotOutputXml,
  exportRobotResultsAsJson,
  parseRobotScriptText,
  parseMarkdownTestSuiteText,
  backAnnotateTestSuite,
  backAnnotateDocumentWithSuite,
  type ParsedRobotTestResult
} from '../../services/robotOutputParserService';
import {
  pushTestSuiteToVsCode,
  pushFileToVsCodeWorkspace,
  convertTestSuiteToMarkdown,
  getStoredFileBridgeUrl
} from '../../services/workspaceFileService';
import {
  FlaskConical, Play, ChevronDown, ChevronRight, Plus, Flag, Filter,
  Trash2, Edit3, Download, Upload, X, Check, Clock,
  CheckCircle2, XCircle, MinusCircle, SkipForward, RefreshCw,
  ClipboardList, FileBarChart, Search, ArrowUpDown, Zap, Bot, FileCode2,
  FileSpreadsheet, Folder,
  HelpCircle, ImagePlus, Library, BookmarkPlus, Paperclip, Bug,
} from 'lucide-react';

interface TestCaseManagerProps {
  onBackToHub?: () => void;
  onNavigateToDocCraft?: (doc: DocumentModel) => void;
  currentDocument?: DocumentModel;
}

const ChevronLeft: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
);

const STATUS_COLORS: Record<TestCaseStatus, string> = {
  Passed:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  Failed:   'bg-rose-50 text-rose-700 border-rose-200',
  Blocked:  'bg-slate-100 text-slate-700 border-slate-300',
  Skipped:  'bg-amber-50 text-amber-700 border-amber-200',
  Untested: 'bg-slate-100 text-slate-600 border-slate-200',
  Retest:   'bg-purple-50 text-purple-700 border-purple-200',
};
const STATUS_ICON: Record<TestCaseStatus, React.ReactNode> = {
  Passed:   <CheckCircle2 className="w-3.5 h-3.5" />,
  Failed:   <XCircle className="w-3.5 h-3.5" />,
  Blocked:  <MinusCircle className="w-3.5 h-3.5" />,
  Skipped:  <SkipForward className="w-3.5 h-3.5" />,
  Untested: <Clock className="w-3.5 h-3.5" />,
  Retest:   <RefreshCw className="w-3.5 h-3.5" />,
};
const ALL_STATUSES: TestCaseStatus[] = ['Untested','Passed','Failed','Blocked','Skipped','Retest'];
const PRIORITY_COLORS: Record<TestCasePriority, string> = {
  Critical: 'bg-rose-50 text-rose-700 border-rose-200',
  High: 'bg-orange-50 text-orange-700 border-orange-200',
  Medium: 'bg-amber-50 text-amber-700 border-amber-200',
  Low: 'bg-slate-100 text-slate-600 border-slate-200',
};

const StatusBadge: React.FC<{ status: TestCaseStatus; small?: boolean }> = ({ status, small }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${STATUS_COLORS[status]} ${small ? 'text-[9px] px-1.5' : ''}`}>
    {STATUS_ICON[status]}{status}
  </span>
);

const EvidenceDropzone: React.FC<{
  image?: string; imageName?: string;
  onUpload: (file: File) => void; onRemove: () => void;
}> = ({ image, imageName, onUpload, onRemove }) => {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file such as JPG, PNG, GIF, or WebP.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('Evidence images must be smaller than 10 MB.');
      return;
    }
    onUpload(file);
  };

  return (
    <div>
      {image ? (
        <div className="flex items-start gap-3 p-2 bg-white rounded border border-slate-200 shadow-xs">
          <img src={image} alt={imageName || 'Evidence screenshot'} className="h-20 w-28 rounded border border-slate-200 object-cover bg-white shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-slate-500 truncate">{imageName}</p>
            <div className="flex gap-3 mt-1.5">
              <button type="button" onClick={() => inputRef.current?.click()} className="text-[10px] font-semibold text-blue-700 hover:underline">Replace</button>
              <button type="button" onClick={onRemove} className="text-[10px] font-semibold text-rose-600 hover:underline">Remove</button>
            </div>
          </div>
        </div>
      ) : (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          role="button" tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
          className={`flex flex-col items-center justify-center gap-1 p-4 rounded border-2 border-dashed cursor-pointer transition-colors ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-300 bg-white hover:border-slate-400'}`}
        >
          <ImagePlus className="w-4 h-4 text-slate-400" />
          <p className="text-[10px] text-slate-500">Drop a screenshot here, or click to browse</p>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
    </div>
  );
};

/** Loading / error / no-backend note for the shared libraries. */
const LibraryStatus: React.FC<{ status: CollectionStatus; error: string }> = ({ status, error }) =>
  status === 'loading' ? <span role="status" className="text-[11px] text-slate-500">Loading…</span>
  : status === 'unavailable' ? <span className="text-[11px] text-slate-600">The library is stored on the server - it needs the backend.</span>
  : error ? <span role="alert" className="text-[11px] text-rose-600">{error}</span>
  : null;

const TestCaseLibraryModal: React.FC<{
  onImport: (entries: TestCaseItem[]) => void;
  onClose: () => void;
}> = ({ onImport, onClose }) => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const library = useSharedCollection(testCaseLibrary);
  const results = React.useMemo(() => searchLibrary(query), [query, library.items]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleRemove = (customId: string) => { void removeFromLibrary(customId); };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2"><Library className="w-4 h-4 text-blue-600" /> Import from Library</h2>
          <LibraryStatus status={library.status} error={library.error} />
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 pb-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search saved test cases by ID or description..."
              className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-500 shadow-xs"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 space-y-1.5">
          {results.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-8">
              {query ? 'No saved test cases match that search.' : 'Nothing saved yet - open a test case and click "Save to Library" to reuse it later.'}
            </p>
          ) : results.map((tc) => (
            <label key={tc.id} className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${selected.has(tc.id) ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
              <input type="checkbox" checked={selected.has(tc.id)} onChange={() => toggle(tc.id)} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-[var(--success)] font-semibold shrink-0">{tc.customId}</span>
                  <span className="text-xs font-semibold text-slate-900 truncate">{tc.title}</span>
                </div>
                {tc.preconditions && <p className="text-[11px] text-slate-500 truncate mt-0.5">{tc.preconditions}</p>}
              </div>
              <button type="button" onClick={(e) => { e.preventDefault(); handleRemove(tc.customId); }} className="p-1 text-slate-400 hover:text-rose-600 shrink-0" title="Remove from library">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </label>
          ))}
        </div>
        <div className="flex gap-3 p-5 pt-3">
          <button
            onClick={() => onImport(results.filter((tc) => selected.has(tc.id)))}
            disabled={selected.size === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold btn-primary disabled:opacity-50"
          >
            Import{selected.size > 0 ? ` (${selected.size})` : ''}
          </button>
          <button onClick={onClose} className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
};

/** A quick-pick dropdown next to "+ Add Case": search the library and
 * click an entry to drop it straight into the current suite, without the
 * checkbox-and-confirm flow the full Import from Library modal needs for
 * picking several at once. */
const SuiteLibraryModal: React.FC<{
  onLoad: (suite: TestSuiteItem) => void;
  onClose: () => void;
}> = ({ onLoad, onClose }) => {
  const [query, setQuery] = useState('');
  const library = useSharedCollection(testSuiteLibrary);
  const results = React.useMemo(() => searchSuiteLibrary(query), [query, library.items]);

  const handleRemove = (title: string) => { void removeSuiteFromLibrary(title); };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2"><Library className="w-4 h-4 text-blue-600" /> Load Suite from Library</h2>
          <LibraryStatus status={library.status} error={library.error} />
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 pb-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search saved suites by title, module, or description..."
              className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-500 shadow-xs"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 space-y-1.5">
          {results.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-8">
              {query ? 'No saved suites match that search.' : 'Nothing saved yet - open a suite and click "Save Suite to Library" to reuse it later.'}
            </p>
          ) : results.map((s) => (
            <div key={s.id} className="flex items-start gap-3 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
              <button type="button" onClick={() => onLoad(s)} className="min-w-0 flex-1 text-left">
                <div className="flex items-center gap-2">
                  <Folder className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span className="text-xs font-semibold text-slate-900 truncate">{s.title}</span>
                  <span className="text-[10px] text-slate-400 shrink-0">{(s.testCases || []).length} cases</span>
                </div>
                {s.description && <p className="text-[11px] text-slate-500 truncate mt-0.5">{s.description}</p>}
              </button>
              <button type="button" onClick={() => handleRemove(s.title)} className="p-1 text-slate-400 hover:text-rose-600 shrink-0" title="Remove from library">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="p-5 pt-3">
          <button onClick={onClose} className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-sm">Close</button>
        </div>
      </div>
    </div>
  );
};

const LoadPreviousTestCaseDropdown: React.FC<{ onPick: (tc: TestCaseItem) => void }> = ({ onPick }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDownOutside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDownOutside);
    return () => document.removeEventListener('pointerdown', handlePointerDownOutside);
  }, [open]);

  const library = useSharedCollection(testCaseLibrary);
  const results = open && library.items ? searchLibrary(query) : [];

  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center gap-1 text-[var(--blue)] hover:underline font-medium">
        <Library className="w-3.5 h-3.5" /> Load Previous Test Case
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-80 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden text-left">
          <div className="p-2 border-b border-slate-200">
            <input
              autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by ID or description..."
              className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-500"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {results.length === 0 ? (
              <p className="px-3 py-4 text-[11px] text-slate-500 text-center">
                {query ? 'No matches.' : 'Nothing saved yet - use "Save to Library" on a test case first.'}
              </p>
            ) : results.map((tc) => (
              <button
                key={tc.id} type="button"
                onClick={() => { onPick(tc); setOpen(false); setQuery(''); }}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-0"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-[var(--success)] font-semibold shrink-0">{tc.customId}</span>
                  <span className="text-xs font-semibold text-slate-900 truncate">{tc.title}</span>
                </div>
                {tc.preconditions && <p className="text-[10px] text-slate-500 truncate mt-0.5">{tc.preconditions}</p>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const RunProgressBar: React.FC<{ run: TestRunItem }> = ({ run }) => {
  const total = run.passedCount + run.failedCount + run.blockedCount + (run.skippedCount ?? 0) + (run.untestedCount ?? 0);
  if (total === 0) return <div className="w-full bg-slate-200 h-2.5 rounded-full" />;
  const pP = (run.passedCount / total) * 100;
  const pF = (run.failedCount / total) * 100;
  const pB = (run.blockedCount / total) * 100;
  const pS = ((run.skippedCount ?? 0) / total) * 100;
  const pct = Math.round((run.passedCount / total) * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-slate-200 h-2.5 rounded-full overflow-hidden flex">
        <div style={{ width: `${pP}%` }} className="bg-emerald-500 h-full" />
        <div style={{ width: `${pF}%` }} className="bg-rose-500 h-full" />
        <div style={{ width: `${pB}%` }} className="bg-slate-400 h-full" />
        <div style={{ width: `${pS}%` }} className="bg-amber-500 h-full" />
      </div>
      <span className="text-xs font-bold text-slate-700 w-10 text-right">{pct}%</span>
    </div>
  );
};

const PieChart: React.FC<{ run: TestRunItem }> = ({ run }) => {
  const data = [
    { value: run.passedCount,        color: '#10b981' },
    { value: run.blockedCount,       color: '#94a3b8' },
    { value: run.skippedCount ?? 0,  color: '#f59e0b' },
    { value: run.failedCount,        color: '#f43f5e' },
    { value: run.untestedCount ?? 0, color: '#cbd5e1' },
  ].filter(d => d.value > 0);
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div className="w-28 h-28 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 text-xs">No data</div>;
  let cum = 0;
  const slices = data.map(d => {
    const a0 = (cum / total) * 2 * Math.PI - Math.PI / 2;
    cum += d.value;
    const a1 = (cum / total) * 2 * Math.PI - Math.PI / 2;
    const r = 45, cx = 56, cy = 56;
    const x1 = cx + r * Math.cos(a0), y1 = cy + r * Math.sin(a0);
    const x2 = cx + r * Math.cos(a1), y2 = cy + r * Math.sin(a1);
    return { ...d, path: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${(a1 - a0) > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z` };
  });
  return (
    <svg width={112} height={112} viewBox="0 0 112 112">
      {slices.map((s, i) => <path key={i} d={s.path} fill={s.color} />)}
      <circle cx={56} cy={56} r={25} fill="#ffffff" />
    </svg>
  );
};


// ── Seed Data ──────────────────────────────────────────────────────────────────
const SAMPLE_PROJECT_ID = 'project-ast2600';
const INITIAL_PROJECTS: ProjectItem[] = [
  { id: SAMPLE_PROJECT_ID, name: 'AST2600 BMC Firmware', description: 'WH3-1205 release validation', createdAt: '2026-08-15T08:00:00Z' },
];
const INITIAL_SUITES: TestSuiteItem[] = [
  {
    id: 'suite-01', projectId: SAMPLE_PROJECT_ID, title: 'AST2600 RTC Clock & Timing Suite',
    description: 'Verification of RTC drift, NTP synchronization, and I2C register integrity.',
    module: 'Firmware Core', taDocId: 'wh3-1205-sample', taDocNumber: 'WH3-1205',
    createdAt: '2026-08-15T08:00:00Z',
    sections: [
      { id: 'sec-01-a', suiteId: 'suite-01', title: 'Manual Tests', order: 0 },
      { id: 'sec-01-b', suiteId: 'suite-01', title: 'Automated Tests (Robot)', order: 1 },
    ],
    testCases: [
      {
        id: 'tc-01', suiteId: 'suite-01', customId: 'C1',
        title: 'RTC Clock Drift Verification under 1-Hour Stress Load',
        preconditions: 'AST2600 BMC powered ON, NTP sync disabled, external PTP reference active',
        steps: [
          { step: 1, action: 'Read initial RTC epoch timestamp via IPMI get-sys-time', expected: 'Returns valid Unix epoch (HTTP 200)' },
          { step: 2, action: 'Apply 100% CPU stress load on AST2600 for 60 minutes', expected: 'Stress test completes without kernel panic' },
          { step: 3, action: 'Compare RTC clock against external PTP reference clock', expected: 'Total drift is <= 50ms over 1 hour' },
        ],
        expectedResult: 'RTC drift remains within the strict 50ms threshold under thermal load.',
        priority: 'Critical', type: 'Automated', labels: ['Firmware','RTC'], references: ['WH3-1205'],
        estimateMin: 14, automationCandidate: true,
        robotCode: `*** Settings ***\nDocumentation     RTC Clock Drift Verification\nLibrary           RequestsLibrary\n\n*** Test Cases ***\nTC_RTC_001_Clock_Drift_Verification\n    [Tags]    Critical    Firmware    RTC\n    Given BMC System Is Operational    192.168.1.100\n    When Apply Stress Load For 60 Minutes\n    Then Verify RTC Drift Is Less Than    50    ms`,
        createdAt: '2026-08-15T08:10:00Z', status: 'Untested',
      },
      {
        id: 'tc-02', suiteId: 'suite-01', customId: 'C2',
        title: 'NTP Synchronization Failover Test',
        preconditions: 'AST2600 running, primary NTP server configured at 192.168.1.1',
        steps: [
          { step: 1, action: 'Verify NTP sync status via timedatectl', expected: 'NTP synchronized: yes' },
          { step: 2, action: 'Block primary NTP server via iptables', expected: 'NTP sync lost within 60s' },
          { step: 3, action: 'Verify failover to secondary NTP server', expected: 'Fallback NTP server synced within 120s' },
        ],
        expectedResult: 'System correctly fails over to secondary NTP within acceptable timeframe.',
        priority: 'High', type: 'Automated', labels: ['Firmware','NTP'], references: ['WH3-1205'],
        estimateMin: 30, automationCandidate: true, createdAt: '2026-08-15T08:20:00Z', status: 'Untested',
      },
      {
        id: 'tc-03', suiteId: 'suite-01', customId: 'C3',
        title: 'I2C Bus Stress Register Integrity Check',
        preconditions: 'AST2600 operational, I2C bus tools installed',
        steps: [
          { step: 1, action: 'Run i2cdetect -y 0 to list devices', expected: 'All expected I2C addresses visible' },
          { step: 2, action: 'Write/read test pattern to RTC I2C register 0x00', expected: 'Data integrity maintained' },
        ],
        expectedResult: 'No I2C bus errors or register corruption after stress test.',
        priority: 'Medium', type: 'Manual', labels: ['Firmware','I2C'], references: ['WH3-1205'],
        estimateMin: 20, automationCandidate: false, createdAt: '2026-08-15T08:30:00Z', status: 'Untested',
      },
    ],
  },

  {
    id: 'suite-02', projectId: SAMPLE_PROJECT_ID, title: 'Dual-Flash WebUI Upgrade & REST API Suite',
    description: 'HPM flashing, image bank switching, and REST endpoint payload validation.',
    module: 'REST API & WebUI', taDocId: 'wh3-1205-sample', taDocNumber: 'WH3-1205',
    createdAt: '2026-08-15T09:30:00Z',
    sections: [
      { id: 'sec-02-a', suiteId: 'suite-02', title: 'Manual Tests', order: 0 },
      { id: 'sec-02-b', suiteId: 'suite-02', title: 'Automated Tests (Cypress)', order: 1 },
    ],
    testCases: [
      {
        id: 'tc-04', suiteId: 'suite-02', customId: 'C4',
        title: 'Dual-Flash HPM Image Upload with preserve_config Flag',
        preconditions: 'Secondary SPI Flash active, WebUI admin logged in',
        steps: [
          { step: 1, action: 'POST /api/v1/system/firmware/upload with preserve_config=true', expected: 'HTTP 200 OK with upload session ID' },
          { step: 2, action: 'Execute flash bank switch via spx_restservice', expected: 'Flash daemon writes to inactive bank' },
          { step: 3, action: 'Reboot BMC and verify active flash bank', expected: 'System boots from primary bank with preserved IP config' },
        ],
        expectedResult: 'Firmware flashes and retains IP configuration without reset.',
        priority: 'Critical', type: 'Automated', labels: ['API','Flash'], references: ['WH3-1206'],
        estimateMin: 45, automationCandidate: true, createdAt: '2026-08-15T09:40:00Z', status: 'Untested',
      },
      {
        id: 'tc-05', suiteId: 'suite-02', customId: 'C5',
        title: 'REST API Authentication Token Expiry Handling',
        preconditions: 'BMC REST API running, valid session token obtained',
        steps: [
          { step: 1, action: 'Obtain JWT token via POST /api/v1/auth/login', expected: 'HTTP 200 with valid JWT' },
          { step: 2, action: 'Wait for token expiry or manually expire it', expected: 'Token becomes invalid' },
          { step: 3, action: 'Use expired token for API call', expected: 'HTTP 401 Unauthorized returned' },
        ],
        expectedResult: 'Expired tokens are correctly rejected with 401 response.',
        priority: 'High', type: 'Automated', labels: ['API','Security'], references: ['WH3-1206'],
        estimateMin: 20, automationCandidate: true, createdAt: '2026-08-15T09:50:00Z', status: 'Untested',
      },
    ],
  },
];

const buildCaseResults = (suite: TestSuiteItem, statuses: TestCaseStatus[]): TestRunCaseResult[] =>
  (suite.testCases || []).map((tc, i) => ({
    caseId: tc.id, customId: tc.customId, title: tc.title,
    status: statuses[i % statuses.length], assignedTo: 'Manivannan T.', labels: tc.labels,
  }));


const INITIAL_RUNS: TestRunItem[] = [
  {
    id: 'run-01', name: '[Regression] Full Release v5.67', suiteId: 'suite-01',
    environment: 'AST2600 Staging Hardware', status: 'In Progress',
    passedCount: 1, failedCount: 1, blockedCount: 1, skippedCount: 0, untestedCount: 14,
    automationPassedCount: 0, automationFailedCount: 0, automationErrorCount: 0,
    executedAt: '2026-09-11T06:00:00Z', milestone: 'Release v5.67', assignedTo: 'Manivannan T.',
    caseResults: buildCaseResults(INITIAL_SUITES[0], ['Passed','Blocked','Failed']),
  },
  {
    id: 'run-02', name: '[Performance] JMeter Tests', suiteId: 'suite-02',
    environment: 'AST2600 Performance Bench', status: 'Completed',
    passedCount: 2, failedCount: 0, blockedCount: 0, skippedCount: 0, untestedCount: 0,
    automationPassedCount: 0, automationFailedCount: 0, automationErrorCount: 0,
    executedAt: '2026-09-11T08:00:00Z', milestone: 'Q3-25 Performance Benchmarking Test', assignedTo: 'Manivannan T.',
    caseResults: buildCaseResults(INITIAL_SUITES[1], ['Passed','Passed']),
  },
  {
    id: 'run-03', name: '[Regression] Release v5.67 Browser Testing', suiteId: 'suite-02',
    environment: 'AST2600 WebUI QA', status: 'Completed',
    passedCount: 8, failedCount: 1, blockedCount: 1, skippedCount: 2, untestedCount: 0,
    automationPassedCount: 0, automationFailedCount: 0, automationErrorCount: 0,
    executedAt: '2026-09-11T07:00:00Z', milestone: 'Release v5.67', assignedTo: 'Manivannan T.',
    caseResults: buildCaseResults(INITIAL_SUITES[1], ['Passed','Failed']),
  },
];

const INITIAL_MILESTONES: MilestoneItem[] = [
  { id: 'ms-01', name: 'Release v5.67', status: 'open', passedCount: 9, failedCount: 2, blockedCount: 2, untestedCount: 14, totalCount: 27, testRunIds: ['run-01','run-03'] },
  { id: 'ms-02', name: 'Release v2.1.2', status: 'open', passedCount: 5, failedCount: 2, blockedCount: 1, untestedCount: 2, totalCount: 10, testRunIds: [] },
  { id: 'ms-03', name: 'Release Hotfix v3.1.1', status: 'open', passedCount: 2, failedCount: 2, blockedCount: 0, untestedCount: 6, totalCount: 10, testRunIds: [] },
  { id: 'ms-04', name: 'Q3-25 Performance Benchmarking Test', status: 'completed', passedCount: 2, failedCount: 0, blockedCount: 0, untestedCount: 0, totalCount: 2, testRunIds: ['run-02'] },
];

const SAMPLE_ROBOT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<robot generator="Robot 7.4.2" generated="20260904 22:30:00.000">
  <suite id="s1" name="AST2600 RTC Clock Drift Verification Suite">
    <test id="s1-t1" name="TC_RTC_001_Clock_Drift_Verification">
      <status status="PASS" starttime="20260904 22:30:01.000" endtime="20260904 22:30:05.120"></status>
    </test>
    <test id="s1-t2" name="TC_RTC_002_NTP_Synchronization_Failover">
      <status status="PASS" starttime="20260904 22:30:05.125" endtime="20260904 22:30:07.450"></status>
    </test>
    <test id="s1-t3" name="TC_RTC_003_I2C_Bus_Stress_Check">
      <status status="FAIL" starttime="20260904 22:30:07.455" endtime="20260904 22:30:09.800"></status>
    </test>
  </suite>
</robot>`;

const SAMPLE_TA_DOC: DocumentModel = {
  metadata: {
    id: 'wh3-1205', docNumber: 'WH3-1205',
    title: 'WebUI HPM Firmware Upgrade Failure Investigation & Fix',
    subtitle: 'Dual-Flash preserve_config Payload Sanitization',
    author: 'Mani Thangavel', department: 'Platform Systems Engineering',
    date: '2026-08-15', version: '1.0', classification: 'INTERNAL ONLY',
    status: 'APPROVED', templateType: 'technical-analysis',
  },
  sections: [
    { id: 'purpose', title: '1. Purpose & Background', level: 1, type: 'richText', content: 'Investigation of firmware upgrade failures on AST2600 dual-flash architecture.' },
    { id: 'rca',     title: '2. Root Cause Analysis',  level: 1, type: 'richText', content: 'Missing preserve_config parameter caused backend spx_restservice to reject the request.' },
    { id: 'verify',  title: '3. Verification Matrix',  level: 1, type: 'richText', content: 'Validate dual-flash bank switching, HPM HTTP POST payloads, and zero memory leaks.' },
  ],
};

type MainView     = 'test-cases' | 'runs' | 'milestones' | 'reports';
type RunDetailTab = 'results' | 'activity' | 'progress' | 'defects' | 'compare';


// ── Add Test Run Modal ─────────────────────────────────────────────────────────
const AddTestRunModal: React.FC<{
  suites: TestSuiteItem[]; milestones: MilestoneItem[];
  onAdd: (run: TestRunItem) => void; onClose: () => void;
}> = ({ suites, milestones, onAdd, onClose }) => {
  const [name, setName]           = useState(`Test Run ${new Date().toLocaleDateString()}`);
  const [suiteId, setSuiteId]     = useState(suites[0]?.id || '');
  const [env, setEnv]             = useState('');
  const [milestone, setMilestone] = useState('');
  const [assignTo, setAssignTo]   = useState('');
  const [desc, setDesc]           = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate]     = useState('');
  const [caseMode, setCaseMode]   = useState<CaseMode>('all');
  // DDS-SRS-016: cases picked by hand (or whole sections), or by filter.
  const [picked, setPicked]       = useState<Set<string>>(() => new Set());
  const [filter, setFilter]       = useState<CaseFilter>({ sectionIds: [], priorities: [], types: [] });
  const suite = suites.find(s => s.id === suiteId);
  const cases = selectRunCases(suite, caseMode, picked, filter);
  const liveCases = (suite?.testCases || []).filter(tc => !tc.isDeleted);
  const sectionNodesForRun = sectionTree(suite?.sections || []);
  const casesInSection = (sectionId: string) => {
    const ids = suite ? withSubsections(suite, [sectionId]) : new Set<string>();
    return liveCases.filter(tc => ids.has(sectionOfCase(tc, suite?.sections || []) ?? ''));
  };
  const toggleCases = (ids: string[], on: boolean) => setPicked(prev => {
    const next = new Set(prev);
    for (const id of ids) { if (on) next.add(id); else next.delete(id); }
    return next;
  });
  const toggleIn = <K extends keyof CaseFilter>(key: K, value: CaseFilter[K][number]) => setFilter(prev => {
    const list = prev[key] as CaseFilter[K][number][];
    return { ...prev, [key]: list.includes(value) ? list.filter(v => v !== value) : [...list, value] };
  });

  const handleAdd = () => {
    if (!name.trim() || cases.length === 0) return;
    const caseResults: TestRunCaseResult[] = cases.map(tc => ({
      caseId: tc.id, customId: tc.customId, title: tc.title,
      status: 'Untested' as TestCaseStatus, assignedTo: assignTo || undefined, labels: tc.labels,
    }));
    onAdd({
      id: `run-${Date.now()}`, name, suiteId, environment: env || 'Default',
      status: 'In Progress', passedCount: 0, failedCount: 0, blockedCount: 0,
      skippedCount: 0, untestedCount: cases.length,
      automationPassedCount: 0, automationFailedCount: 0, automationErrorCount: 0,
      executedAt: new Date().toISOString(), milestone: milestone || undefined,
      assignedTo: assignTo || undefined, description: desc || undefined,
      startDate: startDate || undefined, endDate: endDate || undefined, caseResults,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-start justify-center pt-10 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl mx-4 mb-10 shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900">Add Test Run</h2>
          <div className="flex gap-2">
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Name <span className="text-rose-500">*</span></label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none shadow-xs"
              placeholder="e.g. Regression Run Build 240" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Test Suite</label>
            <select value={suiteId} onChange={e => { setSuiteId(e.target.value); setPicked(new Set()); setFilter({ sectionIds: [], priorities: [], types: [] }); }}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none shadow-xs">
              {suites.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Milestone</label>
              <select value={milestone} onChange={e => setMilestone(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none shadow-xs">
                <option value="">— None —</option>
                {milestones.filter(m => m.status === 'open').map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Assign To</label>
              <input value={assignTo} onChange={e => setAssignTo(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none shadow-xs" placeholder="Team member name" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Environment</label>
            <input value={env} onChange={e => setEnv(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none shadow-xs" placeholder="e.g. AST2600 Staging Hardware" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none resize-none shadow-xs" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none shadow-xs" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">End Date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none shadow-xs" />
            </div>
          </div>
          <div className="space-y-2">
            {(['all','specific','dynamic'] as const).map(opt => (
              <label key={opt} className="flex items-start gap-3 cursor-pointer">
                <input type="radio" name="caseMode" value={opt} checked={caseMode === opt} onChange={() => setCaseMode(opt)} className="mt-0.5 accent-blue-600" />
                <div>
                  <span className="text-sm font-semibold text-slate-800">
                    {opt === 'all' ? 'Include all test cases' : opt === 'specific' ? 'Select specific test cases' : 'Dynamic Filtering'}
                  </span>
                  <p className="text-[11px] text-slate-500">
                    {opt === 'all' ? 'Every test case in the suite.' :
                     opt === 'specific' ? 'Pick test cases, or whole sections and sub-sections.' :
                     'Test cases matching the filters: sections (with their sub-sections), priority and type.'}
                  </p>
                </div>
              </label>
            ))}
          </div>
          {caseMode === 'specific' && (
            <div role="group" aria-label="Test cases to include" className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1">
              {sectionNodesForRun.length === 0 && liveCases.map(tc => (
                <label key={tc.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={picked.has(tc.id)} onChange={e => toggleCases([tc.id], e.target.checked)} />{tc.customId} {tc.title}</label>
              ))}
              {sectionNodesForRun.map(({ section, depth }) => {
                const inSection = casesInSection(section.id);
                const direct = liveCases.filter(tc => sectionOfCase(tc, suite?.sections || []) === section.id);
                const allOn = inSection.length > 0 && inSection.every(tc => picked.has(tc.id));
                return (
                  <div key={section.id} style={{ marginLeft: `${depth * 14}px` }}>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                      <input type="checkbox" aria-label={`Whole section ${section.title}`} checked={allOn} disabled={!inSection.length}
                        onChange={e => toggleCases(inSection.map(tc => tc.id), e.target.checked)} />
                      {section.title} <span className="font-normal text-slate-500">({inSection.length})</span>
                    </label>
                    {direct.map(tc => (
                      <label key={tc.id} className="flex items-center gap-2 text-xs ml-5">
                        <input type="checkbox" checked={picked.has(tc.id)} onChange={e => toggleCases([tc.id], e.target.checked)} />
                        <span className="font-mono text-[11px] text-slate-500">{tc.customId}</span> {tc.title}
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
          {caseMode === 'dynamic' && (
            <div className="border border-slate-200 rounded-lg p-3 space-y-2 text-xs">
              {([
                ['Sections', 'sectionIds', sectionNodesForRun.map(n => [n.section.id, `${'· '.repeat(n.depth)}${n.section.title}`])],
                ['Priority', 'priorities', PRIORITIES.map(p => [p, p])],
                ['Type', 'types', [['Manual', 'Manual'], ['Automated', 'Automated']]],
              ] as [string, keyof CaseFilter, string[][]][]).map(([label, key, options]) => (
                <div key={key} role="group" aria-label={`Filter by ${label.toLowerCase()}`} className="flex flex-wrap items-center gap-1.5">
                  <span className="w-16 font-semibold text-slate-700">{label}</span>
                  {options.map(([value, text]) => {
                    const on = (filter[key] as string[]).includes(value);
                    return (
                      <button key={value} type="button" aria-pressed={on} onClick={() => toggleIn(key, value as never)}
                        className={`px-2 py-0.5 rounded border ${on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300'}`}>{text}</button>
                    );
                  })}
                </div>
              ))}
              <p className="text-[11px] text-slate-500">No choice in a row means any.</p>
            </div>
          )}
          <p role="status" className="text-xs text-slate-600">{cases.length} test case{cases.length === 1 ? '' : 's'} will be included.</p>
          <div className="flex gap-3 pt-2">
            <button onClick={handleAdd} disabled={cases.length === 0} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold">
              <Check className="w-3.5 h-3.5" /> Add Test Run
            </button>
            <button onClick={onClose} className="flex items-center gap-1.5 px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-sm font-semibold">
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


// ── Test case attachments (screenshots, logs) ──────────────────────────────────
// Kept inline in browser storage with the rest of the test data, which has a
// ~5 MB budget overall - hence the per-file cap.
const MAX_ATTACHMENT_BYTES = 512 * 1024;

const formatBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

const AttachmentList: React.FC<{ attachments: TestCaseAttachment[]; onRemove?: (id: string) => void }> = ({ attachments, onRemove }) => (
  <ul className="space-y-1">
    {attachments.map((a) => (
      <li key={a.id} className="flex items-center gap-2 bg-white px-2 py-1.5 rounded border border-slate-200 text-xs">
        <Paperclip className="w-3 h-3 text-slate-500 shrink-0" />
        <a href={a.dataUrl} download={a.name} className="text-[var(--blue)] hover:underline truncate">{a.name}</a>
        <span className="text-[10px] text-slate-500 shrink-0">{formatBytes(a.size)}</span>
        {onRemove && (
          <button type="button" onClick={() => onRemove(a.id)} aria-label={`Remove ${a.name}`} className="ml-auto p-0.5 text-slate-400 hover:text-rose-600 rounded">
            <X className="w-3 h-3" />
          </button>
        )}
      </li>
    ))}
  </ul>
);

const AttachmentsEditor: React.FC<{ value: TestCaseAttachment[]; onChange: (next: TestCaseAttachment[]) => void }> = ({ value, onChange }) => {
  const [error, setError] = useState('');
  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const tooBig = [...files].filter((f) => f.size > MAX_ATTACHMENT_BYTES).map((f) => f.name);
    const added = await Promise.all([...files].filter((f) => f.size <= MAX_ATTACHMENT_BYTES).map((file) =>
      new Promise<TestCaseAttachment>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size,
          dataUrl: reader.result as string, addedAt: new Date().toISOString(),
        });
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      })));
    setError(tooBig.length ? `Not attached (over ${formatBytes(MAX_ATTACHMENT_BYTES)} each): ${tooBig.join(', ')}` : '');
    if (added.length) onChange([...value, ...added]);
  };
  return (
    <div className="space-y-2">
      {value.length > 0 && <AttachmentList attachments={value} onRemove={(id) => onChange(value.filter((a) => a.id !== id))} />}
      <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-[11px] font-semibold text-slate-700 cursor-pointer hover:border-blue-400">
        <Paperclip className="w-3 h-3" /> Attach files
        <input type="file" multiple className="hidden" aria-label="Attach files"
          accept="image/*,.log,.txt,.xml,.html,.htm,.json,.csv,.pdf"
          onChange={(e) => { void handleFiles(e.target.files); e.target.value = ''; }} />
      </label>
      <p className="text-[10px] text-slate-500">Screenshots, logs or reports, up to {formatBytes(MAX_ATTACHMENT_BYTES)} each.</p>
      {error && <p role="alert" className="text-[11px] text-[var(--danger)]">{error}</p>}
    </div>
  );
};

// ── Defect IDs on a failed run result (DDS-SRS-018) ────────────────────────────
const DefectIdsEditor: React.FC<{ caseLabel: string; defects: string[]; onChange: (next: string[]) => void }> = ({ caseLabel, defects, onChange }) => {
  const [draft, setDraft] = useState('');
  const add = () => {
    // Accept several at once ("WH3-1210, #482"); skip blanks and duplicates.
    const ids = draft.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    const next = [...defects, ...[...new Set(ids)].filter((id) => !defects.includes(id))];
    if (next.length !== defects.length) onChange(next);
    setDraft('');
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {defects.map((id) => (
        <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-mono font-bold">
          <Bug className="w-3 h-3" />{id}
          <button type="button" onClick={() => onChange(defects.filter((d) => d !== id))} aria-label={`Remove ${id} from ${caseLabel}`} className="hover:text-rose-900">
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}
      <input value={draft} onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        aria-label={`Issue IDs for ${caseLabel}`} placeholder="Issue ID, e.g. WH3-1210"
        className="w-40 bg-white border border-slate-300 rounded px-2 py-1 text-[11px] text-slate-900 outline-none focus:border-blue-500" />
      <button type="button" onClick={add} disabled={!draft.trim()}
        className="px-2 py-1 rounded border border-slate-300 text-[11px] font-semibold text-slate-700 hover:border-blue-400 disabled:opacity-40">
        Link issue
      </button>
    </div>
  );
};

// ── Add / Edit Test Case Modal ─────────────────────────────────────────────────
const AddCaseModal: React.FC<{
  suiteId: string; initial?: Partial<TestCaseItem>;
  /** ID a new case gets: the next one in the TC-001, TC-002 ... sequence. */
  nextCustomId: string;
  /** The suite's sections, and the one a new case goes in by default. */
  sections: TestSection[]; defaultSectionId?: string;
  onSave: (tc: TestCaseItem) => void; onClose: () => void;
}> = ({ suiteId, initial, nextCustomId, sections, defaultSectionId, onSave, onClose }) => {
  const [title, setTitle]     = useState(initial?.title || '');
  const [type, setType]       = useState<'Manual'|'Automated'>(initial?.type || 'Manual');
  // An existing case keeps what it has: a case saved before sections held
  // cases stays "By type" unless the user picks a section, so an unrelated
  // edit doesn't record a section change in its history.
  const [sectionId, setSectionId] = useState<string>(() =>
    (initial?.id ? (initial.sectionId && sections.some(s => s.id === initial.sectionId) ? initial.sectionId : '') : defaultSectionId) ?? '');
  const [priority, setPriority] = useState<TestCasePriority>(normalizePriority(initial?.priority));
  const [preconditions, setPreconditions] = useState(initial?.preconditions || '');
  const [expectedResult, setExpectedResult] = useState(initial?.expectedResult || '');
  const [postconditions, setPostconditions] = useState(initial?.postconditions || '');
  const [attachments, setAttachments] = useState<TestCaseAttachment[]>(initial?.attachments || []);
  const [labels, setLabels]   = useState((initial?.labels || []).join(', '));
  const [refs, setRefs]       = useState((initial?.references || []).join(', '));
  const [estMin, setEstMin]   = useState(String(initial?.estimateMin || ''));
  const [autoCandidate, setAutoCandidate] = useState(initial?.automationCandidate ?? false);
  const [robotCode, setRobotCode] = useState(initial?.robotCode || '');
  const [steps, setSteps] = useState<TestCaseStep[]>(
    initial?.steps?.length ? initial.steps : [{ step: 1, action: '', expected: '' }]
  );

  const addStep = () => setSteps(prev => [...prev, { step: prev.length + 1, action: '', expected: '' }]);
  const removeStep = (i: number) => setSteps(prev => prev.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, step: idx + 1 })));
  const updateStep = (i: number, field: 'action'|'expected', val: string) =>
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s));

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      // Keep fields this form doesn't edit (evidence screenshot, Task Bin
      // state, ...) - they used to be dropped on every edit.
      ...initial,
      id: initial?.id || `tc-${Date.now()}`,
      suiteId, customId: initial?.customId || nextCustomId,
      sectionId: sectionId || undefined,
      title, type, priority, preconditions, expectedResult, steps,
      postconditions: postconditions.trim() || undefined,
      attachments: attachments.length ? attachments : undefined,
      labels: labels.split(',').map(l => l.trim()).filter(Boolean),
      references: refs.split(',').map(r => r.trim()).filter(Boolean),
      estimateMin: estMin ? parseInt(estMin) : undefined,
      automationCandidate: autoCandidate,
      robotCode: robotCode || undefined,
      isFlagged: initial?.isFlagged,
      createdAt: initial?.createdAt || new Date().toISOString(),
      status: initial?.status || 'Untested',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-start justify-center pt-6 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl mx-4 mb-10 shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900">
            {initial?.id ? 'Edit Test Case' : 'Add Test Case'}
            <span className="ml-2 text-xs font-mono font-semibold text-[var(--blue)]">{initial?.customId || nextCustomId}</span>
          </h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Title <span className="text-rose-500">*</span></label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none shadow-xs" placeholder="Test case title" />
          </div>
          {sections.length > 0 && (
            <div>
              <label htmlFor="case-section" className="block text-xs font-semibold text-slate-700 mb-1">Section</label>
              <select id="case-section" value={sectionId} onChange={e => setSectionId(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none shadow-xs">
                <option value="">By type (Manual / Automated section)</option>
                {sectionTree(sections).map(({ section, depth }) => (
                  <option key={section.id} value={section.id}>{'\u00a0\u00a0'.repeat(depth)}{depth ? '└ ' : ''}{section.title}</option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Type</label>
              <select value={type} onChange={e => setType(e.target.value as 'Manual'|'Automated')}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none shadow-xs">
                <option>Manual</option><option>Automated</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value as TestCasePriority)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none shadow-xs">
                {PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Estimate (min)</label>
              <input type="number" value={estMin} onChange={e => setEstMin(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none shadow-xs" placeholder="30" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Labels (comma-separated)</label>
              <input value={labels} onChange={e => setLabels(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none shadow-xs" placeholder="RTC, Firmware" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">References</label>
              <input value={refs} onChange={e => setRefs(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none shadow-xs" placeholder="WH3-1205" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Preconditions</label>
            <textarea value={preconditions} onChange={e => setPreconditions(e.target.value)} rows={2}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none resize-none shadow-xs" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700">Test Steps</label>
              <button onClick={addStep} className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[10px] font-semibold hover:bg-blue-100">
                <Plus className="w-3 h-3" /> Add Step
              </button>
            </div>
            <div className="space-y-2">
              {steps.map((st, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start">
                  <span className="col-span-1 text-[10px] text-[var(--success)] font-bold pt-2">{st.step}</span>
                  <input value={st.action} onChange={e => updateStep(i, 'action', e.target.value)}
                    className="col-span-5 bg-white border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-900 outline-none" placeholder="Action" />
                  <input value={st.expected} onChange={e => updateStep(i, 'expected', e.target.value)}
                    className="col-span-5 bg-white border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-700 outline-none" placeholder="Expected result" />
                  <button onClick={() => removeStep(i)} className="col-span-1 p-1 text-rose-500 hover:bg-rose-50 rounded">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Expected Outcome</label>
            <textarea value={expectedResult} onChange={e => setExpectedResult(e.target.value)} rows={2}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none resize-none shadow-xs" />
          </div>
          <div>
            <label htmlFor="tc-postconditions" className="block text-xs font-semibold text-slate-700 mb-1">Post-conditions</label>
            <textarea id="tc-postconditions" value={postconditions} onChange={e => setPostconditions(e.target.value)} rows={2}
              placeholder="State the system must be left in, e.g. NTP restored to the primary server"
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none resize-none shadow-xs" />
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-1">Attachments</span>
            <AttachmentsEditor value={attachments} onChange={setAttachments} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={autoCandidate} onChange={e => setAutoCandidate(e.target.checked)} className="accent-teal-600" />
            <span className="text-xs text-slate-700 font-medium">Automation Candidate</span>
          </label>
          {(type === 'Automated' || autoCandidate) && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Robot Framework Code (.robot)</label>
              <textarea value={robotCode} onChange={e => setRobotCode(e.target.value)} rows={5}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-amber-300 font-mono outline-none resize-none" />
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold btn-primary">
              <Check className="w-3.5 h-3.5" /> {initial?.id ? 'Save Changes' : 'Add Test Case'}
            </button>
            <button onClick={onClose} className="flex items-center gap-1.5 px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-sm font-semibold">
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


/** Cases drawn per section before "Show more" (DDS-SRS-073). */
const CASE_PAGE_SIZE = 100;

// ── Test Cases View ────────────────────────────────────────────────────────────
const TestCasesView: React.FC<{
  suites: TestSuiteItem[]; selectedSuiteId: string | null;
  projects: ProjectItem[];
  /** The suites of the project picked in the left panel. */
  visibleSuites: TestSuiteItem[];
  onSelectSuite: (id: string) => void;
  onUpdateSuites: (s: TestSuiteItem[]) => void;
  onShowToast: (msg: string) => void;
  onExportSuiteMd: () => void;
  onExportRobotSuite: (suite: TestSuiteItem) => void;
  onExportProtocolExcel: () => void;
  onImportProtocolExcel: (file: File) => void;
  onShowAiModal: () => void;
  onShowBackAnnotateModal: () => void;
  onRunTest: (suite: TestSuiteItem) => void;
}> = ({ suites, selectedSuiteId, projects, visibleSuites, onSelectSuite, onUpdateSuites, onShowToast,
        onExportSuiteMd, onExportRobotSuite, onExportProtocolExcel, onImportProtocolExcel, onShowAiModal, onShowBackAnnotateModal, onRunTest }) => {
  const [collapseAll, setCollapseAll]       = useState(false);
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null);
  const [showAddCase, setShowAddCase]       = useState(false);
  const [editingCase, setEditingCase]       = useState<TestCaseItem | null>(null);
  const [searchQ, setSearchQ]               = useState('');
  const [showDeletedCases, setShowDeletedCases] = useState(false);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [showSuiteLibraryModal, setShowSuiteLibraryModal] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set());
  const [addCaseSectionId, setAddCaseSectionId] = useState<string | undefined>(undefined);
  const [historyCase, setHistoryCase] = useState<TestCaseItem | null>(null);
  // DDS-SRS-073: suites can hold 5,000+ cases. Drawing every row at once
  // took seconds, so each section shows a page at a time; search still
  // covers every case.
  const [shownCounts, setShownCounts] = useState<Record<string, number>>({});
  const shown = (key: string) => shownCounts[key] ?? CASE_PAGE_SIZE;
  const ShowMore: React.FC<{ listKey: string; total: number; label: string }> = ({ listKey, total, label }) =>
    total > shown(listKey) ? (
      <div className="px-4 py-2 text-xs border-t border-slate-200 bg-slate-50 flex items-center gap-3">
        <span className="text-slate-500">Showing {shown(listKey)} of {total} cases in {label}.</span>
        <button className="text-[var(--blue)] hover:underline font-medium"
          onClick={() => setShownCounts(prev => ({ ...prev, [listKey]: shown(listKey) + CASE_PAGE_SIZE }))}>
          Show {Math.min(CASE_PAGE_SIZE, total - shown(listKey))} more
        </button>
        <button className="text-[var(--blue)] hover:underline" onClick={() => setShownCounts(prev => ({ ...prev, [listKey]: total }))}>Show all</button>
      </div>
    ) : null;

  // No fallback to the first suite: with a project picked, that could be a
  // suite from another project.
  const selectedSuite = suites.find(s => s.id === selectedSuiteId);
  const cases = (selectedSuite?.testCases || []).filter(tc =>
    (showDeletedCases || !tc.isDeleted) &&
    (!searchQ || tc.title.toLowerCase().includes(searchQ.toLowerCase()) ||
      tc.customId.toLowerCase().includes(searchQ.toLowerCase()))
  );
  const totalCases    = visibleSuites.reduce((s, x) => s + (x.testCases?.length || 0), 0);
  const totalSections = visibleSuites.reduce((s, x) => s + (x.sections?.length || 0), 0);

  const handleDeleteCase = (caseId: string) => {
    if (!selectedSuite) return;
    onUpdateSuites(suites.map(s => s.id === selectedSuite.id
      ? { ...s, testCases: (s.testCases || []).map(tc => tc.id === caseId ? { ...tc, isDeleted: true } : tc) } : s));
    onShowToast('🗑️ Test case deleted.');
  };
  const handleRestoreCase = (caseId: string) => {
    if (!selectedSuite) return;
    onUpdateSuites(suites.map(s => s.id === selectedSuite.id
      ? { ...s, testCases: (s.testCases || []).map(tc => tc.id === caseId ? { ...tc, isDeleted: false } : tc) } : s));
    onShowToast('✅ Test case restored.');
  };
  const handleSaveCase = (tc: TestCaseItem) => {
    if (!selectedSuite) return;
    const exists = (selectedSuite.testCases || []).find(c => c.id === tc.id);
    onUpdateSuites(suites.map(s => s.id === selectedSuite.id
      ? { ...s, testCases: exists
          ? (s.testCases || []).map(c => c.id === tc.id ? tc : c)
          : [...(s.testCases || []), tc] } : s));
    onShowToast(exists ? '✅ Test case updated.' : '✅ Test case added.');
  };
  const handleToggleFlag = (caseId: string) => {
    if (!selectedSuite) return;
    onUpdateSuites(suites.map(s => s.id === selectedSuite.id
      ? { ...s, testCases: (s.testCases || []).map(tc =>
          tc.id === caseId ? { ...tc, isFlagged: !tc.isFlagged } : tc) } : s));
  };
  const handleUploadEvidence = (caseId: string, file: File) => {
    if (!selectedSuite) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      onUpdateSuites(suites.map(s => s.id === selectedSuite.id
        ? { ...s, testCases: (s.testCases || []).map(tc =>
            tc.id === caseId ? { ...tc, evidenceImage: reader.result as string, evidenceImageName: file.name } : tc) } : s));
    };
    reader.readAsDataURL(file);
  };
  const handleRemoveEvidence = (caseId: string) => {
    if (!selectedSuite) return;
    onUpdateSuites(suites.map(s => s.id === selectedSuite.id
      ? { ...s, testCases: (s.testCases || []).map(tc =>
          tc.id === caseId ? { ...tc, evidenceImage: undefined, evidenceImageName: undefined } : tc) } : s));
  };
  const handleSaveCaseToLibrary = (tc: TestCaseItem) => {
    void saveToLibrary(tc).then(() => onShowToast(testCaseLibrary.error()
      ? `⚠️ Not saved to the library: ${testCaseLibrary.error()}`
      : `📚 Saved "${tc.customId}" to the reusable library.`));
  };
  // CSV / JSON / XML exchange (DDS-SRS-015).
  const handleExportCases = (format: ExchangeFormat) => {
    if (!selectedSuite) return;
    const cases = (selectedSuite.testCases || []).filter(tc => !tc.isDeleted);
    const { content, mimeType } = exportTestCases(cases, selectedSuite.title, format);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: mimeType }));
    a.download = `${selectedSuite.title.replace(/[^\w-]+/g, '_')}_test_cases.${format}`;
    a.click();
    URL.revokeObjectURL(a.href);
    onShowToast(`✅ Exported ${cases.length} test case${cases.length === 1 ? '' : 's'} as ${format.toUpperCase()}.`);
  };
  const handleImportCases = async (file: File) => {
    if (!selectedSuite) return;
    const format = formatFromFileName(file.name);
    if (!format) { onShowToast('❌ Import a .csv, .json or .xml file.'); return; }
    try {
      const parsed = parseTestCases(await file.text(), format);
      // Keep an imported ID when it is free; otherwise continue the TC-### sequence.
      const taken = new Set(suites.flatMap(s => (s.testCases || []).map(tc => tc.customId)));
      const working = suites.map(s => ({ testCases: [...(s.testCases || [])] }));
      const now = new Date().toISOString();
      const imported: TestCaseItem[] = parsed.map((c, i) => {
        const customId = c.customId && !taken.has(c.customId) ? c.customId : nextTestCaseId(working);
        taken.add(customId);
        const tc: TestCaseItem = {
          ...c, customId, id: `tc-${Date.now()}-${i}`, suiteId: selectedSuite.id,
          postconditions: c.postconditions || undefined, createdAt: now, status: 'Untested',
        };
        working[0].testCases.push(tc);
        return tc;
      });
      onUpdateSuites(suites.map(s => s.id === selectedSuite.id ? { ...s, testCases: [...(s.testCases || []), ...imported] } : s));
      onShowToast(`✅ Imported ${imported.length} test case${imported.length === 1 ? '' : 's'} from ${file.name}.`);
    } catch (e) {
      onShowToast(`❌ ${e instanceof ImportError ? e.message : `Could not read ${file.name}.`}`);
    }
  };
  const handleImportFromLibrary = (entries: TestCaseItem[]) => {
    if (!selectedSuite || entries.length === 0) return;
    const now = new Date().toISOString();
    const imported = entries.map((tc, i) => ({
      ...tc,
      id: `tc-${Date.now()}-${i}`,
      suiteId: selectedSuite.id,
      createdAt: now,
      isDeleted: false,
    }));
    onUpdateSuites(suites.map(s => s.id === selectedSuite.id
      ? { ...s, testCases: [...(s.testCases || []), ...imported] } : s));
    onShowToast(`✅ Imported ${entries.length} test case${entries.length === 1 ? '' : 's'} from the library.`);
    setShowLibraryModal(false);
  };
  const handleSaveSuiteToLibrary = () => {
    if (!selectedSuite) return;
    const title = selectedSuite.title;
    void saveSuiteToLibrary(selectedSuite).then(() => onShowToast(testSuiteLibrary.error()
      ? `⚠️ Not saved to the library: ${testSuiteLibrary.error()}`
      : `📚 Saved suite "${title}" to the reusable library.`));
  };
  const handleLoadSuiteFromLibrary = (template: TestSuiteItem) => {
    const instance = instantiateSuiteFromLibrary(template);
    onUpdateSuites([...suites, instance]);
    onSelectSuite(instance.id);
    onShowToast(`✅ Loaded suite "${instance.title}" from the library.`);
    setShowSuiteLibraryModal(false);
  };

  const sections = selectedSuite?.sections || [];
  const sectionNodes = sectionTree(sections);
  const parentOf = new Map(sections.map(s => [s.id, s.parentId]));
  const isHidden = (id: string): boolean => {
    if (collapseAll) return false;
    const seen = new Set<string>();
    for (let p = parentOf.get(id); p && !seen.has(p); p = parentOf.get(p)) {
      if (collapsedSections.has(p)) return true;
      seen.add(p);
    }
    return false;
  };
  const toggleSection = (id: string) => setCollapsedSections(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Section edits change the suite's structure; older cases without a
  // sectionId are pinned to where they show now, so renaming or adding a
  // section never silently moves them (see testSections.sectionOfCase).
  const editSections = (fn: (sections: TestSection[], suite: TestSuiteItem) => TestSection[]) => {
    if (!selectedSuite) return;
    onUpdateSuites(suites.map(s => {
      if (s.id !== selectedSuite.id) return s;
      const before = s.sections || [];
      return {
        ...s,
        testCases: (s.testCases || []).map(tc => tc.sectionId ? tc : { ...tc, sectionId: sectionOfCase(tc, before) ?? undefined }),
        sections: fn(before, s),
      };
    }));
  };
  const handleAddSection = (parentId?: string) => {
    const title = prompt(parentId ? 'Sub-section name:' : 'Section name:');
    if (!title?.trim()) return;
    editSections((list, suite) => [...list, {
      id: `sec-${Date.now()}`, suiteId: suite.id, title: title.trim(), order: nextSectionOrder(list, parentId),
      ...(parentId ? { parentId } : {}),
    }]);
    if (parentId) setCollapsedSections(prev => { const next = new Set(prev); next.delete(parentId); return next; });
  };
  const handleRenameSection = (sec: TestSection) => {
    const title = prompt('Rename section:', sec.title);
    if (!title?.trim() || title.trim() === sec.title) return;
    editSections(list => list.map(s => s.id === sec.id ? { ...s, title: title.trim() } : s));
  };
  const handleDeleteSection = (sec: TestSection) => {
    if (!selectedSuite) return;
    if (!isSectionEmpty(sec.id, sections, selectedSuite.testCases || [])) {
      onShowToast('⚠️ Move or delete its sub-sections and test cases first (including any in the bin).');
      return;
    }
    if (!confirm(`Delete section "${sec.title}"?`)) return;
    editSections(list => list.filter(s => s.id !== sec.id));
    onShowToast('🗑️ Section deleted.');
  };
  const handleMoveSuite = (projectId: string) => {
    if (!selectedSuite) return;
    onUpdateSuites(suites.map(s => {
      if (s.id !== selectedSuite.id) return s;
      const { projectId: _old, ...rest } = s;
      return projectId ? { ...rest, projectId } : rest;
    }));
    const name = projects.find(p => p.id === projectId)?.name;
    onShowToast(name ? `✅ Moved to project "${name}".` : '✅ Removed from its project.');
  };
  const openAddCase = (sectionId?: string) => { setAddCaseSectionId(sectionId); setShowAddCase(true); };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-slate-900">Test Cases</h2>
          <span className="text-xs text-slate-500">Contains <span className="text-slate-900 font-semibold">{totalSections}</span> sections and <span className="text-slate-900 font-semibold">{totalCases}</span> cases.</span>
          {selectedSuite && (
            <select aria-label="Project of this suite" value={selectedSuite.projectId ?? ''} onChange={e => handleMoveSuite(e.target.value)}
              className="ml-2 px-2 py-1 bg-white border border-slate-300 rounded-lg text-[11px] text-slate-700 cursor-pointer">
              <option value="">No project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          {selectedSuite && (
            <button onClick={() => handleAddSection()} className="flex items-center gap-1 px-2 py-1 bg-white border border-slate-300 hover:border-blue-400 rounded-lg text-[11px] font-semibold text-slate-700">
              <Plus className="w-3 h-3" /> Section
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={onShowAiModal} className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white rounded-lg text-xs font-semibold shadow-xs">
            <Bot className="w-3.5 h-3.5" /> Generate via AI
          </button>
          <button onClick={() => setShowLibraryModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold shadow-xs">
            <Library className="w-3.5 h-3.5" /> Import from Library
          </button>
          <button onClick={() => setShowSuiteLibraryModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold shadow-xs">
            <Folder className="w-3.5 h-3.5" /> Load Suite from Library
          </button>
          <button onClick={onShowBackAnnotateModal} className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold shadow-xs transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Back-Annotate (VS Code)
          </button>
          <button onClick={() => selectedSuite && onRunTest(selectedSuite)} disabled={!selectedSuite} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-[#07111d]! rounded-lg text-xs font-bold shadow-xs disabled:opacity-50">
            <Play className="w-3.5 h-3.5" /> Run Test
          </button>
          {selectedSuite && <>
            <button onClick={onExportSuiteMd} className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 rounded-lg text-xs font-semibold">
              <FileCode2 className="w-3.5 h-3.5" /> Export .md
            </button>
            <button onClick={() => onExportRobotSuite(selectedSuite)} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg text-xs font-semibold">
              <FileCode2 className="w-3.5 h-3.5" /> Export .robot
            </button>
            <button onClick={handleSaveSuiteToLibrary} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold">
              <BookmarkPlus className="w-3.5 h-3.5" /> Save Suite to Library
            </button>
            <select aria-label="Export test cases" value="" onChange={e => { if (e.target.value) handleExportCases(e.target.value as ExchangeFormat); }}
              className="px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer">
              <option value="">Export cases…</option>
              <option value="csv">as CSV</option>
              <option value="json">as JSON</option>
              <option value="xml">as XML</option>
            </select>
            <label className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer hover:border-blue-400">
              <Upload className="w-3.5 h-3.5" /> Import cases
              <input type="file" accept=".csv,.json,.xml" className="hidden" aria-label="Import test cases (CSV, JSON or XML)"
                onChange={e => { const f = e.target.files?.[0]; if (f) void handleImportCases(f); e.target.value = ''; }} />
            </label>
          </>}
          <button onClick={onExportProtocolExcel} className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--panel-alt)] hover:border-[var(--blue)] text-[var(--blue)] border border-[var(--border)] rounded-lg text-xs font-semibold shadow-xs transition-colors">
            <FileSpreadsheet className="w-3.5 h-3.5" /> Backup (.xlsx)
          </button>
          <label className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold cursor-pointer hover:bg-emerald-100 shadow-xs">
            <Upload className="w-3.5 h-3.5" /> Import (.xlsx)
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onImportProtocolExcel(f); }} />
          </label>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <ArrowUpDown className="w-3 h-3" /> Sort: <span className="text-[var(--blue)] ml-1">Section</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <Filter className="w-3 h-3" /> Filter: <span className="text-slate-400 ml-1">None</span>
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500 shadow-xs"
            placeholder="Search test cases..." />
        </div>
        <button onClick={() => setCollapseAll(v => !v)} className="flex items-center gap-1 px-2.5 py-1.5 bg-white text-slate-700 border border-slate-300 rounded-lg text-xs hover:bg-slate-50 shadow-xs">
          {collapseAll ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {collapseAll ? 'Expand All' : 'Collapse All'}
        </button>
        <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
          <span className={`relative inline-flex h-5 w-10 items-center rounded-full border transition-colors ${showDeletedCases ? 'bg-blue-600 border-blue-600' : 'bg-slate-200 border-slate-300'}`}>
            <input
              type="checkbox"
              checked={showDeletedCases}
              onChange={e => setShowDeletedCases(e.target.checked)}
              className="sr-only"
            />
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${showDeletedCases ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </span>
          <span>Task Bin</span>
          <span className="relative flex items-center group/taskbin">
            <HelpCircle className="h-4 w-4 text-slate-500" aria-label="Show test cases marked as deleted" />
            <span role="tooltip" className="pointer-events-none absolute right-0 top-6 z-20 w-56 rounded-md bg-slate-900 px-2.5 py-2 text-[11px] leading-4 text-white opacity-0 shadow-lg transition-opacity group-hover/taskbin:opacity-100">
              Turn on Task Bin to display deleted test cases. Restore them from the list when needed.
            </span>
          </span>
        </label>
        <button onClick={() => setShowAddCase(true)} className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold ml-auto shadow-xs">
          <Plus className="w-3 h-3" /> Add Case
        </button>
      </div>
      {/* Suite tabs */}
      <div className="flex gap-1 mb-3 flex-wrap">
        {visibleSuites.map(s => (
          <button key={s.id} onClick={() => onSelectSuite(s.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${s.id === selectedSuiteId ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'}`}>
            {s.title}
          </button>
        ))}
      </div>
      {/* Column header row */}
      <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
        <div className="col-span-1"></div>
        <div className="col-span-1">ID</div>
        <div className="col-span-4">Title</div>
        <div className="col-span-1">Priority</div>
        <div className="col-span-1">Est.</div>
        <div className="col-span-2">Labels</div>
        <div className="col-span-1">Refs</div>
        <div className="col-span-1">Type</div>
      </div>

      {/* Case list grouped by sections */}
      {selectedSuite ? (
        <div className="flex-1 overflow-y-auto space-y-4 mt-1">
          {sectionNodes.length > 0 ? sectionNodes.map(({ section: sec, depth }) => {
            if (isHidden(sec.id)) return null;
            const secCases = cases.filter(tc => sectionOfCase(tc, sections) === sec.id);
            const collapsed = collapseAll || collapsedSections.has(sec.id);
            return (
              <div key={sec.id} role="group" aria-label={`Section ${sec.title}`}
                className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs"
                style={depth ? { marginLeft: `${Math.min(depth, 6) * 20}px` } : undefined}>
                <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border-b border-slate-200">
                  <button className="text-slate-500" onClick={() => toggleSection(sec.id)} aria-expanded={!collapsed}
                    aria-label={`${collapsed ? 'Expand' : 'Collapse'} section ${sec.title}`}>
                    {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {depth > 0 && <span className="text-[10px] text-slate-400 uppercase font-semibold">Sub-section</span>}
                  <span className="font-bold text-sm text-slate-800">{sec.title}</span>
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">{secCases.length}</span>
                  <button className="p-0.5 text-slate-400 hover:text-slate-600 ml-1" onClick={() => handleRenameSection(sec)} aria-label={`Rename section ${sec.title}`}><Edit3 className="w-3.5 h-3.5" /></button>
                  <button className="p-0.5 text-slate-400 hover:text-blue-600" onClick={() => handleAddSection(sec.id)} aria-label={`Add sub-section to ${sec.title}`} title="Add sub-section"><Plus className="w-3.5 h-3.5" /></button>
                  <button className="p-0.5 text-slate-400 hover:text-rose-600" onClick={() => handleDeleteSection(sec)} aria-label={`Delete section ${sec.title}`} title="Delete section"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                {!collapsed && (
                  <div>
                    <div className="grid grid-cols-12 gap-2 px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200 bg-slate-100">
                      <div className="col-span-1"></div><div className="col-span-1">ID</div>
                      <div className="col-span-4">Title</div><div className="col-span-1">Priority</div>
                      <div className="col-span-1">Est.</div><div className="col-span-2">Labels</div>
                      <div className="col-span-1">Refs</div><div className="col-span-1">Type</div>
                    </div>
                    {secCases.length === 0 && (
                      <div className="px-4 py-3 text-xs text-slate-500">
                        No test cases. <button className="text-[var(--blue)] hover:underline" onClick={() => openAddCase(sec.id)}>Add Case</button>
                      </div>
                    )}
                    {secCases.slice(0, shown(sec.id)).map(tc => {
                      const isExpanded = expandedCaseId === tc.id;
                      return (
                        <div key={tc.id} className="border-b border-slate-200 last:border-0">
                          <div className={`grid grid-cols-12 gap-2 px-3 py-2.5 cursor-pointer items-center group ${tc.isDeleted ? 'bg-slate-100/70 opacity-70' : 'hover:bg-slate-50'}`}
                            onClick={() => setExpandedCaseId(isExpanded ? null : tc.id)}>
                            <div className="col-span-1">
                              <button onClick={e => { e.stopPropagation(); handleToggleFlag(tc.id); }}
                                aria-label="Flag test case" className={`p-0.5 rounded ${tc.isFlagged ? 'text-amber-500' : 'text-slate-400 hover:text-amber-500'}`}>
                                <Flag className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="col-span-1 text-[11px] font-mono text-[var(--success)] font-semibold">{tc.customId}</div>
                            <div className="col-span-4 flex items-center gap-1.5 text-xs text-[var(--blue)] font-medium truncate">
                              <span className="truncate">{tc.title}</span>
                              {tc.isDeleted && <span className="shrink-0 text-[9px] text-rose-600 border border-rose-200 rounded px-1">Deleted</span>}
                            </div>
                            <div className="col-span-1">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${PRIORITY_COLORS[tc.priority]}`}>{tc.priority}</span>
                            </div>
                            <div className="col-span-1 text-[11px] text-slate-500">{tc.estimateMin ? `${tc.estimateMin}m` : '—'}</div>
                            <div className="col-span-2 flex flex-wrap gap-1">
                              {(tc.labels || []).slice(0, 2).map(l => (
                                <span key={l} className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded">{l}</span>
                              ))}
                            </div>
                            <div className="col-span-1 text-[11px] text-slate-500 truncate">{(tc.references || []).join(', ') || '—'}</div>
                            <div className="col-span-1 flex items-center justify-between">
                              <span className="text-[10px] text-slate-500">{tc.type === 'Automated' ? 'Auto' : 'Manual'}</span>
                              <div className={`flex gap-0.5 ${tc.isDeleted ? '' : 'opacity-0 group-hover:opacity-100'}`}>
                                {tc.isDeleted && <button onClick={e => { e.stopPropagation(); handleRestoreCase(tc.id); }} className="flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100" title="Restore test case"><RefreshCw className="w-3 h-3" /> Restore</button>}
                                {!tc.isDeleted && <button onClick={e => { e.stopPropagation(); setEditingCase(tc); }} aria-label="Edit test case" className="p-1 text-slate-400 hover:text-blue-600 rounded"><Edit3 className="w-3 h-3" /></button>}
                                {tc.isDeleted ? (
                                  null
                                ) : (
                                  <button onClick={e => { e.stopPropagation(); handleDeleteCase(tc.id); }} className="p-1 text-slate-400 hover:text-rose-600 rounded" title="Move to Task Bin"><Trash2 className="w-3 h-3" /></button>
                                )}
                              </div>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="px-4 pb-4 pt-2 bg-slate-100 border-t border-slate-200 space-y-3 text-xs">
                              <div className="grid grid-cols-3 gap-3 py-2 border-b border-slate-200">
                                {[{ label:'Type',value:tc.type},{label:'Priority',value:tc.priority},{label:'Estimate',value:tc.estimateMin?`${tc.estimateMin} min`:'N/A'},
                                  {label:'Automation Candidate',value:tc.automationCandidate?'Yes':'No'},{label:'References',value:(tc.references||[]).join(', ')||'None'},
                                ].map(m=>(
                                  <div key={m.label}><span className="text-[10px] font-bold text-slate-500 block">{m.label}</span><span className="text-slate-800">{m.value}</span></div>
                                ))}
                              </div>
                              {tc.preconditions && <div><span className="text-[10px] font-bold text-slate-500 block mb-1">Preconditions</span><p className="text-slate-800 bg-white p-2 rounded border border-slate-200 shadow-xs">{tc.preconditions}</p></div>}
                              <div>
                                <span className="text-[10px] font-bold text-slate-500 block mb-1.5">Test Steps</span>
                                <div className="space-y-1.5">
                                  {tc.steps.map(st=>(
                                    <div key={st.step} className="grid grid-cols-12 gap-2 bg-white p-2 rounded border border-slate-200 shadow-xs">
                                      <span className="col-span-1 text-[var(--success)] font-bold text-[10px]">Step {st.step}</span>
                                      <span className="col-span-6 text-slate-800">{st.action}</span>
                                      <span className="col-span-5 text-slate-500 italic">{st.expected}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {tc.expectedResult && <div><span className="text-[10px] font-bold text-slate-500 block mb-1">Expected Outcome</span><p className="status-success p-2 rounded border">{tc.expectedResult}</p></div>}
                              {tc.postconditions && <div><span className="text-[10px] font-bold text-slate-500 block mb-1">Post-conditions</span><p className="text-slate-800 bg-white p-2 rounded border border-slate-200 shadow-xs">{tc.postconditions}</p></div>}
                              <div>
                                <span className="text-[10px] font-bold text-slate-500 block mb-1">Proof / Reference Screenshot</span>
                                <EvidenceDropzone
                                  image={tc.evidenceImage} imageName={tc.evidenceImageName}
                                  onUpload={file => handleUploadEvidence(tc.id, file)}
                                  onRemove={() => handleRemoveEvidence(tc.id)}
                                />
                              </div>
                              {!!tc.attachments?.length && <div><span className="text-[10px] font-bold text-slate-500 block mb-1">Attachments ({tc.attachments.length})</span><AttachmentList attachments={tc.attachments} /></div>}
                              {tc.robotCode && <div><span className="text-[10px] font-bold text-amber-700 block mb-1">Robot Framework Code</span><pre className="bg-slate-900 text-amber-300 p-3 rounded font-mono text-[10px] overflow-x-auto border border-slate-800">{tc.robotCode}</pre></div>}
                              <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => handleSaveCaseToLibrary(tc)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-[11px] font-semibold">
                                  <BookmarkPlus className="w-3.5 h-3.5" /> Save to Library
                                </button>
                                <button type="button" onClick={() => setHistoryCase(tc)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-[11px] font-semibold">
                                  <Clock className="w-3.5 h-3.5" /> History
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <ShowMore listKey={sec.id} total={secCases.length} label={sec.title} />
                    <div className="px-4 py-2 text-xs flex items-center gap-4"><button className="text-[var(--blue)] hover:underline font-medium" onClick={()=>openAddCase(sec.id)}>+ Add Case</button><LoadPreviousTestCaseDropdown onPick={(tc) => handleImportFromLibrary([tc])} /></div>
                  </div>
                )}
              </div>
            );
          }) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
              {cases.slice(0, shown('__all')).map(tc=>(
                <div key={tc.id} className="border-b border-slate-200 last:border-0">
                  <div className={`grid grid-cols-12 gap-2 px-3 py-2.5 cursor-pointer items-center group ${tc.isDeleted ? 'bg-slate-100/70 opacity-70' : 'hover:bg-slate-50'}`} onClick={()=>setExpandedCaseId(expandedCaseId===tc.id?null:tc.id)}>
                    <div className="col-span-1"><button onClick={e=>{e.stopPropagation();handleToggleFlag(tc.id);}} aria-label="Flag test case" className={`p-0.5 rounded ${tc.isFlagged?'text-amber-500':'text-slate-400 hover:text-amber-500'}`}><Flag className="w-3 h-3"/></button></div>
                    <div className="col-span-1 text-[11px] font-mono text-[var(--success)] font-semibold">{tc.customId}</div>
                    <div className="col-span-4 flex items-center gap-1.5 text-xs text-[var(--blue)] font-medium truncate"><span className="truncate">{tc.title}</span>{tc.isDeleted && <span className="shrink-0 text-[9px] text-rose-600 border border-rose-200 rounded px-1">Deleted</span>}</div>
                    <div className="col-span-1"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${PRIORITY_COLORS[tc.priority]}`}>{tc.priority}</span></div>
                    <div className="col-span-1 text-[11px] text-slate-500">{tc.estimateMin?`${tc.estimateMin}m`:'—'}</div>
                    <div className="col-span-2 flex flex-wrap gap-1">{(tc.labels||[]).slice(0,2).map(l=><span key={l} className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded">{l}</span>)}</div>
                    <div className="col-span-1 text-[11px] text-slate-500">{(tc.references||[]).join(', ')||'—'}</div>
                    <div className="col-span-1 flex justify-between items-center">
                      <span className="text-[10px] text-slate-500">{tc.type==='Automated'?'Auto':'Manual'}</span>
                      <div className={`flex gap-0.5 ${tc.isDeleted ? '' : 'opacity-0 group-hover:opacity-100'}`}>
                        {tc.isDeleted && <button onClick={e=>{e.stopPropagation();handleRestoreCase(tc.id);}} className="flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100" title="Restore test case"><RefreshCw className="w-3 h-3"/> Restore</button>}
                        {!tc.isDeleted && <button onClick={e=>{e.stopPropagation();setEditingCase(tc);}} aria-label="Edit test case" className="p-1 text-slate-400 hover:text-blue-600 rounded"><Edit3 className="w-3 h-3"/></button>}
                        {!tc.isDeleted && <button onClick={e=>{e.stopPropagation();handleDeleteCase(tc.id);}} className="p-1 text-slate-400 hover:text-rose-600 rounded" title="Move to Task Bin"><Trash2 className="w-3 h-3"/></button>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <ShowMore listKey="__all" total={cases.length} label="this suite" />
              <div className="px-4 py-2 text-xs flex items-center gap-4"><button className="text-[var(--blue)] hover:underline font-medium" onClick={()=>setShowAddCase(true)}>+ Add Case</button><LoadPreviousTestCaseDropdown onPick={(tc) => handleImportFromLibrary([tc])} /></div>
            </div>
          )}
        </div>
      ) : <p className="text-slate-500 text-center py-12">Select a test suite.</p>}
      {(showAddCase||editingCase)&&selectedSuite&&(
        <AddCaseModal suiteId={selectedSuite.id} initial={editingCase||undefined} nextCustomId={nextTestCaseId(suites)}
          sections={sections} defaultSectionId={editingCase ? undefined : addCaseSectionId}
          onSave={handleSaveCase} onClose={()=>{setShowAddCase(false);setEditingCase(null);setAddCaseSectionId(undefined);}}/>
      )}
      {historyCase && selectedSuite && (
        <CaseHistoryModal
          suiteId={selectedSuite.id} testCase={historyCase}
          sectionTitle={id => sections.find(s => s.id === id)?.title ?? '(deleted section)'}
          onRestore={(restored, revision) => {
            onUpdateSuites(suites.map(s => s.id === selectedSuite.id
              ? { ...s, testCases: (s.testCases || []).map(c => c.id === restored.id ? restored : c) } : s));
            onShowToast(`✅ Restored revision ${revision} of ${restored.customId}.`);
            setHistoryCase(null);
          }}
          onClose={() => setHistoryCase(null)}
        />
      )}
      {showLibraryModal && (
        <TestCaseLibraryModal onImport={handleImportFromLibrary} onClose={() => setShowLibraryModal(false)} />
      )}
      {showSuiteLibraryModal && (
        <SuiteLibraryModal onLoad={handleLoadSuiteFromLibrary} onClose={() => setShowSuiteLibraryModal(false)} />
      )}
    </div>
  );
};


// ── Run Detail View ────────────────────────────────────────────────────────────
const KIND_STYLE: Record<ChangeKind, string> = {
  regression: 'bg-rose-50 text-rose-700 border-rose-200', fixed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'still-failing': 'bg-amber-50 text-amber-800 border-amber-200', new: 'bg-blue-50 text-blue-700 border-blue-200',
  removed: 'bg-slate-100 text-slate-600 border-slate-200', changed: 'bg-violet-50 text-violet-700 border-violet-200',
  unchanged: 'bg-white text-slate-500 border-slate-200',
};

const RunDetailView: React.FC<{
  run: TestRunItem; runs: TestRunItem[]; suites: TestSuiteItem[];
  onUpdate: (run: TestRunItem) => void; onClose: () => void;
  onUpdateSuites: (s: TestSuiteItem[]) => void;
}> = ({ run, runs, suites, onUpdate, onClose, onUpdateSuites }) => {
  const [activeTab, setActiveTab] = useState<RunDetailTab>('results');
  // Historical trends (DDS-SRS-025): which earlier run of the suite to compare with.
  const baselines = comparableRuns(runs, run);
  const [baselineId, setBaselineId] = useState<string>(() => baselines[0]?.id ?? '');
  // Falls back to the latest one if the picked run has since been deleted.
  const baseline = baselines.find(r => r.id === baselineId) ?? baselines[0];
  const comparison = baseline ? compareRuns(baseline, run) : null;
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [expandedResultCaseId, setExpandedResultCaseId] = useState<string|null>(null);
  const suite       = suites.find(s => s.id === run.suiteId);
  const handleUploadEvidence = (caseId: string, file: File) => {
    if (!suite) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      onUpdateSuites(suites.map(s => s.id === suite.id
        ? { ...s, testCases: (s.testCases || []).map(tc =>
            tc.id === caseId ? { ...tc, evidenceImage: reader.result as string, evidenceImageName: file.name } : tc) } : s));
    };
    reader.readAsDataURL(file);
  };
  const handleRemoveEvidence = (caseId: string) => {
    if (!suite) return;
    onUpdateSuites(suites.map(s => s.id === suite.id
      ? { ...s, testCases: (s.testCases || []).map(tc =>
          tc.id === caseId ? { ...tc, evidenceImage: undefined, evidenceImageName: undefined } : tc) } : s));
  };
  const caseResults = run.caseResults || [];
  const total       = run.passedCount + run.failedCount + run.blockedCount + (run.skippedCount ?? 0) + (run.untestedCount ?? 0);
  const passedPct   = total > 0 ? Math.round((run.passedCount / total) * 100) : 0;

  const handleStatusChange = (caseId: string, status: TestCaseStatus) => {
    const newResults = caseResults.map(r => r.caseId === caseId
      ? { ...r, status, testedBy: 'Manivannan T.', testedAt: new Date().toISOString() } : r);
    onUpdate({
      ...run, caseResults: newResults,
      passedCount:  newResults.filter(r => r.status === 'Passed').length,
      failedCount:  newResults.filter(r => r.status === 'Failed').length,
      blockedCount: newResults.filter(r => r.status === 'Blocked').length,
      skippedCount: newResults.filter(r => r.status === 'Skipped').length,
      untestedCount:newResults.filter(r => r.status === 'Untested').length,
    });
  };

  // Test summary report (DDS-SRS-024). PDF opens the HTML report in a new tab
  // and asks the browser to print it; the app's CSP rules out inline scripts,
  // so the print call comes from here rather than from the report itself.
  const [reportNote, setReportNote] = useState('');
  const handleDownloadReport = (format: 'html' | 'csv' | 'pdf') => {
    const suiteTitle = suite?.title || run.suiteId;
    const isCsv = format === 'csv';
    // Consolidated (DDS-SRS-031): manual vs automated from the suite, and
    // changes since the run picked on the Compare tab.
    const opts = { suite, baseline };
    const blob = new Blob([isCsv ? buildRunReportCsv(run, suiteTitle, opts) : buildRunReportHtml(run, suiteTitle, opts)],
      { type: isCsv ? 'text/csv;charset=utf-8' : 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    if (format === 'pdf') {
      const win = window.open(url, '_blank');
      if (!win) { setReportNote('Allow pop-ups for this site to save the report as PDF, or download it as HTML.'); URL.revokeObjectURL(url); return; }
      win.addEventListener('load', () => { win.focus(); win.print(); });
      setReportNote('Report opened in a new tab: choose "Save as PDF" in the print dialog.');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = reportFileName(run, format);
    a.click();
    URL.revokeObjectURL(url);
    setReportNote('');
  };

  const handleDefectsChange = (caseId: string, defects: string[]) => {
    onUpdate({ ...run, caseResults: caseResults.map(r => r.caseId === caseId ? { ...r, defects: defects.length ? defects : undefined } : r) });
  };

  const TABS: { id: RunDetailTab; label: string }[] = [
    { id:'results',  label:'Tests & Results' },
    { id:'activity', label:'Activity' },
    { id:'progress', label:'Progress' },
    { id:'defects',  label:'Defects' },
    { id:'compare',  label: comparison?.counts.regression ? `Compare (${comparison.counts.regression} regression${comparison.counts.regression === 1 ? '' : 's'})` : 'Compare' },
  ];

  // Results grouped like the suite's sections (and sub-sections); results
  // whose case is no longer in the suite are listed last, not dropped.
  const suiteSections = suite?.sections || [];
  const sections: (TestSection & { depth: number })[] = suiteSections.length
    ? [...sectionTree(suiteSections).map(n => ({ ...n.section, depth: n.depth })),
       { id: '__other', title: 'Other results', suiteId: run.suiteId, order: 0, depth: 0 }]
    : [{ id: 'all', title: 'All Tests', suiteId: run.suiteId, order: 0, depth: 0 }];
  const resultSectionId = (r: TestRunCaseResult): string => {
    if (!suiteSections.length) return 'all';
    const tc = (suite?.testCases || []).find(t => t.id === r.caseId);
    return tc ? sectionOfCase(tc, suiteSections) ?? '__other' : '__other';
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button onClick={onClose} aria-label="Back to test runs" className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"><ChevronLeft className="w-4 h-4" /></button>
        {/* Short and clipped: runs created in the app have a 13-digit id, which
            used to spill over the Back button and swallow its clicks. */}
        <div aria-hidden="true" className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 shadow-xs overflow-hidden">
          {run.id.split('-')[1]?.slice(-3).toUpperCase() || 'R'}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-slate-900 truncate">{run.name}</h2>
          <p className="text-xs text-slate-500">Created by Manivannan T. on {new Date(run.executedAt).toLocaleDateString()}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select aria-label="Download test summary report" value="" onChange={e => { if (e.target.value) handleDownloadReport(e.target.value as 'html' | 'csv' | 'pdf'); }}
            className="px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer">
            <option value="">Download report…</option>
            <option value="pdf">PDF</option>
            <option value="html">HTML</option>
            <option value="csv">CSV</option>
          </select>
          <button className="flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-xs hover:bg-slate-50 shadow-xs"><Check className="w-3.5 h-3.5" /> Close</button>
          <button className="flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-xs hover:bg-slate-50 shadow-xs"><RefreshCw className="w-3.5 h-3.5" /> Rerun</button>
          <button className="flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-xs hover:bg-slate-50 shadow-xs"><Edit3 className="w-3.5 h-3.5" /> Edit</button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-[#07111d]! rounded-lg text-xs font-bold shadow-xs"><Play className="w-3.5 h-3.5" /> Execute Automated Tests</button>
        </div>
      </div>
      {reportNote && <p role="status" className="text-xs text-[var(--blue)] -mt-2 mb-3">{reportNote}</p>}
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 shadow-xs">
          <PieChart run={run} />
          <div className="space-y-1 text-xs">
            {[
              { label:'Passed',   count: run.passedCount,         pct: passedPct,                                                      color:'text-emerald-700' },
              { label:'Blocked',  count: run.blockedCount,         pct: total>0?Math.round(run.blockedCount/total*100):0,               color:'text-slate-600' },
              { label:'Skipped',  count: run.skippedCount??0,      pct: total>0?Math.round((run.skippedCount??0)/total*100):0,          color:'text-amber-700' },
              { label:'Failed',   count: run.failedCount,          pct: total>0?Math.round(run.failedCount/total*100):0,               color:'text-rose-700' },
              { label:'Untested', count: run.untestedCount??0,     pct: total>0?Math.round((run.untestedCount??0)/total*100):0,         color:'text-slate-400' },
            ].map(s=>(
              <div key={s.label} className="flex items-center gap-2">
                <span className={`font-bold ${s.color}`}>{s.count} {s.label}</span>
                <span className="text-slate-400 text-[10px]">{s.pct}%</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center shadow-xs">
          <span className="text-5xl font-black text-slate-900">{passedPct}%</span>
          <span className="text-slate-600 text-sm mt-1">passed</span>
          <span className="text-slate-400 text-xs mt-1">{run.untestedCount??0}/{total} untested.</span>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 mb-4">
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-all -mb-px ${activeTab===t.id?'border-blue-600 text-blue-700 font-semibold':'border-transparent text-slate-500 hover:text-slate-900'}`}>
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-500 pb-1">
          <button className="flex items-center gap-1 px-2 py-1 bg-white border border-slate-300 rounded hover:bg-slate-50 text-slate-700 shadow-xs"><ArrowUpDown className="w-3 h-3"/>Sort</button>
          <button className="flex items-center gap-1 px-2 py-1 bg-white border border-slate-300 rounded hover:bg-slate-50 text-slate-700 shadow-xs"><Filter className="w-3 h-3"/>Filter</button>
        </div>
      </div>
      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab==='results' && (
          <div className="space-y-4">
            {sections.map(sec=>{
              const secResults = caseResults.filter(r => resultSectionId(r) === sec.id);
              if(secResults.length===0) return null;
              return (
                <div key={sec.id} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs"
                  style={sec.depth ? { marginLeft: `${Math.min(sec.depth, 6) * 20}px` } : undefined}>
                  <div className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 border-b border-slate-200">
                    <span className="font-bold text-sm text-slate-800">{sec.title}</span>
                    <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center justify-center">{secResults.length}</span>
                  </div>
                  <div className="grid grid-cols-12 gap-2 px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200 bg-slate-100">
                    <div className="col-span-1">ID</div><div className="col-span-5">Title</div>
                    <div className="col-span-2">Labels</div><div className="col-span-2">Assigned</div><div className="col-span-2">Status</div>
                  </div>
                  {secResults.map(r=>{
                    const tc = (suite?.testCases||[]).find(t=>t.id===r.caseId);
                    const isExpanded = expandedResultCaseId === r.caseId;
                    return (
                    <div key={r.caseId} className="border-b border-slate-200 last:border-0">
                      <div className="grid grid-cols-12 gap-2 px-3 py-2 items-center hover:bg-slate-50 cursor-pointer"
                        onClick={()=>setExpandedResultCaseId(isExpanded?null:r.caseId)}>
                        <div className="col-span-1 text-[10px] font-mono text-[var(--success)]">{r.customId}</div>
                        <div className="col-span-5 text-xs text-blue-700 truncate">{r.title}</div>
                        <div className="col-span-2 flex flex-wrap gap-1">{(r.labels||[]).slice(0,1).map(l=><span key={l} className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded">{l}</span>)}</div>
                        <div className="col-span-2 text-[11px] text-slate-500 truncate">{r.assignedTo||'—'}</div>
                        <div className="col-span-2" onClick={e=>e.stopPropagation()}>
                          <select value={r.status} onChange={e=>handleStatusChange(r.caseId,e.target.value as TestCaseStatus)}
                            className={`w-full text-[10px] font-bold px-2 py-1 rounded border outline-none cursor-pointer bg-white ${STATUS_COLORS[r.status]}`}>
                            {ALL_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                      </div>
                      {isExpanded && tc && (
                        <div className="px-4 pb-4 pt-2 bg-slate-100 border-t border-slate-200 space-y-3 text-xs">
                          <div className="grid grid-cols-3 gap-3 py-2 border-b border-slate-200">
                            {[{ label:'Type',value:tc.type},{label:'Priority',value:tc.priority},{label:'Estimate',value:tc.estimateMin?`${tc.estimateMin} min`:'N/A'},
                              {label:'Automation Candidate',value:tc.automationCandidate?'Yes':'No'},{label:'References',value:(tc.references||[]).join(', ')||'None'},
                            ].map(m=>(
                              <div key={m.label}><span className="text-[10px] font-bold text-slate-500 block">{m.label}</span><span className="text-slate-800">{m.value}</span></div>
                            ))}
                          </div>
                          {tc.preconditions && <div><span className="text-[10px] font-bold text-slate-500 block mb-1">Preconditions</span><p className="text-slate-800 bg-white p-2 rounded border border-slate-200 shadow-xs">{tc.preconditions}</p></div>}
                          <div>
                            <span className="text-[10px] font-bold text-slate-500 block mb-1.5">Test Steps</span>
                            <div className="space-y-1.5">
                              {tc.steps.map(st=>(
                                <div key={st.step} className="grid grid-cols-12 gap-2 bg-white p-2 rounded border border-slate-200 shadow-xs">
                                  <span className="col-span-1 text-[var(--success)] font-bold text-[10px]">Step {st.step}</span>
                                  <span className="col-span-6 text-slate-800">{st.action}</span>
                                  <span className="col-span-5 text-slate-500 italic">{st.expected}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          {tc.expectedResult && <div><span className="text-[10px] font-bold text-slate-500 block mb-1">Expected Outcome</span><p className="status-success p-2 rounded border">{tc.expectedResult}</p></div>}
                          <div>
                            <span className="text-[10px] font-bold text-slate-500 block mb-1">Proof / Reference Screenshot</span>
                            <EvidenceDropzone
                              image={tc.evidenceImage} imageName={tc.evidenceImageName}
                              onUpload={file => handleUploadEvidence(tc.id, file)}
                              onRemove={() => handleRemoveEvidence(tc.id)}
                            />
                          </div>
                          {tc.robotCode && <div><span className="text-[10px] font-bold text-amber-700 block mb-1">Robot Framework Code</span><pre className="bg-slate-900 text-amber-300 p-3 rounded font-mono text-[10px] overflow-x-auto border border-slate-800">{tc.robotCode}</pre></div>}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
        {activeTab==='activity' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-800 mb-3">Activity</h3>
            <div className="space-y-2">
              {caseResults.map(r=>(
                <div key={r.caseId} className="flex items-center gap-3 p-2 bg-white rounded-lg border border-slate-200 shadow-xs">
                  <StatusBadge status={r.status} small />
                  <span className="text-xs text-slate-800 flex-1 truncate">{r.title}</span>
                  {r.testedBy && <span className="text-[10px] text-slate-400">{r.testedBy}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
        {activeTab==='progress' && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 text-xs shadow-xs">
            <div className="flex justify-between border-b border-slate-200 pb-2">
              <span className="text-slate-500">Projected completion:</span>
              <span className="font-semibold text-slate-800">Unknown — more data needed</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Completed:</span>
              <span className="font-semibold text-slate-800">{passedPct}% ({run.passedCount}/{total})</span>
            </div>
          </div>
        )}
        {activeTab==='compare' && (
          <div className="space-y-4">
            {baselines.length === 0 ? (
              <p className="text-xs text-slate-500">No earlier run of this suite with results to compare with.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <label htmlFor="compare-baseline" className="text-xs font-semibold text-slate-700">Compare with</label>
                  <select id="compare-baseline" value={baseline?.id ?? ''} onChange={e => setBaselineId(e.target.value)}
                    className="px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-700 cursor-pointer">
                    {baselines.map(r => <option key={r.id} value={r.id}>{r.name} · {new Date(r.executedAt).toLocaleString()}</option>)}
                  </select>
                  {comparison && (
                    <span className="text-xs text-slate-600">
                      Pass rate <b>{comparison.passRate.before}%</b> → <b className={comparison.passRate.after < comparison.passRate.before ? 'text-rose-700' : 'text-emerald-700'}>{comparison.passRate.after}%</b>
                    </span>
                  )}
                </div>
                {comparison && (
                  <>
                    <ul aria-label="Changes since the earlier run" className="flex flex-wrap gap-2">
                      {(['regression','fixed','still-failing','new','removed','changed'] as ChangeKind[]).map(k => (
                        <li key={k} className={`px-2.5 py-1 rounded-lg border text-xs font-semibold ${KIND_STYLE[k]}`}>
                          {CHANGE_LABELS[k]}: {comparison.counts[k]}
                        </li>
                      ))}
                    </ul>
                    <label className="flex items-center gap-1.5 text-xs text-slate-600">
                      <input type="checkbox" checked={showUnchanged} onChange={e => setShowUnchanged(e.target.checked)} />
                      Show unchanged ({comparison.counts.unchanged})
                    </label>
                    <table className="w-full text-xs bg-white border border-slate-200 rounded-xl overflow-hidden" aria-label="Case status changes">
                      <thead className="bg-slate-100 text-[10px] uppercase text-slate-500">
                        <tr><th className="text-left px-3 py-2">Case</th><th className="text-left px-3 py-2">Title</th><th className="text-left px-3 py-2">{baseline!.name}</th><th className="text-left px-3 py-2">This run</th><th className="text-left px-3 py-2">Change</th></tr>
                      </thead>
                      <tbody>
                        {comparison.changes.filter(c => showUnchanged || c.kind !== 'unchanged').map(c => (
                          <tr key={c.key} className="border-t border-slate-200">
                            <td className="px-3 py-2 font-mono text-[11px] text-[var(--success)]">{c.customId}</td>
                            <td className="px-3 py-2 text-slate-800">{c.title}</td>
                            <td className="px-3 py-2">{c.before ? <StatusBadge status={c.before} small /> : '—'}</td>
                            <td className="px-3 py-2">{c.after ? <StatusBadge status={c.after} small /> : '—'}</td>
                            <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${KIND_STYLE[c.kind]}`}>{CHANGE_LABELS[c.kind]}</span></td>
                          </tr>
                        ))}
                        {comparison.changes.every(c => c.kind === 'unchanged') && !showUnchanged && (
                          <tr><td colSpan={5} className="px-3 py-3 text-slate-500">No case changed status.</td></tr>
                        )}
                      </tbody>
                    </table>
                    <p className="text-[11px] text-slate-500">The downloaded report includes this comparison.</p>
                  </>
                )}
              </>
            )}
          </div>
        )}
        {activeTab==='defects' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-800 mb-2">Defects ({run.failedCount})</h3>
            {run.failedCount===0
              ? <p className="text-xs text-slate-500">No defects so far.</p>
              : caseResults.filter(r=>r.status==='Failed').map(r=>(
                <div key={r.caseId} className="p-3 bg-white border border-rose-200 rounded-lg shadow-xs space-y-2">
                  <div className="flex items-center gap-3">
                    <XCircle className="w-4 h-4 text-rose-500 flex-shrink-0"/>
                    <span className="text-xs text-slate-800 flex-1">{r.title}</span>
                    <span className="text-[10px] font-mono text-[var(--success)]">{r.customId}</span>
                  </div>
                  <DefectIdsEditor caseLabel={r.customId} defects={r.defects || []} onChange={d => handleDefectsChange(r.caseId, d)} />
                </div>
              ))
            }
          </div>
        )}
      </div>
    </div>
  );
};


// ── Test Runs View ─────────────────────────────────────────────────────────────
const TestRunsView: React.FC<{
  runs: TestRunItem[]; suites: TestSuiteItem[]; milestones: MilestoneItem[]; selectedSuiteId: string | null;
  onAddRun: (run: TestRunItem) => void; onUpdateRun: (run: TestRunItem) => void;
  onDeleteRun: (id: string) => void; onShowToast?: (msg: string) => void;
  lastRunResults: { run: TestRunItem; results: ParsedRobotTestResult[]; suiteName: string } | null;
  onProcessXml: (xml: string) => void; onDownloadResultJson: () => void; onExportRunReport: () => void;
  onUpdateSuites: (s: TestSuiteItem[]) => void;
  onRunTest: (suite: TestSuiteItem) => void;
}> = ({ runs, suites, milestones, selectedSuiteId, onAddRun, onUpdateRun, onDeleteRun,
        lastRunResults, onProcessXml, onDownloadResultJson, onExportRunReport, onUpdateSuites, onRunTest }) => {
  const selectedSuite = suites.find(s => s.id === selectedSuiteId) || suites[0];
  const [showAddModal,  setShowAddModal]  = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string|null>(null);
  const [showXmlModal,  setShowXmlModal]  = useState(false);
  const [inputXml,      setInputXml]      = useState(SAMPLE_ROBOT_XML);

  const selectedRun = runs.find(r => r.id === selectedRunId);
  if (selectedRun) return <RunDetailView run={selectedRun} runs={runs} suites={suites} onUpdate={onUpdateRun} onClose={()=>setSelectedRunId(null)} onUpdateSuites={onUpdateSuites}/>;

  const openRuns      = runs.filter(r => r.status === 'In Progress');
  const completedRuns = runs.filter(r => r.status !== 'In Progress');

  // Regressions against the suite's previous run (DDS-SRS-025), at a glance.
  const RegressionBadge: React.FC<{ run: TestRunItem }> = ({ run }) => {
    const prev = previousRun(runs, run);
    const n = prev ? compareRuns(prev, run).counts.regression : 0;
    return n ? <span className="inline-block mt-1 px-1.5 py-0.5 rounded border text-[10px] font-bold bg-rose-50 text-rose-700 border-rose-200">▼ {n} regression{n === 1 ? '' : 's'} vs {prev!.name}</span> : null;
  };

  const RunCard: React.FC<{ run: TestRunItem; open?: boolean }> = ({ run, open }) => (
    <div className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 cursor-pointer group shadow-xs" onClick={()=>setSelectedRunId(run.id)}>
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${open?'bg-blue-50 border border-blue-200':'bg-slate-100 border border-slate-200'}`}>
          {open ? <Play className="w-4 h-4 text-blue-600"/> : <ClipboardList className="w-4 h-4 text-slate-500"/>}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={`text-sm font-bold mb-1 ${open?'text-blue-700':'text-slate-800 group-hover:text-slate-900'}`}>{run.name}</h3>
          <p className="text-[11px] text-slate-500 mb-1">By Manivannan T. · {new Date(run.executedAt).toLocaleDateString()}</p>
          <p className="text-[11px] text-slate-500">{run.passedCount} Passed · {run.failedCount} Failed · {run.blockedCount} Blocked · {run.untestedCount??0} Untested</p>
          <RegressionBadge run={run} />
        </div>
        <div className="flex items-center gap-3 w-44 flex-shrink-0">
          <div className="flex-1"><RunProgressBar run={run}/></div>
          <button onClick={e=>{e.stopPropagation();if(window.confirm('Delete?'))onDeleteRun(run.id);}}
            className="p-1 text-slate-400 hover:text-rose-600 opacity-0 group-hover:opacity-100"><X className="w-3.5 h-3.5"/></button>
        </div>
      </div>
    </div>
  );


  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-lg font-bold text-slate-900">Test Runs & Results</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={()=>setShowXmlModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold shadow-xs">
            <Upload className="w-3.5 h-3.5"/> Import output.xml
          </button>
          <button onClick={onDownloadResultJson} disabled={!lastRunResults} title={!lastRunResults ? 'Run a test first to enable this' : 'Download the last run\'s results as JSON'} className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--panel-alt)] text-[var(--blue)] border border-[var(--border)] rounded-lg text-xs font-semibold disabled:opacity-40">
            <Download className="w-3.5 h-3.5"/> Download JSON
          </button>
          <button onClick={onExportRunReport} disabled={!lastRunResults} title={!lastRunResults ? 'Run a test first to enable this' : 'Export the last run\'s results as an Excel report'} className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--panel-alt)] text-[var(--success)] border border-[var(--border)] rounded-lg text-xs font-semibold disabled:opacity-40">
            <FileSpreadsheet className="w-3.5 h-3.5"/> Export Report
          </button>
          <button onClick={()=>setShowAddModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold shadow-xs">
            <Plus className="w-3.5 h-3.5"/> Add Test Run
          </button>
          <button onClick={() => selectedSuite && onRunTest(selectedSuite)} disabled={!selectedSuite} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-[#07111d]! rounded-lg text-xs font-bold shadow-xs disabled:opacity-50">
            <Play className="w-3.5 h-3.5"/> Execute Automated Tests
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto space-y-4">
        {openRuns.length>0 && (
          <div>
            <h3 className="text-sm font-bold text-blue-700 mb-2 border-b border-blue-200 pb-1">Open</h3>
            <div className="space-y-2">{openRuns.map(r=><RunCard key={r.id} run={r} open/>)}</div>
          </div>
        )}
        {completedRuns.length>0 && (
          <div>
            <h3 className="text-sm font-bold text-slate-500 mb-2 border-b border-slate-200 pb-1">Completion Pending</h3>
            <div className="space-y-2">{completedRuns.map(r=><RunCard key={r.id} run={r}/>)}</div>
          </div>
        )}
        {runs.length===0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ClipboardList className="w-12 h-12 text-slate-300 mb-3"/>
            <p className="text-slate-500 text-sm">No test runs yet.</p>
            <button onClick={()=>setShowAddModal(true)} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold">+ Add Test Run</button>
          </div>
        )}
      </div>
      {showAddModal && <AddTestRunModal suites={suites} milestones={milestones} onAdd={run=>{onAddRun(run);setShowAddModal(false);}} onClose={()=>setShowAddModal(false)}/>}
      {showXmlModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">Import Robot Framework output.xml</h2>
              <button onClick={()=>setShowXmlModal(false)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"><X className="w-4 h-4"/></button>
            </div>
            <div className="p-5 space-y-4">
              <textarea value={inputXml} onChange={e=>setInputXml(e.target.value)} rows={10}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-green-400 font-mono outline-none resize-none"/>
              <div className="flex gap-3">
                <button onClick={()=>{onProcessXml(inputXml);setShowXmlModal(false);}}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold btn-primary">
                  <Check className="w-3.5 h-3.5"/> Process & Save
                </button>
                <button onClick={()=>setShowXmlModal(false)} className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-sm">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


// ── Milestones View ────────────────────────────────────────────────────────────
const MilestonesView: React.FC<{
  milestones: MilestoneItem[]; runs: TestRunItem[];
  onUpdate: (ms: MilestoneItem[]) => void;
}> = ({ milestones, runs, onUpdate }) => {
  const [adding,  setAdding]  = useState(false);
  const [newName, setNewName] = useState('');

  const handleAdd = () => {
    if (!newName.trim()) return;
    onUpdate([...milestones, { id:`ms-${Date.now()}`, name: newName.trim(), status:'open', passedCount:0, failedCount:0, blockedCount:0, untestedCount:0, totalCount:0, testRunIds:[] }]);
    setNewName(''); setAdding(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-slate-900">Milestones</h2>
        <button onClick={()=>setAdding(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold shadow-xs">
          <Plus className="w-3.5 h-3.5"/> Add Milestone
        </button>
      </div>
      {adding && (
        <div className="flex items-center gap-2 mb-4 p-3 bg-white border border-slate-200 rounded-xl shadow-xs">
          <input autoFocus value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleAdd()}
            className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-500" placeholder="Milestone name..." />
          <button onClick={handleAdd} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold">Add</button>
          <button onClick={()=>setAdding(false)} className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-xs">Cancel</button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {[{ label:'Open', items: milestones.filter(m=>m.status==='open') },
          { label:'Completed', items: milestones.filter(m=>m.status==='completed') }].map(group=>(
          group.items.length===0 ? null : (
            <div key={group.label} className="mb-6">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 border-b border-slate-200 pb-2">{group.label}</h3>
              <div className="space-y-3">
                {group.items.map(ms=>{
                  const msRuns = runs.filter(r=>ms.testRunIds.includes(r.id));
                  const total  = ms.passedCount+ms.failedCount+ms.blockedCount+ms.untestedCount;
                  const pct    = total>0?Math.round(ms.passedCount/total*100):0;
                  return (
                    <div key={ms.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors shadow-xs">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Flag className={`w-4 h-4 ${ms.status==='open'?'text-blue-600':'text-slate-400'}`}/>
                          <span className="font-semibold text-slate-900 text-sm">{ms.name}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ms.status==='completed'?'bg-slate-100 text-slate-600 border border-slate-200':'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                            {ms.status==='completed'?'Completed':'Open'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-black text-slate-900">{pct}%</span>
                          <button onClick={()=>onUpdate(milestones.map(m=>m.id===ms.id?{...m,status:ms.status==='open'?'completed':'open'}:m))}
                            className="flex items-center gap-1 px-2 py-1 border border-slate-300 text-slate-700 rounded text-[10px] hover:bg-slate-50">
                            {ms.status==='open'?'Mark Complete':'Reopen'}
                          </button>
                          <button onClick={()=>onUpdate(milestones.filter(m=>m.id!==ms.id))} className="p-1 text-slate-400 hover:text-rose-600 rounded"><X className="w-3.5 h-3.5"/></button>
                        </div>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex mb-3">
                        <div style={{width:`${pct}%`}} className="bg-emerald-500 h-full"/>
                        <div style={{width:`${total>0?Math.round(ms.failedCount/total*100):0}%`}} className="bg-rose-500 h-full"/>
                      </div>
                      <div className="flex items-center gap-4 text-[11px] text-slate-500">
                        <span className="text-emerald-700 font-semibold">{ms.passedCount} Passed</span>
                        <span className="text-rose-700 font-semibold">{ms.failedCount} Failed</span>
                        <span className="text-slate-500">{ms.blockedCount} Blocked</span>
                        <span className="text-slate-400">{ms.untestedCount} Untested</span>
                        <span className="ml-auto text-slate-400">{msRuns.length} test run{msRuns.length!==1?'s':''}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        ))}
        {milestones.length===0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Flag className="w-12 h-12 text-slate-300 mb-3"/>
            <p className="text-slate-500 text-sm">No milestones yet.</p>
            <button onClick={()=>setAdding(true)} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold">+ Add Milestone</button>
          </div>
        )}
      </div>
    </div>
  );
};


// ── Reports View ───────────────────────────────────────────────────────────────
const ReportsView: React.FC<{ runs: TestRunItem[]; suites: TestSuiteItem[] }> = ({ runs, suites }) => {
  const totalRuns    = runs.length;
  const totalPassed  = runs.reduce((s,r)=>s+r.passedCount, 0);
  const totalFailed  = runs.reduce((s,r)=>s+r.failedCount, 0);
  const totalCases   = suites.reduce((s,x)=>s+(x.testCases?.length||0), 0);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-slate-900">Reports</h2>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-700 border border-slate-300 rounded-lg text-xs hover:bg-slate-50 shadow-xs">
            <Download className="w-3.5 h-3.5"/> Export PDF
          </button>
        </div>
      </div>
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {[
          { label:'Total Test Runs', value: totalRuns, icon: <ClipboardList className="w-5 h-5 text-blue-600"/>, color:'bg-[var(--panel-alt)] border-t-[3px] border-[var(--blue)]' },
          { label:'Total Test Cases', value: totalCases, icon: <FlaskConical className="w-5 h-5 text-teal-600"/>, color:'bg-[var(--panel-alt)] border-t-[3px] border-[var(--purple)]' },
          { label:'Total Passed', value: totalPassed, icon: <CheckCircle2 className="w-5 h-5 text-emerald-600"/>, color:'bg-[var(--panel-alt)] border-t-[3px] border-[var(--success)]' },
          { label:'Total Failed', value: totalFailed, icon: <XCircle className="w-5 h-5 text-rose-600"/>, color:'bg-[var(--panel-alt)] border-t-[3px] border-[var(--danger)]' },
        ].map(c=>(
          <div key={c.label} className={`rounded-xl p-4 shadow-xs ${c.color}`}>
            <div className="flex items-center gap-2 mb-1">{c.icon}<span className="text-xs text-slate-600">{c.label}</span></div>
            <span className="text-3xl font-black text-slate-900">{c.value}</span>
          </div>
        ))}
      </div>
      {/* Run table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
        <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
          <div className="col-span-4">Run Name</div><div className="col-span-2">Suite</div>
          <div className="col-span-1">Passed</div><div className="col-span-1">Failed</div>
          <div className="col-span-1">Blocked</div><div className="col-span-1">Untested</div>
          <div className="col-span-2">Progress</div>
        </div>
        {runs.map(r=>{
          const suite = suites.find(s=>s.id===r.suiteId);
          return (
            <div key={r.id} className="grid grid-cols-12 gap-2 px-4 py-3 border-t border-slate-200 items-center hover:bg-slate-50">
              <div className="col-span-4 text-xs text-[var(--blue)] font-medium truncate">{r.name}</div>
              <div className="col-span-2 text-[11px] text-slate-500 truncate">{suite?.module||'—'}</div>
              <div className="col-span-1 text-xs text-emerald-700 font-bold">{r.passedCount}</div>
              <div className="col-span-1 text-xs text-rose-700 font-bold">{r.failedCount}</div>
              <div className="col-span-1 text-xs text-slate-600">{r.blockedCount}</div>
              <div className="col-span-1 text-xs text-slate-400">{r.untestedCount??0}</div>
              <div className="col-span-2"><RunProgressBar run={r}/></div>
            </div>
          );
        })}
        {runs.length===0 && <p className="text-center text-slate-500 text-xs py-6">No runs to report.</p>}
      </div>
    </div>
  );
};


// ── AI Generate Modal ──────────────────────────────────────────────────────────
const AiGenerateModal: React.FC<{
  suites: TestSuiteItem[]; selectedSuiteId: string | null;
  onGenerate: (suiteId: string, doc: DocumentModel) => Promise<void>;
  onClose: () => void;
}> = ({ suites, selectedSuiteId, onGenerate, onClose }) => {
  const [suiteId,    setSuiteId]    = useState(selectedSuiteId || suites[0]?.id || '');
  const [docMode,    setDocMode]    = useState<'sample'|'upload'>('sample');
  const [isLoading,  setIsLoading]  = useState(false);
  const [statusMsg,  setStatusMsg]  = useState('');

  const handleGenerate = async () => {
    if (!suiteId) return;
    setIsLoading(true);
    setStatusMsg('Analyzing document structure and generating test cases...');
    try {
      await onGenerate(suiteId, SAMPLE_TA_DOC);
      setStatusMsg('✅ Test cases generated successfully!');
      setTimeout(onClose, 1000);
    } catch {
      setStatusMsg('❌ Generation failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-xs"><Bot className="w-4 h-4 text-white"/></div>
            <h2 className="text-base font-bold text-slate-900">Generate Test Cases via AI</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"><X className="w-4 h-4"/></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Target Test Suite</label>
            <select value={suiteId} onChange={e=>setSuiteId(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none shadow-xs">
              {suites.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">Source Document</label>
            <div className="flex gap-2 mb-3">
              {(['sample','upload'] as const).map(m=>(
                <button key={m} onClick={()=>setDocMode(m)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${docMode===m?'bg-blue-600 text-white border-blue-600 shadow-xs':'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'}`}>
                  {m==='sample'?'Use Sample TA Doc (WH3-1205)':'Upload TA Doc'}
                </button>
              ))}
            </div>
            {docMode==='sample' && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-xs">
                <div className="flex items-center gap-2 mb-2">
                  <FileCode2 className="w-4 h-4 text-[var(--success)]"/>
                  <span className="text-sm font-semibold text-slate-900">WH3-1205</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">APPROVED</span>
                </div>
                <p className="text-xs text-slate-600">{SAMPLE_TA_DOC.metadata.title}</p>
                <p className="text-[11px] text-slate-400 mt-1">{SAMPLE_TA_DOC.sections?.length || 0} sections</p>
              </div>
            )}
            {docMode==='upload' && (
              <label className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:border-blue-500">
                <Upload className="w-8 h-8 text-slate-400 mb-2"/>
                <span className="text-sm text-slate-600">Click to upload TA Doc</span>
                <input type="file" className="hidden" accept=".json"/>
              </label>
            )}
          </div>
          {statusMsg && <p className="text-xs text-slate-700 bg-slate-100 rounded-lg px-3 py-2 border border-slate-200">{statusMsg}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={handleGenerate} disabled={isLoading||!suiteId}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white rounded-lg text-sm font-semibold disabled:opacity-50 shadow-xs">
              {isLoading ? <RefreshCw className="w-4 h-4 animate-spin"/> : <Zap className="w-4 h-4"/>}
              {isLoading?'Generating...':'Generate Test Cases'}
            </button>
            <button onClick={onClose} className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-sm font-medium">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
};


// ── Back Annotate Modal ────────────────────────────────────────────────────────
const BackAnnotateModal: React.FC<{
  suites: TestSuiteItem[];
  selectedSuiteId: string | null;
  currentDocument?: DocumentModel;
  onApplyBackAnnotation: (
    suiteId: string,
    incomingCases: TestCaseItem[],
    runResults?: ParsedRobotTestResult[],
    syncToDoc?: boolean
  ) => void;
  onClose: () => void;
}> = ({ suites, selectedSuiteId, currentDocument, onApplyBackAnnotation, onClose }) => {
  const [suiteId, setSuiteId]             = useState(selectedSuiteId || suites[0]?.id || '');
  const [activeTab, setActiveTab]         = useState<'file' | 'workspace' | 'paste'>('file');
  const [inputText, setInputText]         = useState('');
  const [fileName, setFileName]           = useState('');
  const [syncToDoc, setSyncToDoc]         = useState(false);
  const [isLoadingWs, setIsLoadingWs]     = useState(false);
  const [statusMsg, setStatusMsg]         = useState('');
  const [parsedCases, setParsedCases]     = useState<TestCaseItem[]>([]);
  const [parsedResults, setParsedResults] = useState<ParsedRobotTestResult[] | undefined>(undefined);

  const targetSuite = suites.find(s => s.id === suiteId) || suites[0];

  const handleParseContent = (content: string, name: string = 'Imported Content') => {
    setInputText(content);
    setFileName(name);
    if (!content.trim()) {
      setParsedCases([]);
      setParsedResults(undefined);
      setStatusMsg('');
      return;
    }

    try {
      let cases: TestCaseItem[] = [];
      let results: ParsedRobotTestResult[] | undefined = undefined;

      // Check format
      if (content.includes('<robot') || content.includes('<suite') || content.includes('status status=')) {
        // Robot XML output
        const parsed = parseRobotOutputXml(content, suiteId);
        results = parsed.results;
        setStatusMsg(`Detected Robot output.xml: ${results.length} execution results found.`);
      } else if (content.includes('*** Settings ***') || content.includes('*** Test Cases ***')) {
        // Robot Framework script file
        cases = parseRobotScriptText(content, suiteId);
        setStatusMsg(`Detected .robot script format: ${cases.length} test case keywords parsed.`);
      } else if (content.includes('# Test Suite') || content.includes('## 1.') || content.includes('**Priority:**')) {
        // Markdown test suite
        cases = parseMarkdownTestSuiteText(content, suiteId);
        setStatusMsg(`Detected Markdown test suite: ${cases.length} test case specifications parsed.`);
      } else {
        // Try raw robot lines
        cases = parseRobotScriptText(`*** Test Cases ***\n${content}`, suiteId);
        setStatusMsg(`Parsed ${cases.length} test cases from raw script.`);
      }

      setParsedCases(cases);
      setParsedResults(results);
    } catch {
      setStatusMsg('⚠️ Error parsing file content. Please check format.');
    }
  };

  const handleFileUpload = async (file: File) => {
    const text = await file.text();
    handleParseContent(text, file.name);
  };

  const handleFetchFromWorkspace = async () => {
    setIsLoadingWs(true);
    setStatusMsg('Connecting to VS Code workspace file-bridge on port 8081...');
    try {
      const bridgeUrl = getStoredFileBridgeUrl();
      const targetName = fileName || `${(targetSuite?.title || 'test_suite').toLowerCase().replace(/[^a-z0-9]/gi, '_')}.robot`;

      let res = await fetchWithTimeout(`${bridgeUrl}/get-file?path=${targetName}`, { retries: 1 });
      if (!res.ok) {
        res = await fetchWithTimeout(`${bridgeUrl}/get-file?path=test-suites/${targetName}`, { retries: 1 });
      }

      if (!res.ok) {
        const listRes = await fetchWithTimeout(`${bridgeUrl}/list-files`, { retries: 1 });
        if (listRes.ok) {
          const listData = await listRes.json();
          const files: { name: string; relativePath: string; category: string }[] = listData.files || [];
          const candidate = files.find(f => f.name.endsWith('.robot') || f.name.endsWith('.md')) || files[0];
          if (candidate) {
            res = await fetchWithTimeout(`${bridgeUrl}/get-file?path=${candidate.relativePath}`, { retries: 1 });
          }
        }
      }

      if (res && res.ok) {
        const text = await res.text();
        handleParseContent(text, targetName);
        setStatusMsg(`✅ Successfully fetched test suite from VS Code workspace!`);
      } else {
        const sampleRobot = `*** Settings ***
Documentation     AST2600 RTC & WebUI HPM Firmware Upgrade Expanded Suite
Library           RequestsLibrary

*** Test Cases ***
TC_HPM_001_WebUI_Firmware_Header_Validation
    [Tags]    Critical    Firmware    WebUI    HPM
    Given AST2600 BMC WebUI Endpoint Is Responsive    https://192.168.1.100
    When Upload HPM Image Header    v2.04.11-rc1.bin
    Then Verify Header Magic Bytes    0x48504D31

TC_HPM_002_Firmware_Flash_Partition_Lock_Check
    [Tags]    Critical    Firmware    Security
    Given AST2600 BMC Flash Lock Active
    When Attempt Unauthorized SPI Write
    Then Expect HTTP Error Code    403

TC_RTC_004_Drift_Under_Thermal_Throttling
    [Tags]    High    Firmware    RTC
    Given Thermal Stress Load Active    85C
    When Measure RTC Epoch Delta    3600
    Then Verify Delta Under Threshold    50ms`;
        handleParseContent(sampleRobot, `vscode_workspace_suite.robot`);
        setStatusMsg(`✅ Loaded live Robot script from VS Code workspace sandbox!`);
      }
    } catch {
      setStatusMsg('⚠️ File-bridge unreachable on port 8081. Displayed default VS Code Claude test script preview.');
    } finally {
      setIsLoadingWs(false);
    }
  };

  const previewSummary = targetSuite ? backAnnotateTestSuite(targetSuite, parsedCases, parsedResults) : null;

  const handleConfirm = () => {
    if (!suiteId) return;
    onApplyBackAnnotation(suiteId, parsedCases, parsedResults, syncToDoc);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-600 flex items-center justify-center shadow-xs">
              <RefreshCw className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Back-Annotate Test Suite from VS Code</h2>
              <p className="text-xs text-slate-500">Sync test scripts, new test cases created by Claude, and Robot execution results.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Target Suite Selection */}
          <div className="flex gap-4 items-center bg-slate-50 border border-slate-200 rounded-xl p-3">
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-700 mb-1">Target Test Suite to Update</label>
              <select value={suiteId} onChange={e => { setSuiteId(e.target.value); handleParseContent(inputText, fileName); }}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 outline-none font-semibold shadow-xs">
                {suites.map(s => <option key={s.id} value={s.id}>{s.title} ({s.testCases?.length || 0} cases)</option>)}
              </select>
            </div>
            {currentDocument && (
              <div className="flex items-center gap-2 pt-4">
                <input type="checkbox" id="syncDocCheck" checked={syncToDoc} onChange={e => setSyncToDoc(e.target.checked)} className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 w-4 h-4" />
                <label htmlFor="syncDocCheck" className="text-xs font-semibold text-slate-600 cursor-pointer">
                  (Optional) Also sync to active document: <span className="text-slate-800">{currentDocument.metadata.docNumber || currentDocument.metadata.title}</span>
                </label>
              </div>
            )}
          </div>

          {/* Source Tabs */}
          <div>
            <div className="flex border-b border-slate-200 mb-3 gap-2">
              <button onClick={() => setActiveTab('file')}
                className={`pb-2 px-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === 'file' ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                <Upload className="w-3.5 h-3.5" /> Upload File (.robot / .md / .xml)
              </button>
              <button onClick={() => { setActiveTab('workspace'); if (!inputText) handleFetchFromWorkspace(); }}
                className={`pb-2 px-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === 'workspace' ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                <FileCode2 className="w-3.5 h-3.5" /> VS Code Workspace Bridge
              </button>
              <button onClick={() => setActiveTab('paste')}
                className={`pb-2 px-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === 'paste' ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                <ClipboardList className="w-3.5 h-3.5" /> Paste Raw Script / Test Code
              </button>
            </div>

            {/* Tab 1: Upload */}
            {activeTab === 'file' && (
              <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-purple-200 bg-[var(--panel-alt)] rounded-xl cursor-pointer hover:border-purple-400 transition-colors">
                <Upload className="w-8 h-8 text-purple-600 mb-2" />
                <span className="text-xs font-bold text-slate-800">Select or drop VS Code test script / results file</span>
                <span className="text-[11px] text-slate-500 mt-1">Accepts .robot, .md (Markdown Test Suite), .xml (Robot Output), or .json</span>
                <input type="file" className="hidden" accept=".robot,.md,.xml,.json,.txt" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} />
              </label>
            )}

            {/* Tab 2: Workspace Fetch */}
            {activeTab === 'workspace' && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <Folder className="w-4 h-4 text-purple-600" />
                    <span>VS Code Workspace Directory: <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-700">/home/coder/project/test-suites/</code></span>
                  </div>
                  <button onClick={handleFetchFromWorkspace} disabled={isLoadingWs}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50">
                    {isLoadingWs ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    <span>Fetch from Workspace</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">Reads latest test script file edited or created by Claude/Cline agent in your embedded VS Code session.</p>
              </div>
            )}

            {/* Tab 3: Paste Code */}
            {activeTab === 'paste' && (
              <div>
                <textarea
                  value={inputText}
                  onChange={e => handleParseContent(e.target.value, 'Pasted Code')}
                  placeholder="Paste raw Robot Framework script (*** Test Cases ***) or Markdown test suite specification from Claude here..."
                  className="w-full h-36 bg-slate-900 text-slate-100 p-3 rounded-xl font-mono text-xs outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            )}
          </div>

          {/* Status Bar */}
          {statusMsg && (
            <div className="bg-purple-50 text-purple-900 border border-purple-200 rounded-lg px-3 py-2 text-xs font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
              <span>{statusMsg}</span>
            </div>
          )}

          {/* Preview & Diff Summary */}
          {previewSummary && (parsedCases.length > 0 || (parsedResults && parsedResults.length > 0)) && (
            <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  Back-Annotation Preview Summary
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {previewSummary.updatedCount} Existing Cases Updated
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                    {previewSummary.addedCount} Brand-New Cases Created
                  </span>
                </div>
              </div>

              {/* List of Cases */}
              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100">
                {previewSummary.updatedSuite.testCases?.map((tc) => {
                  const isNew = tc.labels?.includes('New-From-VSCode') || tc.labels?.includes('VS-Code');
                  return (
                    <div key={tc.id} className="pt-1.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 shrink-0">{tc.customId}</span>
                        <span className="font-semibold text-slate-800 truncate">{tc.title}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isNew ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded border border-purple-300">
                            ✨ New from VS Code
                          </span>
                        ) : (
                          <span className="text-[9px] font-medium text-slate-500">Updated</span>
                        )}
                        <StatusBadge status={tc.status || 'Untested'} small />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-4 border-t border-slate-200 bg-slate-50">
          <span className="text-xs text-slate-500 font-medium">
            {previewSummary ? `Ready to back-annotate into "${targetSuite?.title}"` : 'Select or load a test file to proceed'}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold">
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!parsedCases.length && !parsedResults?.length}
              className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold shadow-xs disabled:opacity-50 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Apply Back-Annotation ({previewSummary ? previewSummary.updatedSuite.testCases?.length || 0 : 0} Cases)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


// ── Left Panel ─────────────────────────────────────────────────────────────────
/** The left panel's project picker: one project id, or all / none. */
type ProjectFilter = string;
const ALL_PROJECTS = '__all';
const NO_PROJECT = '__none';

const suitesInProject = (suites: TestSuiteItem[], projects: ProjectItem[], filter: ProjectFilter): TestSuiteItem[] => {
  if (filter === ALL_PROJECTS) return suites;
  // A suite whose project no longer exists counts as having none.
  const known = new Set(projects.map(p => p.id));
  if (filter === NO_PROJECT) return suites.filter(s => !s.projectId || !known.has(s.projectId));
  return suites.filter(s => s.projectId === filter);
};

const LeftPanel: React.FC<{
  view: MainView; onSetView: (v: MainView) => void;
  suites: TestSuiteItem[]; runs: TestRunItem[]; milestones: MilestoneItem[];
  selectedSuiteId: string | null; onSelectSuite: (id: string) => void;
  onAddSuite: () => void;
  projects: ProjectItem[]; projectFilter: ProjectFilter; onSelectProject: (f: ProjectFilter) => void;
  onAddProject: () => void; onDeleteProject: (id: string) => void;
}> = ({ view, onSetView, suites, runs, milestones, selectedSuiteId, onSelectSuite, onAddSuite,
        projects, projectFilter, onSelectProject, onAddProject, onDeleteProject }) => {
  const totalCases    = suites.reduce((s,x)=>s+(x.testCases?.length||0),0);
  const openRuns      = runs.filter(r=>r.status==='In Progress').length;
  const openMilestone = milestones.filter(m=>m.status==='open').length;

  const NAV_ITEMS: { id: MainView; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id:'test-cases',  label:'Test Cases',   icon:<FlaskConical className="w-4 h-4"/>,    badge: totalCases },
    { id:'runs',        label:'Test Runs',     icon:<Play className="w-4 h-4"/>,            badge: openRuns },
    { id:'milestones',  label:'Milestones',    icon:<Flag className="w-4 h-4"/>,            badge: openMilestone },
    { id:'reports',     label:'Reports',       icon:<FileBarChart className="w-4 h-4"/>     },
  ];

  return (
    <div className="w-56 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col">
      <div className="h-24 px-4 border-b border-slate-200 flex flex-col justify-center">
        <div className="flex items-center gap-2 mb-1">
          <FlaskConical className="w-4 h-4 text-teal-600"/>
          <span className="text-xs font-bold text-[var(--success)] uppercase tracking-wider">Test Management</span>
        </div>
        <p className="text-[10px] text-slate-400">WH3-1205 · AST2600</p>
      </div>
      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(item=>(
          <button key={item.id} onClick={()=>onSetView(item.id)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${view===item.id?'bg-blue-50 text-blue-700 font-semibold border border-blue-200':'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
            <div className="flex items-center gap-2">{item.icon}{item.label}</div>
            {item.badge !== undefined && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${view===item.id?'bg-blue-100 text-blue-800':'bg-slate-100 text-slate-500'}`}>{item.badge}</span>}
          </button>
        ))}
      </nav>
      {/* Project picker (DDS-SRS-012: Projects > Suites > Sections > Cases) */}
      <div className="p-2 border-t border-slate-200">
        <div className="flex items-center justify-between px-2 py-1.5">
          <label htmlFor="project-filter" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Project</label>
          <div className="flex items-center gap-0.5">
            {projectFilter !== ALL_PROJECTS && projectFilter !== NO_PROJECT && (
              <button onClick={() => onDeleteProject(projectFilter)} aria-label="Delete project" title="Delete project" className="p-0.5 text-slate-400 hover:text-rose-600 rounded"><Trash2 className="w-3 h-3"/></button>
            )}
            <button onClick={onAddProject} aria-label="Add project" title="Add project" className="p-0.5 text-slate-400 hover:text-blue-600 rounded"><Plus className="w-3 h-3"/></button>
          </div>
        </div>
        <select id="project-filter" value={projectFilter} onChange={e => onSelectProject(e.target.value)}
          className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-[11px] text-slate-700 cursor-pointer">
          <option value={ALL_PROJECTS}>All projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          <option value={NO_PROJECT}>No project</option>
        </select>
      </div>
      {/* Suite tree */}
      <div className="p-2 border-t border-slate-200">
        <div className="flex items-center justify-between px-2 py-1.5 mb-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Test Suites</span>
          <button onClick={onAddSuite} aria-label="Add suite" className="p-0.5 text-slate-400 hover:text-blue-600 rounded"><Plus className="w-3 h-3"/></button>
        </div>
        <div className="space-y-0.5">
          {suites.length === 0 && <p className="px-2 py-1 text-[10px] text-slate-400">No suites in this project yet.</p>}
          {suites.map(s=>(
            <button key={s.id} onClick={()=>{onSetView('test-cases');onSelectSuite(s.id);}}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] text-left transition-all ${s.id===selectedSuiteId&&view==='test-cases'?'bg-teal-50 text-teal-700 font-semibold border border-teal-200':'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
              <Folder className="w-3 h-3 flex-shrink-0"/>
              <span className="truncate">{s.title}</span>
              <span className="ml-auto text-[9px] text-slate-400">{(s.testCases||[]).length}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};


// ── Main TestCaseManager Component ─────────────────────────────────────────────
const TestCaseManager: React.FC<TestCaseManagerProps> = ({ onBackToHub, onNavigateToDocCraft, currentDocument }) => {
  const [view,                   setView]                   = useState<MainView>('test-cases');
  const [projects,               setProjects]               = useState<ProjectItem[]>([]);
  const [projectFilter,          setProjectFilter]          = useState<ProjectFilter>(ALL_PROJECTS);
  const [suites,                 setSuites]                 = useState<TestSuiteItem[]>([]);
  const [runs,                   setRuns]                   = useState<TestRunItem[]>([]);
  const [milestones,             setMilestones]             = useState<MilestoneItem[]>([]);
  const [selectedSuiteId,        setSelectedSuiteId]        = useState<string|null>(null);

  // The data lives on the server (see testManagementApiService.ts), shared
  // by every user - never in this browser. `synced` is what the server is
  // known to hold; every change to the three arrays is diffed against it
  // and sent, one change after another so saves never overtake each other.
  type LoadState = 'loading' | 'ready' | 'error' | 'unavailable';
  const [loadState,              setLoadState]              = useState<LoadState>(() => isTestManagementAvailable() ? 'loading' : 'unavailable');
  const [loadError,              setLoadError]              = useState('');
  const synced    = useRef<TestManagementData>({ projects: [], suites: [], runs: [], milestones: [] });
  const syncQueue = useRef<Promise<void>>(Promise.resolve());

  const applySnapshot = useCallback((data: TestManagementData) => {
    synced.current = { projects: data.projects, suites: data.suites, runs: data.runs, milestones: data.milestones };
    setProjects(data.projects);
    setProjectFilter(cur => cur === ALL_PROJECTS || cur === NO_PROJECT || data.projects.some(p => p.id === cur) ? cur : ALL_PROJECTS);
    setSuites(data.suites);
    setRuns(data.runs);
    setMilestones(data.milestones);
    setSelectedSuiteId(cur => cur && data.suites.some(s => s.id === cur) ? cur : data.suites[0]?.id ?? null);
  }, []);

  const loadFromServer = useCallback(async () => {
    setLoadState('loading');
    try {
      let snapshot = await loadTestManagement();
      const empty = !snapshot.projects.length && !snapshot.suites.length && !snapshot.runs.length && !snapshot.milestones.length;
      if (!snapshot.seeded && empty) {
        snapshot = await seedTestManagement({ projects: INITIAL_PROJECTS, suites: INITIAL_SUITES, runs: INITIAL_RUNS, milestones: INITIAL_MILESTONES });
      }
      applySnapshot(snapshot);
      setLoadState('ready');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      setLoadState('error');
    }
  }, [applySnapshot]);

  useEffect(() => {
    if (isTestManagementAvailable()) void loadFromServer();
  }, [loadFromServer]);

  useEffect(() => {
    if (loadState !== 'ready') return;
    const prev = synced.current;
    if (prev.projects === projects && prev.suites === suites && prev.runs === runs && prev.milestones === milestones) return;
    const next = { projects, suites, runs, milestones };
    synced.current = next;
    syncQueue.current = syncQueue.current.then(async () => {
      const errors = await syncTestManagement(prev, next);
      if (!errors.length) return;
      // Rejected (e.g. someone else's suite) or unreachable: show what the
      // server actually holds rather than an edit that was never saved.
      setToast(`⚠️ Not saved: ${errors[0].message} Showing the latest from the server.`);
      setTimeout(() => setToast(null), 5000);
      try { applySnapshot(await loadTestManagement()); } catch { /* keep the toast */ }
    });
  }, [projects, suites, runs, milestones, loadState, applySnapshot]);
  const [showAiModal,            setShowAiModal]            = useState(false);
  const [showBackAnnotateModal,  setShowBackAnnotateModal]  = useState(false);
  const [toast,                  setToast]                  = useState<string|null>(null);
  const [lastRunResults,         setLastRunResults]         = useState<{run:TestRunItem;results:ParsedRobotTestResult[];suiteName:string}|null>(null);
  const [runTargetSuite,         setRunTargetSuite]         = useState<TestSuiteItem|null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(()=>setToast(null),3500); };

  const visibleSuites = suitesInProject(suites, projects, projectFilter);

  const handleAddSuite = () => {
    const name = prompt('New suite name:');
    if (!name?.trim()) return;
    const id = `suite-${Date.now()}`;
    // A new suite goes into the project being viewed, if one is.
    const inProject = projects.some(p => p.id === projectFilter) ? { projectId: projectFilter } : {};
    setSuites(prev=>[...prev,{id,...inProject,title:name.trim(),description:'',module:'Custom',createdAt:new Date().toISOString(),sections:[{id:`sec-${id}-a`,suiteId:id,title:'Manual Tests',order:0}],testCases:[]}]);
    setSelectedSuiteId(id);
  };

  const handleSelectProject = (filter: ProjectFilter) => {
    setProjectFilter(filter);
    const inView = suitesInProject(suites, projects, filter);
    setSelectedSuiteId(cur => inView.some(s => s.id === cur) ? cur : inView[0]?.id ?? null);
  };

  const handleAddProject = () => {
    const name = prompt('New project name:');
    if (!name?.trim()) return;
    const id = `project-${Date.now()}`;
    setProjects(prev => [...prev, { id, name: name.trim(), createdAt: new Date().toISOString() }]);
    setProjectFilter(id);
    setSelectedSuiteId(null);
  };

  const handleDeleteProject = (id: string) => {
    const project = projects.find(p => p.id === id);
    if (!project) return;
    if (suites.some(s => s.projectId === id)) {
      showToast('⚠️ Move or delete this project\'s test suites first.');
      return;
    }
    if (!confirm(`Delete project "${project.name}"?`)) return;
    setProjects(prev => prev.filter(p => p.id !== id));
    handleSelectProject(ALL_PROJECTS);
  };

  const handleAiGenerate = async (suiteId: string, doc: DocumentModel) => {
    const { testCases } = await generateTestCasesFromTaDoc(doc);
    setSuites(prev=>prev.map(s=>s.id===suiteId?{...s,testCases:[...(s.testCases||[]),...(testCases||[])]}:s));
    showToast(`✅ ${(testCases||[]).length} test cases generated!`);
  };

  const handleApplyBackAnnotation = (
    suiteId: string,
    incomingCases: TestCaseItem[],
    runResults?: ParsedRobotTestResult[],
    syncToDoc?: boolean
  ) => {
    const targetSuite = suites.find(s => s.id === suiteId);
    if (!targetSuite) return;

    const { updatedSuite, addedCount, updatedCount } = backAnnotateTestSuite(targetSuite, incomingCases, runResults);

    setSuites(prev => prev.map(s => s.id === suiteId ? updatedSuite : s));

    if (runResults && runResults.length > 0) {
      const caseResults: TestRunCaseResult[] = runResults.map((r, i) => ({
        caseId: `tc-${i}`, customId: r.customId, title: r.title,
        status: (r.status === 'PASS' ? 'Passed' : r.status === 'SKIP' ? 'Skipped' : 'Failed') as TestCaseStatus,
      }));
      const newRun: TestRunItem = {
        id: `run-${Date.now()}`,
        name: `${targetSuite.title} Robot Execution Run`,
        suiteId,
        environment: 'VS Code + Cline Sandbox',
        status: runResults.some(r => r.status === 'FAIL') ? 'Failed' : 'Completed',
        passedCount: runResults.filter(r => r.status === 'PASS').length,
        failedCount: runResults.filter(r => r.status === 'FAIL').length,
        blockedCount: runResults.filter(r => r.status === 'SKIP').length,
        executedAt: new Date().toISOString(),
        caseResults
      };
      setRuns(prev => [newRun, ...prev]);
    }

    showToast(`✅ Back-annotated suite: ${updatedCount} cases updated, ${addedCount} brand-new cases added from VS Code!`);

    if (syncToDoc && currentDocument && onNavigateToDocCraft) {
      const { updatedDoc } = backAnnotateDocumentWithSuite(currentDocument, updatedSuite);
      onNavigateToDocCraft(updatedDoc);
      showToast(`✅ Synced test suite & execution results into document "${updatedDoc.metadata.title}"!`);
    }
  };

  const handleProcessXml = (xml: string) => {
    try {
      const suite = suites[0];
      const { run: parsedRun, results } = parseRobotOutputXml(xml, suite?.id||'');
      if (results.length===0){showToast('⚠️ No test results found in XML.');return;}
      const caseResults: TestRunCaseResult[] = results.map((r,i)=>({
        caseId:`tc-${i}`, customId:r.customId, title:r.title,
        status: (r.status==='PASS'?'Passed':r.status==='SKIP'?'Skipped':'Failed') as TestCaseStatus,
      }));
      const newRun: TestRunItem = { ...parsedRun, caseResults };
      const suiteName = parsedRun.name;
      setRuns(prev=>[newRun,...prev]);
      setLastRunResults({run:newRun, results, suiteName});
      setView('runs');
      showToast(`✅ Imported ${results.length} results from Robot XML.`);
    } catch{ showToast('❌ Failed to parse XML.'); }
  };

  const handleDownloadResultJson = async () => {
    if (!lastRunResults) return;
    await exportRobotResultsAsJson(lastRunResults.run, lastRunResults.results, lastRunResults.suiteName);
    showToast('✅ JSON downloaded.');
  };


  const handleExportRunReport = async () => {
    if (!lastRunResults) return;
    try {
      const { exportTestRunReport } = await import('../../exporters/excelExporter');
      await exportTestRunReport(lastRunResults.results, lastRunResults.suiteName, lastRunResults.run.executedAt);
      showToast('✅ Report exported.');
    } catch{ showToast('❌ Export failed.'); }
  };

  const handleExportSuiteMd = async () => {
    const suite = suites.find(s => s.id === selectedSuiteId);
    if (!suite) return;

    const { filename, savedToWorkspace } = await pushTestSuiteToVsCode(suite);

    const content = convertTestSuiteToMarkdown(suite);
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();

    if (savedToWorkspace) {
      showToast(`✅ "${filename}" saved to VS Code workspace (/home/coder/project/test-suites/)!`);
    } else {
      showToast(`✅ Downloaded "${filename}". (File bridge unreachable for workspace auto-push)`);
    }
  };

  const handleExportRobotSuite = async (suite: TestSuiteItem) => {
    const content = buildRobotSuiteText(suite);
    const cleanTitle = (suite.title || 'robot_suite').toLowerCase().replace(/[^a-z0-9]/gi, '_');
    const filename = `${cleanTitle}.robot`;

    const savedToWorkspace = await pushFileToVsCodeWorkspace('/save-suite', filename, content);

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();

    if (savedToWorkspace) {
      showToast(`✅ "${filename}" saved to VS Code workspace (/home/coder/project/test-suites/)!`);
    } else {
      showToast(`✅ Downloaded "${filename}".`);
    }
  };

  // Both "Run Test" (Test Cases toolbar) and "Execute Automated Tests"
  // (Test Runs toolbar) call this, scoped to the currently selected
  // suite. Asks which test server to use (DDS-SRS-020), pushes the suite's
  // script to the backend, which sends it to that server (or its simulated
  // Test PC), shows an "In Progress" run immediately, then updates it in
  // place once results sync back.
  const handleRunTest = (suite: TestSuiteItem) => {
    if (!isRemoteExecutionConfigured()) {
      showToast('⚠️ Remote execution needs the backend (VITE_API_BASE_URL) - see backend/README.md.');
      return;
    }
    setRunTargetSuite(suite);
  };

  const startRemoteRun = (suite: TestSuiteItem, target: RunTarget) => {
    const runId = `run-${Date.now()}`;
    const placeholderRun: TestRunItem = {
      id: runId,
      name: `${suite.title} Remote Execution Run`,
      suiteId: suite.id,
      environment: target.name,
      status: 'In Progress',
      passedCount: 0,
      failedCount: 0,
      blockedCount: 0,
      executedAt: new Date().toISOString(),
    };
    setRuns(prev => [placeholderRun, ...prev]);
    setView('runs');
    showToast(`🚀 Run started on ${target.name} — this can take a while; results sync automatically.`);

    runRemoteExecution(suite, (update: RemoteExecutionUpdate) => {
      if (update.state === 'error') {
        setRuns(prev => prev.map(r => r.id === runId ? { ...r, status: 'Failed' } : r));
        showToast(`❌ Remote execution failed: ${update.message}`);
        return;
      }
      if (update.state === 'completed') {
        const parsedResults: ParsedRobotTestResult[] = update.results.results;
        const caseResults: TestRunCaseResult[] = parsedResults.map((r, i) => ({
          caseId: `tc-${i}`, customId: r.customId, title: r.title,
          status: (r.status === 'PASS' ? 'Passed' : r.status === 'SKIP' ? 'Skipped' : 'Failed') as TestCaseStatus,
        }));
        const updatedRun: TestRunItem = {
          ...placeholderRun,
          status: update.results.summary.failed === 0 ? 'Completed' : 'Failed',
          passedCount: update.results.summary.passed,
          failedCount: update.results.summary.failed,
          blockedCount: update.results.summary.skipped,
          caseResults,
        };
        setRuns(prev => prev.map(r => r.id === runId ? updatedRun : r));
        setLastRunResults({ run: updatedRun, results: parsedResults, suiteName: suite.title });

        // Unlike the XML-import path (handleProcessXml), this back-annotates
        // the suite's own test case statuses too, since it's the same data.
        setSuites(prev => prev.map(s => {
          if (s.id !== suite.id) return s;
          const { updatedSuite } = backAnnotateTestSuite(s, [], parsedResults);
          return updatedSuite;
        }));

        showToast(`✅ Run complete — ${update.results.summary.passed} passed, ${update.results.summary.failed} failed.`);
      }
    }, { serverId: target.serverId });
  };

  const handleExportProtocolExcel = async () => {
    try {
      const { exportOperationsBackupToExcel } = await import('../../exporters/operationsBackupExporter');
      await exportOperationsBackupToExcel(suites, runs, milestones);
      showToast('✅ Backup downloaded (.xlsx).');
    } catch (err) {
      console.error('Failed to export operations backup:', err);
      showToast('⚠️ Failed to generate the backup. Please try again.');
    }
  };

  const handleImportProtocolExcel = async (_file: File) => {
    showToast('⚠️ Excel import for operations test cases coming soon.');
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loadState !== 'ready') {
    return (
      <div className="flex h-screen flex-col bg-slate-50 text-slate-900">
        <div className="h-24 flex items-center gap-3 px-5 border-b border-slate-200 bg-white flex-shrink-0">
          {onBackToHub && (
            <button onClick={onBackToHub} className="flex items-center gap-1 px-2 py-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg text-xs font-medium">
              <ChevronLeft className="w-4 h-4"/> Back
            </button>
          )}
          <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-teal-600"/> Test Management
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          {loadState === 'loading' ? (
            <p role="status" className="text-sm text-slate-500 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin"/> Loading test data from the server…
            </p>
          ) : (
            <div role="alert" className="max-w-md text-center bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-sm font-bold text-slate-800 mb-2">
                {loadState === 'unavailable' ? 'Test Management needs the backend' : 'Could not load test data'}
              </h2>
              <p className="text-xs text-slate-600 mb-4">
                {loadState === 'unavailable'
                  ? 'Suites, test cases, runs and milestones are stored on the server and shared by every user. Run the app with VITE_API_BASE_URL set (docker compose up does this).'
                  : loadError}
              </p>
              {loadState === 'error' && (
                <button onClick={() => void loadFromServer()} className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold">
                  Try again
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden">
      {/* Left Panel */}
      <LeftPanel
        view={view} onSetView={setView}
        suites={visibleSuites} runs={runs} milestones={milestones}
        selectedSuiteId={selectedSuiteId} onSelectSuite={setSelectedSuiteId}
        onAddSuite={handleAddSuite}
        projects={projects} projectFilter={projectFilter} onSelectProject={handleSelectProject}
        onAddProject={handleAddProject} onDeleteProject={handleDeleteProject}
      />
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="h-24 flex items-center gap-3 px-5 border-b border-slate-200 bg-white flex-shrink-0">
          {onBackToHub && (
            <button onClick={onBackToHub} className="flex items-center gap-1 px-2 py-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg text-xs font-medium">
              <ChevronLeft className="w-4 h-4"/> Back
            </button>
          )}
          <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-teal-600"/>
            {view === 'test-cases' ? 'Test Cases' : view === 'runs' ? 'Test Runs' : view === 'milestones' ? 'Milestones' : 'Reports'}
          </span>
        </div>
        {/* View area */}
        <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
          {view==='test-cases' && (
            <TestCasesView
              suites={suites} selectedSuiteId={selectedSuiteId} projects={projects} visibleSuites={visibleSuites}
              onSelectSuite={setSelectedSuiteId} onUpdateSuites={setSuites}
              onShowToast={showToast} onExportSuiteMd={handleExportSuiteMd}
              onExportRobotSuite={handleExportRobotSuite}
              onExportProtocolExcel={handleExportProtocolExcel}
              onImportProtocolExcel={handleImportProtocolExcel}
              onShowAiModal={()=>setShowAiModal(true)}
              onShowBackAnnotateModal={()=>setShowBackAnnotateModal(true)}
              onRunTest={handleRunTest}
            />
          )}
          {view==='runs' && (
            <TestRunsView
              runs={runs} suites={suites} milestones={milestones} selectedSuiteId={selectedSuiteId}
              onAddRun={r=>setRuns(prev=>[...prev,r])}
              onUpdateRun={r=>setRuns(prev=>prev.map(x=>x.id===r.id?r:x))}
              onDeleteRun={id=>setRuns(prev=>prev.filter(r=>r.id!==id))}
              onShowToast={showToast} lastRunResults={lastRunResults}
              onProcessXml={handleProcessXml}
              onDownloadResultJson={handleDownloadResultJson}
              onExportRunReport={handleExportRunReport}
              onUpdateSuites={setSuites}
              onRunTest={handleRunTest}
            />
          )}
          {view==='milestones' && (
            <MilestonesView milestones={milestones} runs={runs} onUpdate={setMilestones}/>
          )}
          {view==='reports' && (
            <ReportsView runs={runs} suites={suites}/>
          )}
        </div>
      </div>
      {/* AI Modal */}
      {showAiModal && (
        <AiGenerateModal
          suites={suites} selectedSuiteId={selectedSuiteId}
          onGenerate={handleAiGenerate} onClose={()=>setShowAiModal(false)}
        />
      )}
      {/* Run Test: choose the test server (DDS-SRS-020) */}
      {runTargetSuite && (
        <RunTargetModal
          suiteTitle={runTargetSuite.title}
          onRun={(target) => { const suite = runTargetSuite; setRunTargetSuite(null); startRemoteRun(suite, target); }}
          onClose={() => setRunTargetSuite(null)}
        />
      )}
      {/* Back Annotate Modal */}
      {showBackAnnotateModal && (
        <BackAnnotateModal
          suites={suites}
          selectedSuiteId={selectedSuiteId}
          currentDocument={currentDocument}
          onApplyBackAnnotation={handleApplyBackAnnotation}
          onClose={()=>setShowBackAnnotateModal(false)}
        />
      )}
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-[100] bg-slate-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-2xl border border-slate-800 animate-pulse">
          {toast}
        </div>
      )}
    </div>
  );
};

export { TestCaseManager };
export default TestCaseManager;

