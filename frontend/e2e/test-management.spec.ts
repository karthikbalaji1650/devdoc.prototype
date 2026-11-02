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
