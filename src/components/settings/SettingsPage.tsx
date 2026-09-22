import React, { useState } from 'react';
import {
  User,
  Bot,
  Key,
  Cpu,
  Globe,
  ShieldCheck,
  Check,
  Bell,
  Palette,
  Database,
  Trash2,
  Download,
  Save,
  ChevronRight,
  Info,
  Upload,
} from 'lucide-react';
import type { AppView, OperationsTab } from '../../types/appState';
import type { UserProfile } from '../../types/auth';
import { AppSidebar } from '../AppSidebar';
import {
  getStoredAiConfig,
  saveStoredAiConfig,
  type AiConfig,
  type AiProvider,
} from '../../services/aiService';

/* ─── Props ─── */
interface SettingsPageProps {
  user: UserProfile;
  onNavigate: (app: AppView, opsTab?: OperationsTab) => void;
  onLogout: () => void;
  onUpdateAvatar: (avatarUrl?: string) => void;
}

/* ─── Section tab definition ─── */
type SettingsTab = 'profile' | 'ai' | 'notifications' | 'appearance' | 'data';

const TABS: { id: SettingsTab; label: string; icon: React.ElementType; desc: string }[] = [
  { id: 'profile',       label: 'Profile',        icon: User,     desc: 'Account info & session' },
  { id: 'ai',            label: 'AI Assistant',   icon: Bot,      desc: 'Provider, keys & model' },
  { id: 'notifications', label: 'Notifications',  icon: Bell,     desc: 'Alerts & toasts' },
  { id: 'appearance',    label: 'Appearance',     icon: Palette,  desc: 'Theme & layout' },
  { id: 'data',          label: 'Data & Storage', icon: Database, desc: 'Export & clear cache' },
];

const ROLE_LABELS: Record<string, string> = {
  admin:             'Software Engineering Manager / Admin',
  'firmware-lead':   'Team Lead - SW Engineering',
  'release-manager': 'Technical Lead - SW Engineering',
  'qa-director':     'QA & Security Testing Lead',
};

