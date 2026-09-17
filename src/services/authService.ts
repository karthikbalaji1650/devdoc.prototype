import type { UserProfile, UserSession } from '../types/auth';
import { DEMO_USERS } from '../types/auth';

const STORAGE_SESSION_KEY = 'devdoc_studio_user_session_v1';

export function getStoredSession(): UserSession | null {
  const saved = localStorage.getItem(STORAGE_SESSION_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to parse user session', e);
    }
  }
  return null;
}

export function loginWithProfile(profile: UserProfile): UserSession {
  const session: UserSession = {
    user: profile,
    token: `token_${profile.id}_${Date.now()}`,
    loginTime: new Date().toISOString(),
    isAuthenticated: true
  };
  localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
  return session;
}

export function loginWithCredentials(email: string, _pass: string): UserSession {
  const matched = DEMO_USERS.find(u => u.email.toLowerCase() === email.toLowerCase()) || {
    id: `usr-${Date.now()}`,
    name: email.split('@')[0].replace('.', ' ').replace(/^./, str => str.toUpperCase()),
    email,
    title: 'Senior Systems Engineer',
    department: 'Engineering Organization',
    role: 'firmware-lead',
    avatarBg: 'from-blue-600 to-indigo-600',
    initials: email.slice(0, 2).toUpperCase()
  };

  return loginWithProfile(matched);
}

export function logout(): void {
  localStorage.removeItem(STORAGE_SESSION_KEY);
}
