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
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between relative overflow-hidden font-sans">
      {/* Background Ambient Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-400/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-indigo-400/15 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-[40%] right-[30%] w-[350px] h-[350px] bg-cyan-400/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Top Brand Bar */}
      <div className="px-6 md:px-12 py-5 flex items-center justify-between z-10 border-b border-slate-200 bg-white/80 backdrop-blur-xs">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="DevDoc Studio Logo" className="w-10 h-10 object-contain shrink-0 rounded-xl shadow-xs" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base tracking-tight text-slate-900">
                DocCraft Studio
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                Enterprise Suite
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">
              Platform Engineering & Release Operations Hub
            </p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 text-xs text-slate-600">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Container Cluster: <strong className="text-emerald-700 font-mono">3 Services Healthy</strong></span>
        </div>
      </div>

      {/* Center Main Login Section */}
      <div className="flex-1 flex items-center justify-center p-4 md:p-8 z-10">
        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* Left Column: Value Proposition & Architecture Badges */}
          <div className="lg:col-span-6 space-y-6 text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-700">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Unified Engineering Portal v2.5</span>
            </div>

            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
              Single Sign-On for <br />
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 bg-clip-text text-transparent">
                Firmware, QA & Releases
              </span>
            </h1>

            <p className="text-sm text-slate-600 leading-relaxed">
              Eliminate manual Word/Docs formatting, synchronize JIRA releases, track root-cause incidents, and coordinate peer reviews in one integrated workspace.
            </p>

            {/* Feature Pills */}
            <div className="space-y-2.5 pt-2">
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs text-xs text-slate-700">
                <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <strong className="text-slate-900 block">DocCraft Studio Document Automation</strong>
                  <span className="text-[11px] text-slate-500">Auto-generate Word `.docx`, Google Docs & Excel test reports</span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs text-xs text-slate-700">
                <div className="p-1.5 rounded-lg bg-purple-50 text-purple-600">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <strong className="text-slate-900 block">Engineering Operations & JIRA Release Hub</strong>
                  <span className="text-[11px] text-slate-500">Incident trackers, JIRA live sync, Reviewer logs, and Gantt charts</span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs text-xs text-slate-700">
                <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                  <Container className="w-4 h-4" />
                </div>
                <div>
                  <strong className="text-slate-900 block">Dockerized Microservices Architecture</strong>
                  <span className="text-[11px] text-slate-500">Independent containerized apps with seamless cross-launching</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Sign In Card & 1-Click Persona Logins */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-xl shadow-slate-200/50 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Developer Sign In</h2>
              <p className="text-xs text-slate-500 mt-0.5">Enter your enterprise credentials or use 1-click demo personas</p>
            </div>

            {/* Custom Login Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5 text-left">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-blue-600" />
                  <span>Corporate Email</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="engineer@sanmina.com"
                  className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none transition-colors shadow-xs"
                />
              </div>

              <div className="space-y-1.5 text-left">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-blue-600" />
                  <span>Password</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••••••"
                  className="w-full bg-white border border-slate-300 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none transition-colors font-mono shadow-xs"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 transition-colors"
              >
                <span>{isLoading ? 'Authenticating...' : 'Sign In to Platform'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="relative flex items-center justify-center">
              <div className="border-t border-slate-200 w-full" />
              <span className="bg-white px-3 text-[11px] text-slate-400 uppercase tracking-wider font-semibold absolute">
                Or 1-Click Quick Demo Login
              </span>
            </div>

            {/* Quick Demo Persona Logins */}
            <div className="space-y-2 text-left">
              {DEMO_USERS.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => handleQuickLogin(user)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-all flex items-center justify-between group shadow-2xs"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-tr ${user.avatarBg} flex items-center justify-center text-xs font-bold text-white shadow-xs`}>
                      {user.initials}
                    </div>
                    <div>
                      <div className="font-semibold text-xs text-slate-800 group-hover:text-blue-600 transition-colors">
                        {user.name}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {user.title} • <span className="text-slate-400">{user.department}</span>
                      </div>
                    </div>
                  </div>

                  <span className="text-[10px] font-semibold text-blue-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                    <span>Login</span>
                    <ArrowRight className="w-3 h-3" />
                  </span>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>TLS 1.3 End-to-End Enterprise Encryption</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 text-center text-xs text-slate-500 border-t border-slate-200 bg-white/60 z-10">
        DocCraft Studio & Engineering Operations Suite • Multi-Container Cloud Architecture
      </div>
    </div>
  );
};
