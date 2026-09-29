import { test, expect } from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This spec proves the frontend and the real API (server/) work
// together: unlike the rest of e2e/, which runs the app without
// VITE_API_BASE_URL (the browser-only demo, per playwright.config.ts),
// it starts the real Express app on an in-memory Postgres and a
// second Vite dev server configured to talk to it.
const API_PORT = 4111;
const FRONTEND_PORT = 5199;
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

test.describe.configure({ mode: 'serial' });

let apiProc: ChildProcessWithoutNullStreams;
let frontendProc: ChildProcessWithoutNullStreams;
let users: { email: string; password: string; name: string }[];

test.beforeAll(async () => {
  apiProc = spawn('npx', ['tsx', 'test/manual-integration-server.ts'], {
    cwd: path.join(REPO_ROOT, 'server'),
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

test('real backend: wrong password is rejected with the server\'s own message', async ({ page }) => {
  await skipWelcomeGuide(page);
  await page.goto(`http://localhost:${FRONTEND_PORT}`);
  await page.getByPlaceholder('engineer@sanmina.com').fill(users[0].email);
  await page.getByPlaceholder('Enter your password').fill('definitely-wrong');
  await page.getByRole('button', { name: /sign in to platform/i }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password.');
});

test('real backend: the right password signs in, and logout revokes the session server-side', async ({ page }) => {
  await skipWelcomeGuide(page);
  await page.goto(`http://localhost:${FRONTEND_PORT}`);
  await page.getByPlaceholder('engineer@sanmina.com').fill(users[0].email);
  await page.getByPlaceholder('Enter your password').fill(users[0].password);
  await page.getByRole('button', { name: /sign in to platform/i }).click();
  await expect(page.getByText(new RegExp(`Good (Morning|Afternoon|Evening)`))).toBeVisible();

  // The cookie was set for API_PORT's origin, invisible to document.cookie
  // (httpOnly) — confirm the session is real by calling /me with it.
  const meWhileIn = await page.request.get(`http://localhost:${API_PORT}/api/auth/me`);
  expect(meWhileIn.ok()).toBe(true);

  await page.getByRole('button', { name: /logout/i }).click();
  await expect(page.getByRole('button', { name: /sign in to platform/i })).toBeVisible();
  const meAfterLogout = await page.request.get(`http://localhost:${API_PORT}/api/auth/me`);
  expect(meAfterLogout.status()).toBe(401);
});

test('real backend: a document saved in one browser is picked up by another, signed-in separately', async ({ browser }) => {
  const title = `Shared from A ${Date.now()}`;

  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await skipWelcomeGuide(pageA);
  await pageA.goto(`http://localhost:${FRONTEND_PORT}`);
  await pageA.getByPlaceholder('engineer@sanmina.com').fill(users[0].email);
  await pageA.getByPlaceholder('Enter your password').fill(users[0].password);
  await pageA.getByRole('button', { name: /sign in to platform/i }).click();
  await pageA.getByRole('button', { name: 'Document Editor' }).first().click();
  await pageA.getByRole('button', { name: /New Document/ }).click();
  const titleInput = pageA.getByText('Document Title', { exact: true }).first().locator('xpath=following::input[1]');
  await expect(titleInput).toBeVisible();
  await titleInput.fill(title);
  // The push to the API is fire-and-forget from the frontend's point of
  // view; give it a moment to land before the second browser looks for it.
  await expect.poll(async () => {
    const res = await pageA.request.get(`http://localhost:${API_PORT}/api/documents`);
    const { documents } = await res.json();
    return documents.some((d: { metadata: { title: string } }) => d.metadata.title === title);
  }, { timeout: 5000 }).toBe(true);
  await contextA.close();

  // A second browser, signed in separately, with nothing in its own
  // localStorage — it should only see the document because it pulled
  // it from the shared backend, not because it shares storage with A.
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await skipWelcomeGuide(pageB);
  await pageB.goto(`http://localhost:${FRONTEND_PORT}`);
  await pageB.getByPlaceholder('engineer@sanmina.com').fill(users[0].email);
  await pageB.getByPlaceholder('Enter your password').fill(users[0].password);
  await pageB.getByRole('button', { name: /sign in to platform/i }).click();
  await pageB.getByRole('button', { name: 'Document Editor' }).first().click();
  await expect(pageB.getByText(title, { exact: true })).toBeVisible({ timeout: 5000 });
  await contextB.close();
});
