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

test('dashboard: sidebar is open on load, a tap on the content closes it, nav still works, and content fits', async ({ page }) => {
  await signInAs(page);
  await page.goto('/');
  await expect(page.getByText(/Good (Morning|Afternoon|Evening)/)).toBeVisible();

  // Open on load, as on desktop.
  await expect(page.getByRole('button', { name: 'Minimize sidebar' })).toHaveAttribute('aria-expanded', 'true');

  // A tap on the content closes it, giving the page the width back.
  await page.locator('header h1').click();
  await expect(page.getByRole('button', { name: 'Maximize sidebar' })).toHaveAttribute('aria-expanded', 'false');

  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

  // The nav is still usable from the closed rail (icons, by accessible name).
  await page.getByRole('button', { name: 'Document Editor' }).click();
  await expect(page.getByRole('button', { name: /New Document/ })).toBeVisible();
});
