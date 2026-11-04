import { readFileSync } from 'node:fs';
import { test, expect, signInAs, seedDocuments, serverDocument } from './fixtures';

// Runs against a real API (see fixtures.ts): documents are stored on the
// server only. The browser-only demo is covered by demo.spec.ts.
const ADMIN = 'Manivannan Thangavel';
const OTHER = 'Judia Lumina';

/** The title the server holds now. */
const storedTitle = async (page: import('@playwright/test').Page, id = 'd1') =>
  (await serverDocument(page, id))?.metadata.title;

const titleInput = (page: import('@playwright/test').Page) =>
  page.getByText('Document Title', { exact: true }).first().locator('xpath=following::input[1]');

async function openEditor(page: import('@playwright/test').Page, title: string) {
  await page.getByRole('button', { name: 'Document Editor' }).first().click();
  await page.getByText(title, { exact: true }).first().click();
  await expect(titleInput(page)).toBeVisible();
}

test.describe('sign in', () => {
  test('a user signs in with their real password and reaches the dashboard', async ({ page, stack }) => {
    await page.goto('/');
    await page.getByPlaceholder('engineer@sanmina.com').fill(stack.users[0].email);
    await page.getByPlaceholder('Enter your password').fill(stack.users[0].password);
    await page.getByRole('button', { name: /sign in to platform/i }).click();
    await expect(page.getByRole('heading', { name: 'Engineering workspace' })).toBeVisible();
  });
});

test.describe('autosave', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page);
    await seedDocuments(page, [{ id: 'd1', title: 'Original', docNumber: 'D-1', author: ADMIN }]);
    await openEditor(page, 'Original');
  });

  test('is debounced, then saved to the server', async ({ page }) => {
    await titleInput(page).fill('Edited fast');
    expect(await storedTitle(page)).toBe('Original');
    await expect.poll(() => storedTitle(page)).toBe('Edited fast');
  });

  test('leaving the editor immediately does not lose the edit', async ({ page }) => {
    await titleInput(page).fill('Edited then left');
    await page.getByRole('button', { name: /All Documents/ }).click();
    await expect(page.getByText('Edited then left', { exact: true })).toBeVisible();
    await expect.poll(() => storedTitle(page)).toBe('Edited then left');
  });

  test('closing the tab flushes the edit and it survives a reload', async ({ page }) => {
    await titleInput(page).fill('Edited then hidden');
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await expect.poll(() => storedTitle(page)).toBe('Edited then hidden');
    await page.reload();
    await openEditor(page, 'Edited then hidden');
    await expect(titleInput(page)).toHaveValue('Edited then hidden');
  });

  test('nothing is stored in the browser', async ({ page }) => {
    await titleInput(page).fill('Server only');
    await expect.poll(() => storedTitle(page)).toBe('Server only');
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys.filter((k) => /documents|doc_history|doc_bin|current_doc/.test(k))).toEqual([]);
  });
});

test.describe('version history', () => {
  test('restores an earlier version, and the restore itself can be undone', async ({ page }) => {
    await signInAs(page);
    await seedDocuments(page, [{ id: 'd1', title: 'Original', docNumber: 'D-1', author: ADMIN }]);
    await openEditor(page, 'Original');
    await titleInput(page).fill('Edited title');
    await expect.poll(() => storedTitle(page)).toBe('Edited title');

    await page.getByRole('button', { name: /History/ }).click();
    await page.getByRole('button', { name: /Restore/ }).click();
    await expect(titleInput(page)).toHaveValue('Original');

    await page.getByRole('button', { name: /History/ }).click();
    await expect(page.getByRole('button', { name: /Restore/ })).toHaveCount(2);
  });
});

