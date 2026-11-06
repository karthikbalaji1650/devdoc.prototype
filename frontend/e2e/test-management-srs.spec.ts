import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';
import { signInThroughBackend, startStack, type Stack } from './backendHarness';

// Test Management requirements not covered elsewhere, against the real API:
// 017 (manual execution statuses), 029 (code editor + AI generation),
// 032 (suites shared with the AI code editor, through the real file bridge).
test.describe.configure({ mode: 'serial' });
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BRIDGE_PORT = 18261;
let stack: Stack;
let bridge: ChildProcess;
let dir: string;

test.beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'devdoc-tm-bridge-'));
  bridge = spawn('python3', ['-I', path.join(ROOT, 'sandbox', 'file_bridge.py')], {
    cwd: dir, stdio: 'ignore', env: { ...process.env, BRIDGE_PORT: String(BRIDGE_PORT) },
  });
  stack = await startStack(4266, 5366);
});
test.afterAll(() => {
  stack?.stop();
  bridge?.kill();
  if (dir) rmSync(dir, { recursive: true, force: true });
});
test.beforeEach(async () => { await stack.reset(); });

async function openTestManagement(page: Page) {
  await page.addInitScript((url) => localStorage.setItem('devdoc_file_bridge_url', url), `http://127.0.0.1:${BRIDGE_PORT}`);
  await signInThroughBackend(page, stack);
  await page.getByRole('button', { name: 'Test Management', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add Case' }).first()).toBeVisible();
}

async function runResult(page: Page, runName: string, customId: string): Promise<string | undefined> {
  const res = await page.request.get(`${stack.apiUrl}/api/test-management`);
  const run = (await res.json()).runs.find((r: { name: string }) => r.name === runName);
  return run?.caseResults?.find((c: { customId: string }) => c.customId === customId)?.status;
}

test('017: each manual execution status can be set on a case in a run, and is saved', async ({ page }) => {
  await openTestManagement(page);
  await page.getByRole('button', { name: /Test Runs/ }).first().click();
  const run = '[Regression] Full Release v5.67';
  await page.getByText(run).click();
  const select = page.getByRole('combobox').filter({ has: page.locator('option[value="Retest"]') })
    .and(page.locator('xpath=//div[contains(@class,"grid")][.//div[normalize-space()="C3"]]//select')).first();
  const options = await select.locator('option').allTextContents();
  expect(options.sort()).toEqual(['Blocked', 'Failed', 'Passed', 'Retest', 'Skipped', 'Untested']);
  for (const status of ['Passed', 'Failed', 'Blocked', 'Retest', 'Skipped', 'Untested']) {
    await select.selectOption(status);
    await expect.poll(() => runResult(page, run, 'C3')).toBe(status);
  }
  await select.selectOption('Blocked');
  await expect.poll(() => runResult(page, run, 'C3')).toBe('Blocked');
  await page.reload();
  await page.getByRole('button', { name: 'Test Management', exact: true }).click();
  await page.getByRole('button', { name: /Test Runs/ }).first().click();
  await page.getByText(run).click();
  await expect(select).toHaveValue('Blocked');
});

test('029: Generate via AI adds test cases to the suite, and they are saved', async ({ page }) => {
  await openTestManagement(page);
  const before = (await (await page.request.get(`${stack.apiUrl}/api/test-management`)).json()).suites[0].testCases.length;
  await page.getByRole('button', { name: 'Generate via AI' }).click();
  await page.getByRole('button', { name: 'Generate Test Cases' }).click();
  const toast = page.getByText(/^✅ \d+ test cases generated!$/);
  await expect(toast).toBeVisible();
  const generated = Number((await toast.textContent())!.match(/(\d+) test cases/)![1]);
  expect(generated).toBeGreaterThan(0);
  await expect.poll(async () => (await (await page.request.get(`${stack.apiUrl}/api/test-management`)).json()).suites[0].testCases.length)
    .toBe(before + generated);
  const cases = (await (await page.request.get(`${stack.apiUrl}/api/test-management`)).json()).suites[0].testCases.slice(before);
  expect(cases.every((c: { robotCode?: string }) => c.robotCode?.includes('*** Test Cases ***'))).toBe(true); // with Robot scripts
});

test('029: the Coder screen embeds the code editor through the same-origin /vscode/ proxy', async ({ page }) => {
  await signInThroughBackend(page, stack);
  await page.getByRole('button', { name: 'Coder' }).first().click();
  const frame = page.locator('iframe');
  await expect(frame).toHaveCount(1);
  expect(await frame.getAttribute('src')).toBe(`${stack.frontendUrl}/vscode/`);
});

test('032: a suite is sent to the code editor\'s folder as .robot and as .md', async ({ page }) => {
  await openTestManagement(page);
  const suites = path.join(dir, 'vscode-workspace', 'test-suites');
  await page.getByRole('button', { name: 'Export .robot' }).click();
  await expect(page.getByText(/saved to VS Code workspace/)).toBeVisible();
  const robot = readdirSync(suites).find((f) => f.endsWith('.robot'));
  expect(robot).toBeTruthy();
  const robotText = readFileSync(path.join(suites, robot!), 'utf8');
  expect(robotText).toContain('*** Test Cases ***');

  await page.getByRole('button', { name: 'Export .md' }).click();
  const findMd = () => readdirSync(suites).find((f) => f.endsWith('.md'));
  await expect.poll(findMd).toBeTruthy();
  const md = findMd()!;
  expect(readFileSync(path.join(suites, md), 'utf8')).toMatch(/^# /m);
  expect(existsSync(path.join(dir, 'vscode-workspace', 'specs', md))).toBe(true);
});

test('013: a case keeps every field the SRS lists, as entered', async ({ page }) => {
  await openTestManagement(page);
  await page.getByRole('button', { name: 'Add Case' }).first().click();
  const field = (label: string, tag: 'select' | 'textarea') =>
    page.locator(`xpath=//label[normalize-space()="${label}"]/following::${tag}[1]`);
  await page.getByPlaceholder('Test case title').fill('Watchdog re-arms after warm reset');
  await field('Type', 'select').selectOption('Automated');
  await field('Priority', 'select').selectOption('Critical');
  await field('Preconditions', 'textarea').fill('BMC booted; watchdog enabled');
  await page.getByPlaceholder('Action').first().fill('Issue a warm reset');
  await page.getByPlaceholder('Expected result').first().fill('Watchdog timer restarts within 5 s');
  await page.getByLabel('Post-conditions').fill('BMC healthy');
  await page.getByLabel('Attach files').setInputFiles([{ name: 'wd.log', mimeType: 'text/plain', buffer: Buffer.from('wd ok') }]);
  await page.getByRole('button', { name: 'Add Test Case' }).click();

  const stored = async () => {
    const data = await (await page.request.get(`${stack.apiUrl}/api/test-management`)).json();
    return data.suites.flatMap((s: { testCases: unknown[] }) => s.testCases)
      .find((c: { title: string }) => c.title === 'Watchdog re-arms after warm reset');
  };
  await expect.poll(stored).toBeTruthy();
  const tc = await stored();
  expect(tc.customId).toMatch(/^TC-\d{3}$/);
  expect([tc.type, tc.priority, tc.preconditions, tc.postconditions]).toEqual(['Automated', 'Critical', 'BMC booted; watchdog enabled', 'BMC healthy']);
  expect(tc.steps).toEqual([expect.objectContaining({ step: 1, action: 'Issue a warm reset', expected: 'Watchdog timer restarts within 5 s' })]);
  expect(tc.attachments.map((a: { name: string }) => a.name)).toEqual(['wd.log']);
});

test('023: a run shows a pass/fail donut and its pass %', async ({ page }) => {
  await openTestManagement(page);
  const res = await page.request.put(`${stack.apiUrl}/api/test-management/runs/run-donut`, {
    data: { name: 'Donut Run', suiteId: 'x', environment: 'Lab', status: 'Failed', passedCount: 8, failedCount: 1, blockedCount: 0, untestedCount: 1, executedAt: new Date().toISOString() },
  });
  expect(res.ok()).toBeTruthy();
  await page.reload();
  await page.getByRole('button', { name: 'Test Management', exact: true }).click();
  await page.getByRole('button', { name: /Test Runs/ }).first().click();
  await page.getByText('Donut Run', { exact: true }).click();
  const donut = page.locator('svg[viewBox="0 0 112 112"]');
  await expect(donut.locator('path')).toHaveCount(3); // passed, failed, untested
  await expect(page.getByText('8 Passed', { exact: true })).toBeVisible();
  await expect(page.getByText('1 Failed', { exact: true })).toBeVisible();
  await expect(page.getByText('80%', { exact: true }).first()).toBeVisible();
});
