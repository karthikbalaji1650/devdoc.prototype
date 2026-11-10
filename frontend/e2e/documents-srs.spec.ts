import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { test, expect, signInAs, seedDocuments, serverDocument } from './fixtures';

// Document editor requirements, end to end against the real API:
// 002 / 003 / 004 (who sees and edits what), 005 (Drive status on the
// dashboard), 009 (saved into the code editor's folder, through the real
// file bridge), 010 (downloaded files and their content).
const ADMIN = 'Manivannan Thangavel';
const OTHER = 'Judia Lumina';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const titleInput = (page: Page) =>
  page.getByText('Document Title', { exact: true }).first().locator('xpath=following::input[1]');

async function openEditor(page: Page, title: string) {
  await page.getByRole('button', { name: 'Document Editor' }).first().click();
  await page.getByText(title, { exact: true }).first().click();
  await expect(titleInput(page)).toBeVisible();
}

test.describe('who sees and edits what (DDS-SRS-002, 003, 004)', () => {
  test('002: a non-admin cannot edit a document someone else wrote', async ({ page }) => {
    await signInAs(page, 'firmware-lead');
    await seedDocuments(page, [{ id: 'd1', title: 'Admin Draft', docNumber: 'D-1', author: ADMIN }]);
    await openEditor(page, 'Admin Draft');
    await titleInput(page).fill('Hijacked');
    await expect(page.getByText('Read-only: you can only edit documents you authored.').first()).toBeVisible();
    await page.waitForTimeout(1500); // longer than the autosave delay
    expect((await serverDocument(page, 'd1'))?.metadata.title).toBe('Admin Draft');
  });

  test('002: the same user can edit their own document', async ({ page }) => {
    await signInAs(page, 'firmware-lead');
    await seedDocuments(page, [{ id: 'd1', title: 'My Draft', docNumber: 'D-1', author: OTHER }]);
    await openEditor(page, 'My Draft');
    await titleInput(page).fill('My Draft v2');
    await expect.poll(async () => (await serverDocument(page, 'd1'))?.metadata.title).toBe('My Draft v2');
  });

  test('003: an admin sees documents in every status, including other people\'s', async ({ page }) => {
    await signInAs(page, 'admin');
    await seedDocuments(page, [
      { id: 'a', title: 'Lead Draft', docNumber: 'A', author: OTHER, status: 'DRAFT' },
      { id: 'b', title: 'Lead Approved', docNumber: 'B', author: OTHER, status: 'APPROVED' },
      { id: 'c', title: 'Lead Published', docNumber: 'C', author: OTHER, status: 'PUBLISHED' },
    ]);
    await page.getByRole('button', { name: 'Document Editor' }).first().click();
    for (const t of ['Lead Draft', 'Lead Approved', 'Lead Published']) {
      await expect(page.getByText(t, { exact: true })).toBeVisible();
    }
    await page.getByText('Lead Approved', { exact: true }).click();
    await expect(titleInput(page)).toHaveValue('Lead Approved');
  });

  test('004: an admin edits a document someone else wrote, and its author is kept', async ({ page }) => {
    await signInAs(page, 'admin');
    await seedDocuments(page, [{ id: 'd1', title: 'Lead Doc', docNumber: 'D-1', author: OTHER }]);
    await openEditor(page, 'Lead Doc');
    await titleInput(page).fill('Lead Doc (admin edit)');
    await expect.poll(async () => (await serverDocument(page, 'd1'))?.metadata.title).toBe('Lead Doc (admin edit)');
    const stored = (await serverDocument(page, 'd1')) as { metadata: { author: string } } | null;
    expect(stored?.metadata.author).toBe(OTHER);
  });
});

