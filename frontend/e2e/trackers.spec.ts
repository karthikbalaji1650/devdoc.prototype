import { test, expect } from '@playwright/test';
import { signInThroughBackend, startStack, type Stack } from './backendHarness';

// DDS-SRS-044: an admin connects Jira; a release's blockers are synced from a
// JQL query and linked by key, read from the tracker (the harness's fake Jira).
let stack: Stack;
test.beforeAll(async () => { stack = await startStack(4233, 5333); });
test.afterAll(() => stack?.stop());

test('release blockers are read from Jira by query and by key', async ({ page }) => {
  const [admin] = stack.users;
  await signInThroughBackend(page, stack, admin);

  // Connect Jira (Cloud) and test the connection.
  await page.getByRole('button', { name: 'Data Management' }).click();
  const jira = page.getByRole('form', { name: 'Jira connection' });
  await jira.getByLabel('Site URL').fill(`${stack.apiUrl}/__e2e/jira`);
  await jira.getByLabel('Account email').fill('qa@example.com');
  await jira.getByLabel('API token', { exact: true }).fill('e2e-jira-token');
  await jira.getByRole('button', { name: 'Save Jira' }).click();
  await expect(page.getByText('Jira connection saved.')).toBeVisible();
  await jira.getByRole('button', { name: 'Test' }).click();
  await expect(page.getByText('Jira: signed in as QA Bot.')).toBeVisible();

  // Release Master: sample releases load after Test Management's sample runs.
  await page.getByRole('button', { name: 'Test Management', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Run Test' })).toBeVisible();
  await page.getByRole('button', { name: 'Release Master' }).first().click();
  await page.getByRole('tab', { name: /v13\.04\.00/ }).click();
  await page.getByRole('tab', { name: /^Blockers/ }).click();

  const query = page.getByRole('region', { name: 'Blocker query' });
  await query.getByLabel('Jira JQL').fill('fixVersion = "v13.04.00" AND labels = release-blocker');
  await query.getByRole('button', { name: 'Save and sync' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Blocker query saved and synced.' })).toBeVisible();

  const table = page.getByRole('table', { name: 'Release blockers' });
  const row = (key: string) => table.getByRole('row').filter({ hasText: key });
  await expect(row('FW-101')).toContainText('BMC hangs after warm reset');
  await expect(row('FW-101')).toContainText('Blocker');
  await expect(row('FW-101')).toContainText('from query');
  await expect(row('FW-102')).toContainText('Critical');
  await expect(row('FW-103')).toContainText('Closed');
  await expect(row('FW-101').getByRole('link', { name: 'FW-101' })).toHaveAttribute('href', `${stack.apiUrl}/__e2e/jira/browse/FW-101`);
  await expect(row('FW-101').getByRole('button', { name: 'Close' })).toHaveCount(0); // status comes from Jira

  // Link one more by key.
  const link = page.getByRole('form', { name: 'Link issue' });
  await link.getByLabel('Issue key').fill('FW-200');
  await link.getByRole('button', { name: 'Link issue' }).click();
  await expect(row('FW-200')).toContainText('Watchdog not re-armed');
  await expect(row('FW-200')).toContainText('linked');
  await expect(page.getByRole('tab', { name: /^Blockers/ })).toContainText('open');
});
