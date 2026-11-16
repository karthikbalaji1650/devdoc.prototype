import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, signInAs, seedDocuments } from './fixtures';

// Reduced motion switches off the sidebar's fade, so axe measures the final
// colours rather than a half-faded label. The Coder screen embeds code-server's
// own page in an iframe; that third-party page is not ours to fix, so it is skipped.
async function scan(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('iframe').analyze();
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
    await expect(page.getByText(/Good (Morning|Afternoon|Evening)/)).toBeVisible();
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

  test('release master', async ({ page, stack }) => {
    await signInAs(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Release Master' }).first().click();
    await expect(page.getByText(/No releases yet/)).toBeVisible();
    expect(await scan(page)).toEqual([]);
    await page.getByRole('link', { name: 'New release' }).click();
    await expect(page.getByRole('form', { name: 'New release' })).toBeVisible();
    await page.getByRole('combobox', { name: 'Add a signer' }).fill('Jud');
    await expect(page.getByRole('listbox', { name: 'People' }).getByRole('option').first()).toBeVisible();
    expect(await scan(page)).toEqual([]);
    // A release, and each of its tabs.
    const people = await (await page.request.get(`${stack.apiUrl}/api/users?q=Vaishnavi`)).json();
    const created = await page.request.post(`${stack.apiUrl}/api/releases`, {
      data: { version: 'v1.0.0', type: 'Minor', targetDate: '2026-12-01', signerIds: [people.users[0].id] },
    });
    const id = (await created.json()).release.id;
    for (const tab of ['', '/builds', '/blockers', '/notes', '/audit']) {
      await page.goto(`/releases/${id}${tab}`);
      await expect(page.getByRole('tablist', { name: 'Release sections' })).toBeVisible();
      expect(await scan(page)).toEqual([]);
    }
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