test.describe('permissions', () => {
  test('a non-admin cannot delete a document they did not write', async ({ page }) => {
    await signInAs(page, 'firmware-lead');
    await seedDocuments(page, [{ id: 'd1', title: 'Someone Elses Doc', docNumber: 'D-1', author: ADMIN }]);
    await page.getByRole('button', { name: 'Document Editor' }).first().click();
    await page.getByRole('button', { name: /Move .* to Doc Bin/ }).click();
    await expect(page.getByText(/only delete documents you authored/i)).toBeVisible();
    expect((await serverDocument(page, 'd1'))?.metadata.title).toBe('Someone Elses Doc');
  });

  test('an author can move their own document to the Doc Bin and restore it', async ({ page }) => {
    await signInAs(page, 'firmware-lead');
    await seedDocuments(page, [{ id: 'd1', title: 'My Own Doc', docNumber: 'D-1', author: OTHER }]);
    await page.getByRole('button', { name: 'Document Editor' }).first().click();
    await page.getByRole('button', { name: /Move My Own Doc to Doc Bin/ }).click();
    await expect(page.getByText('No documents yet.')).toBeVisible();
    await page.getByRole('button', { name: 'Doc Bin', exact: true }).click();
    await page.getByRole('button', { name: /Restore/ }).click();
    await expect(page.getByRole('status')).toContainText('Document restored');
    await page.keyboard.press('Escape');
    await expect(page.getByText('My Own Doc', { exact: true })).toBeVisible();
    // The bin is on the server: still restored after a reload.
    await page.reload();
    await page.getByRole('button', { name: 'Document Editor' }).first().click();
    await expect(page.getByText('My Own Doc', { exact: true })).toBeVisible();
  });

  test('non-admins only see documents that are still in progress', async ({ page }) => {
    await signInAs(page, 'firmware-lead');
    await seedDocuments(page, [
      { id: 'a', title: 'Draft One', docNumber: 'A', author: OTHER, status: 'DRAFT' },
      { id: 'b', title: 'Approved One', docNumber: 'B', author: OTHER, status: 'APPROVED' },
    ]);
    await page.getByRole('button', { name: 'Document Editor' }).first().click();
    await expect(page.getByText('Draft One', { exact: true })).toBeVisible();
    await expect(page.getByText('Approved One', { exact: true })).toHaveCount(0);
  });
});

test.describe('dashboard drill-down', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page);
    await seedDocuments(page, [
      { id: 'a', title: 'Approved Alpha', docNumber: 'WH3-1205', author: ADMIN, status: 'APPROVED' },
      { id: 'd', title: 'Draft Delta', docNumber: 'D-4', author: ADMIN, status: 'DRAFT' },
    ]);
  });
  const card = (page: import('@playwright/test').Page, label: string) =>
    page.getByRole('button', { name: new RegExp(label, 'i') }).filter({ hasText: /^\s*(total docs|approved|in review)/i }).first();

  test('cards count distinct documents and agree with Recent Activity', async ({ page }) => {
    await expect(card(page, 'approved')).toContainText('1'); // WH3-1205 signed off three times, counted once
    await expect(card(page, 'in review')).toContainText('1'); // ADR-2026-042 from the sign-off log
  });

  test('Approved card lists only approved documents, and Show all clears the filter', async ({ page }) => {
    await card(page, 'approved').click();
    await expect(page.getByText('Approved Alpha')).toBeVisible();
    await expect(page.getByText('Draft Delta')).toHaveCount(0);
    await page.getByRole('button', { name: 'Show all' }).click();
    await expect(page.getByText('Draft Delta')).toBeVisible();
  });

  test('In review card explains a document tracked only in the log', async ({ page }) => {
    await card(page, 'in review').click();
    await expect(page.getByRole('note')).toContainText('ADR-2026-042');
  });

  test('a recent-activity row opens the matching document', async ({ page }) => {
    await page.getByTitle('Open this document').first().click();
    await expect(page.getByText('Document Title', { exact: true })).toBeVisible();
  });
});

test.describe('a save the server does not accept', () => {
  test('is announced instead of silently lost', async ({ page }) => {
    await signInAs(page);
    await seedDocuments(page, [{ id: 'd1', title: 'Original', docNumber: 'D-1', author: ADMIN }]);
    await openEditor(page, 'Original');
    await page.route('**/api/documents/d1', (route) =>
      route.request().method() === 'PUT' ? route.fulfill({ status: 500, body: 'down' }) : route.continue());
    await titleInput(page).fill('Will not be saved');
    await expect(page.getByText(/Not saved: Server error \(500\)/)).toBeVisible();
  });
});

test.describe('crash recovery', () => {
  test('a corrupted document shows the recovery screen, and Reload gets back to the app', async ({ page }) => {
    await signInAs(page);
    // The server never stores a document like this; feed one in to prove the screen copes.
    await page.route('**/api/documents', (route) => route.fulfill({ json: { documents: [{
      metadata: { id: 'bad', title: 'Corrupt one', docNumber: 'X', author: ADMIN, date: '2026-01-01', version: '1', classification: 'INTERNAL ONLY', status: 'DRAFT', templateType: 'technical-analysis' },
      sections: null, updatedAt: new Date().toISOString(),
    }] } }));
    await page.goto('/');
    await page.getByRole('button', { name: 'Document Editor' }).first().click();
    await page.getByText('Corrupt one', { exact: true }).first().click();
    await expect(page.getByRole('alert')).toContainText('Something went wrong');
    await expect(page.getByRole('alert')).toContainText('stored on the server');
    await page.unroute('**/api/documents');
    await page.getByRole('button', { name: 'Reload' }).click();
    await expect(page.getByRole('heading', { name: 'Engineering workspace' })).toBeVisible();
  });
});

