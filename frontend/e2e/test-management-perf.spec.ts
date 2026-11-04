import { test, expect } from '@playwright/test';
import { signInThroughBackend, startStack, type Stack } from './backendHarness';

// DDS-SRS-073: suites of 5,000+ test cases load in under 500 ms.
const CASES = 5000;
let stack: Stack;
test.beforeAll(async () => { stack = await startStack(4144, 5230); });
test.afterAll(() => stack?.stop());

function bigSuite() {
  const testCases = Array.from({ length: CASES }, (_, i) => ({
    id: `tc-${i}`, suiteId: 'big', customId: `TC-${String(i + 1).padStart(5, '0')}`,
    title: `BMC firmware check number ${i + 1} under sustained load`,
    preconditions: 'AST2600 BMC powered on, NTP disabled, PTP reference active',
    type: i % 3 ? 'Manual' : 'Automated', priority: 'P2', sectionId: i % 2 ? 'sec-a' : 'sec-b',
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

test('a 5,000-case suite opens in under 500 ms', async ({ page }) => {
  test.setTimeout(120_000);
  await stack.reset();
  await signInThroughBackend(page, stack);
  const openTestManagement = () => page.getByRole('button', { name: 'Test Management', exact: true }).click();
  const leave = () => page.getByRole('button', { name: 'Dashboard', exact: true }).click();

  // Warm-up: the dev server compiles the screen's code on first use, which
  // a production build never does - keep that out of the measurement.
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
  const median = [...timings].sort((a, b) => a - b)[1];
  console.log(`opening Test Management with ${CASES} cases: ${timings.join(', ')} ms (median ${median} ms)`);
  expect(median).toBeLessThan(500);

  // Every case is still reachable: search covers all of them, not just the first page.
  await openTestManagement();
  await expect(page.getByText(/Showing 100 of 2500 cases in Section A/)).toBeVisible();
  await page.getByPlaceholder('Search test cases...').fill('TC-04999');
  await expect(page.getByText('TC-04999', { exact: true })).toBeVisible();
});
