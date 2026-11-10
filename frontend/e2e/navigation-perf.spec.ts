import { test, expect, type Page } from '@playwright/test';
import { startStack, type Stack } from './backendHarness';

// DDS-SRS-071: navigating between screens responds in under 1.5 seconds.
// Measured on a production build talking to the real API (each screen
// fetches its own data from the server), from the sidebar click to the
// screen's own content being visible.
const BUDGET_MS = 1500;
let stack: Stack;
test.beforeAll(async () => {
  test.setTimeout(180_000); // includes the production build
  stack = await startStack(4177, 5260, { production: true });
});
test.afterAll(() => stack?.stop());

// Each screen's own text (case-insensitive: some labels are upper-cased by CSS), checked in the page on every animation frame -
// Playwright's own visibility polling backs off (100, 250, 500, 1000 ms),
// which would round a screen's time up to the next step.
const SCREENS: { name: string; text: string }[] = [
  { name: 'Document Editor', text: 'New Document' },
  { name: 'Test Management', text: 'Add Case' },
  { name: 'Release Master', text: 'Releases, release candidate builds' },
  { name: 'Incident Tracker', text: 'Incident Reporting & Tracking System' },
  { name: 'Reviewers Log', text: 'Document Reviewers Log' },
  { name: 'Coder', text: 'VS Code + Cline Agent' },
  { name: 'Data Management', text: 'Download server backup' },
  { name: 'Settings', text: 'Your account information from the active session.' },
  { name: 'Dashboard', text: 'Total Docs' },
];

/** Clicks the sidebar entry and resolves with ms until its text is on screen. */
async function open(page: Page, s: { name: string; text: string }): Promise<number> {
  const button = page.getByRole('button', { name: s.name, exact: true }).first();
  await button.waitFor();
  const t0 = Date.now();
  await button.click();
  await page.waitForFunction((text) => document.body.innerText.toLowerCase().includes(text.toLowerCase()), s.text, { polling: 'raf', timeout: 30_000 });
  return Date.now() - t0;
}

test('every screen opens in under 1.5 s', async ({ page }) => {
  test.setTimeout(180_000);
  await stack.reset();
  const admin = stack.users[0];
  await page.addInitScript(() => localStorage.setItem('devdoc_studio_welcome_seen_v1', '1'));
  await page.goto(stack.frontendUrl);
  await page.getByPlaceholder('engineer@sanmina.com').fill(admin.email);
  await page.getByPlaceholder('Enter your password').fill(admin.password);
  await page.getByRole('button', { name: /sign in to platform/i }).click();
  await expect(page.getByText(/Good (Morning|Afternoon|Evening)/)).toBeVisible();

  // First visits: each screen's code is downloaded on demand, and the
  // server loads its sample data - the slowest a screen ever opens.
  const firstVisit: Record<string, number> = {};
  for (const s of SCREENS) firstVisit[s.name] = await open(page, s);
  console.log('first visits (ms):', JSON.stringify(firstVisit));
  for (const [name, ms] of Object.entries(firstVisit)) expect(ms, `${name} first visit took ${ms} ms`).toBeLessThan(BUDGET_MS);

  const results: Record<string, number[]> = {};
  for (let round = 0; round < 3; round++) {
    for (const s of SCREENS) (results[s.name] ??= []).push(await open(page, s));
  }
  const medians = Object.fromEntries(Object.entries(results).map(([k, v]) => [k, [...v].sort((a, b) => a - b)[1]]));
  console.log('navigation medians (ms):', JSON.stringify(medians));
  for (const [name, ms] of Object.entries(medians)) expect(ms, `${name} took ${ms} ms`).toBeLessThan(BUDGET_MS);
});