test.describe('data management access (DDS-SRS-007/008/011)', () => {
  test('an admin gets a Data Management sidebar entry that opens System & Storage', async ({ page }) => {
    await signInAs(page, 'admin');
    await page.goto('/');
    await page.getByRole('button', { name: 'Data Management' }).click();
    await expect(page.getByText('Download server backup')).toBeVisible();
    await expect(page.getByText('User Session Audit Log')).toBeVisible();
    // Settings still opens on its own first tab, not on data management.
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByText('Download server backup')).toHaveCount(0);
  });

  for (const role of ['release-manager', 'firmware-lead'] as const) {
    test(`a ${role} cannot reach data management or the session audit log`, async ({ page }) => {
      await signInAs(page, role);
      await page.goto('/');
      await expect(page.getByRole('button', { name: 'Data Management' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await expect(page.getByRole('button', { name: /Profile/ }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /System & Storage/i })).toHaveCount(0);
      await expect(page.getByText('User Session Audit Log')).toHaveCount(0);
    });
  }
});

test.describe('server backup and reset (DDS-SRS-008)', () => {
  test('an admin downloads a backup of the server, and a typed confirmation resets it', async ({ page }) => {
    await signInAs(page, 'admin');
    await seedDocuments(page, [{ id: 'd1', title: 'Soon gone', docNumber: 'D-1', author: ADMIN }]);
    await page.getByRole('button', { name: 'Data Management' }).click();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^devdoc-studio-server-backup-.*\.json$/);
    const backup = JSON.parse(readFileSync(await file.path(), 'utf8'));
    expect(backup.documents.map((d: { id: string }) => d.id)).toEqual(['d1']);

    const reset = page.getByRole('button', { name: 'Reset all data' });
    await expect(reset).toBeDisabled();
    await page.getByLabel(/to confirm/).fill('DELETE ALL DATA');
    await reset.click();
    await expect(page.getByText(/All data deleted/)).toBeVisible();
    await expect.poll(async () => (await serverDocument(page, 'd1'))?.metadata.title ?? null).toBeNull();
  });
});

test.describe('lazy screens', () => {
  for (const name of ['Settings', 'Test Management', 'Release Master']) {
    test(`${name} loads on demand without errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await signInAs(page);
      await page.goto('/');
      await page.getByRole('button', { name }).first().click();
      await expect(page.getByText('Loading…')).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
});

test.describe('first-run welcome guide', () => {
  test('shows once on a fresh browser, mentions admin-only visibility for an admin, and stays dismissed after reload', async ({ page }) => {
    await signInAs(page);
    await page.goto('/'); // runs signInAs's one-time init script (marks the guide as already seen)
    await page.evaluate(() => localStorage.removeItem('devdoc_studio_welcome_seen_v1'));
    await page.reload(); // the guard in signInAs's init script means it won't re-set the flag this time
    const dialog = page.getByRole('dialog', { name: /Welcome to DevDoc Studio/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('You can see everything, as an admin')).toBeVisible();

    await dialog.getByRole('button', { name: /Got it/ }).click();
    await expect(dialog).toBeHidden();

    await page.reload();
    await expect(page.getByRole('dialog', { name: /Welcome to DevDoc Studio/ })).toHaveCount(0);
  });

  test('does not mention admin-only visibility for a non-admin, and Help reopens it', async ({ page }) => {
    await signInAs(page, 'firmware-lead');
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('devdoc_studio_welcome_seen_v1'));
    await page.reload();
    const dialog = page.getByRole('dialog', { name: /Welcome to DevDoc Studio/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('You can see everything, as an admin')).toHaveCount(0);
    await dialog.getByRole('button', { name: /Got it/ }).click();

    await page.getByRole('button', { name: 'Help' }).click();
    await expect(page.getByRole('dialog', { name: /Welcome to DevDoc Studio/ })).toBeVisible();
  });
});
