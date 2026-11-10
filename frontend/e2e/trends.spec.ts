import { test, expect } from '@playwright/test';
import { signInThroughBackend, startStack, type Stack } from './backendHarness';

// DDS-SRS-023: velocity and pass-rate trend graphs on the Reports dashboard.
let stack: Stack;
test.beforeAll(async () => { stack = await startStack(4222, 5322); });
test.afterAll(() => stack?.stop());

test('Reports shows execution velocity and the pass-rate trend, with a table view', async ({ page }) => {
  const [admin] = stack.users;
  await signInThroughBackend(page, stack, admin);
  await page.getByRole('button', { name: 'Test Management', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Run Test' })).toBeVisible();

  // Five finished runs over the last week, added through the API.
  const day = (ago: number) => new Date(Date.now() - ago * 86_400_000).toISOString();
  const runs = [[6, 30, 10], [5, 34, 6], [3, 38, 2], [1, 36, 4], [0, 40, 0]];
  for (const [ago, passed, failed] of runs) {
    const res = await page.request.put(`${stack.apiUrl}/api/test-management/runs/trend-${ago}`, {
      data: { name: `Nightly ${ago}`, suiteId: 'x', environment: 'Lab', status: 'Completed', passedCount: passed, failedCount: failed, blockedCount: 0, executedAt: day(ago) },
    });
    expect(res.ok()).toBeTruthy();
  }
  await page.getByRole('button', { name: 'Dashboard' }).click();
  await page.getByRole('button', { name: 'Test Management', exact: true }).click();
  await page.getByRole('button', { name: /Reports/ }).first().click();

  const trends = page.getByRole('region', { name: 'Trends' });
  await expect(trends.getByText('Execution velocity')).toBeVisible();
  await expect(trends.getByText(/Test cases executed per day · 200 in 30 days/)).toBeVisible();
  await expect(trends.getByText(/per finished run · 5 runs/)).toBeVisible();
  await expect(trends.locator('svg text', { hasText: /^100%$/ })).toHaveCount(2); // axis tick + latest-value label

  // Keyboard reaches every value too.
  await trends.getByRole('img', { name: /Test cases executed per day/ }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(trends.getByRole('status')).toContainText('40 executed');

  await trends.getByRole('button', { name: 'Show as table' }).click();
  const table = trends.getByRole('table', { name: 'Pass rate per finished run' });
  await expect(table.getByRole('row')).toHaveCount(6);
  await expect(table.getByRole('row').nth(1)).toContainText('75%');
});
