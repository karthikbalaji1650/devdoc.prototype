import React, { useEffect, useState, useRef } from 'react';
import { 
  Download, 
  Copy, 
  Printer, 
  Upload, 
  FolderDown, 
  FolderUp, 
  Sparkles,
  RotateCcw,
  Check,
  ChevronDown,
  ChevronLeft,
  Layers,
  FileCode2,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Bot,
  LogOut,
  RefreshCw
} from 'lucide-react';
import confetti from 'canvas-confetti';
import type { DocumentModel } from '../types/document';
import type { UserProfile } from '../types/auth';
import { TEMPLATE_REGISTRY } from '../templates';
import { exportToGoogleDoc } from '../exporters/googleDocsExport';
import { GoogleAuthCancelledError, GoogleClientIdMissingError } from '../services/googleAuthService';
import { GoogleClientIdModal } from './google/GoogleClientIdModal';
import { recordDriveExport } from '../services/googleDriveStatusService';
import { exportDocToVsCodeSpecs } from '../services/workspaceFileService';

interface HeaderNavProps {
  document: DocumentModel;
  user?: UserProfile;
  onUpdateMetadata: (updates: Partial<DocumentModel['metadata']>) => void;
  onLoadTemplate: (templateId: string, isBlank?: boolean) => void;
  onUploadDocx: (file: File) => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onReset: () => void;
  viewMode: 'paginated' | 'continuous';
  onToggleViewMode: (mode: 'paginated' | 'continuous') => void;
  onOpenAiSettings: () => void;
  onBackToHub?: () => void;
  onLaunchOperations?: () => void;
  onLogout?: () => void;
}

