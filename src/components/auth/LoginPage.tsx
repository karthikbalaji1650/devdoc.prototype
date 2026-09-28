import React, { useState } from 'react';
import { ArrowRight, Lock, Mail } from 'lucide-react';
import { DEMO_USERS, type UserProfile } from '../../types/auth';
import { isBackendConfigured, loginWithBackend } from '../../services/backendAuthService';

interface LoginPageProps {
  onLogin: (profile: UserProfile) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('mani.thangavel@sanmina.com');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const backendMode = isBackendConfigured();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsLoading(true);

    // With an API configured (server/), the password is actually
    // checked there. Without one, this stays the browser-only demo:
    // any password signs in as whichever DEMO_USERS profile matches
    // the email.
    if (backendMode) {
      try {
        const user = await loginWithBackend(email.trim(), password);
        onLogin(user);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invalid email or password. Check your credentials and try again.');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    setTimeout(() => {
      const user = DEMO_USERS.find((profile) => profile.email.toLowerCase() === email.trim().toLowerCase());
      if (!user) {
        setError('Invalid email or password. Check your credentials and try again.');
        setIsLoading(false);
        return;
      }

      onLogin(user);
      setIsLoading(false);
    }, 400);
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col justify-between relative overflow-hidden font-sans">
      <header className="px-6 md:px-12 py-5 flex items-center justify-between z-10 border-b border-[var(--border)] bg-[var(--panel)]">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="DevDoc Studio Logo" className="w-10 h-10 object-contain shrink-0 border border-[var(--border)] bg-[var(--panel-alt)] p-1" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-[0.12em] text-[var(--text)] uppercase font-mono">DocCraft</span>
              <span className="text-[9px] uppercase font-bold tracking-[0.14em] px-2 py-0.5 border border-[var(--success)] bg-[var(--panel-alt)] text-[var(--success)] font-mono">Enterprise Suite</span>
            </div>
            <p className="text-[11px] text-[var(--text-dim)] font-medium uppercase tracking-[0.1em] font-mono">Platform Engineering &amp; Release Operations Hub</p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-2 text-xs text-[var(--text-dim)] font-mono uppercase tracking-[0.12em]">
          <span className="w-2 h-2 bg-[var(--success)]" />
          <span>3 Services Healthy</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 md:p-8 z-10">
        <section className="w-full max-w-md bg-[var(--panel)] border border-[var(--border)] p-6 md:p-8">
          <div>
            <h1 className="text-lg font-bold text-[var(--text)]">Developer Sign In</h1>
            <p className="text-xs text-[var(--text-dim)] mt-0.5 font-mono uppercase tracking-[0.12em]">Use your enterprise credentials</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 mt-6">
            <div className="space-y-1.5 text-left">
              <label className="text-[10px] font-semibold text-[var(--text-dim)] flex items-center gap-1.5 font-mono uppercase tracking-[0.12em]">
                <Mail className="w-3.5 h-3.5 text-[var(--success)]" />
                <span>Corporate Email</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(event) => { setEmail(event.target.value); setError(''); }}
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
                onChange={(event) => { setPassword(event.target.value); setError(''); }}
                required
                placeholder="Enter your password"
                className="w-full bg-[var(--bg)] border border-[var(--border)] px-3.5 py-2.5 text-xs text-[var(--text)] placeholder-[var(--text-faint)] focus:outline-none focus:border-[var(--success)] font-mono"
              />
            </div>

            {error && (
              <p role="alert" className="border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 border border-[var(--success)] bg-[image:var(--signal-gradient)] text-[#07111d] text-[10px] font-semibold flex items-center justify-center gap-2 font-mono uppercase tracking-[0.12em] disabled:opacity-50"
            >
              <span>{isLoading ? 'Authenticating...' : 'Sign In to Platform'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </section>
      </main>

      <footer className="px-6 py-4 text-center text-xs text-[var(--text-faint)] border-t border-[var(--border)] bg-[var(--panel)] z-10">
        DocCraft Studio &amp; Engineering Operations Suite
      </footer>
    </div>
  );
};
