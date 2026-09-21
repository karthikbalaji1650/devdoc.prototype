import React, { useState } from 'react';
import { 
  FileText, 
  Lock, 
  Mail, 
  ArrowRight, 
  Sparkles, 
  ShieldCheck, 
  Layers, 
  Container
} from 'lucide-react';
import { DEMO_USERS, type UserProfile } from '../../types/auth';

interface LoginPageProps {
  onLogin: (profile: UserProfile) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('mani.thangavel@sanmina.com');
  const [password, setPassword] = useState('••••••••••••');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      const user = DEMO_USERS.find(u => u.email.toLowerCase() === email.toLowerCase()) || DEMO_USERS[0];
      onLogin(user);
      setIsLoading(false);
    }, 400);
  };

  const handleQuickLogin = (user: UserProfile) => {
    setIsLoading(true);
    setTimeout(() => {
      onLogin(user);
      setIsLoading(false);
    }, 200);
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col justify-between relative overflow-hidden font-sans">

      <div className="px-6 md:px-12 py-5 flex items-center justify-between z-10 border-b border-[var(--border)] bg-[var(--panel)]">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="DevDoc Studio Logo" className="w-10 h-10 object-contain shrink-0 border border-[var(--border)] bg-[var(--panel-alt)] p-1" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-[0.12em] text-[var(--text)] uppercase font-mono">
                DocCraft
              </span>
              <span className="text-[9px] uppercase font-bold tracking-[0.14em] px-2 py-0.5 border border-[var(--success)] bg-[var(--panel-alt)] text-[var(--success)] font-mono">
                Enterprise Suite
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-dim)] font-medium uppercase tracking-[0.1em] font-mono">
              Platform Engineering & Release Operations Hub
            </p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 text-xs text-[var(--text-dim)] font-mono uppercase tracking-[0.12em]">
          <span className="w-2 h-2 bg-[var(--success)]" />
          <span>3 Services Healthy</span>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 md:p-8 z-10">
        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-6 space-y-6 text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 border border-[var(--border)] bg-[var(--panel)] text-[10px] uppercase tracking-[0.12em] text-[var(--success)] font-mono">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Unified Engineering Portal v2.5</span>
            </div>

            <h1 className="text-3xl md:text-4xl font-bold text-[var(--text)] tracking-tight leading-tight">
              Single Sign-On for <br />
              <span className="signal-text">Firmware, QA & Releases</span>
            </h1>

            <p className="text-sm text-[var(--text-dim)] leading-relaxed">
              Eliminate manual Word/Docs formatting, synchronize JIRA releases, track root-cause incidents, and coordinate peer reviews in one integrated workspace.
            </p>

            <div className="space-y-2.5 pt-2">
              <div className="flex items-center gap-3 p-2.5 border border-[var(--border)] bg-[var(--panel)] text-xs text-[var(--text)]">
                <div className="p-1.5 border border-[var(--border)] bg-[var(--bg)] text-[var(--success)]">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <strong className="text-[var(--text)] block">DocCraft Studio Document Automation</strong>
                  <span className="text-[11px] text-[var(--text-dim)]">Auto-generate Word `.docx`, Google Docs & Excel test reports</span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2.5 border border-[var(--border)] bg-[var(--panel)] text-xs text-[var(--text)]">
                <div className="p-1.5 border border-[var(--border)] bg-[var(--bg)] text-[var(--purple)]">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <strong className="text-[var(--text)] block">Engineering Operations & JIRA Release Hub</strong>
                  <span className="text-[11px] text-[var(--text-dim)]">Incident trackers, JIRA live sync, reviewer logs, and gantt charts</span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2.5 border border-[var(--border)] bg-[var(--panel)] text-xs text-[var(--text)]">
                <div className="p-1.5 border border-[var(--border)] bg-[var(--bg)] text-[var(--amber)]">
                  <Container className="w-4 h-4" />
                </div>
                <div>
                  <strong className="text-[var(--text)] block">Dockerized Microservices Architecture</strong>
                  <span className="text-[11px] text-[var(--text-dim)]">Independent containerized apps with seamless cross-launching</span>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 bg-[var(--panel)] border border-[var(--border)] p-6 md:p-8 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-[var(--text)]">Developer Sign In</h2>
              <p className="text-xs text-[var(--text-dim)] mt-0.5 font-mono uppercase tracking-[0.12em]">Enterprise credentials or quick demo login</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5 text-left">
                <label className="text-[10px] font-semibold text-[var(--text-dim)] flex items-center gap-1.5 font-mono uppercase tracking-[0.12em]">
                  <Mail className="w-3.5 h-3.5 text-[var(--success)]" />
                  <span>Corporate Email</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="engineer@sanmina.com"
                  className="w-full bg-[var(--bg)] border border-[var(--border)] px-3.5 py-2.5 text-xs text-[var(--text)] placeholder-[var(--text-faint)] focus:outline-none focus:border-[var(--success)]"
                />
              </div>

              <div className="space-y-1.5 text-left">
                <label className="text-[10px] font-semibold text-[var(--text-dim)] flex items-center gap-1.5 font-mono uppercase tracking-[0.12em]">
                  <Lock className="w-3.5 h-3.5 text-[var(--success)]" />
                  <span>Password</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••••••"
                  className="w-full bg-[var(--bg)] border border-[var(--border)] px-3.5 py-2.5 text-xs text-[var(--text)] placeholder-[var(--text-faint)] focus:outline-none focus:border-[var(--success)] font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 border border-[var(--success)] bg-[var(--signal-gradient)] text-[#07111d] text-[10px] font-semibold flex items-center justify-center gap-2 font-mono uppercase tracking-[0.12em] disabled:opacity-50"
              >
                <span>{isLoading ? 'Authenticating...' : 'Sign In to Platform'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="relative flex items-center justify-center">
              <div className="border-t border-[var(--border)] w-full" />
              <span className="bg-[var(--panel)] px-3 text-[10px] text-[var(--text-dim)] uppercase tracking-[0.12em] font-semibold absolute font-mono">
                Or 1-Click Quick Demo Login
              </span>
            </div>

            <div className="space-y-2 text-left">
              {DEMO_USERS.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => handleQuickLogin(user)}
                  className="w-full p-2.5 border border-[var(--border)] bg-[var(--bg)] transition-all flex items-center justify-between group hover:bg-[var(--panel-alt)]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 border border-[var(--border)] bg-[var(--panel)] flex items-center justify-center text-xs font-bold text-[var(--text)] font-mono">
                      {user.initials}
                    </div>
                    <div>
                      <div className="font-semibold text-xs text-[var(--text)] group-hover:text-[var(--success)] transition-colors">
                        {user.name}
                      </div>
                      <div className="text-[10px] text-[var(--text-dim)] font-mono uppercase tracking-[0.08em]">
                        {user.title} • {user.department}
                      </div>
                    </div>
                  </div>

                  <span className="text-[10px] font-semibold text-[var(--success)] flex items-center gap-1 font-mono uppercase tracking-[0.12em]">
                    <span>Login</span>
                    <ArrowRight className="w-3 h-3" />
                  </span>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-center gap-2 text-[11px] text-[var(--text-dim)] font-mono uppercase tracking-[0.1em]">
              <ShieldCheck className="w-3.5 h-3.5 text-[var(--success)]" />
              <span>TLS 1.3 End-to-End Encryption</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 text-center text-xs text-[var(--text-faint)] border-t border-[var(--border)] bg-[var(--panel)] z-10">
        DocCraft Studio & Engineering Operations Suite • Multi-Container Cloud Architecture
      </div>
    </div>
  );
};
