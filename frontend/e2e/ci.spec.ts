import { test, expect } from '@playwright/test';
import { signInThroughBackend, startStack, type Stack } from './backendHarness';

// DDS-SRS-026/027: an admin creates a CI token; a pipeline uses it to record
// Robot results; the run shows up in Test Runs with the build it came from.
let stack: Stack;
test.beforeAll(async () => { stack = await startStack(4211, 5311); });
test.afterAll(() => stack?.stop());

const OUTPUT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<robot generator="Robot 7.1"><suite id="s1" name="RTC">
<test id="t1" name="TC_RTC_001 Drift"><status status="PASS" elapsed="1.2"/></test>
<test id="t2" name="TC_RTC_002 Alarm"><status status="FAIL" elapsed="0.4">Timeout</status></test>
</suite></robot>`;

test('a CI token records pipeline results as a test run', async ({ page }) => {
  const [admin] = stack.users;
  await signInThroughBackend(page, stack, admin);

  // Load Test Management once so its sample suites exist on the server.
  await page.getByRole('button', { name: 'Test Management', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Run Test' })).toBeVisible();

  await page.getByRole('button', { name: 'Data Management' }).click();
  await page.getByLabel('New token for').fill('Jenkins – firmware');
  await page.getByRole('button', { name: 'Create token' }).click();
  const tokenCode = page.getByRole('status').filter({ hasText: 'will not be shown again' }).locator('code');
  const token = (await tokenCode.textContent())!.trim();
  expect(token).toMatch(/^ddsci_/);
  await expect(page.getByRole('list', { name: 'CI tokens' })).toContainText('Jenkins – firmware');

  // The ready-made upload command names the chosen suite.
  const upload = page.locator('code', { hasText: 'ci/devdoc-ci.sh upload' });
  const suiteId = (await upload.textContent())!.match(/upload '([^']+)'/)![1];

  // What ci/devdoc-ci.sh upload sends, from a Jenkins agent.
  const res = await page.request.post(
    `${stack.apiUrl}/api/ci/results?suiteId=${encodeURIComponent(suiteId)}&name=Jenkins%20%23482&pipeline=Jenkins&buildNumber=482&branch=main&commit=abc1234def&buildUrl=${encodeURIComponent('https://jenkins.example.com/job/fw/482/')}`,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/xml' }, data: OUTPUT_XML },
  );
  expect(res.status()).toBe(200);
  expect((await res.json()).outcome).toBe('failed');

  await page.getByRole('button', { name: 'Test Management', exact: true }).click();
  // Opening Test Management loads what the server holds, the new run included.
  await page.getByRole('button', { name: /Test Runs/ }).first().click();
  const heading = page.getByRole('heading', { name: 'Jenkins #482' });
  await expect(heading).toBeVisible();
  const build = heading.locator('xpath=..').getByTestId('ci-build');
  await expect(build).toHaveText('Jenkins #482 · main @ abc1234def');
  await expect(build.getByRole('link', { name: 'Jenkins #482' })).toHaveAttribute('href', 'https://jenkins.example.com/job/fw/482/');
  await expect(heading.locator('xpath=..')).toContainText('1 Passed · 1 Failed');
});
