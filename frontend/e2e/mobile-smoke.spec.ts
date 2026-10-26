import { test, expect } from '@playwright/test';
import { signInAs } from './helpers';

// Baseline mobile coverage, not full responsive support: this app is
// primarily a desktop engineering tool (dense editors, tables), and
// making every screen fully mobile-optimised is out of scope here (see
// the README). What this checks is the one thing that actually
// mattered on a phone viewport: that the sidebar doesn't eat most of
// the screen and push content into an unreadable sliver.

test('login screen fits without horizontal scrolling', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /sign in to platform/i })).toBeVisible();
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // +1: subpixel rounding
});

test('dashboard: sidebar defaults to collapsed, nav is still usable, and content fits', async ({ page }) => {
  await signInAs(page);
  await page.goto('/');
  await expect(page.getByText(/Good (Morning|Afternoon|Evening)/)).toBeVisible();

  // Collapsed means the full-text label isn't shown...
  await expect(page.getByText('Document Editor', { exact: true })).toHaveCount(0);
  // ...but the button is still reachable by its accessible name (aria-label).
  const editorNav = page.getByRole('button', { name: 'Document Editor' });
  await expect(editorNav).toBeVisible();

  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

  await editorNav.click();
  await expect(page.getByRole('button', { name: /New Document/ })).toBeVisible();
});
