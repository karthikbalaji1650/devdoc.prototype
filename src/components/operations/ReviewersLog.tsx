import React, { useState, useEffect } from 'react';
import { 
  ClipboardCheck, 
  FileSpreadsheet, 
  Plus, 
  ExternalLink, 
  Copy, 
  Search, 
  Check, 
  FileText,
  Edit3,
  Table as TableIcon,
  Globe,
  Settings
} from 'lucide-react';
import type { ReviewerLogItem } from '../../types/operations';
import type { DocumentModel } from '../../types/document';
import { 
  getStoredReviewersLog, 
  saveStoredReviewersLog, 
  ensureCurrentDocReviewEntry, 
  exportReviewersLogToExcel,
  getStoredGoogleSheetUrl,
  saveStoredGoogleSheetUrl,
  DEFAULT_GOOGLE_SHEET_URL
} from '../../services/reviewersLogService';

interface ReviewersLogProps {
  currentDocument?: DocumentModel;
  onOpenDocCraft?: () => void;
}

export const ReviewersLog: React.FC<ReviewersLogProps> = ({ currentDocument, onOpenDocCraft }) => {
  const [logs, setLogs] = useState<ReviewerLogItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSheetConfigModal, setShowSheetConfigModal] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [copiedSpreadsheet, setCopiedSpreadsheet] = useState(false);
  const [activeTab, setActiveTab] = useState<'matrix' | 'embed-sheet'>('matrix');

  // Google Sheet URL
  const [sheetUrl, setSheetUrl] = useState<string>(getStoredGoogleSheetUrl());
  const [tempSheetUrl, setTempSheetUrl] = useState<string>(sheetUrl);

  // Paste raw TSV from Google Sheets
  const [pastedData, setPastedData] = useState('');

  // New reviewer form
  const [newReviewerName, setNewReviewerName] = useState('');
  const [newReviewerRole, setNewReviewerRole] = useState<ReviewerLogItem['reviewerRole']>('Lead Architect');
  const [newStatus, setNewStatus] = useState<ReviewerLogItem['reviewStatus']>('APPROVED');
  const [newComments, setNewComments] = useState('');

  useEffect(() => {
    let currentLogs = getStoredReviewersLog();
    if (currentDocument) {
      currentLogs = ensureCurrentDocReviewEntry(currentDocument, currentLogs);
    }
    setLogs(currentLogs);
  }, [currentDocument]);

  const handleStatusChange = (id: string, newStatus: ReviewerLogItem['reviewStatus']) => {
    const updated = logs.map(l => l.id === id ? { ...l, reviewStatus: newStatus } : l);
    setLogs(updated);
    saveStoredReviewersLog(updated);
  };

  const handleAddReviewer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReviewerName.trim()) return;

    const newEntry: ReviewerLogItem = {
      id: `rev-${Date.now()}`,
      docId: currentDocument?.metadata.id || 'doc-general',
      docTitle: currentDocument?.metadata.title || 'Platform Firmware Technical Specification',
      docNumber: currentDocument?.metadata.docNumber || 'DOC-01',
      reviewerName: newReviewerName,
      reviewerRole: newReviewerRole,
      reviewStatus: newStatus,
      reviewDate: new Date().toISOString().split('T')[0],
      comments: newComments || 'Reviewed and signed off from Operations Hub.'
    };

    const updated = [newEntry, ...logs];
    setLogs(updated);
    saveStoredReviewersLog(updated);
    setShowAddModal(false);
    setNewReviewerName('');
    setNewComments('');
  };

  const handleSaveSheetUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (tempSheetUrl.trim()) {
      saveStoredGoogleSheetUrl(tempSheetUrl.trim());
      setSheetUrl(tempSheetUrl.trim());
      setShowSheetConfigModal(false);
    }
  };

  const handleImportPastedData = () => {
    if (!pastedData.trim()) return;
    const lines = pastedData.trim().split('\n');
    const newItems: ReviewerLogItem[] = [];

    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split('\t');
      if (parts.length >= 3) {
        // Check if header row
        if (parts[0].toLowerCase().includes('doc') || parts[1].toLowerCase().includes('title')) {
          continue;
        }
        newItems.push({
          id: `rev-pasted-${Date.now()}-${i}`,
          docNumber: parts[0]?.trim() || 'DOC-01',
          docTitle: parts[1]?.trim() || 'Imported Document',
          docId: `doc-${Date.now()}-${i}`,
          reviewerName: parts[2]?.trim() || 'Reviewer',
          reviewerRole: (parts[3]?.trim() as any) || 'Lead Architect',
          reviewStatus: (parts[4]?.trim().toUpperCase() as any) || 'APPROVED',
          reviewDate: parts[5]?.trim() || new Date().toISOString().split('T')[0],
          comments: parts[6]?.trim() || 'Imported from Google Sheets'
        });
      }
    }

    if (newItems.length > 0) {
      const updated = [...newItems, ...logs];
      setLogs(updated);
      saveStoredReviewersLog(updated);
      setShowPasteModal(false);
      setPastedData('');
    } else {
      alert('Could not parse TSV data. Please copy rows directly from Google Sheets and paste them.');
    }
  };

  const handleCopyGoogleSpreadsheetFormat = () => {
    let tsv = "Document Number\tDocument Title\tReviewer Name\tReviewer Role\tStatus\tReview Date\tComments\n";
    logs.forEach(l => {
      tsv += `${l.docNumber}\t${l.docTitle}\t${l.reviewerName}\t${l.reviewerRole}\t${l.reviewStatus}\t${l.reviewDate}\t${l.comments}\n`;
    });
    navigator.clipboard.writeText(tsv);
    setCopiedSpreadsheet(true);
    setTimeout(() => setCopiedSpreadsheet(false), 2000);
  };

  // Convert Google Sheet URL into embedded view URL
  const getEmbeddedSheetUrl = (url: string) => {
    try {
      if (url.includes('/edit')) {
        return url.replace(/\/edit.*$/, '/edit?embedded=true&rm=minimal');
      }
      return `${url}?embedded=true&rm=minimal`;
    } catch {
      return url;
    }
  };

  const filteredLogs = logs.filter(l => 
    l.docTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.docNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.reviewerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.reviewerRole.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 text-left">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
              Option 3
            </span>
            <h2 className="text-xl font-bold text-slate-900">Document Reviewers Log & Google Sheets Sync</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Track peer sign-offs with auto-fetched document titles from DocCraft Studio, and synchronize live with your Google Spreadsheet.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Direct Open in Google Sheets */}
          <a
            href={sheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-semibold shadow-xs transition-colors"
          >
            <Globe className="w-3.5 h-3.5 text-emerald-600" />
            <span>Open in Google Sheets</span>
            <ExternalLink className="w-3 h-3" />
          </a>

          {/* Copy for Sheets */}
          <button
            type="button"
            onClick={handleCopyGoogleSpreadsheetFormat}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-semibold shadow-xs transition-colors"
            title="Copy as TSV ready to paste directly into Google Sheets"
          >
            {copiedSpreadsheet ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-emerald-600" />}
            <span>{copiedSpreadsheet ? 'Copied for Google Sheets!' : 'Copy for Google Sheets'}</span>
          </button>

          {/* Paste from Sheets */}
          <button
            type="button"
            onClick={() => setShowPasteModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-semibold shadow-xs transition-colors"
            title="Paste rows from Google Sheets"
          >
            <Edit3 className="w-3.5 h-3.5 text-cyan-600" />
            <span>Import from Sheet</span>
          </button>

          {/* Export to Excel */}
          <button
            type="button"
            onClick={() => exportReviewersLogToExcel(logs)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-semibold shadow-xs transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Excel (.xlsx)</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Reviewer</span>
          </button>
        </div>
      </div>

      {/* Connected Google Spreadsheet Info Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900">Connected Google Spreadsheet:</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-mono border border-emerald-200 font-bold">
                SYNC ACTIVE
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-mono mt-0.5 truncate max-w-xl">
              {sheetUrl}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle View Tabs */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('matrix')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                activeTab === 'matrix' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Review Table</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('embed-sheet')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                activeTab === 'embed-sheet' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Live Google Sheet View</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setTempSheetUrl(sheetUrl);
              setShowSheetConfigModal(true);
            }}
            title="Configure Spreadsheet Link"
            className="p-2 rounded-xl bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-900 border border-slate-300 transition-colors shadow-xs"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Linked DocCraft Document Banner (Auto-Fetched Title) */}
      {currentDocument && (
        <div className="bg-gradient-to-r from-blue-50/80 via-white to-emerald-50/50 border border-blue-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-700">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 font-mono">
                  Active DocCraft Document
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono border border-blue-200">
                  {currentDocument.metadata.docNumber}
                </span>
              </div>
              <h4 className="text-sm font-bold text-slate-900 mt-0.5">
                {currentDocument.metadata.title}
              </h4>
              <p className="text-[11px] text-slate-500">
                Author: <strong className="text-slate-800">{currentDocument.metadata.author}</strong> • Classification: {currentDocument.metadata.classification}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenDocCraft}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold self-start sm:self-auto transition-colors shadow-xs"
          >
            <span>Open in DocCraft Studio</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* MAIN VIEW CONTENT: Table or Embedded Google Sheet */}
      {activeTab === 'matrix' ? (
        <div className="space-y-4">
          {/* Search Bar */}
          <div className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-slate-300 max-w-md text-xs shadow-xs">
            <Search className="w-4 h-4 text-slate-400 ml-1" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by document title, reviewer name, or role..."
              className="w-full bg-transparent text-slate-900 placeholder-slate-400 focus:outline-none"
            />
          </div>

          {/* Reviewers Log Table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-slate-700">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Doc ID</th>
                    <th className="py-3 px-4">Document Title (From DocCraft)</th>
                    <th className="py-3 px-4">Reviewer Name & Role</th>
                    <th className="py-3 px-4">Sign-Off Status</th>
                    <th className="py-3 px-4">Review Date</th>
                    <th className="py-3 px-4">Comments & Sign-Off Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredLogs.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-blue-700">
                        {item.docNumber}
                      </td>

                      <td className="py-3.5 px-4 font-semibold text-slate-900 max-w-xs">
                        {item.docTitle}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{item.reviewerName}</div>
                        <div className="text-[10px] text-slate-500">{item.reviewerRole}</div>
                      </td>

                      <td className="py-3.5 px-4">
                        <select
                          value={item.reviewStatus}
                          onChange={(e) => handleStatusChange(item.id, e.target.value as any)}
                          className={`text-[11px] font-bold rounded-lg px-2.5 py-1 border focus:outline-none cursor-pointer ${
                            item.reviewStatus === 'APPROVED'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : item.reviewStatus === 'CHANGES_REQUESTED'
                              ? 'bg-rose-50 text-rose-800 border-rose-300'
                              : item.reviewStatus === 'IN_REVIEW'
                              ? 'bg-purple-50 text-purple-800 border-purple-300'
                              : 'bg-amber-50 text-amber-800 border-amber-300'
                          }`}
                        >
                          <option value="APPROVED">✓ APPROVED</option>
                          <option value="CHANGES_REQUESTED">✕ CHANGES REQUESTED</option>
                          <option value="IN_REVIEW">⋯ IN REVIEW</option>
                          <option value="PENDING">○ PENDING</option>
                        </select>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-500">
                        {item.reviewDate}
                      </td>

                      <td className="py-3.5 px-4 text-slate-700 max-w-sm leading-relaxed text-[11px]">
                        {item.comments}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Embedded Live Google Sheet View */
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs space-y-3 p-4">
          <div className="flex items-center justify-between text-xs text-slate-600 pb-2 border-b border-slate-200">
            <span className="font-semibold flex items-center gap-2 text-slate-900">
              <Globe className="w-4 h-4 text-emerald-600" />
              <span>Interactive Google Spreadsheet Canvas</span>
            </span>
            <a
              href={sheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-700 hover:text-emerald-800 flex items-center gap-1 font-semibold"
            >
              <span>Open in Full Tab</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="w-full h-[650px] rounded-xl overflow-hidden bg-white border border-slate-300 shadow-xs">
            <iframe
              src={getEmbeddedSheetUrl(sheetUrl)}
              title="Google Spreadsheet Reviewers Log"
              className="w-full h-full border-0"
              allowFullScreen
            />
          </div>
        </div>
      )}

      {/* Configure Google Sheet URL Modal */}
      {showSheetConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Configure Google Spreadsheet URL</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowSheetConfigModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSheetUrl} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-700 font-semibold block mb-1">Google Sheet URL</label>
                <input
                  type="url"
                  value={tempSheetUrl}
                  onChange={(e) => setTempSheetUrl(e.target.value)}
                  required
                  placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-emerald-500 font-mono shadow-xs"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Ensure the spreadsheet sharing settings are set to &quot;Anyone with link can view/edit&quot; or logged into your Google account in this browser.
                </p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setTempSheetUrl(DEFAULT_GOOGLE_SHEET_URL)}
                  className="text-slate-500 hover:text-slate-800 text-xs underline"
                >
                  Reset to Default Sheet
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSheetConfigModal(false)}
                    className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-xs"
                  >
                    Save URL
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Paste from Google Sheets Modal */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-cyan-600" />
                <span>Import / Paste Rows from Google Sheets</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-600">
                Highlight rows in your Google Sheet, press <kbd className="px-1.5 py-0.5 bg-slate-100 rounded font-mono text-slate-800 border border-slate-300">Ctrl+C</kbd> / <kbd className="px-1.5 py-0.5 bg-slate-100 rounded font-mono text-slate-800 border border-slate-300">Cmd+C</kbd>, and paste here:
              </p>

              <textarea
                value={pastedData}
                onChange={(e) => setPastedData(e.target.value)}
                rows={6}
                placeholder="WH3-1205&#9;Firmware Upgrade Fix&#9;Manivannan Thangavel&#9;Software engineering manager&#9;APPROVED&#9;2026-08-14&#9;Approved architecture"
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-cyan-500 font-mono text-[11px] resize-none shadow-xs"
              />

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowPasteModal(false)}
                  className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImportPastedData}
                  className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold shadow-xs"
                >
                  Import Rows to Matrix
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Reviewer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-emerald-600" />
                <span>Add Reviewer Sign-Off</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddReviewer} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-700 font-semibold block mb-1">Reviewer Name</label>
                <input
                  type="text"
                  value={newReviewerName}
                  onChange={(e) => setNewReviewerName(e.target.value)}
                  required
                  placeholder="e.g. Manivannan Thangavel"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 focus:outline-none focus:border-emerald-500 shadow-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-700 font-semibold block mb-1">Reviewer Role</label>
                  <select
                    value={newReviewerRole}
                    onChange={(e) => setNewReviewerRole(e.target.value as any)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 focus:outline-none shadow-xs"
                  >
                    <option value="Lead Architect">Lead Architect</option>
                    <option value="Security Officer">Security Officer</option>
                    <option value="QA Director">QA Director</option>
                    <option value="Product Owner">Product Owner</option>
                    <option value="Firmware Engineer">Firmware Engineer</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-700 font-semibold block mb-1">Sign-Off Status</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as any)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 focus:outline-none shadow-xs"
                  >
                    <option value="APPROVED">APPROVED</option>
                    <option value="IN_REVIEW">IN REVIEW</option>
                    <option value="CHANGES_REQUESTED">CHANGES REQUESTED</option>
                    <option value="PENDING">PENDING</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-700 font-semibold block mb-1">Review Comments & Sign-Off Notes</label>
                <textarea
                  value={newComments}
                  onChange={(e) => setNewComments(e.target.value)}
                  rows={3}
                  placeholder="Enter architecture verification notes, test observations..."
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 focus:outline-none focus:border-emerald-500 resize-none shadow-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-xs"
                >
                  Save Reviewer Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