export const HeaderNav: React.FC<HeaderNavProps> = ({
  document,
  user,
  onLoadTemplate,
  onUploadDocx,
  onExportJson,
  onImportJson,
  onReset,
  onOpenAiSettings,
  onBackToHub,
  onLaunchOperations,
  onLogout,
}) => {
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [copiedSuccess, setCopiedSuccess] = useState(false);
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [isExportingGoogleDoc, setIsExportingGoogleDoc] = useState(false);
  const [googleDocsError, setGoogleDocsError] = useState<string | null>(null);
  const [showGoogleClientIdModal, setShowGoogleClientIdModal] = useState(false);
  const templateName = TEMPLATE_REGISTRY.find(template => template.id === document.metadata.templateType)?.name
    || document.metadata.templateType.replace('-', ' ');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportDropdownOpen) return;

    const handlePointerDownOutside = (event: PointerEvent) => {
      if (!exportDropdownRef.current?.contains(event.target as Node)) {
        setExportDropdownOpen(false);
      }
    };

    globalThis.document.addEventListener('pointerdown', handlePointerDownOutside);
    return () => globalThis.document.removeEventListener('pointerdown', handlePointerDownOutside);
  }, [exportDropdownOpen]);


  const handleDocxExport = async () => {
    try {
      setIsExportingDocx(true);
      const { exportToDocx } = await import('../exporters/docxExporter');
      await exportToDocx(document);
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.1 }
      });
    } catch (err) {
      console.error('Failed to export DOCX:', err);
      alert('Error generating DOCX document. Please verify all sections.');
    } finally {
      setIsExportingDocx(false);
      setExportDropdownOpen(false);
    }
  };

  const handleGoogleDocsExport = async () => {
    setGoogleDocsError(null);
    try {
      setIsExportingGoogleDoc(true);
      const docUrl = await exportToGoogleDoc(document);
      void recordDriveExport({
        docTitle: document.metadata.title || 'Untitled Document',
        docNumber: document.metadata.docNumber || '',
        driveUrl: docUrl,
      });
      window.open(docUrl, '_blank', 'noopener,noreferrer');
      setCopiedSuccess(true);
      confetti({
        particleCount: 50,
        spread: 40,
        origin: { y: 0.1 }
      });
      setTimeout(() => setCopiedSuccess(false), 3000);
    } catch (err) {
      if (err instanceof GoogleAuthCancelledError) {
        // User closed the sign-in popup or denied access — not an error worth surfacing loudly.
        console.info('Google Docs export cancelled by user.');
      } else if (err instanceof GoogleClientIdMissingError) {
        setShowGoogleClientIdModal(true);
      } else {
        console.error('Failed to export to Google Docs:', err);
        const message = err instanceof Error ? err.message : 'Failed to export to Google Docs.';
        setGoogleDocsError(message);
        setTimeout(() => setGoogleDocsError(null), 5000);
      }
    } finally {
      setIsExportingGoogleDoc(false);
      setExportDropdownOpen(false);
    }
  };

  const handleExcelExport = async () => {
    const allTestCases = document.sections.flatMap(s => s.testCases || []);
    if (allTestCases.length > 0) {
      const { exportTestCasesToExcel } = await import('../exporters/excelExporter');
      await exportTestCasesToExcel(allTestCases, document.metadata.docNumber || 'Test_Cases');
      confetti({ particleCount: 50, spread: 50, origin: { y: 0.1 } });
    } else {
      alert('No test cases found in this document to export to Excel.');
    }
    setExportDropdownOpen(false);
  };

  const handleVsCodeSpecsSave = async () => {
    try {
      const { fileName, savedToWorkspace } = await exportDocToVsCodeSpecs(document);
      confetti({ particleCount: 70, spread: 50, origin: { y: 0.1 } });
      if (savedToWorkspace) {
        alert(`✅ "${fileName}.md" saved directly into VS Code workspace!\n\nLocation: /home/coder/project/docs/${fileName}.md\nOpen VS Code (Coder tab) to view it.\n\n"${fileName}.docx" also downloaded to your browser.`);
      } else {
        alert(`Downloaded "${fileName}.docx" & "${fileName}.md" to your browser.\n\n⚠️ Could not reach the VS Code file-bridge (port 8081). The .md was not automatically placed in the workspace — copy it manually if needed.`);
      }
    } catch (e) {
      console.error('Failed to export to specs', e);
      alert('Error exporting document to VS Code specs folder.');
    } finally {
      setExportDropdownOpen(false);
    }
  };

  const handlePrint = () => {
    window.print();
    setExportDropdownOpen(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadDocx(file);
    }
    if (e.target) e.target.value = '';
  };

  const handleJsonChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportJson(file);
    }
    if (e.target) e.target.value = '';
  };

  return (
    <header className="sticky top-0 z-50 h-16 bg-[var(--panel)] border-b border-[var(--border)] px-4 flex items-center justify-between">
      {/* Brand, App Switcher & Template Selector */}
      <div className="flex items-center gap-3">
        {onBackToHub && (
          <button
            type="button"
            onClick={onBackToHub}
            title="Back to all documents"
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--panel-alt)] transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">All Documents</span>
          </button>
        )}

        {/* Template Switcher Dropdown */}
        <div className="relative">
          <button
            onClick={() => setTemplateDropdownOpen(!templateDropdownOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-800 border border-slate-300 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>
              <strong className="text-slate-900">{templateName.toUpperCase()}</strong>
            </span>
            <ChevronDown className="w-3 h-3 text-slate-500" />
          </button>

          {templateDropdownOpen && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setTemplateDropdownOpen(false)} 
              />
              <div className="absolute left-0 mt-2 w-84 rounded-xl glass-dropdown z-50 p-2 animate-fade-in divide-y divide-slate-200 text-left">
                <div className="p-2">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Pre-built Engineering Templates
                  </div>
                  <div className="space-y-1">
                    {TEMPLATE_REGISTRY.map((tmpl) => (
                      <div
                        key={tmpl.id}
                        className="group flex flex-col p-2 rounded-lg hover:bg-slate-100 cursor-pointer transition-all"
                        onClick={() => {
                          onLoadTemplate(tmpl.id, false);
                          setTemplateDropdownOpen(false);
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 font-medium text-xs text-slate-800 group-hover:text-blue-600">
                            {tmpl.id === 'spreadsheet-test-matrix' ? (
                              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                            ) : tmpl.category === 'technical-analysis' ? (
                              <FileCode2 className="w-4 h-4 text-blue-600" />
                            ) : tmpl.category === 'test-report' ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            ) : tmpl.category === 'adr' ? (
                              <Layers className="w-4 h-4 text-purple-600" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-amber-600" />
                            )}
                            <span>{tmpl.name}</span>
                          </div>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                            {tmpl.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">
                          {tmpl.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-2 pt-2 flex items-center justify-between">
                  <button
                    onClick={() => {
                      onLoadTemplate(document.metadata.templateType, true);
                      setTemplateDropdownOpen(false);
                    }}
                    className="text-xs text-slate-600 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
                  >
                    Blank Template
                  </button>
                  <button
                    onClick={() => {
                      onReset();
                      setTemplateDropdownOpen(false);
                    }}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50 transition-colors font-medium"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Restore Sample</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right: AI Assistant, Export, Operations Switcher & User Profile */}
      <div className="flex items-center gap-2">
        {/* Hidden File Inputs */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".docx"
          className="hidden"
        />
        <input
          type="file"
          ref={jsonInputRef}
          onChange={handleJsonChange}
          accept=".json"
          className="hidden"
        />

        {/* Export to Google Docs button */}
        <button
          onClick={handleGoogleDocsExport}
          disabled={isExportingGoogleDoc}
          title={googleDocsError || 'Create a Google Doc in your Drive from this document'}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-all shadow-xs disabled:opacity-60"
        >
          {googleDocsError ? (
            <>
              <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
              <span className="hidden md:inline">Export failed</span>
            </>
          ) : isExportingGoogleDoc ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 text-emerald-600 animate-spin" />
              <span className="hidden md:inline">Exporting…</span>
            </>
          ) : copiedSuccess ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600 animate-bounce" />
              <span>Exported to Google Docs</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden md:inline">Google Docs</span>
            </>
          )}
        </button>

        {/* Primary Export to Word .docx */}
        <button
          onClick={handleDocxExport}
          disabled={isExportingDocx}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold btn-primary rounded-lg shadow-sm"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{isExportingDocx ? 'Generating...' : 'Export Word'}</span>
        </button>

        {/* Secondary Actions Dropdown (Excel, JSON, Print, AI Settings). The ref
            marks what counts as "inside" for closing it on an outside press. */}
        <div ref={exportDropdownRef} className="relative">
          <button
            onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
            aria-label="Export options"
            aria-expanded={exportDropdownOpen}
            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors border border-slate-300"
          >
            <ChevronDown className="w-4 h-4" />
          </button>

          {exportDropdownOpen && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setExportDropdownOpen(false)} 
              />
              <div className="absolute right-0 mt-2 w-64 rounded-xl glass-dropdown z-50 p-1.5 animate-fade-in space-y-1 text-left">
                {/* Operations Hub Link */}
                {onLaunchOperations && (
                  <button
                    onClick={() => {
                      onLaunchOperations();
                      setExportDropdownOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors text-left font-semibold"
                  >
                    <Layers className="w-4 h-4 text-indigo-600" />
                    <span>Switch to Operations Suite</span>
                  </button>
                )}

                <div className="h-[1px] bg-slate-200 my-1" />

                {/* AI Configuration */}
                <button
                  onClick={() => {
                    onOpenAiSettings();
                    setExportDropdownOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-purple-700 hover:bg-purple-50 rounded-lg transition-colors text-left font-semibold"
                >
                  <Bot className="w-4 h-4 text-purple-600" />
                  <span>Configure AI Provider & Keys</span>
                </button>

                {/* Save to VS Code Workspace specs/ (.docx & .md) */}
                <button
                  onClick={handleVsCodeSpecsSave}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-cyan-700 hover:bg-cyan-50 rounded-lg transition-colors text-left font-semibold"
                >
                  <FileCode2 className="w-4 h-4 text-cyan-600" />
                  <span>Save to VS Code Workspace (.md)</span>
                </button>

                {/* Back-Annotate / Sync Robot Test Suite to Test Management */}
                {onLaunchOperations && (
                  <button
                    onClick={() => {
                      onLaunchOperations();
                      setExportDropdownOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-purple-700 hover:bg-purple-50 rounded-lg transition-colors text-left font-semibold"
                  >
                    <RefreshCw className="w-4 h-4 text-purple-600" />
                    <span>Sync Robot Test Suite (Test Management)</span>
                  </button>
                )}

                {/* Excel Export */}
                <button
                  onClick={handleExcelExport}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors text-left font-semibold"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Export Test Cases to Excel (.xlsx)</span>
                </button>

                <div className="h-[1px] bg-slate-200 my-1" />

                {/* Upload DOCX Template */}
                <button
                  onClick={() => {
                    fileInputRef.current?.click();
                    setExportDropdownOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 rounded-lg transition-colors text-left"
                >
                  <Upload className="w-4 h-4 text-slate-500" />
                  <span>Import Existing Word .docx</span>
                </button>

                <button
                  onClick={handlePrint}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 rounded-lg transition-colors text-left"
                >
                  <Printer className="w-4 h-4 text-slate-500" />
                  <span>Print / Save as PDF</span>
                </button>

                <button
                  onClick={() => {
                    onExportJson();
                    setExportDropdownOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 rounded-lg transition-colors text-left"
                >
                  <FolderDown className="w-4 h-4 text-blue-600" />
                  <span>Save Draft Project (JSON)</span>
                </button>

                <button
                  onClick={() => {
                    jsonInputRef.current?.click();
                    setExportDropdownOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 rounded-lg transition-colors text-left"
                >
                  <FolderUp className="w-4 h-4 text-amber-600" />
                  <span>Load Draft Project (JSON)</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* User Profile Avatar / Logout Dropdown */}
        {user && (
          <div className="relative ml-1">
            <button
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className={`w-7 h-7 rounded-lg bg-gradient-to-tr ${user.avatarBg} flex items-center justify-center text-xs font-bold text-white shadow-xs ring-1 ring-slate-200`}
              title={user.name}
            >
              {user.initials}
            </button>

            {userDropdownOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setUserDropdownOpen(false)} 
                />
                <div className="absolute right-0 mt-2 w-56 rounded-xl glass-dropdown z-50 p-2 animate-fade-in space-y-2 text-left">
                  <div className="p-2 border-b border-slate-200">
                    <div className="text-xs font-bold text-slate-900">{user.name}</div>
                    <div className="text-[10px] text-slate-500">{user.title}</div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{user.email}</div>
                  </div>

                  {onLaunchOperations && (
                    <button
                      onClick={() => {
                        onLaunchOperations();
                        setUserDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded-lg transition-colors text-left"
                    >
                      <Layers className="w-3.5 h-3.5 text-purple-600" />
                      <span>Operations Suite</span>
                    </button>
                  )}

                  {onLogout && (
                    <button
                      onClick={() => {
                        onLogout();
                        setUserDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-lg transition-colors text-left font-semibold"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Log Out</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {showGoogleClientIdModal && (
        <GoogleClientIdModal
          onClose={() => setShowGoogleClientIdModal(false)}
          onSaved={() => {
            setShowGoogleClientIdModal(false);
            handleGoogleDocsExport();
          }}
        />
      )}
    </header>
  );
};
