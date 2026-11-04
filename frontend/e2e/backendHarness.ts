import { expect, type Page } from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// A real API (backend/tests/e2e_server.py: the FastAPI app on in-memory
// users and an in-process fake Redis) plus a dev server pointed at it,
// on ports of the spec's choosing - for screens that are server-only,
// like Test Management.

const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND_ROOT = path.resolve(FRONTEND_ROOT, '..', 'backend');

export interface TestUser { email: string; password: string; name: string }

export interface Stack {
  frontendUrl: string;
  apiUrl: string;
  users: TestUser[];
  /** Empties the server's Redis: the next visit loads fresh sample data. */
  reset(): Promise<void>;
  stop(): void;
}

function waitForLine(proc: ChildProcessWithoutNullStreams, pattern: RegExp, timeoutMs = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${pattern}`)), timeoutMs);
    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      if (pattern.test(text)) { clearTimeout(timer); proc.stdout.off('data', onData); resolve(text); }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', (c) => process.stderr.write(`[child] ${c}`));
  });
}

export async function startStack(apiPort: number, frontendPort: number): Promise<Stack> {
  const frontendUrl = `http://localhost:${frontendPort}`;
  // The venv's python directly (after `uv sync` in backend/), not `uv run`:
  // killing uv can leave the server orphaned on its port.
  const api = spawn(path.join(BACKEND_ROOT, '.venv', 'bin', 'python'), ['-m', 'tests.e2e_server'], {
    cwd: BACKEND_ROOT,
    env: { ...process.env, PORT: String(apiPort), FRONTEND_ORIGIN: frontendUrl },
  });
  const ready = await waitForLine(api, /READY (.+)/);
  const users: TestUser[] = JSON.parse(ready.match(/READY (.+)/)![1]);

  const frontend = spawn('npx', ['vite', '--port', String(frontendPort), '--strictPort'], {
    cwd: FRONTEND_ROOT,
    env: { ...process.env, VITE_API_BASE_URL: `http://localhost:${apiPort}` },
  });
  await waitForLine(frontend, /ready in/);

  return {
    frontendUrl,
    apiUrl: `http://localhost:${apiPort}`,
    users,
    async reset() {
      const res = await fetch(`http://127.0.0.1:${apiPort}/__e2e/reset`, { method: 'POST' });
      if (!res.ok) throw new Error(`reset failed: ${res.status}`);
    },
    stop() {
      api.kill();
      frontend.kill();
    },
  };
}

/** Signs in through the real login form (so the API session cookie is set). */
export async function signInThroughBackend(page: Page, stack: Stack, user: TestUser = stack.users[0]): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('devdoc_studio_welcome_seen_v1', '1'));
  await page.goto(stack.frontendUrl);
  await page.getByPlaceholder('engineer@sanmina.com').fill(user.email);
  await page.getByPlaceholder('Enter your password').fill(user.password);
  await page.getByRole('button', { name: /sign in to platform/i }).click();
  await expect(page.getByText(/Good (Morning|Afternoon|Evening)/)).toBeVisible();
}
