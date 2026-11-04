import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, signInAs, seedDocuments } from './fixtures';

async function scan(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return results.violations.map(
    (v) => `${v.id} (${v.impact}) x${v.nodes.length}: ${v.help}\n` +
      v.nodes.map((n) => `    ${n.target.join(' ')}  ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`).join('\n'),
  );
}

test.describe('accessibility (axe, WCAG 2 A/AA)', () => {
  test('login screen', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /sign in to platform/i })).toBeVisible();
    expect(await scan(page)).toEqual([]);
  });

  test('dashboard', async ({ page }) => {
    await signInAs(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Engineering workspace' })).toBeVisible();
    expect(await scan(page)).toEqual([]);
  });

  test('documents list', async ({ page }) => {
    await signInAs(page);
    await seedDocuments(page, [{ id: 'd1', title: 'Firmware Report', docNumber: 'FW-1', author: 'Manivannan Thangavel' }]);
    await page.getByRole('button', { name: 'Document Editor' }).first().click();
    await expect(page.getByText('Firmware Report')).toBeVisible();
    expect(await scan(page)).toEqual([]);
  });

  test('document editor', async ({ page }) => {
    await signInAs(page);
    await seedDocuments(page, [{ id: 'd1', title: 'Firmware Report', docNumber: 'FW-1', author: 'Manivannan Thangavel' }]);
    await page.getByRole('button', { name: 'Document Editor' }).first().click();
    await page.getByText('Firmware Report').first().click();
    await expect(page.getByText('Document Title', { exact: true })).toBeVisible();
    expect(await scan(page)).toEqual([]);
  });

  test('settings', async ({ page }) => {
    await signInAs(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings' }).first().click();
    await expect(page.getByRole('heading').first()).toBeVisible();
    expect(await scan(page)).toEqual([]);
  });

  test('settings: system & storage', async ({ page }) => {
    await signInAs(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings' }).first().click();
    await page.getByRole('button', { name: /System & Storage/i }).click();
    await expect(page.getByText('Download server backup')).toBeVisible();
    expect(await scan(page)).toEqual([]);
  });

  test('test management', async ({ page }) => {
    await signInAs(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Test Management' }).first().click();
    await page.waitForTimeout(800);
    expect(await scan(page)).toEqual([]);
  });

  test('coder', async ({ page }) => {
    await signInAs(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Coder' }).first().click();
    await page.waitForTimeout(500);
    expect(await scan(page)).toEqual([]);
  });

  test('release master', async ({ page }) => {
    await signInAs(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Release Master' }).first().click();
    await expect(page.getByRole('tab', { name: /v13\.04\.00/ })).toBeVisible();
    expect(await scan(page)).toEqual([]);
    await page.getByRole('tab', { name: /^Builds/ }).click();
    expect(await scan(page)).toEqual([]);
  });

  test('incident tracker', async ({ page }) => {
    await signInAs(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Incident Tracker' }).first().click();
    await expect(page.getByRole('heading', { name: /Incident Reporting/i })).toBeVisible();
    expect(await scan(page)).toEqual([]);
  });

  test('reviewers log', async ({ page }) => {
    await signInAs(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Reviewers Log' }).first().click();
    await expect(page.getByRole('heading', { name: /Document Reviewers Log/i })).toBeVisible();
    expect(await scan(page)).toEqual([]);
  });

});

test.describe('dialogs are keyboard accessible', () => {
  test('version history: axe-clean, Escape closes, focus returns to the button that opened it', async ({ page }) => {
    await signInAs(page);
    await seedDocuments(page, [{ id: 'd1', title: 'Firmware Report', docNumber: 'FW-1', author: 'Manivannan Thangavel' }]);
    await page.getByRole('button', { name: 'Document Editor' }).first().click();
    await page.getByText('Firmware Report').first().click();
    const opener = page.getByRole('button', { name: /History/ });
    await opener.focus();
    await opener.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Version history' });
    await expect(dialog).toBeVisible();
    expect(await scan(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('doc bin: Escape closes and Tab stays inside the dialog', async ({ page }) => {
    await signInAs(page);
    await seedDocuments(page, [{ id: 'd1', title: 'Firmware Report', docNumber: 'FW-1', author: 'Manivannan Thangavel' }]);
    await page.getByRole('button', { name: 'Document Editor' }).first().click();
    await page.getByRole('button', { name: 'Doc Bin' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Doc Bin' });
    await expect(dialog).toBeVisible();
    expect(await scan(page)).toEqual([]);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});