/* ─── Small reusable sub-components ─── */
function SectionHeader({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) {
  return (
    <div className="flex items-center gap-3 pb-3 border-b border-[#28395a]">
      <div className="w-9 h-9 border border-[#28395a] bg-[#16223a] flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-[#3ec7ff]" />
      </div>
      <div>
        <h2 className="text-base font-bold text-[#eef3ff] leading-tight">{title}</h2>
        <p className="text-[11px] text-[#96a8c9]">{desc}</p>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="ui-label">{children}</p>;
}

function FieldRow({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="ui-label flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 text-[#3ec7ff]" />
        {label}
      </label>
      {children}
    </div>
  );
}

function ToggleRow({ label, desc, defaultChecked }: { label: string; desc: string; defaultChecked?: boolean }) {
  const [on, setOn] = useState(defaultChecked ?? false);
  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <div>
        <div className="text-xs font-semibold text-slate-900">{label}</div>
        <div className="text-[11px] text-slate-500 mt-0.5">{desc}</div>
      </div>
      <button
        type="button"
        onClick={() => setOn(!on)}
        className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${on ? 'bg-blue-600' : 'bg-slate-300'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-xs transition-transform ${on ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}

function InfoBanner({ text }: { text: string }) {
  return (
    <div className="ui-panel flex items-start gap-2.5 p-3.5 text-[11px] font-semibold text-[#eef3ff]">
      <Info className="w-4 h-4 text-[#3ec7ff] shrink-0 mt-0.5" />
      <span>{text}</span>
    </div>
  );
}

/* ─── Main Component ─── */
export const SettingsPage: React.FC<SettingsPageProps> = ({ user, onNavigate, onLogout, onUpdateAvatar }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [aiConfig, setAiConfig] = useState<AiConfig>(getStoredAiConfig());
  const [aiSaved, setAiSaved] = useState(false);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  const handleAvatarUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('Profile images must be smaller than 10 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => onUpdateAvatar(reader.result as string);
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleSaveAi = () => {
    saveStoredAiConfig(aiConfig);
    setAiSaved(true);
    setTimeout(() => setAiSaved(false), 2000);
  };

  const handleClearLocalStorage = () => {
    if (window.confirm('This will clear all local app data (AI config, documents, session). You will be logged out. Continue?')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  const handleExportData = () => {
    const data: Record<string, unknown> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      try { data[k] = JSON.parse(localStorage.getItem(k)!); }
      catch { data[k] = localStorage.getItem(k); }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `devdoc-studio-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      <AppSidebar user={user} activeView="settings" onNavigate={onNavigate} onLogout={onLogout} />

      <div className="flex-1 flex overflow-hidden">
        {/* Settings Sub-Tab Panel */}
        <aside className="w-60 bg-white border-r border-slate-200 flex flex-col shrink-0 select-none shadow-xs">
          <div className="px-4 py-4 border-b border-slate-200">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Settings</p>
          </div>
          <nav className="p-3 space-y-0.5 flex-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all group border ${
                    active ? 'bg-[#16223a] border-[#3ec7ff] text-[#eef3ff] font-bold' : 'text-[#96a8c9] hover:text-[#eef3ff] hover:bg-[#16223a] border-transparent'
                  }`}>
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#3ec7ff]' : 'group-hover:text-[#3ec7ff] text-[#96a8c9]'}`} />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{tab.label}</div>
                    <div className="text-[10px] text-slate-400 truncate">{tab.desc}</div>
                  </div>
                  {!active && <ChevronRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-50 shrink-0 text-slate-400" />}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Settings Content */}
        <main className="flex-1 overflow-y-auto p-8 bg-slate-50">
          <div className="max-w-2xl mx-auto space-y-8">

            {/* PROFILE */}
            {activeTab === 'profile' && (
              <section className="space-y-6">
                <SectionHeader icon={User} title="Profile" desc="Your account information from the active session." />
                <div className="ui-panel p-6 flex items-center gap-5">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={`${user.name} profile`} className="w-16 h-16 rounded-2xl object-cover shadow-md shrink-0" />
                  ) : (
                    <div className={`w-16 h-16 rounded-2xl bg-gradient-to-tr ${user.avatarBg} flex items-center justify-center text-xl font-black text-white shadow-md shrink-0`}>
                      {user.initials}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-lg font-extrabold text-slate-900 leading-tight">{user.name}</div>
                    <div className="text-sm text-slate-500 mt-0.5">{user.email}</div>
                    <div className="mt-2 inline-flex items-center px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold">
                      {ROLE_LABELS[user.role] ?? user.role}
                    </div>
                  </div>
                  <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleAvatarUpload} className="hidden" />
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <button type="button" onClick={() => avatarInputRef.current?.click()} className="ui-button">
                      <Upload className="w-3.5 h-3.5" />
                      {user.avatarUrl ? 'Change image' : 'Import image'}
                    </button>
                    {user.avatarUrl && (
                      <button type="button" onClick={() => onUpdateAvatar(undefined)} className="ui-button ui-button-danger">
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove image
                      </button>
                    )}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden shadow-xs">
                  {[
                    { label: 'Full Name',  value: user.name },
                    { label: 'Email',      value: user.email },
                    { label: 'Title',      value: user.title },
                    { label: 'Department', value: user.department },
                    { label: 'Role',       value: ROLE_LABELS[user.role] ?? user.role },
                    { label: 'User ID',    value: user.id },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between px-5 py-3.5">
                      <span className="text-xs font-semibold text-slate-500 w-32 shrink-0">{row.label}</span>
                      <span className="text-xs text-slate-900 font-mono text-right truncate">{row.value}</span>
                    </div>
                  ))}
                </div>
                <InfoBanner text="Profile data is read-only from your active session. Log out to switch accounts." />
              </section>
            )}

            {/* AI ASSISTANT */}
            {activeTab === 'ai' && (
              <section className="space-y-6">
                <SectionHeader icon={Bot} title="AI Writing Assistant" desc="Configure which AI provider powers rephrasing and document generation." />

                {/* Provider picker */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
                  <Label>Provider</Label>
                  <div className="grid grid-cols-2 gap-2.5">
                    {([
                      { id: 'builtin', name: 'Smart Built-in', desc: 'Offline · Zero setup' },
                      { id: 'gemini',  name: 'Google Gemini',  desc: 'Gemini 1.5 Flash / Pro' },
                      { id: 'openai',  name: 'OpenAI',         desc: 'GPT-4o / GPT-4o-mini' },
                      { id: 'ollama',  name: 'Local Ollama',   desc: 'Private local models' },
                    ] as { id: AiProvider; name: string; desc: string }[]).map((prov) => (
                      <button key={prov.id} type="button"
                        onClick={() => setAiConfig(prev => ({ ...prev, provider: prov.id }))}
                        className={`relative p-3 rounded-xl border text-left transition-all ${
                          aiConfig.provider === prov.id
                            ? 'bg-[var(--panel-alt)] border-[var(--success)] shadow-[0_0_0_1px_var(--success)]'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900'
                        }`}>
                        {aiConfig.provider === prov.id && (
                          <Check className="w-3.5 h-3.5 text-[var(--success)] absolute top-2.5 right-2.5" />
                        )}
                        <div className={`text-xs font-bold pr-4 ${aiConfig.provider === prov.id ? 'text-[var(--success)]' : 'text-slate-900'}`}>{prov.name}</div>
                        <div className={`text-[10px] mt-0.5 ${aiConfig.provider === prov.id ? 'text-[var(--text-dim)]' : 'text-slate-500'}`}>{prov.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Gemini */}
                {aiConfig.provider === 'gemini' && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
                    <Label>Google Gemini Settings</Label>
                    <FieldRow icon={Key} label="API Key">
                      <input type="password" value={aiConfig.apiKey ?? ''} placeholder="AIza..."
                        onChange={(e) => setAiConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 font-mono shadow-xs" />
                    </FieldRow>
                    <FieldRow icon={Cpu} label="Model">
                      <select value={aiConfig.model ?? 'gemini-1.5-flash'}
                        onChange={(e) => setAiConfig(prev => ({ ...prev, model: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs">
                        <option value="gemini-1.5-flash">gemini-1.5-flash (Fast)</option>
                        <option value="gemini-1.5-pro">gemini-1.5-pro (Most capable)</option>
                        <option value="gemini-2.0-flash">gemini-2.0-flash (Latest)</option>
                      </select>
                    </FieldRow>
                  </div>
                )}

                {/* OpenAI */}
                {aiConfig.provider === 'openai' && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
                    <Label>OpenAI Settings</Label>
                    <FieldRow icon={Key} label="API Key">
                      <input type="password" value={aiConfig.apiKey ?? ''} placeholder="sk-..."
                        onChange={(e) => setAiConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 font-mono shadow-xs" />
                    </FieldRow>
                    <FieldRow icon={Cpu} label="Model">
                      <select value={aiConfig.model ?? 'gpt-4o-mini'}
                        onChange={(e) => setAiConfig(prev => ({ ...prev, model: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs">
                        <option value="gpt-4o-mini">gpt-4o-mini (Fast & economical)</option>
                        <option value="gpt-4o">gpt-4o (Most intelligent)</option>
                      </select>
                    </FieldRow>
                  </div>
                )}

                {/* Ollama */}
                {aiConfig.provider === 'ollama' && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
                    <Label>Local Ollama Settings</Label>
                    <FieldRow icon={Globe} label="Base URL">
                      <input type="text" value={aiConfig.baseUrl ?? 'http://localhost:11434'}
                        onChange={(e) => setAiConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 font-mono shadow-xs" />
                    </FieldRow>
                    <FieldRow icon={Cpu} label="Model Name">
                      <input type="text" value={aiConfig.model ?? 'llama3'} placeholder="llama3 or qwen2.5-coder"
                        onChange={(e) => setAiConfig(prev => ({ ...prev, model: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 font-mono shadow-xs" />
                    </FieldRow>
                  </div>
                )}

                <div className="flex items-start gap-2.5 text-[11px] text-slate-600 bg-emerald-50 p-3.5 rounded-xl border border-emerald-200">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>API keys are stored exclusively in your browser's <span className="text-slate-900 font-semibold">local storage</span> and are never sent to third-party servers.</span>
                </div>

                <div className="flex justify-end">
                  <button type="button" onClick={handleSaveAi}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors">
                    {aiSaved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                    {aiSaved ? 'Saved!' : 'Save AI Settings'}
                  </button>
                </div>
              </section>
            )}

            {/* NOTIFICATIONS */}
            {activeTab === 'notifications' && (
              <section className="space-y-6">
                <SectionHeader icon={Bell} title="Notifications" desc="Control in-app alerts and toast messages." />
                <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden shadow-xs">
                  <ToggleRow label="Document save toasts"      desc="Show confirmation when a document is saved." defaultChecked />
                  <ToggleRow label="AI rephrase success toast" desc="Notify when an AI operation completes." defaultChecked />
                  <ToggleRow label="Export completion toast"   desc="Show toast after export to Word/JSON." defaultChecked />
                  <ToggleRow label="Login / logout alerts"     desc="Show session start and end notifications." defaultChecked />
                </div>
                <InfoBanner text="Notification preferences are stored locally in your browser and apply to this session only." />
              </section>
            )}

            {/* APPEARANCE */}
            {activeTab === 'appearance' && (
              <section className="space-y-6">
                <SectionHeader icon={Palette} title="Appearance" desc="Customize the platform look and feel." />
                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-5 shadow-xs">
                  <div className="space-y-2">
                    <Label>Theme</Label>
                    <div className="grid grid-cols-3 gap-2.5">
                      {[
                        { id: 'light',  label: 'Light', bg: 'bg-slate-100', active: true },
                        { id: 'dark',   label: 'Dark',  bg: 'bg-slate-900', active: false },
                        { id: 'abyss',  label: 'Abyss', bg: 'bg-black',     active: false },
                      ].map((t) => (
                        <button key={t.id} type="button" disabled={!t.active}
                          className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-xs font-semibold transition-all ${
                            t.active ? 'bg-blue-50 border-blue-300 text-blue-900 shadow-xs' : 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                          }`}>
                          <div className={`w-full h-8 rounded-lg ${t.bg} border border-slate-200`} />
                          {t.label}
                          {!t.active && <span className="text-[10px] text-slate-400 font-normal">Coming soon</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <InfoBanner text="Light theme is enabled application-wide." />
              </section>
            )}

            {/* DATA & STORAGE */}
            {activeTab === 'data' && (
              <section className="space-y-6">
                <SectionHeader icon={Database} title="Data & Storage" desc="Manage locally stored app data, export a backup, or reset the workspace." />

                {/* VS Code Server URL setting */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <Label>VS Code + Cline Server URL</Label>
                    <span className="text-[10px] font-mono text-slate-400">Key: devdoc_vscode_url</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Configure the address of your embedded code-server container or local VS Code web service.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      defaultValue={localStorage.getItem('devdoc_vscode_url') || `http://${window.location.hostname || 'localhost'}:8080`}
                      onChange={(e) => {
                        const val = e.target.value.trim();
                        if (val) {
                          localStorage.setItem('devdoc_vscode_url', val);
                        } else {
                          localStorage.removeItem('devdoc_vscode_url');
                        }
                      }}
                      placeholder="http://localhost:8080"
                      className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-blue-500 shadow-xs"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        localStorage.removeItem('devdoc_vscode_url');
                        window.location.reload();
                      }}
                      className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold shadow-2xs transition-colors"
                    >
                      Reset Default
                    </button>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden shadow-xs">
                  {/* Export */}
                  <div className="flex items-center justify-between px-5 py-4">
                    <div>
                      <div className="text-xs font-bold text-slate-900">Export All Local Data</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Download a JSON backup of all locally stored data.</div>
                    </div>
                    <button type="button" onClick={handleExportData}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-colors shrink-0 shadow-2xs">
                      <Download className="w-3.5 h-3.5" />Export
                    </button>
                  </div>
                  {/* Clear */}
                  <div className="flex items-center justify-between px-5 py-4">
                    <div>
                      <div className="text-xs font-bold text-rose-600">Clear All Local Data</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Wipes all stored documents, settings, and session. You will be logged out.</div>
                    </div>
                    <button type="button" onClick={handleClearLocalStorage}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-semibold transition-colors shrink-0 shadow-2xs">
                      <Trash2 className="w-3.5 h-3.5" />Clear
                    </button>
                  </div>
                </div>

                {/* Storage key browser */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-xs">
                  <Label>Local Storage Keys</Label>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).map((key) => {
                      const raw = localStorage.getItem(key) ?? '';
                      const bytes = new Blob([raw]).size;
                      return (
                        <div key={key} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-slate-50 border border-slate-200">
                          <span className="text-[11px] font-mono text-slate-800 truncate max-w-[70%]">{key}</span>
                          <span className="text-[10px] text-slate-500 font-mono shrink-0">
                            {bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`}
                          </span>
                        </div>
                      );
                    })}
                    {localStorage.length === 0 && (
                      <p className="text-xs text-slate-500 text-center py-4">No local storage data found.</p>
                    )}
                  </div>
                </div>
              </section>
            )}

          </div>
        </main>
      </div>
    </div>
  );
};
