import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { signInAs } from './helpers';

async function openTestManagement(page: Page) {
  await page.getByRole('button', { name: 'Test Management', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add Case' }).first()).toBeVisible();
}

test.describe('test case fields (DDS-SRS-013)', () => {
  test('a new case gets a sequential TC id, post-conditions and attachments, and keeps them after reload', async ({ page }) => {
    await signInAs(page);
    await page.goto('/');
    await openTestManagement(page);

    await page.getByRole('button', { name: 'Add Case' }).first().click();
    await expect(page.getByRole('heading', { name: /Add Test Case\s*TC-001/ })).toBeVisible();
    await page.getByPlaceholder('Test case title').fill('BMC reboots cleanly after flash');
    await page.getByLabel('Post-conditions').fill('Primary image bank active again');
    await page.getByLabel('Attach files').setInputFiles([
      { name: 'boot.log', mimeType: 'text/plain', buffer: Buffer.from('U-Boot 2019.04\nBooting kernel...\n') },
      { name: 'huge.log', mimeType: 'text/plain', buffer: Buffer.alloc(600 * 1024, 'x') },
    ]);
    await expect(page.getByRole('link', { name: 'boot.log' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('huge.log'); // over the per-file cap: refused, and said so
    await page.getByRole('button', { name: 'Add Test Case' }).click();

    await page.reload();
    await openTestManagement(page);
    await page.getByText('BMC reboots cleanly after flash').click();
    await expect(page.getByText('TC-001').first()).toBeVisible();
    await expect(page.getByText('Primary image bank active again')).toBeVisible();
    await expect(page.getByRole('link', { name: 'boot.log' })).toHaveAttribute('download', 'boot.log');

    // The next case continues the sequence.
    await page.getByRole('button', { name: 'Add Case' }).first().click();
    await expect(page.getByRole('heading', { name: /Add Test Case\s*TC-002/ })).toBeVisible();
  });
});

test.describe('CSV / JSON / XML exchange (DDS-SRS-015)', () => {
  for (const format of ['csv', 'json', 'xml'] as const) {
    test(`exporting as ${format} and importing the file back adds copies with fresh IDs`, async ({ page }) => {
      await signInAs(page);
      await page.goto('/');
      await openTestManagement(page);
      const rows = page.getByText(/^C\d$/);
      const before = await rows.count();
      expect(before).toBeGreaterThan(0);

      const download = page.waitForEvent('download');
      await page.getByLabel('Export test cases').selectOption(format);
      const file = await download;
      expect(file.suggestedFilename()).toMatch(new RegExp(`_test_cases\\.${format}$`));

      // Playwright stores downloads under a random, extension-less name; hand the
      // importer the file under the name a user would actually have saved it as.
      const buffer = readFileSync(await file.path());
      await page.getByLabel('Import test cases (CSV, JSON or XML)').setInputFiles({ name: file.suggestedFilename(), mimeType: 'text/plain', buffer });
      await expect(page.getByText(`Imported ${before} test case`)).toBeVisible();
      // Originals keep C1.. ; the clashing copies continue the TC sequence.
      await expect(rows).toHaveCount(before);
      await expect(page.getByText('TC-001', { exact: true }).first()).toBeVisible();
      await expect(page.getByText(`TC-${String(before).padStart(3, '0')}`, { exact: true }).first()).toBeVisible();
    });
  }

  test('a malformed file is rejected with a message', async ({ page }) => {
    await signInAs(page);
    await page.goto('/');
    await openTestManagement(page);
    await page.getByLabel('Import test cases (CSV, JSON or XML)').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{oops') });
    await expect(page.getByText('JSON: the file is not valid JSON.')).toBeVisible();
  });
});

test.describe('defect links on failed results (DDS-SRS-018)', () => {
  test('issue IDs can be linked to a failed result and persist', async ({ page }) => {
    await signInAs(page);
    await page.goto('/');
    await openTestManagement(page);
    const openDefects = async () => {
      await page.getByRole('button', { name: /Test Runs/ }).first().click();
      await page.getByText('[Regression] Full Release v5.67').click();
      await page.getByRole('button', { name: 'Defects' }).click();
    };
    await openDefects();

    const input = page.getByLabel('Issue IDs for C3');
    await input.fill('WH3-1210, #482 WH3-1210');
    await input.press('Enter');
    await expect(page.getByText('WH3-1210', { exact: true })).toHaveCount(1); // de-duplicated
    await expect(page.getByText('#482', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Remove #482 from C3' }).click();

    await page.reload();
    await openTestManagement(page);
    await openDefects();
    await expect(page.getByText('WH3-1210', { exact: true })).toBeVisible();
    await expect(page.getByText('#482', { exact: true })).toHaveCount(0);
  });
});

test.describe('test summary reports (DDS-SRS-024)', () => {
  test('a run downloads as CSV and HTML, and opens a print-ready report for PDF', async ({ page }) => {
    await signInAs(page);
    await page.goto('/');
    await openTestManagement(page);
    await page.getByRole('button', { name: /Test Runs/ }).first().click();
    await page.getByText('[Regression] Full Release v5.67').click();
    const report = page.getByLabel('Download test summary report');

    for (const format of ['csv', 'html'] as const) {
      const download = page.waitForEvent('download');
      await report.selectOption(format);
      const file = await download;
      expect(file.suggestedFilename()).toBe(`Regression_Full_Release_v5_67_test_summary.${format}`);
      const text = readFileSync(await file.path(), 'utf8');
      expect(text).toContain(format === 'csv' ? 'Case ID,Title,Status' : '5. Sign-off');
    }

    const popup = page.waitForEvent('popup');
    await report.selectOption('pdf');
    const tab = await popup;
    await expect(tab.getByRole('heading', { name: '[Regression] Full Release v5.67' })).toBeVisible();
    await expect(tab.getByText('3. Failures and defects')).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Save as PDF');
  });
});
