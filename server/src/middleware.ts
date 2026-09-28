import type { NextFunction, Request, Response } from 'express';
import type { Db } from './db.js';
import { SESSION_COOKIE, userForSession, type SessionUser } from './auth.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

/** Attaches req.user from the session cookie; does not itself reject
 * unauthenticated requests (see requireAuth) so routes can decide. */
export function withSession(db: Db) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const sid = req.cookies?.[SESSION_COOKIE];
    req.user = sid ? (await userForSession(db, sid)) ?? undefined : undefined;
    next();
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Not signed in.' });
    return;
  }
  next();
}
