import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { signInThroughBackend, startStack, type Stack } from './backendHarness';

// Test Management is server-only (its data lives in Redis behind the API),
// so these run against a real API on their own ports. One worker, in file
// order: they share that server, which is reset before each test.
test.describe.configure({ mode: 'default' });

let stack: Stack;
test.beforeAll(async () => { stack = await startStack(4133, 5220); });
test.afterAll(() => stack?.stop());
test.beforeEach(async () => { await stack.reset(); });

const signIn = (page: Page) => signInThroughBackend(page, stack);

async function openTestManagement(page: Page) {
  await page.getByRole('button', { name: 'Test Management', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add Case' }).first()).toBeVisible();
}

test.describe('shared on the server', () => {
  test('a case one user adds is visible to another user', async ({ page, browser }) => {
    await signIn(page);
    await openTestManagement(page);
    await page.getByRole('button', { name: 'Add Case' }).first().click();
    await page.getByPlaceholder('Test case title').fill('Shared across users');
    await page.getByRole('button', { name: 'Add Test Case' }).click();
    await expect(page.getByText('Shared across users')).toBeVisible();

    const otherContext = await browser.newContext();
    const other = await otherContext.newPage();
    await signInThroughBackend(other, stack, stack.users[2]);
    await openTestManagement(other);
    await expect(other.getByText('Shared across users')).toBeVisible();
    await otherContext.close();
  });

  test('the reusable test case library is shared too', async ({ page, browser }) => {
    await signIn(page);
    await openTestManagement(page);
    await page.getByText('RTC Clock Drift Verification under 1-Hour Stress Load').click();
    await page.getByRole('button', { name: 'Save to Library' }).click();
    await expect(page.getByText(/Saved "C1" to the reusable library/)).toBeVisible();

    const otherContext = await browser.newContext();
    const other = await otherContext.newPage();
    await signInThroughBackend(other, stack, stack.users[2]);
    await openTestManagement(other);
    await other.getByRole('button', { name: 'Import from Library' }).click();
    const modal = other.getByRole('heading', { name: 'Import from Library' }).locator('xpath=ancestor::div[contains(@class, "max-w-2xl")]');
    await expect(modal.getByText('RTC Clock Drift Verification under 1-Hour Stress Load')).toBeVisible();
    await otherContext.close();
  });
});

/** Answers the next prompt()/confirm() with `answer`. */
function answerNextDialog(page: Page, answer?: string) {
  page.once('dialog', (d) => void d.accept(answer));
}

test.describe('projects and sub-sections (DDS-SRS-012)', () => {
  test('suites are grouped by project, and a new suite lands in the project being viewed', async ({ page }) => {
    await signIn(page);
    await openTestManagement(page);
    const picker = page.getByLabel('Project', { exact: true });
    const suiteList = page.getByRole('button', { name: /AST2600 RTC Clock/ });

    await picker.selectOption({ label: 'AST2600 BMC Firmware' });
    await expect(suiteList.first()).toBeVisible();

    answerNextDialog(page, 'Gen5 Platform');
    await page.getByRole('button', { name: 'Add project' }).click();
    await expect(picker).toHaveValue(/project-/);
    await expect(page.getByText('No suites in this project yet.')).toBeVisible();
    await expect(suiteList).toHaveCount(0);

    answerNextDialog(page, 'PCIe Link Training');
    await page.getByRole('button', { name: 'Add suite' }).click();
    await expect(page.getByRole('button', { name: /PCIe Link Training/ }).first()).toBeVisible();

    // Kept on the server: still in its project after a reload.
    await page.reload();
    await openTestManagement(page);
    await page.getByLabel('Project', { exact: true }).selectOption({ label: 'Gen5 Platform' });
    await expect(page.getByRole('button', { name: /PCIe Link Training/ }).first()).toBeVisible();
    await expect(suiteList).toHaveCount(0);

    // A project with suites can't be deleted.
    await page.getByRole('button', { name: 'Delete project' }).click();
    await expect(page.getByText(/Move or delete this project's test suites first/)).toBeVisible();
  });

  test('a sub-section holds its own cases, and a section with cases cannot be deleted', async ({ page }) => {
    await signIn(page);
    await openTestManagement(page);

    answerNextDialog(page, 'Boot Sequence');
    await page.getByRole('button', { name: 'Add sub-section to Manual Tests' }).click();
    const sub = page.getByRole('group', { name: 'Section Boot Sequence' });
    await expect(sub).toContainText('Sub-section');

    await sub.getByRole('button', { name: '+ Add Case' }).click();
    await expect(page.getByLabel('Section', { exact: true })).toHaveValue(/sec-/);
    await page.getByPlaceholder('Test case title').fill('Cold boot reaches BMC ready');
    await page.getByRole('button', { name: 'Add Test Case' }).click();
    await expect(sub).toContainText('Cold boot reaches BMC ready');

    await page.reload();
    await openTestManagement(page);
    const subAfter = page.getByRole('group', { name: 'Section Boot Sequence' });
    await expect(subAfter).toContainText('Cold boot reaches BMC ready');
    await expect(page.getByRole('group', { name: 'Section Manual Tests' })).not.toContainText('Cold boot reaches BMC ready');

    await subAfter.getByRole('button', { name: 'Delete section Boot Sequence' }).click();
    await expect(page.getByText(/Move or delete its sub-sections and test cases first/)).toBeVisible();

    // Collapsing the parent hides the sub-section too.
    await page.getByRole('button', { name: 'Collapse section Manual Tests' }).click();
    await expect(subAfter).toHaveCount(0);
  });

  test('a section can be renamed, and an empty one deleted', async ({ page }) => {
    await signIn(page);
    await openTestManagement(page);
    answerNextDialog(page, 'Scratch');
    await page.getByRole('button', { name: 'Section', exact: true }).click();
    answerNextDialog(page, 'Scratch Renamed');
    await page.getByRole('button', { name: 'Rename section Scratch' }).click();
    await expect(page.getByRole('group', { name: 'Section Scratch Renamed' })).toBeVisible();

    answerNextDialog(page);
    await page.getByRole('button', { name: 'Delete section Scratch Renamed' }).click();
    await expect(page.getByRole('group', { name: 'Section Scratch Renamed' })).toHaveCount(0);
    await page.reload();
    await openTestManagement(page);
    await expect(page.getByRole('group', { name: 'Section Scratch Renamed' })).toHaveCount(0);
  });
});

test.describe('revision history (DDS-SRS-014)', () => {
  test('an edit becomes a revision showing what changed, and an older revision can be restored', async ({ page }) => {
    await signIn(page);
    await openTestManagement(page);
    const original = 'RTC Clock Drift Verification under 1-Hour Stress Load';
    const row = page.getByText(original);

    await row.click();
    await row.locator('xpath=ancestor::div[contains(@class, "group")][1]').getByRole('button', { name: 'Edit test case' }).click();
    await page.getByPlaceholder('Test case title').fill('RTC drift under 2-hour load');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByText('RTC drift under 2-hour load')).toBeVisible();

    await page.reload(); // proves the edit and its revision are on the server
    await openTestManagement(page);
    await page.getByText('RTC drift under 2-hour load').click();
    await page.getByRole('button', { name: 'History' }).click();
    const dialog = page.getByRole('dialog', { name: /History of/ });
    await expect(dialog.getByRole('button', { name: /Revision 2 \(current\)/ })).toContainText('Title');
    const changes = dialog.getByRole('table', { name: 'Changes in revision 2' });
    await expect(changes).toContainText(original);
    await expect(changes).toContainText('RTC drift under 2-hour load');

    await dialog.getByRole('button', { name: /^Revision 1/ }).click();
    await dialog.getByRole('button', { name: 'Restore revision 1' }).click();
    await expect(page.getByText('Restored revision 1')).toBeVisible();
    await expect(page.getByText(original)).toBeVisible();

    await page.reload();
    await openTestManagement(page);
    await page.getByText(original).click();
    await page.getByRole('button', { name: 'History' }).click();
    await expect(page.getByRole('button', { name: /Revision 3 \(current\)/ })).toBeVisible();
  });
});

test.describe('creating test runs (DDS-SRS-016)', () => {
  async function addRun(page: Page, name: string, choose: () => Promise<void>, expectedCount: string) {
    await page.getByRole('button', { name: 'Add Test Run' }).first().click();
    await page.getByPlaceholder('e.g. Regression Run Build 240').fill(name);
    await choose();
    await expect(page.getByRole('status').filter({ hasText: 'will be included' })).toHaveText(expectedCount);
    await page.getByRole('button', { name: 'Add Test Run' }).last().click();
    await page.getByText(name, { exact: true }).click();
  }

  test('a run can be made from a whole section, or from a filter, and holds only those cases', async ({ page }) => {
    await signIn(page);
    await openTestManagement(page);
    await page.getByRole('button', { name: /Test Runs/ }).first().click();

    await addRun(page, 'Manual section only', async () => {
      await page.getByText('Select specific test cases').click();
      await expect(page.getByRole('button', { name: 'Add Test Run' }).last()).toBeDisabled(); // nothing picked yet
      await page.getByLabel('Whole section Manual Tests').check();
    }, '1 test case will be included.');
    await expect(page.getByText('C3', { exact: true })).toBeVisible();
    await expect(page.getByText('C1', { exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Back to test runs' }).click();
    await expect(page.getByRole('heading', { name: 'Test Runs & Results' })).toBeVisible();
    await addRun(page, 'Critical only', async () => {
      await page.getByText('Dynamic Filtering').click();
      await page.getByRole('group', { name: 'Filter by priority' }).getByRole('button', { name: 'Critical' }).click();
    }, '1 test case will be included.');
    await expect(page.getByText('C1', { exact: true })).toBeVisible();
    await expect(page.getByText('C3', { exact: true })).toHaveCount(0);
  });
});

test.describe('test case fields (DDS-SRS-013)', () => {
  test('a new case gets a sequential TC id, post-conditions and attachments, and keeps them after reload', async ({ page }) => {
    await signIn(page);
    await openTestManagement(page);

    await page.getByRole('button', { name: 'Add Case' }).first().click();
    await expect(page.getByRole('heading', { name: /Add Test Case\s*TC-001/ })).toBeVisible();
    await page.getByPlaceholder('Test case title').fill('BMC reboots cleanly after flash');
    await page.getByLabel('Post-conditions').fill('Primary image bank active again');
    await page.getByLabel('Attach files').setInputFiles([
      { name: 'boot.log', mimeType: 'text/plain', buffer: Buffer.from('U-Boot 2019.04\nBooting kernel...\n') },
      { name: 'huge.log', mimeType: 'text/plain', buffer: Buffer.alloc(600 * 1024, 'x') },
    ]);
    await expect(page.getByRole('link', { name: 'boot.log' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('huge.log'); // over the per-file cap: refused, and said so
    await page.getByRole('button', { name: 'Add Test Case' }).click();

    await page.reload();
    await openTestManagement(page);
    await page.getByText('BMC reboots cleanly after flash').click();
    await expect(page.getByText('TC-001').first()).toBeVisible();
    await expect(page.getByText('Primary image bank active again')).toBeVisible();
    await expect(page.getByRole('link', { name: 'boot.log' })).toHaveAttribute('download', 'boot.log');

    // The next case continues the sequence.
    await page.getByRole('button', { name: 'Add Case' }).first().click();
    await expect(page.getByRole('heading', { name: /Add Test Case\s*TC-002/ })).toBeVisible();
  });
});

test.describe('CSV / JSON / XML exchange (DDS-SRS-015)', () => {
  for (const format of ['csv', 'json', 'xml'] as const) {
    test(`exporting as ${format} and importing the file back adds copies with fresh IDs`, async ({ page }) => {
      await signIn(page);
      await openTestManagement(page);
      const rows = page.getByText(/^C\d$/);
      const before = await rows.count();
      expect(before).toBeGreaterThan(0);

      const download = page.waitForEvent('download');
      await page.getByLabel('Export test cases').selectOption(format);
      const file = await download;
      expect(file.suggestedFilename()).toMatch(new RegExp(`_test_cases\\.${format}$`));

      // Playwright stores downloads under a random, extension-less name; hand the
      // importer the file under the name a user would actually have saved it as.
      const buffer = readFileSync(await file.path());
      await page.getByLabel('Import test cases (CSV, JSON or XML)').setInputFiles({ name: file.suggestedFilename(), mimeType: 'text/plain', buffer });
      await expect(page.getByText(`Imported ${before} test case`)).toBeVisible();
      // Originals keep C1.. ; the clashing copies continue the TC sequence.
      await expect(rows).toHaveCount(before);
      await expect(page.getByText('TC-001', { exact: true }).first()).toBeVisible();
      await expect(page.getByText(`TC-${String(before).padStart(3, '0')}`, { exact: true }).first()).toBeVisible();
    });
  }

  test('a malformed file is rejected with a message', async ({ page }) => {
    await signIn(page);
    await openTestManagement(page);
    await page.getByLabel('Import test cases (CSV, JSON or XML)').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{oops') });
    await expect(page.getByText('JSON: the file is not valid JSON.')).toBeVisible();
  });
});

test.describe('defect links on failed results (DDS-SRS-018)', () => {
  test('issue IDs can be linked to a failed result and persist', async ({ page }) => {
    await signIn(page);
    await openTestManagement(page);
    const openDefects = async () => {
      await page.getByRole('button', { name: /Test Runs/ }).first().click();
      await page.getByText('[Regression] Full Release v5.67').click();
      await page.getByRole('button', { name: 'Defects' }).click();
    };
    await openDefects();

    const input = page.getByLabel('Issue IDs for C3');
    await input.fill('WH3-1210, #482 WH3-1210');
    await input.press('Enter');
    await expect(page.getByText('WH3-1210', { exact: true })).toHaveCount(1); // de-duplicated
    await expect(page.getByText('#482', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Remove #482 from C3' }).click();

    await page.reload();
    await openTestManagement(page);
    await openDefects();
    await expect(page.getByText('WH3-1210', { exact: true })).toBeVisible();
    await expect(page.getByText('#482', { exact: true })).toHaveCount(0);
  });
});

test.describe('run comparison (DDS-SRS-025) and consolidated report (DDS-SRS-031)', () => {
  test('a run is compared with the suite\'s previous run, regressions are flagged, and the report includes both', async ({ page }) => {
    await signIn(page);
    await openTestManagement(page);
    await page.getByRole('button', { name: /Test Runs/ }).first().click();
    await page.getByText('[Performance] JMeter Tests').click();

    await page.getByRole('button', { name: 'Compare' }).click();
    await expect(page.getByLabel('Compare with')).toContainText('[Regression] Release v5.67 Browser Testing');
    const summary = page.getByRole('list', { name: 'Changes since the earlier run' });
    await expect(summary).toContainText('Fixed: 1');
    await expect(summary).toContainText('Regression: 0');

    // Fail C4, which passed in the earlier run: a regression.
    await page.getByRole('button', { name: 'Tests & Results' }).click();
    await page.locator('div.grid', { hasText: 'C4' }).getByRole('combobox').selectOption('Failed');
    await expect(page.getByRole('button', { name: 'Compare (1 regression)' })).toBeVisible();
    await page.getByRole('button', { name: 'Compare (1 regression)' }).click();
    const table = page.getByRole('table', { name: 'Case status changes' });
    await expect(table.getByRole('row', { name: /C4/ })).toContainText('Regression');

    const download = page.waitForEvent('download');
    await page.getByLabel('Download test summary report').selectOption('html');
    const html = readFileSync(await (await download).path(), 'utf8');
    expect(html).toContain('Consolidated test summary report (manual + automated)');
    expect(html).toContain('3. Manual and automated');
    expect(html).toContain('Compared with <b>[Regression] Release v5.67 Browser Testing</b>');
    expect(html).toContain('1 regression</b>');

    // The runs list flags it too.
    await page.getByRole('button', { name: 'Back to test runs' }).click();
    await expect(page.getByText(/▼ 1 regression vs \[Regression\] Release v5.67 Browser Testing/)).toBeVisible();
  });
});

test.describe('test summary reports (DDS-SRS-024)', () => {
  test('a run downloads as CSV and HTML, and opens a print-ready report for PDF', async ({ page }) => {
    await signIn(page);
    await openTestManagement(page);
    await page.getByRole('button', { name: /Test Runs/ }).first().click();
    await page.getByText('[Regression] Full Release v5.67').click();
    const report = page.getByLabel('Download test summary report');

    for (const format of ['csv', 'html'] as const) {
      const download = page.waitForEvent('download');
      await report.selectOption(format);
      const file = await download;
      expect(file.suggestedFilename()).toBe(`Regression_Full_Release_v5_67_test_summary.${format}`);
      const text = readFileSync(await file.path(), 'utf8');
      expect(text).toContain(format === 'csv' ? 'Case ID,Title,Status,Type' : '7. Sign-off');
    }

    const popup = page.waitForEvent('popup');
    await report.selectOption('pdf');
    const tab = await popup;
    await expect(tab.getByRole('heading', { name: '[Regression] Full Release v5.67' })).toBeVisible();
    await expect(tab.getByText('3. Manual and automated')).toBeVisible();
    await expect(tab.getByText('5. Failures and defects')).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Save as PDF');
  });
});
