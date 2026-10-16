import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { Db } from '../db.js';
import { SESSION_COOKIE, createSession, destroySession, userForSession, verifyPassword } from '../auth.js';

// Nothing throttled repeated password guesses before this - a real gap
// found in review, not a theoretical one. Counts by IP; successful
// logins don't count against the limit, so a mistyped password once
// doesn't penalise someone who then signs in correctly.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many sign-in attempts. Try again in a few minutes.' },
});

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  // Secure cookies require HTTPS - independent of NODE_ENV. A
  // production-mode build can still run over plain HTTP (this repo's
  // own docker-compose demo, localhost only): conflating the two broke
  // login there, since the browser silently drops a Secure cookie
  // issued over HTTP, right after a login response that looked fine.
  // Set COOKIE_SECURE=true only for a real deployment actually served
  // over HTTPS.
  secure: process.env.COOKIE_SECURE === 'true',
  maxAge: 12 * 60 * 60 * 1000,
};

export function authRouter(db: Db): Router {
  const router = Router();

  router.post('/login', loginLimiter, async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const { rows } = await db.query<{ id: string; password_hash: string }>(
      'SELECT id, password_hash FROM users WHERE lower(email) = $1',
      [email],
    );
    const row = rows[0];
    // Same response whether the email is unknown or the password is wrong,
    // so a caller can't use the error to discover which accounts exist.
    if (!row || !(await verifyPassword(password, row.password_hash))) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const session = await createSession(db, row.id);
    const user = await userForSession(db, session.id);
    res.cookie(SESSION_COOKIE, session.id, COOKIE_OPTS);
    res.json({ user });
  });

  router.post('/logout', async (req, res) => {
    const sid = req.cookies?.[SESSION_COOKIE];
    if (sid) await destroySession(db, sid);
    res.clearCookie(SESSION_COOKIE);
    res.status(204).end();
  });

  router.get('/me', async (req, res) => {
    const sid = req.cookies?.[SESSION_COOKIE];
    const user = sid ? await userForSession(db, sid) : null;
    if (!user) {
      res.status(401).json({ error: 'Not signed in.' });
      return;
    }
    res.json({ user });
  });

  return router;
}
