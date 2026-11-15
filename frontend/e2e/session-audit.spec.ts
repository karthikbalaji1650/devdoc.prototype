import { test, expect } from '@playwright/test';
import { signInThroughBackend, startStack, type Stack } from './backendHarness';
import { openSystemAndStorage } from './helpers';

// DDS-SRS-011: the server records every sign-in and sign-out, for every
// user on every machine. Admins read everyone's, anyone else only their own.
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
  await openSystemAndStorage(page);
  const leadRow = page.getByRole('row', { name: new RegExp(lead.name) }).first();
  await expect(leadRow).toBeVisible();
  await expect(leadRow).not.toContainText('Active');
  // Sign-in time, sign-out time, role and session length (Duration) are shown.
  const cells = await leadRow.locator('td').allTextContents();
  expect(cells.some((c) => /^(\d+h )?\d+m$/.test(c.trim()))).toBe(true); // e.g. "12m" or "1h 5m"
  await expect(page.getByRole('row', { name: new RegExp(`${admin.name}.*Active`) }).first()).toBeVisible();
});

test('a non-admin sees only their own sign-ins, without the User and Role columns', async ({ page, browser }) => {
  const [admin, , lead] = stack.users;

  // The admin signs in elsewhere: that must not show up for the lead.
  const adminContext = await browser.newContext();
  await signInThroughBackend(await adminContext.newPage(), stack, admin);
  await adminContext.close();

  await signInThroughBackend(page, stack, lead);
  await openSystemAndStorage(page);
  await expect(page.getByText('Your sign-ins only')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'User' })).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: 'Active' }).first()).toBeVisible(); // this session
  await expect(page.getByText(admin.name)).toHaveCount(0);
});
