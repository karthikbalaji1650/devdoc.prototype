import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import type { Db } from './db.js';
import { withSession } from './middleware.js';
import { authRouter } from './routes/auth.js';
import { documentsRouter } from './routes/documents.js';
import { aiRouter } from './routes/ai.js';
import { testExecRouter } from './routes/testExec.js';

export interface AppOptions {
  /** Origins allowed to send credentialed requests (the Vite dev server, the deployed frontend). */
  corsOrigins?: string[];
}

export function createApp(db: Db, opts: AppOptions = {}): Express {
  const app = express();
  app.use(express.json({ limit: '5mb' })); // documents can carry embedded base64 images
  app.use(cookieParser());
  if (opts.corsOrigins?.length) {
    app.use(cors({ origin: opts.corsOrigins, credentials: true }));
  }
  app.use(withSession(db));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter(db));
  app.use('/api/documents', documentsRouter(db));
  app.use('/api/ai', aiRouter());
  app.use('/api/test-exec', testExecRouter());

  return app;
}
