import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import type { DocumentModel, DocSection, SectionType, DocStatus } from './types/document';
import type { AppView, OperationsTab } from './types/appState';
import type { UserProfile } from './types/auth';
import type { IncidentItem } from './types/operations';
import { TEMPLATE_REGISTRY, getDefaultDocument } from './templates';
import { sampleTestReportDoc } from './templates/testReportTemplate';
import { HeaderNav } from './components/HeaderNav';
import { DocumentSidebar } from './components/DocumentSidebar';
import { SectionEditorContainer } from './components/SectionEditorContainer';
import { MetadataEditor } from './components/editors/MetadataEditor';
import { DocumentPreview } from './components/DocumentPreview';
import { AiRephraseModal } from './components/ai/AiRephraseModal';
import { AiSettingsModal } from './components/ai/AiSettingsModal';
import { LoginPage } from './components/auth/LoginPage';
import { AppSidebar } from './components/AppSidebar';
import { DocumentsListPage } from './components/documents/DocumentsListPage';
import { listDocuments, getDocument, saveDocument, generateDocumentId, moveDocumentToBin, moveSectionToBin } from './services/documentsStoreService';
import { DocBinModal } from './components/documents/DocBinModal';
import { VersionHistoryModal } from './components/documents/VersionHistoryModal';
import { snapshotIfDue, recordSnapshot } from './services/versionHistoryService';
import { getStoredSession, loginWithProfile, logout } from './services/authService';
import { recordLogin, recordLogout } from './services/sessionAuditService';
import { createDebouncedSaver } from './services/autosave';
import { filterByStatus } from './services/documentStats';
import { safeSetItem, STORAGE_ERROR_EVENT } from './services/safeStorage';
import { canEditDocument, canDeleteDocument, canAccessDataManagement, isAdmin, visibleDocumentsFor } from './services/permissions';

import { saveAs } from 'file-saver';
import { 
  PanelLeftClose,
  PanelLeftOpen,
  CheckCircle,
  ShieldAlert,
  ArchiveRestore,
  History
} from 'lucide-react';

