import { DEMO_USERS } from '../types/auth';

const AUDIT_LOG_KEY = 'devdoc_studio_session_audit_v1';
const SEEDED_FLAG_KEY = 'devdoc_studio_session_audit_seeded_v1';

export interface SessionAuditEntry {
  id: string;
  userId: string;
  userName: string;
  role: string;
  loginTime: string; // ISO
  logoutTime: string | null; // null = still active
}

function readLog(): SessionAuditEntry[] {
  try {
    const raw = localStorage.getItem(AUDIT_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLog(entries: SessionAuditEntry[]): void {
  localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(entries));
}

/** This is a frontend-only app with no shared backend, so there's no
 * way to observe other users' real browser sessions. On first use we
 * seed a few illustrative entries for the other demo users so the
 * admin view isn't empty - clearly the same simulated-data convention
 * already used throughout this app (reviewers log, JIRA issues, etc).
 * Every entry from here on for *this* browser's actual user is real. */
function seedDemoEntriesIfNeeded(): void {
  if (localStorage.getItem(SEEDED_FLAG_KEY)) return;
  localStorage.setItem(SEEDED_FLAG_KEY, '1');

  const now = Date.now();
  const seeded: SessionAuditEntry[] = DEMO_USERS.slice(0, 3).map((u, idx) => {
    const loginMinutesAgo = 45 + idx * 90;
    const durationMinutes = 20 + idx * 15;
    const loginTime = new Date(now - loginMinutesAgo * 60000).toISOString();
    const stillActive = idx === 0 && durationMinutes > loginMinutesAgo;
    const logoutTime = stillActive
      ? null
      : new Date(now - (loginMinutesAgo - durationMinutes) * 60000).toISOString();
    return {
      id: `seed-${u.id}`,
      userId: u.id,
      userName: u.name,
      role: u.role,
      loginTime,
      logoutTime,
    };
  });

  const existing = readLog();
  writeLog([...seeded, ...existing]);
}

export function recordLogin(userId: string, userName: string, role: string): void {
  seedDemoEntriesIfNeeded();
  const entries = readLog();
  entries.unshift({
    id: `${userId}-${Date.now()}`,
    userId,
    userName,
    role,
    loginTime: new Date().toISOString(),
    logoutTime: null,
  });
  writeLog(entries.slice(0, 100));
}

export function recordLogout(userId: string): void {
  const entries = readLog();
  const openEntry = entries.find((e) => e.userId === userId && e.logoutTime === null);
  if (openEntry) {
    openEntry.logoutTime = new Date().toISOString();
    writeLog(entries);
  }
}

export function getSessionAuditLog(): SessionAuditEntry[] {
  seedDemoEntriesIfNeeded();
  return readLog().sort((a, b) => b.loginTime.localeCompare(a.loginTime));
}
