import { expect, type Page } from '@playwright/test';
import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process';
import net from 'node:net';
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
  stop(): Promise<void>;
}

function waitForLine(proc: ChildProcessWithoutNullStreams, pattern: RegExp, timeoutMs = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${pattern}`)), timeoutMs);
    const onData = (chunk: Buffer) => {
      // Without colour codes: Vite prints parts of its URL in bold.
      const text = chunk.toString().replace(/\x1b\[[0-9;]*m/g, '');
      if (pattern.test(text)) { clearTimeout(timer); proc.stdout.off('data', onData); resolve(text); }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', (c) => process.stderr.write(`[child] ${c}`));
  });
}

/** Starts a server in its own process group, so stopServer() can stop it
 * and everything it started: `npx vite` runs vite as a child, and killing
 * only npx left vite holding its port - the next spec on that port then
 * failed with "Port … is already in use" (as on CI, with one worker). */
export function spawnServer(command: string, args: string[], opts: SpawnOptionsWithoutStdio): ChildProcessWithoutNullStreams {
  return spawn(command, args, { ...opts, detached: true });
}

async function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

/** Waits until nothing listens on these ports (up to `timeoutMs`). */
export async function waitForPortsFree(ports: number[], timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (const port of ports) {
    while (await portInUse(port)) {
      if (Date.now() > deadline) throw new Error(`port ${port} is still in use`);
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}

/** Stops a server started with spawnServer, with everything it started. */
export function stopServer(proc: ChildProcess | undefined): void {
  if (!proc?.pid || proc.exitCode !== null) return;
  try {
    process.kill(-proc.pid, 'SIGTERM');
  } catch {
    proc.kill('SIGTERM');
  }
}

/** `production: true` serves a production build (vite build + preview)
 * instead of the dev server - for timing measurements, where the dev
 * server's on-demand compiling would distort the numbers. */
export async function startStack(apiPort: number, frontendPort: number, opts: { production?: boolean } = {}): Promise<Stack> {
  const frontendUrl = `http://localhost:${frontendPort}`;
  await waitForPortsFree([apiPort, frontendPort]); // nothing left over from an earlier spec
  // The venv's python directly (after `uv sync` in backend/), not `uv run`:
  // killing uv can leave the server orphaned on its port.
  const api = spawnServer(path.join(BACKEND_ROOT, '.venv', 'bin', 'python'), ['-m', 'tests.e2e_server'], {
    cwd: BACKEND_ROOT,
    env: { ...process.env, PORT: String(apiPort), FRONTEND_ORIGIN: frontendUrl },
  });
  const ready = await waitForLine(api, /READY (.+)/);
  const users: TestUser[] = JSON.parse(ready.match(/READY (.+)/)![1]);

  const env = { ...process.env, VITE_API_BASE_URL: `http://localhost:${apiPort}` };
  let frontend: ChildProcessWithoutNullStreams;
  if (opts.production) {
    // Built outside the repo's dist/ (node_modules is ignored), per port.
    const outDir = path.join(FRONTEND_ROOT, 'node_modules', `.e2e-dist-${frontendPort}`);
    const build = spawn('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'warn'], { cwd: FRONTEND_ROOT, env });
    build.stderr.on('data', (c) => process.stderr.write(`[build] ${c}`));
    const code = await new Promise<number | null>((resolve) => build.on('exit', resolve));
    if (code !== 0) throw new Error(`production build failed (${code})`);
    frontend = spawnServer('npx', ['vite', 'preview', '--outDir', outDir, '--port', String(frontendPort), '--strictPort'], { cwd: FRONTEND_ROOT, env });
    await waitForLine(frontend, new RegExp(`localhost:${frontendPort}`));
  } else {
    frontend = spawnServer('npx', ['vite', '--port', String(frontendPort), '--strictPort'], { cwd: FRONTEND_ROOT, env });
    await waitForLine(frontend, /ready in/);
  }

  return {
    frontendUrl,
    apiUrl: `http://localhost:${apiPort}`,
    users,
    async reset() {
      const res = await fetch(`http://127.0.0.1:${apiPort}/__e2e/reset`, { method: 'POST' });
      if (!res.ok) throw new Error(`reset failed: ${res.status}`);
    },
    async stop() {
      stopServer(api);
      stopServer(frontend);
      await waitForPortsFree([apiPort, frontendPort]);
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
  await expect(page.getByRole('heading', { name: 'Engineering workspace' })).toBeVisible();
}