// Heavy screens load on demand so the login/document screens ship a much
// smaller first bundle.
const DashboardPage = lazy(() => import('./components/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const LandingHub = lazy(() => import('./components/hub/LandingHub').then((m) => ({ default: m.LandingHub })));
const OperationsLayout = lazy(() => import('./components/operations/OperationsLayout').then((m) => ({ default: m.OperationsLayout })));
const SettingsPage = lazy(() => import('./components/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const DataManagementPage = lazy(() => import('./components/data/DataManagementPage').then((m) => ({ default: m.DataManagementPage })));
const CoderView = lazy(() => import('./components/coder/CoderView').then((m) => ({ default: m.CoderView })));

const PageLoading: React.FC = () => (
  <div className="flex h-screen items-center justify-center bg-[var(--bg)] text-xs font-mono uppercase tracking-[0.14em] text-[var(--text-dim)]">
    Loading…
  </div>
);

const STORAGE_KEY = 'devdoc_studio_current_doc_v1';

const migrateSavedDocument = (savedDocument: DocumentModel): DocumentModel => {
  const isLegacyImpactAnalysis = savedDocument.metadata.templateType === 'test-report' && (
    savedDocument.metadata.title === 'Firmware Security & REST API Test Execution Report' ||
    savedDocument.sections.some(section => section.id === 'sec-exec-summary') ||
    !savedDocument.sections.some(section => section.id === 'sec-purpose-scope')
  );

  return isLegacyImpactAnalysis
    ? JSON.parse(JSON.stringify(sampleTestReportDoc))
    : savedDocument;
};

export const App: React.FC = () => {
  // Auth state
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    const session = getStoredSession();
    return session?.user || null;
  });

  // App routing state
  const [currentApp, setCurrentApp] = useState<AppView>(() => {
    const session = getStoredSession();
    return session ? 'dashboard' : 'login';
  });

  const [activeOpsTab, setActiveOpsTab] = useState<OperationsTab>('incidents');

  // Document model state
  const [document, setDocument] = useState<DocumentModel>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return migrateSavedDocument(JSON.parse(saved) as DocumentModel);
      } catch (e) {
        console.error('Failed to parse saved document', e);
      }
    }
    return getDefaultDocument();
  });

  // null = showing the documents list; a real id = editing that document
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | 'metadata'>('metadata');
  const [viewMode, setViewMode] = useState<'paginated' | 'continuous'>('paginated');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [documentSidebarWidth, setDocumentSidebarWidth] = useState(320);
  const [activeTab, setActiveTab] = useState<'split' | 'editor-only' | 'preview-only'>('split');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [docBinOpen, setDocBinOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Set when the dashboard sends you to the list narrowed to one status.
  const [documentsStatusFilter, setDocumentsStatusFilter] = useState<DocStatus | null>(null);
  const [documentListVersion, setDocumentListVersion] = useState(0);

  // AI Modal States
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [aiInitialText, setAiInitialText] = useState('');
  const [aiApplyCallback, setAiApplyCallback] = useState<((newText: string) => void) | null>(null);

  // Auto-save the active document into the multi-document store.
  // (Legacy single-doc key is kept in sync too, only so an older build
  // reverting mid-session wouldn't see a blank slate; documentsStoreService
  // migrates it in on first read.)
  // Saves are debounced so a burst of keystrokes serialises the document
  // once, not once per keystroke. Anything that reads the saved copy (or
  // leaves the page / editor) calls flush() first so no edit is lost.
  const autosaverRef = useRef(
    createDebouncedSaver<DocumentModel>((doc) => {
      // The store is the source of truth; the legacy copy is best-effort
      // and must not raise a second warning when storage is full.
      snapshotIfDue(() => getDocument(doc.metadata.id), doc.metadata.id);
      saveDocument(doc);
      safeSetItem(STORAGE_KEY, JSON.stringify(doc), { notify: false });
    }, 400)
  );

  useEffect(() => {
    if (!activeDocumentId) return;
    autosaverRef.current.schedule(document);
  }, [document, activeDocumentId]);

  // Leaving or switching documents flushes the pending save.
  useEffect(() => {
    if (!activeDocumentId) return;
    const saver = autosaverRef.current;
    return () => saver.flush();
  }, [activeDocumentId]);

  // Closing or hiding the tab flushes it too.
  useEffect(() => {
    const saver = autosaverRef.current;
    const flush = () => saver.flush();
    const onVisibility = () => { if (window.document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    window.document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Browser storage is full or blocked: tell the user their latest edits
  // are NOT being saved (rate-limited so autosave retries don't spam).
  useEffect(() => {
    let lastShown = 0;
    const onStorageError = () => {
      if (Date.now() - lastShown < 30000) return;
      lastShown = Date.now();
      setToastMessage('⚠️ Browser storage is full - recent changes are not being saved. Export your data, then clear space in Data Management.');
      setTimeout(() => setToastMessage(null), 8000);
    };
    window.addEventListener(STORAGE_ERROR_EVENT, onStorageError);
    return () => window.removeEventListener(STORAGE_ERROR_EVENT, onStorageError);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Opens an existing document (from the list, an import, etc.) or
  // registers a brand-new one, and switches the editor onto it.
  const openDocumentInEditor = (doc: DocumentModel) => {
    const id = doc.metadata.id || generateDocumentId();
    const docWithId: DocumentModel = { ...doc, metadata: { ...doc.metadata, id } };
    saveDocument(docWithId);
    setDocument(docWithId);
    setActiveSectionId('metadata');
    setActiveDocumentId(id);
  };

  const handleOpenDocument = (id: string) => {
    const doc = getDocument(id);
    if (!doc) {
      showToast('Could not find that document.');
      return;
    }
    setDocument(doc);
    setActiveSectionId('metadata');
    setActiveDocumentId(id);
  };

  const handleCreateDocument = () => {
    const tmpl = TEMPLATE_REGISTRY[0];
    const newDoc = tmpl.getBlankDoc();
    newDoc.metadata.id = generateDocumentId();
    newDoc.metadata.author = currentUser?.name || 'Unknown';
    newDoc.metadata.status = 'DRAFT';
    newDoc.metadata.date = new Date().toISOString().split('T')[0];
    openDocumentInEditor(newDoc);
    showToast(`Created "${newDoc.metadata.title || 'New Document'}"`);
  };

  const handleBackToDocumentsList = () => {
    // Flush first: the list reads the store during render, which happens
    // before any effect cleanup would get the chance to save.
    autosaverRef.current.flush();
    setActiveDocumentId(null);
  };

  const handleMoveDocumentToBin = (id: string) => {
    const doc = getDocument(id);
    if (!doc) return;
    // Same rule as editing (#2/#4): only the author or an admin may delete.
    if (!canDeleteDocument(currentUser, doc)) {
      showToast('You can only delete documents you authored.');
      return;
    }
    moveDocumentToBin(doc);
    setDocumentListVersion((version) => version + 1);
    showToast(`Moved "${doc.metadata.title || 'Untitled Document'}" to Doc Bin.`);
  };

  // Auth Handlers
  const handleLogin = (profile: UserProfile) => {
    loginWithProfile(profile);
    recordLogin(profile.id, profile.name, profile.role);
    setCurrentUser(profile);
    setCurrentApp('dashboard');
    showToast(`Welcome, ${profile.name}!`);
  };

  const handleLogout = () => {
    if (currentUser) recordLogout(currentUser.id);
    logout();
    setCurrentUser(null);
    setCurrentApp('login');
    showToast('Logged out successfully.');
  };

  const handleUpdateAvatar = (avatarUrl?: string) => {
    if (!currentUser) return;
    const updatedUser = { ...currentUser, avatarUrl };
    setCurrentUser(updatedUser);
    const session = getStoredSession();
    if (session) {
      loginWithProfile(updatedUser);
    }
  };

  const handleLaunchApp = (app: AppView, opsTab?: OperationsTab) => {
    setCurrentApp(app);
    if (app === 'doccraft') {
      // "Document Editor" in the sidebar is a launcher, not "resume last
      // doc" - always land on the documents list (flush so it shows the
      // latest edit).
      autosaverRef.current.flush();
      setActiveDocumentId(null);
      setDocumentsStatusFilter(null);
    }
    if (opsTab) {
      setActiveOpsTab(opsTab);
    }
  };

  // Dashboard drill-downs: a status card opens the list for that status,
  // an activity row opens that document directly.
  const handleOpenDocumentsByStatus = (status: DocStatus | null) => {
    autosaverRef.current.flush();
    setDocumentsStatusFilter(status);
    setActiveDocumentId(null);
    setCurrentApp('doccraft');
  };

  const handleOpenDocumentFromDashboard = (id: string) => {
    const doc = getDocument(id);
    if (!doc) { showToast('Could not find that document.'); return; }
    setDocument(doc);
    setActiveSectionId('metadata');
    setActiveDocumentId(id);
    setCurrentApp('doccraft');
  };

  // Cross-App Incident -> RCA Document Generator
  const handleExportIncidentToRCA = (incident: IncidentItem) => {
    const rcaDoc: DocumentModel = {
      metadata: {
        id: `rca-${incident.id.toLowerCase()}`,
        title: `Root Cause Analysis: ${incident.title}`,
        subtitle: `Investigation, Code Mitigations & Resolution Matrix for ${incident.id}`,
        docNumber: incident.jiraTicket || incident.id,
        author: incident.owner,
        department: 'Platform Systems Engineering',
        date: new Date().toISOString().split('T')[0],
        version: '1.0',
        classification: 'INTERNAL ONLY',
        status: incident.status === 'Resolved' ? 'APPROVED' : 'IN_REVIEW',
        templateType: 'technical-analysis',
        logoUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60" fill="none"><rect width="40" height="40" y="10" rx="8" fill="%232563EB"/><path d="M14 24h12v12H14z" fill="white"/><path d="M20 18v6m0 12v6m-6-12H8m24 0h-6" stroke="white" stroke-width="2" stroke-linecap="round"/><text x="50" y="38" fill="%231E3A8A" font-family="Arial" font-weight="bold" font-size="20">FIRMWARE</text></svg>',
        logoPosition: 'center',
        tags: ['RCA', 'Incident', incident.severity, incident.affectedSystem]
      },
      sections: [
        {
          id: 'sec-summary',
          title: '1. Executive Incident Summary',
          level: 1,
          type: 'richText',
          content: `On ${incident.reportedDate}, an engineering incident (${incident.id}) was detected on ${incident.affectedSystem} with severity classification **${incident.severity}**.\n\nImmediate mitigation and root-cause analysis was initiated by ${incident.owner}. Current resolution status is **${incident.status}**.`
        },
        {
          id: 'sec-root-cause',
          title: '2. Root Cause Analysis (RCA)',
          level: 1,
          type: 'richText',
          content: `${incident.rootCause}\n\nTechnical investigation identified error propagation across the subsystem daemon when parsing initial payload arguments.`
        },
        {
          id: 'sec-matrix',
          title: '3. Verification & Resolution Matrix',
          level: 1,
          type: 'verificationMatrix',
          verificationMatrix: [
            {
              id: '1',
              rootCause: incident.rootCause,
              fixLocation: `${incident.affectedSystem} payload parser`,
              resolution: incident.status === 'Resolved' ? 'Code fix merged and regression verified on hardware testbed.' : 'Fix currently under review.',
              status: incident.status === 'Resolved' ? 'PASSED' : 'PENDING'
            }
          ]
        },
        {
          id: 'sec-signoff',
          title: '4. Engineering Sign-off',
          level: 1,
          type: 'callout',
          callout: {
            type: incident.status === 'Resolved' ? 'success' : 'warning',
            title: `Incident ${incident.id} Status: ${incident.status}`,
            text: `RCA document compiled automatically from Operations Hub by ${incident.owner}. Ready for formal peer review and JIRA release mapping.`
          }
        }
      ]
    };

    openDocumentInEditor(rcaDoc);
    setCurrentApp('doccraft');
    showToast(`Generated RCA Document for ${incident.id}!`);
  };

  const handleTriggerAi = (text: string, onApply?: (newText: string) => void) => {
    setAiInitialText(text);
    setAiApplyCallback(() => (newText: string) => {
      if (onApply) {
        onApply(newText);
        showToast('Applied AI rephrase!');
      }
    });
    setAiModalOpen(true);
  };

  // Section manipulation handlers
  // Requirement #2/#4: a user may only edit documents they authored;
  // admins may edit any document. Guarding here (not just visually)
  // means the restriction holds regardless of which UI path is used.
  const canEditActiveDocument = (): boolean => canEditDocument(currentUser, document);

  const handleUpdateMetadata = (updates: Partial<DocumentModel['metadata']>) => {
    if (!canEditActiveDocument()) { showToast('Read-only: you can only edit documents you authored.'); return; }
    setDocument(prev => ({
      ...prev,
      metadata: { ...prev.metadata, ...updates }
    }));
  };

  const handleUpdateSection = (id: string, updates: Partial<DocSection>) => {
    if (!canEditActiveDocument()) { showToast('Read-only: you can only edit documents you authored.'); return; }
    setDocument(prev => ({
      ...prev,
      sections: prev.sections.map(s => (s.id === id ? { ...s, ...updates } : s))
    }));
  };

  const handleDeleteSection = (id: string) => {
    if (!canEditActiveDocument()) { showToast('Read-only: you can only edit documents you authored.'); return; }
    const deletedSection = document.sections.find((section) => section.id === id);
    if (!deletedSection) return;
    moveSectionToBin(document, deletedSection, document.sections.findIndex((section) => section.id === id));
    setDocument(prev => {
      const newSections = prev.sections.filter(s => s.id !== id);
      if (activeSectionId === id) {
        setActiveSectionId(newSections.length > 0 ? newSections[0].id : 'metadata');
      }
      return { ...prev, sections: newSections };
    });
    showToast(`Moved "${deletedSection.title}" to Doc Bin.`);
  };

  const handleDuplicateSection = (id: string) => {
    if (!canEditActiveDocument()) { showToast('Read-only: you can only edit documents you authored.'); return; }
    setDocument(prev => {
      const index = prev.sections.findIndex(s => s.id === id);
      if (index === -1) return prev;
      const target = prev.sections[index];
      const duplicated: DocSection = {
        ...JSON.parse(JSON.stringify(target)),
        id: `sec-${Date.now()}`,
        title: `${target.title} (Copy)`
      };
      const newSections = [...prev.sections];
      newSections.splice(index + 1, 0, duplicated);
      setActiveSectionId(duplicated.id);
      return { ...prev, sections: newSections };
    });
    showToast('Section duplicated');
  };

  const handleMoveSection = (id: string, direction: 'up' | 'down') => {
    if (!canEditActiveDocument()) { showToast('Read-only: you can only edit documents you authored.'); return; }
    setDocument(prev => {
      const index = prev.sections.findIndex(s => s.id === id);
      if (index === -1) return prev;
      if (direction === 'up' && index === 0) return prev;
      if (direction === 'down' && index === prev.sections.length - 1) return prev;

      const targetIdx = direction === 'up' ? index - 1 : index + 1;
      const newSections = [...prev.sections];
      const [removed] = newSections.splice(index, 1);
      newSections.splice(targetIdx, 0, removed);
      return { ...prev, sections: newSections };
    });
  };

  const handleReorderSections = (draggedId: string, targetId: string) => {
    if (!canEditActiveDocument()) { showToast('Read-only: you can only edit documents you authored.'); return; }
    setDocument(prev => {
      const draggedIndex = prev.sections.findIndex(section => section.id === draggedId);
      const targetIndex = prev.sections.findIndex(section => section.id === targetId);
      if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) return prev;

      const newSections = [...prev.sections];
      const [draggedSection] = newSections.splice(draggedIndex, 1);
      newSections.splice(targetIndex, 0, draggedSection);
      return { ...prev, sections: newSections };
    });
  };

  const handleAddSection = (level: 1 | 2 | 3, type: SectionType, title: string = 'New Section') => {
    if (!canEditActiveDocument()) { showToast('Read-only: you can only edit documents you authored.'); return; }
    const newId = `sec-${Date.now()}`;
    const newSection: DocSection = {
      id: newId,
      title,
      level,
      type,
      content: type === 'richText' ? '' : undefined,
      tableData: type === 'table' ? { headers: ['Parameter', 'Value'], rows: [['', '']] } : undefined,
      codeSnippet: type === 'codeDiff' ? { filename: '', language: 'javascript', code: '', isDiff: false } : undefined,
      testCases: type === 'testCases' ? [] : undefined,
      verificationMatrix: type === 'verificationMatrix' ? [] : undefined,
      callout: type === 'callout' ? { type: 'info', title: 'Note', text: '' } : undefined
    };

    setDocument(prev => ({
      ...prev,
      sections: [...prev.sections, newSection]
    }));
    setActiveSectionId(newId);
    showToast(`Added ${title}`);
  };

  // Template Switching
  const handleLoadTemplate = (templateId: string, isBlank: boolean = false) => {
    if (activeDocumentId && !canEditActiveDocument()) { showToast('Read-only: you can only edit documents you authored.'); return; }
    const tmpl = TEMPLATE_REGISTRY.find(t => t.id === templateId) || TEMPLATE_REGISTRY[0];
    const newDoc = isBlank ? tmpl.getBlankDoc() : tmpl.getSampleDoc();
    // Switching templates mid-edit replaces content, not the document's identity.
    if (activeDocumentId) {
      newDoc.metadata.id = activeDocumentId;
    }
    setDocument(newDoc);
    setActiveSectionId('metadata');
    showToast(`Loaded ${tmpl.name}${isBlank ? ' (Blank)' : ''}`);
  };

  const handleResetSampleData = () => {
    const currentType = document.metadata.templateType;
    handleLoadTemplate(currentType, false);
  };

  // Import / Export JSON
  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' });
    saveAs(blob, `${document.metadata.docNumber || 'document'}_draft.json`);
    showToast('Draft project saved as JSON');
  };

  const handleImportJson = async (file: File) => {
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      if (imported.metadata && imported.sections) {
        openDocumentInEditor(imported);
        showToast('Draft project loaded successfully');
      } else {
        alert('Invalid document project JSON format');
      }
    } catch (e) {
      console.error('Failed to import JSON', e);
      alert('Error parsing JSON file');
    }
  };

  // Upload DOCX template
  const handleUploadDocx = async (file: File) => {
    try {
      showToast('Parsing uploaded Word template...');
      const { parseDocxFile } = await import('./exporters/docxImporter');
      const importedDoc = await parseDocxFile(file);
      openDocumentInEditor(importedDoc);
      showToast(`Imported ${importedDoc.sections.length} sections from DOCX!`);
    } catch (e) {
      console.error('Failed to parse docx', e);
      alert('Could not parse Word document. Please ensure it is a valid .docx file.');
    }
  };



  const activeSection = document.sections.find(s => s.id === activeSectionId);
  const activeSectionIndex = document.sections.findIndex(s => s.id === activeSectionId);

  const showEditor = (activeTab as string) !== 'preview-only';
  const showPreview = (activeTab as string) !== 'editor-only';

  // 1. Render Login Screen
  if (currentApp === 'login' || !currentUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // 2. Render Dashboard (new landing page)
  if (currentApp === 'dashboard') {
    return (
      <Suspense fallback={<PageLoading />}>
        <DashboardPage
          user={currentUser}
          onNavigate={handleLaunchApp}
          onLogout={handleLogout}
          onOpenDocuments={handleOpenDocumentsByStatus}
          onOpenDocument={handleOpenDocumentFromDashboard}
        />
      </Suspense>
    );
  }

  // 3. Render Landing Hub Screen (legacy)
  if (currentApp === 'hub') {
    return (
      <Suspense fallback={<PageLoading />}>
        <LandingHub
          user={currentUser}
          onLaunchApp={handleLaunchApp}
          onLogout={handleLogout}
        />
      </Suspense>
    );
  }

  // 4. Render Engineering Operations Suite Screen (Options 1-5 with Sidebar)
  if (currentApp === 'operations') {
    return (
      <Suspense fallback={<PageLoading />}>
        <OperationsLayout
          activeTab={activeOpsTab}
          onTabChange={setActiveOpsTab}
          user={currentUser}
          currentDocument={document}
          onBackToHub={() => setCurrentApp('dashboard')}
          onLaunchDocCraft={(_docId, doc) => {
            if (doc) {
              setDocument(doc);
              setActiveSectionId('metadata');
            }
            setCurrentApp('doccraft');
          }}
          onExportIncidentToRCA={handleExportIncidentToRCA}
          onLogout={handleLogout}
          onNavigate={handleLaunchApp}
        />
      </Suspense>
    );
  }

  // 5. Render Settings Page
  if (currentApp === 'settings') {
    return (
      <Suspense fallback={<PageLoading />}>
        <SettingsPage
          user={currentUser}
          onNavigate={handleLaunchApp}
          onLogout={handleLogout}
          onUpdateAvatar={handleUpdateAvatar}
        />
      </Suspense>
    );
  }

  if (currentApp === 'data-management') {
    // Requirement #8: database/data management is admin-only. The
    // sidebar already hides this link for non-admins; this guard
    // covers direct navigation too.
    if (!canAccessDataManagement(currentUser)) {
      return (
        <div className="flex h-screen bg-[var(--bg)] text-[var(--text)] font-sans overflow-hidden">
          <AppSidebar user={currentUser} activeView="dashboard" onNavigate={handleLaunchApp} onLogout={handleLogout} />
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <ShieldAlert className="w-8 h-8 text-[var(--amber)]" />
            <p className="text-sm text-[var(--text-dim)]">Data Management is restricted to admins.</p>
            <button
              type="button"
              onClick={() => handleLaunchApp('dashboard')}
              className="text-xs font-semibold text-[var(--blue)] hover:underline"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      );
    }
    return (
      <Suspense fallback={<PageLoading />}>
        <DataManagementPage
          user={currentUser}
          onNavigate={handleLaunchApp}
          onLogout={handleLogout}
        />
      </Suspense>
    );
  }

  // 5b. Render Coder (VS Code + Cline Agent embedded iframe)
  if (currentApp === 'coder') {
    return (
      <Suspense fallback={<PageLoading />}>
        <CoderView
          user={currentUser}
          onNavigate={handleLaunchApp}
          onLogout={handleLogout}
        />
      </Suspense>
    );
  }

  // 6. Render Documents List (landing point before opening a document)
  if (!activeDocumentId) {
    void documentListVersion;
    const userIsAdmin = isAdmin(currentUser);
    const visibleDocs = filterByStatus(visibleDocumentsFor(currentUser, listDocuments()), documentsStatusFilter);
    const scopeBase = userIsAdmin ? 'All documents' : 'Documents currently in progress';
    return (
      <>
        <DocumentsListPage
          user={currentUser}
          documents={visibleDocs}
          scopeLabel={documentsStatusFilter ? `${scopeBase} · ${documentsStatusFilter.replace('_', ' ').toLowerCase()} only` : scopeBase}
          onClearFilter={documentsStatusFilter ? () => setDocumentsStatusFilter(null) : undefined}
          onOpen={handleOpenDocument}
          onCreate={handleCreateDocument}
          onDelete={handleMoveDocumentToBin}
          onRestore={() => setDocumentListVersion((version) => version + 1)}
          onNavigate={handleLaunchApp}
          onLogout={handleLogout}
        />
        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-50 bg-[var(--panel-alt)] text-[var(--text)] px-4 py-2.5 flex items-center gap-2 text-xs font-semibold animate-fade-in border border-[var(--success)]">
            <CheckCircle className="w-4 h-4" />
            <span>{toastMessage}</span>
          </div>
        )}
      </>
    );
  }

  // 7. Render DocCraft Studio (Document Automation Workspace)
  return (
    <div className="flex h-screen bg-[var(--bg)] text-[var(--text)] font-sans overflow-hidden">
      {/* ── Shared App Sidebar ── */}
      <AppSidebar
        user={currentUser}
        compact
        activeView="doccraft"
        onNavigate={handleLaunchApp}
        onLogout={handleLogout}
      />

      {/* ── DocCraft content column ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[var(--bg)]">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[var(--panel-alt)] text-[var(--text)] px-4 py-2.5 flex items-center gap-2 text-xs font-semibold animate-fade-in border border-[var(--success)]">
          <CheckCircle className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* AI Rephrase Modal */}
      <AiRephraseModal
        isOpen={aiModalOpen}
        initialText={aiInitialText}
        onClose={() => setAiModalOpen(false)}
        onAccept={(rephrased) => {
          if (aiApplyCallback) {
            aiApplyCallback(rephrased);
          }
        }}
        onOpenSettings={() => {
          setAiModalOpen(false);
          setAiSettingsOpen(true);
        }}
      />

      {/* AI Settings Modal */}
      <AiSettingsModal
        isOpen={aiSettingsOpen}
        onClose={() => setAiSettingsOpen(false)}
      />

      {/* Main Top Navigation */}
      <HeaderNav
        document={document}
        user={currentUser}
        onUpdateMetadata={handleUpdateMetadata}
        onLoadTemplate={handleLoadTemplate}
        onUploadDocx={handleUploadDocx}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        onReset={handleResetSampleData}
        viewMode={viewMode}
        onToggleViewMode={setViewMode}
        onOpenAiSettings={() => setAiSettingsOpen(true)}
        onBackToHub={handleBackToDocumentsList}
        onLaunchOperations={() => setCurrentApp('operations')}
        onLogout={handleLogout}
      />
      {historyOpen && activeDocumentId && (
        <VersionHistoryModal
          documentId={activeDocumentId}
          canRestore={canEditActiveDocument()}
          onClose={() => setHistoryOpen(false)}
          onRestore={(snap) => {
            if (!canEditActiveDocument()) { showToast('Read-only: you can only edit documents you authored.'); return; }
            autosaverRef.current.flush();
            recordSnapshot(document, 'Before restore');
            setDocument(snap.doc);
            setHistoryOpen(false);
            showToast(`Restored version from ${new Date(snap.savedAt).toLocaleString()}.`);
          }}
        />
      )}
      {docBinOpen && (
        <DocBinModal
          onClose={() => setDocBinOpen(false)}
          onRestore={(restored) => {
            if (restored.metadata.id === activeDocumentId) setDocument(restored);
            showToast('Restored item from Doc Bin.');
          }}
        />
      )}

      {/* App Workspace Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Document Outline & Section Navigator */}
        {sidebarOpen && (
          <DocumentSidebar
            sections={document.sections}
            width={documentSidebarWidth}
            onResize={setDocumentSidebarWidth}
            activeSectionId={activeSectionId}
            onSelectSection={setActiveSectionId}
            onAddSection={handleAddSection}
            onReorderSections={handleReorderSections}
          />
        )}

        {/* Workspace Central Split Layout */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* View Split Switcher — persistent across Split/Editor/Preview modes */}
          <div className="flex items-center justify-end gap-2 px-3 py-1.5 border-b border-[var(--border)] bg-[var(--panel-alt)] shrink-0">
            <button
              type="button"
              onClick={() => { autosaverRef.current.flush(); setHistoryOpen(true); }}
              className="flex items-center gap-1.5 border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-dim)] hover:border-[var(--blue)] hover:text-[var(--blue)]"
              title="Restore an earlier saved version of this document"
            >
              <History className="h-3.5 w-3.5" /> History
            </button>
            <button
              type="button"
              onClick={() => { autosaverRef.current.flush(); setDocBinOpen(true); }}
              className="flex items-center gap-1.5 border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-dim)] hover:border-[var(--success)] hover:text-[var(--success)]"
              title="View deleted documents and sections"
            >
              <ArchiveRestore className="h-3.5 w-3.5" /> Doc Bin
            </button>
            <div className="flex items-center gap-1 bg-[var(--panel)] p-0.5 border border-[var(--border)]">
              <button
                type="button"
                onClick={() => setActiveTab('split')}
                className={`px-2 py-1 text-[11px] font-medium ${
                  activeTab === 'split' ? 'bg-[image:var(--signal-gradient)] text-[#07111d] font-semibold' : 'text-[var(--text-dim)] hover:text-[var(--success)]'
                }`}
              >
                Split
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('editor-only')}
                className={`px-2 py-1 text-[11px] font-medium ${
                  activeTab === 'editor-only' ? 'bg-[image:var(--signal-gradient)] text-[#07111d] font-semibold' : 'text-[var(--text-dim)] hover:text-[var(--success)]'
                }`}
              >
                Editor
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('preview-only')}
                className={`px-2 py-1 text-[11px] font-medium ${
                  activeTab === 'preview-only' ? 'bg-[image:var(--signal-gradient)] text-[#07111d] font-semibold' : 'text-[var(--text-dim)] hover:text-[var(--success)]'
                }`}
              >
                Preview
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Section Form Editor Column */}
          {showEditor && (
            <div className="flex-1 flex flex-col h-[calc(100vh-64px)] border-r border-[var(--border)] bg-[var(--panel)] overflow-hidden">
              {/* Editor Sub-Header */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--panel-alt)] border-b border-[var(--border)] text-xs">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    title={sidebarOpen ? 'Collapse Outline' : 'Expand Outline'}
                    className="p-1 text-[var(--text-dim)] hover:text-[var(--success)] hover:bg-[var(--panel)] transition-colors"
                  >
                    {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
                  </button>
                  <span className="font-semibold text-[var(--text)]">
                    {activeSectionId === 'metadata' ? 'Document Properties' : activeSection?.title || 'Section Editor'}
                  </span>
                </div>
              </div>

              {!canEditActiveDocument() && (
                <div className="px-4 py-2 bg-[#2a220b] border-b border-[var(--amber)] text-[11px] text-[var(--amber)] font-semibold flex items-center gap-2">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                  Read-only — authored by {document.metadata.author || 'another user'}. You can only edit documents you authored.
                </div>
              )}

              {/* Editor Body Area */}
              <div className={`flex-1 overflow-y-auto p-4 md:p-6 space-y-4 ${!canEditActiveDocument() ? 'pointer-events-none opacity-70 select-none' : ''}`}>
                {activeSectionId === 'metadata' ? (
                  <MetadataEditor
                    metadata={document.metadata}
                    onChange={handleUpdateMetadata}
                    onTriggerAi={handleTriggerAi}
                  />
                ) : activeSection ? (
                  <SectionEditorContainer
                    section={activeSection}
                    onUpdate={(updates) => handleUpdateSection(activeSection.id, updates)}
                    onDelete={() => handleDeleteSection(activeSection.id)}
                    onDuplicate={() => handleDuplicateSection(activeSection.id)}
                    onMoveUp={() => handleMoveSection(activeSection.id, 'up')}
                    onMoveDown={() => handleMoveSection(activeSection.id, 'down')}
                    onTriggerAi={handleTriggerAi}
                    isFirst={activeSectionIndex === 0}
                    isLast={activeSectionIndex === document.sections.length - 1}
                  />
                ) : (
                  <div className="p-8 text-center text-[var(--text-dim)]">
                    <p className="text-sm">Select a section from the outline to begin editing.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* High-Fidelity Live Document Preview Column */}
          {showPreview && (
            <DocumentPreview
              document={document}
              viewMode={viewMode}
              onUpdateTestCase={(sectionId, testCaseIndex, updates) => {
                const section = document.sections.find((item) => item.id === sectionId);
                if (!section?.testCases) return;
                const testCases = section.testCases.map((testCase, index) => (
                  index === testCaseIndex ? { ...testCase, ...updates } : testCase
                ));
                handleUpdateSection(sectionId, { testCases });
              }}
              onSelectSection={(id) => {
                setActiveSectionId(id);
                setActiveTab('split');
              }}
            />
          )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};
