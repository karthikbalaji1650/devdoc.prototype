import { test, expect } from '@playwright/test';
import { signInThroughBackend, startStack, type Stack } from './backendHarness';

// DDS-SRS-011: the server records every sign-in and sign-out, for every
// user on every machine; only admins can read the log.
let stack: Stack;
test.beforeAll(async () => { stack = await startStack(4155, 5240); });
test.afterAll(() => stack?.stop());

test('an admin sees real sign-ins from other browsers, with sign-outs', async ({ page, browser }) => {
  const [admin, , lead] = stack.users;

  // Another user signs in and out in a separate browser.
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await signInThroughBackend(other, stack, lead);
  await other.getByRole('button', { name: /log ?out|sign ?out/i }).first().click();
  await expect(other.getByPlaceholder('Enter your password')).toBeVisible();
  await otherContext.close();

  await signInThroughBackend(page, stack, admin);
  await page.getByRole('button', { name: 'Data Management' }).click();
  const leadRow = page.getByRole('row', { name: new RegExp(lead.name) }).first();
  await expect(leadRow).toBeVisible();
  await expect(leadRow).not.toContainText('Active');
  // Sign-in time, sign-out time, role and session length (Duration) are shown.
  const cells = await leadRow.locator('td').allTextContents();
  expect(cells.some((c) => /^(\d+h )?\d+m$/.test(c.trim()))).toBe(true); // e.g. "12m" or "1h 5m"
  await expect(page.getByRole('row', { name: new RegExp(`${admin.name}.*Active`) }).first()).toBeVisible();
});
