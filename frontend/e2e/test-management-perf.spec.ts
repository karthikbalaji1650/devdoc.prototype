import { test, expect } from '@playwright/test';
import { signInThroughBackend, startStack, type Stack } from './backendHarness';

// DDS-SRS-073: "Database query responses for fetching test suites with
// 5,000+ cases must complete within < 500 ms". Measured as the API response
// that returns the suite. Opening the whole screen with it (fetch + render)
// is held to the navigation budget of DDS-SRS-071 (1.5 s), on a production
// build as in navigation-perf.spec.ts.
const CASES = 5000;
const QUERY_BUDGET_MS = 500;
const SCREEN_BUDGET_MS = 1500;
let stack: Stack;
test.beforeAll(async () => { stack = await startStack(4144, 5230, { production: true }); });
test.afterAll(() => stack?.stop());

function bigSuite() {
  const testCases = Array.from({ length: CASES }, (_, i) => ({
    id: `tc-${i}`, suiteId: 'big', customId: `TC-${String(i + 1).padStart(5, '0')}`,
    title: `BMC firmware check number ${i + 1} under sustained load`,
    preconditions: 'AST2600 BMC powered on, NTP disabled, PTP reference active',
    type: i % 3 ? 'Manual' : 'Automated', priority: 'High', sectionId: i % 2 ? 'sec-a' : 'sec-b',
    createdAt: '2026-11-04T00:00:00Z', expectedResult: 'Drift stays below 50 ms',
    labels: ['Firmware', 'RTC'], references: ['WH3-1205'],
    steps: [1, 2, 3, 4].map((s) => ({ step: s, action: `Step ${s}: read the RTC epoch via IPMI and compare`, expected: 'Valid epoch returned' })),
  }));
  return {
    projects: [], runs: [], milestones: [],
    suites: [{ id: 'big', title: 'Big Suite', description: '', module: 'Perf', createdAt: '2026-11-04T00:00:00Z',
      sections: [{ id: 'sec-a', suiteId: 'big', title: 'Section A', order: 0 }, { id: 'sec-b', suiteId: 'big', title: 'Section B', order: 1 }],
      testCases }],
  };
}

test('a 5,000-case suite is fetched in under 500 ms, and the screen opens in under 1.5 s', async ({ page }) => {
  test.setTimeout(120_000);
  await stack.reset();
  await signInThroughBackend(page, stack);
  const openTestManagement = () => page.getByRole('button', { name: 'Test Management', exact: true }).click();
  const leave = () => page.getByRole('button', { name: 'Dashboard', exact: true }).click();

  // Warm-up: load the screen's code once, outside the measurement.
  await openTestManagement();
  await expect(page.getByRole('button', { name: 'Add Case' }).first()).toBeVisible();
  await leave();

  await stack.reset();
  const apiBase = stack.frontendUrl.replace('5230', '4144');
  const seeded = await page.evaluate(async ([url, body]) =>
    (await fetch(`${url}/api/test-management/seed`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).status,
  [apiBase, bigSuite()] as const);
  expect(seeded).toBe(200);

  // Each open fetches every case from the server again and draws the screen.
  const timings: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    await openTestManagement();
    await expect(page.getByText('TC-00001', { exact: true })).toBeVisible({ timeout: 30_000 });
    timings.push(Date.now() - t0);
    await leave();
  }
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[1];

  // The query itself: the API response with every case, timed in the browser.
  const queries: number[] = [];
  for (let i = 0; i < 3; i++) {
    queries.push(await page.evaluate(async (url) => {
      const t0 = performance.now();
      const res = await fetch(`${url}/api/test-management`, { credentials: 'include' });
      const data = await res.json();
      if (data.suites[0].testCases.length !== 5000) throw new Error('not every case was returned');
      return Math.round(performance.now() - t0);
    }, apiBase));
  }
  console.log(`fetching ${CASES} cases: ${queries.join(', ')} ms (median ${median(queries)} ms); `
    + `opening the screen: ${timings.join(', ')} ms (median ${median(timings)} ms)`);
  expect(median(queries), 'API response with every case').toBeLessThan(QUERY_BUDGET_MS);
  expect(median(timings), 'opening Test Management').toBeLessThan(SCREEN_BUDGET_MS);

  // Every case is still reachable: search covers all of them, not just the first page.
  await openTestManagement();
  await expect(page.getByText(/Showing 100 of 2500 cases in Section A/)).toBeVisible();
  await page.getByPlaceholder('Search test cases...').fill('TC-04999');
  await expect(page.getByText('TC-04999', { exact: true })).toBeVisible();
});
