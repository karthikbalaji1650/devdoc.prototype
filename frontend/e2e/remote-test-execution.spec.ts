import { test, expect } from '@playwright/test';
import { type ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawnServer, stopServer, waitForPortsFree } from './backendHarness';
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
const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND_ROOT = path.resolve(FRONTEND_ROOT, '..', 'backend');

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

// One API + dev server on fixed ports for the whole file, so its tests run
// one after another (the first expects no test servers registered yet).
test.describe.configure({ mode: 'serial' });

let apiProc: ChildProcessWithoutNullStreams;
let frontendProc: ChildProcessWithoutNullStreams;
let users: { email: string; password: string; name: string }[];

test.beforeAll(async () => {
  // The backend venv's python directly (after `uv sync` in backend/), not
  // `uv run`: killing uv can leave the server orphaned on its port.
  await waitForPortsFree([API_PORT, FRONTEND_PORT]);
  apiProc = spawnServer(path.join(BACKEND_ROOT, '.venv', 'bin', 'python'), ['-m', 'tests.e2e_server'], {
    cwd: BACKEND_ROOT,
    env: { ...process.env, PORT: String(API_PORT), FRONTEND_ORIGIN: `http://localhost:${FRONTEND_PORT}` },
  });
  const ready = await waitForLine(apiProc, /READY (.+)/);
  users = JSON.parse(ready.match(/READY (.+)/)![1]);

  frontendProc = spawnServer('npx', ['vite', '--port', String(FRONTEND_PORT), '--strictPort'], {
    cwd: FRONTEND_ROOT,
    env: { ...process.env, VITE_API_BASE_URL: `http://localhost:${API_PORT}` },
  });
  await waitForLine(frontendProc, /ready in/);
});

test.afterAll(async () => {
  stopServer(apiProc);
  stopServer(frontendProc);
  await waitForPortsFree([API_PORT, FRONTEND_PORT]);
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
  // No servers registered: the simulated Test PC is the only choice.
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('No test servers are registered yet.', { exact: false })).toBeVisible();
  await expect(dialog.getByRole('radio', { name: /Simulated Test PC/ })).toBeChecked();
  await dialog.getByRole('button', { name: 'Start run' }).click();

  await expect(page.getByText(/Run started on Simulated Test PC/)).toBeVisible();
  await expect(page.getByText('Remote Execution Run')).toBeVisible();

  // The push + start calls happen in the background (not awaited by the
  // click handler); give them a moment against the real mock backend,
  // then confirm no error toast landed - that's the real proof the
  // network calls succeeded, not just that the UI optimistically showed
  // an "In Progress" placeholder.
  await page.waitForTimeout(1000);
  await expect(page.getByText(/Remote execution failed/)).toHaveCount(0);
});

test('Run Test sends the suite to a registered test server and follows it live to completion (DDS-SRS-020, 021, 022)', async ({ page }) => {
  test.setTimeout(60_000);
  const api = `http://localhost:${API_PORT}`;
  await skipWelcomeGuide(page);
  await page.goto(`http://localhost:${FRONTEND_PORT}`);
  await page.getByPlaceholder('engineer@sanmina.com').fill(users[0].email);
  await page.getByPlaceholder('Enter your password').fill(users[0].password);
  await page.getByRole('button', { name: /sign in to platform/i }).click();
  await expect(page.getByText(/Good (Morning|Afternoon|Evening)/)).toBeVisible();

  // Register the harness's fake Test PC (backend/tests/e2e_server.py) as the admin.
  const created = await page.request.post(`${api}/api/test-servers`, {
    data: {
      name: 'Fake Lab PC', endpointUrl: `${api}/__e2e/testpc`, authType: 'apiKey',
      auth: { apiKey: 'e2e-testpc-key' }, payload: { bmcIp: '10.0.0.5' },
    },
  });
  expect(created.ok()).toBeTruthy();

  // Which status requests the page makes: the live stream (DDS-SRS-022), not polling.
  const statusRequests: string[] = [];
  page.on('request', (r) => { if (/\/api\/test-exec\/runs\/[^/]+/.test(r.url())) statusRequests.push(new URL(r.url()).pathname); });

  await page.getByRole('button', { name: 'Test Management', exact: true }).click();
  await page.getByRole('button', { name: 'Run Test' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('radio', { name: /Fake Lab PC/ })).toBeChecked();
  await dialog.getByRole('button', { name: 'Start run' }).click();
  await expect(page.getByText(/Run started on Fake Lab PC/)).toBeVisible();

  // What the fake Test PC received: the suite's Robot script, the payload
  // parameters and the API key, sent by the backend (never the browser).
  await expect.poll(async () => (await (await page.request.get(`${api}/__e2e/testpc/last`)).json())?.apiKey).toBe('e2e-testpc-key');
  const last = await (await page.request.get(`${api}/__e2e/testpc/last`)).json();
  expect(last.body.parameters).toEqual({ bmcIp: '10.0.0.5' });
  expect(last.body.robotCode).toContain('*** Test Cases ***');

  // The server's worker polls the Test PC (DDS-SRS-021): first halfway,
  // then finished; the page picks both up without a reload.
  const progress = page.getByTestId('remote-progress').first();
  await expect(progress).toContainText(/Running on Fake Lab PC · 1 of 2 executed \(50%\)/, { timeout: 20_000 });
  await expect(progress).toContainText('Completed on Fake Lab PC · 2 of 2 executed (100%) · 1 passed · 1 failed', { timeout: 20_000 });
  await expect(page.getByText(/Run complete — 1 passed, 1 failed/)).toBeVisible();
  expect(statusRequests.length).toBeGreaterThan(0);
  expect(statusRequests.every((p) => p.endsWith('/events'))).toBe(true);
});

test('a scheduled run fires on the server and its results show up (DDS-SRS-028)', async ({ page }) => {
  test.setTimeout(90_000);
  const api = `http://localhost:${API_PORT}`;
  await skipWelcomeGuide(page);
  await page.goto(`http://localhost:${FRONTEND_PORT}`);
  await page.getByPlaceholder('engineer@sanmina.com').fill(users[0].email);
  await page.getByPlaceholder('Enter your password').fill(users[0].password);
  await page.getByRole('button', { name: /sign in to platform/i }).click();
  await page.getByRole('button', { name: 'Test Management', exact: true }).click();

  // "Fake Lab PC" was registered by the previous test.
  await page.getByRole('button', { name: 'Schedule' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('No scheduled runs for this suite yet.')).toBeVisible();
  await dialog.getByLabel('Repeat').selectOption('weekly');
  await dialog.getByLabel(/^Time/).fill('03:15');
  await dialog.getByRole('button', { name: 'Add schedule' }).click();
  await expect(dialog.getByText(/^Mon, Tue, Wed, Thu, Fri at 03:15 on Fake Lab PC$/)).toBeVisible();
  await expect(dialog.getByText(/^Next: /)).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();

  // The server's worker fires it (fast-forwarded here), runs it on the fake
  // Test PC and fills in the run; the open Runs view picks it up.
  await page.getByRole('button', { name: /Test Runs/ }).first().click();
  const fired = await (await page.request.post(`${api}/__e2e/fire-schedules`)).json();
  expect(fired.fired).toBe(1);
  const card = page.getByText(/Scheduled Run$/).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  // The card's heading and progress line share a parent.
  await expect(card.locator('xpath=..').getByTestId('remote-progress'))
    .toHaveText('Completed on Fake Lab PC · 2 of 2 executed (100%) · 1 passed · 1 failed', { timeout: 45_000 });
});
