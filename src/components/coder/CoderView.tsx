import React, { useState, useRef, useCallback } from 'react';
import {
  Code2,
  RefreshCw,
  ExternalLink,
  Upload,
  Bot,
  AlertCircle,
  Loader2,
  Settings2,
  Check,
  RotateCcw,
} from 'lucide-react';
import type { AppView, OperationsTab } from '../../types/appState';
import type { UserProfile } from '../../types/auth';
import { AppSidebar } from '../AppSidebar';

/* ─── Helper to resolve VS Code Server URL dynamically ─── */
export const getStoredVscodeUrl = (): string => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('devdoc_vscode_url');
    if (stored && stored.trim()) return stored.trim();
  }
  const envUrl = import.meta.env.VITE_VSCODE_URL;
  if (envUrl && envUrl.trim()) return envUrl.trim();
  const host = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
  return `http://${host}:8080`;
};

const ENVIRONMENT_LABEL = 'codercom/code-server (Claude 3.7 Sonnet)';

/* ─── Props ─── */
interface CoderViewProps {
  user: UserProfile;
  onNavigate: (app: AppView, opsTab?: OperationsTab) => void;
  onLogout: () => void;
}

/* ─── Component ─── */
export const CoderView: React.FC<CoderViewProps> = ({ user, onNavigate, onLogout }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [vscodeUrl, setVscodeUrl] = useState<string>(getStoredVscodeUrl);
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [inputUrl, setInputUrl] = useState(vscodeUrl);

  const [iframeKey, setIframeKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const handleReload = useCallback(() => {
    setIsLoading(true);
    setHasError(false);
    setIframeKey(k => k + 1);
  }, []);

  const handlePopout = useCallback(() => {
    window.open(vscodeUrl, '_blank', 'noopener,noreferrer');
  }, [vscodeUrl]);

  const handleImportXml = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleXmlFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    alert(`Execution XML "${file.name}" selected.\nIntegrate with your Robot Framework runner or CI pipeline to process this file.`);
    e.target.value = '';
  }, []);

  const handleSaveUrl = (e: React.FormEvent) => {
    e.preventDefault();
    let formatted = inputUrl.trim();
    if (formatted && !formatted.startsWith('http://') && !formatted.startsWith('https://')) {
      formatted = `http://${formatted}`;
    }
    if (!formatted) return;
    setVscodeUrl(formatted);
    localStorage.setItem('devdoc_vscode_url', formatted);
    setIsEditingUrl(false);
    setIsLoading(true);
    setHasError(false);
    setIframeKey(k => k + 1);
  };

  const handleResetDefaultUrl = () => {
    const host = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
    const defaultUrl = `http://${host}:8080`;
    setInputUrl(defaultUrl);
    setVscodeUrl(defaultUrl);
    localStorage.removeItem('devdoc_vscode_url');
    setIsEditingUrl(false);
    setIsLoading(true);
    setHasError(false);
    setIframeKey(k => k + 1);
  };

  const handleIframeLoad = useCallback(() => {
    setIsLoading(false);
    setHasError(false);
  }, []);

  const handleIframeError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
  }, []);

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      <AppSidebar
        user={user}
        activeView="coder"
        onNavigate={onNavigate}
        onLogout={onLogout}
      />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* ── Top Header Bar ── */}
        <header className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-white border-b border-slate-200 shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center">
                <Code2 className="w-4 h-4 text-blue-600" />
              </div>
              <span className="text-sm font-bold text-slate-900 whitespace-nowrap">VS Code + Cline Agent</span>
            </div>

            {/* Configurable Server URL bar */}
            {isEditingUrl ? (
              <form onSubmit={handleSaveUrl} className="flex items-center gap-1.5 bg-slate-50 border border-blue-300 rounded-lg px-2 py-1">
                <input
                  type="text"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="http://localhost:8080"
                  className="text-xs font-mono text-slate-900 bg-white border border-slate-300 rounded px-2 py-0.5 w-60 focus:outline-none focus:border-blue-500 shadow-2xs"
                  autoFocus
                />
                <button
                  type="submit"
                  className="p-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs transition-colors"
                  title="Save Server URL"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleResetDefaultUrl}
                  className="p-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs transition-colors"
                  title="Reset to default hostname"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setInputUrl(vscodeUrl);
                  setIsEditingUrl(true);
                }}
                className="flex items-center gap-1.5 text-xs font-mono text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 hover:border-slate-300 px-2.5 py-1 rounded-lg transition-all"
                title="Click to configure VS Code server URL"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="font-semibold truncate max-w-[200px]">{vscodeUrl}</span>
                <Settings2 className="w-3 h-3 text-slate-400" />
              </button>
            )}

            <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-emerald-700 whitespace-nowrap min-w-0 overflow-hidden">
              <Bot className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Environment: {ENVIRONMENT_LABEL}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleImportXml}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition-all shadow-xs"
              title="Import Robot Framework / CI Execution XML"
            >
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Import Execution XML</span>
            </button>
            <button
              type="button"
              onClick={handleReload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-all shadow-xs"
              title="Reload VS Code View"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Reload View</span>
            </button>
            <button
              type="button"
              onClick={handlePopout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-all shadow-xs"
              title="Open VS Code in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Popout Window</span>
            </button>
          </div>
        </header>

        {/* ── VS Code iframe area ── */}
        <div className="flex-1 relative overflow-hidden bg-slate-100">
          {/* Loading overlay */}
          {isLoading && !hasError && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-50/90 backdrop-blur-xs gap-4">
              <div className="flex items-center gap-3 text-slate-700">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                <span className="text-sm font-medium">Connecting to VS Code server…</span>
              </div>
              <p className="text-[11px] text-slate-500 flex items-center gap-2">
                <span>Connecting to:</span>
                <code className="text-[var(--blue)] bg-white border border-slate-200 px-1.5 py-0.5 rounded font-mono">{vscodeUrl}</code>
              </p>
            </div>
          )}

          {/* Error state */}
          {hasError && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-50 gap-4 p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center">
                <AlertCircle className="w-7 h-7 text-rose-600" />
              </div>
              <div>
                <p className="text-base font-bold text-slate-900">Cannot reach VS Code server</p>
                <p className="text-sm text-slate-600 mt-1 max-w-md">
                  The code-server instance at{' '}
                  <code className="text-[var(--blue)] bg-white border border-slate-200 px-1.5 py-0.5 rounded font-mono">{vscodeUrl}</code>{' '}
                  is not reachable. Ensure the code-server process or Docker container is running.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setInputUrl(vscodeUrl);
                    setIsEditingUrl(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold transition-colors shadow-xs"
                >
                  <Settings2 className="w-4 h-4" />
                  Change Server URL
                </button>
                <button
                  type="button"
                  onClick={handleReload}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors shadow-xs"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try Again
                </button>
              </div>
            </div>
          )}

          {/* The iframe — fills the full main area */}
          <iframe
            key={iframeKey}
            ref={iframeRef}
            src={vscodeUrl}
            title="VS Code + Cline Agent"
            className="w-full h-full border-0"
            allow="clipboard-read; clipboard-write; microphone; camera"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
            onLoad={handleIframeLoad}
            onError={handleIframeError}
          />
        </div>
      </div>

      {/* Hidden file input for XML import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xml"
        className="hidden"
        onChange={handleXmlFileChange}
      />
    </div>
  );
};
