import { test, expect } from '@playwright/test';
import { signInAs } from './helpers';

// The browser-only demo (no VITE_API_BASE_URL): anyone can look around, but
// documents and other shared data live on the server, so nothing is saved
// and nothing is kept in this browser.

test('any password signs in to the demo', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('Enter your password').fill('anything');
  await page.getByRole('button', { name: /sign in to platform/i }).click();
  await expect(page.getByText(/Good (Morning|Afternoon|Evening)/)).toBeVisible();
});

test('shows the sample document read-only, and says edits cannot be saved', async ({ page }) => {
  await signInAs(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Document Editor' }).first().click();
  await expect(page.getByText('ADR 0042: Migration from REST Polling to WebSocket State Streaming').first()).toBeVisible();

  await page.getByRole('button', { name: /New Document|Create/ }).first().click();
  await expect(page.getByText(/stored on the server - this browser-only demo cannot save them/)).toBeVisible();
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys.filter((k) => /documents|doc_history|doc_bin|current_doc/.test(k))).toEqual([]);
});
