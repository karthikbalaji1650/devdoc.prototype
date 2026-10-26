import { test, expect } from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Same real-backend harness as backend-login.spec.ts, on its own ports
// so the two specs can run independently. The production poll interval
// is 30 minutes (src/services/remoteExecutionService.ts), which the UI
// doesn't expose an override for - so this only asserts what a real
// click can observe in a reasonable test timeout: the run appearing
// immediately as "In Progress". The full push -> start -> poll ->
// completed sequence is covered by remoteExecutionService.test.ts.
const API_PORT = 4122;
const FRONTEND_PORT = 5210;
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function waitForLine(proc: ChildProcessWithoutNullStreams, pattern: RegExp, timeoutMs = 20_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${pattern}`)), timeoutMs);
    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      const match = text.match(pattern);
      if (match) { clearTimeout(timer); proc.stdout.off('data', onData); resolve(text); }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', (c) => process.stderr.write(`[child] ${c}`));
  });
}

let apiProc: ChildProcessWithoutNullStreams;
let frontendProc: ChildProcessWithoutNullStreams;
let users: { email: string; password: string; name: string }[];

test.beforeAll(async () => {
  apiProc = spawn('uv', ['run', '--frozen', 'python', '-m', 'tests.e2e_server'], {
    cwd: path.join(REPO_ROOT, 'backend'),
    env: { ...process.env, PORT: String(API_PORT), FRONTEND_ORIGIN: `http://localhost:${FRONTEND_PORT}` },
  });
  const ready = await waitForLine(apiProc, /READY (.+)/);
  users = JSON.parse(ready.match(/READY (.+)/)![1]);

  frontendProc = spawn('npx', ['vite', '--port', String(FRONTEND_PORT), '--strictPort'], {
    cwd: REPO_ROOT,
    env: { ...process.env, VITE_API_BASE_URL: `http://localhost:${API_PORT}` },
  });
  await waitForLine(frontendProc, /ready in/);
});

test.afterAll(() => {
  apiProc?.kill();
  frontendProc?.kill();
});

function skipWelcomeGuide(page: import('@playwright/test').Page) {
  return page.addInitScript(() => localStorage.setItem('devdoc_studio_welcome_seen_v1', '1'));
}

test('clicking Run Test starts a remote run that shows up immediately as In Progress', async ({ page }) => {
  await skipWelcomeGuide(page);
  await page.goto(`http://localhost:${FRONTEND_PORT}`);
  await page.getByPlaceholder('engineer@sanmina.com').fill(users[0].email);
  await page.getByPlaceholder('Enter your password').fill(users[0].password);
  await page.getByRole('button', { name: /sign in to platform/i }).click();
  await expect(page.getByText(new RegExp(`Good (Morning|Afternoon|Evening)`))).toBeVisible();

  await page.getByRole('button', { name: 'Test Management', exact: true }).click();
  await page.getByRole('button', { name: 'Run Test' }).click();

  await expect(page.getByText(/Run started/)).toBeVisible();
  await expect(page.getByText('Remote Execution Run')).toBeVisible();

  // The push + start calls happen in the background (not awaited by the
  // click handler); give them a moment against the real mock backend,
  // then confirm no error toast landed - that's the real proof the
  // network calls succeeded, not just that the UI optimistically showed
  // an "In Progress" placeholder.
  await page.waitForTimeout(1000);
  await expect(page.getByText(/Remote execution failed/)).toHaveCount(0);
});
