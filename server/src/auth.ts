import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import type { Db } from './db.js';

export const SESSION_COOKIE = 'devdoc_sid';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  title: string | null;
  department: string | null;
  role: string;
  avatarBg: string | null;
  initials: string | null;
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

/** A random, unguessable session id — not a JWT, so logout (or an
 * admin revoking a session) takes effect immediately: deleting the row
 * invalidates it, with nothing left holding a still-valid token. */
export function generateSessionId(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function createSession(db: Db, userId: string): Promise<{ id: string; expiresAt: Date }> {
  const id = generateSessionId();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.query('INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)', [id, userId, expiresAt]);
  return { id, expiresAt };
}

export async function destroySession(db: Db, sessionId: string): Promise<void> {
  await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
}

export async function userForSession(db: Db, sessionId: string): Promise<SessionUser | null> {
  const { rows } = await db.query<{
    id: string; name: string; email: string; title: string | null; department: string | null;
    role: string; avatar_bg: string | null; initials: string | null;
  }>(
    `SELECT u.id, u.name, u.email, u.title, u.department, u.role, u.avatar_bg, u.initials
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.expires_at > now()`,
    [sessionId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id, name: row.name, email: row.email, title: row.title, department: row.department,
    role: row.role, avatarBg: row.avatar_bg, initials: row.initials,
  };
}