test('005: the dashboard shows the latest Google Drive upload', async ({ page, stack }) => {
  await signInAs(page, 'admin');
  await page.goto('/');
  await expect(page.getByText('Not synced yet')).toBeVisible();
  const res = await page.request.put(`${stack.apiUrl}/api/collections/drive-exports/export-e2e-1`, {
    data: { id: 'export-e2e-1', docTitle: 'RTC Analysis', docNumber: 'TA-7', driveUrl: 'https://docs.google.com/document/d/x/edit', exportedAt: new Date().toISOString() },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  await page.reload();
  await expect(page.getByText(/^Synced /)).toBeVisible();
  await expect(page.getByText('RTC Analysis', { exact: true })).toBeVisible();
});

test.describe('saving and downloading (DDS-SRS-009, 010)', () => {
  let bridge: ChildProcess | undefined;
  let dir = '';
  test.afterEach(() => {
    bridge?.kill();
    bridge = undefined;
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = '';
  });

  test('009: the document is saved into the code editor\'s folder, and .docx + .md downloaded', async ({ page }, testInfo) => {
    // The real file bridge, with its workspace in a temp folder.
    dir = mkdtempSync(path.join(tmpdir(), 'devdoc-bridge-'));
    const port = 18200 + testInfo.parallelIndex;
    bridge = spawn('python3', ['-I', path.join(ROOT, 'sandbox', 'file_bridge.py')], {
      cwd: dir, stdio: 'ignore', env: { ...process.env, BRIDGE_PORT: String(port) },
    });
    await expect.poll(async () => (await fetch(`http://127.0.0.1:${port}/health`).catch(() => null))?.ok ?? false).toBe(true);

    await signInAs(page, 'admin');
    await page.addInitScript((url) => localStorage.setItem('devdoc_file_bridge_url', url), `http://127.0.0.1:${port}`);
    await seedDocuments(page, [{ id: 'd1', title: 'RTC Clock Analysis', docNumber: 'TA-9', author: ADMIN }]);
    await openEditor(page, 'RTC Clock Analysis');

    const downloads: string[] = [];
    page.on('download', (d) => downloads.push(d.suggestedFilename()));
    let alertText = '';
    page.on('dialog', (d) => { alertText = d.message(); void d.accept(); });
    await page.getByRole('button', { name: 'Export options' }).click();
    await page.getByRole('button', { name: 'Save to VS Code Workspace (.md)' }).click();

    await expect.poll(() => alertText).toContain('saved directly into VS Code workspace');
    const md = path.join(dir, 'vscode-workspace', 'docs', 'TA-9_rtc_clock_analysis.md');
    expect(existsSync(md)).toBe(true);
    const text = readFileSync(md, 'utf8');
    expect(text).toContain('# RTC Clock Analysis');
    expect(text).toContain('**Document Number:** TA-9');
    expect(text).toContain('Sample content');
    expect(existsSync(path.join(dir, 'vscode-workspace', 'specs', 'TA-9_rtc_clock_analysis.md'))).toBe(true);
    await expect.poll(() => downloads.sort()).toEqual(['TA-9_rtc_clock_analysis.docx', 'TA-9_rtc_clock_analysis.md']);
  });

  test('009: without the bridge, both files are still downloaded and the user is told', async ({ page }) => {
    await signInAs(page, 'admin');
    await page.addInitScript(() => localStorage.setItem('devdoc_file_bridge_url', 'http://127.0.0.1:1'));
    await seedDocuments(page, [{ id: 'd1', title: 'Offline Doc', docNumber: 'TA-1', author: ADMIN }]);
    await openEditor(page, 'Offline Doc');
    let alertText = '';
    page.on('dialog', (d) => { alertText = d.message(); void d.accept(); });
    await page.getByRole('button', { name: 'Export options' }).click();
    await page.getByRole('button', { name: 'Save to VS Code Workspace (.md)' }).click();
    await expect.poll(() => alertText).toContain('Could not reach the VS Code file-bridge');
  });

  test('010: Export Word downloads a .docx with the document in it', async ({ page }) => {
    await signInAs(page, 'admin');
    await seedDocuments(page, [{ id: 'd1', title: 'Firmware Upgrade Plan', docNumber: 'TA-3', author: ADMIN }]);
    await openEditor(page, 'Firmware Upgrade Plan');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export Word' }).click()]);
    expect(download.suggestedFilename()).toMatch(/\.docx$/);
    const file = await download.path();
    const xml = execFileSync('unzip', ['-p', file, 'word/document.xml']).toString();
    expect(xml).toContain('Firmware Upgrade Plan');
    expect(xml).toContain('Sample content');
  });

  test('010: Save Draft Project downloads the document as JSON', async ({ page }) => {
    await signInAs(page, 'admin');
    await seedDocuments(page, [{ id: 'd1', title: 'JSON Doc', docNumber: 'TA-4', author: ADMIN }]);
    await openEditor(page, 'JSON Doc');
    await page.getByRole('button', { name: 'Export options' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save Draft Project (JSON)' }).click()]);
    expect(download.suggestedFilename()).toBe('TA-4_draft.json');
    const doc = JSON.parse(readFileSync(await download.path(), 'utf8'));
    expect(doc.metadata.title).toBe('JSON Doc');
    expect(doc.sections[0].content).toBe('Sample content');
  });
});
