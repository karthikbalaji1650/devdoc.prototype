import { test, expect, signInAs } from './fixtures';
import type { Page } from '@playwright/test';

// Release management (DDS-SRS-033 - 046) against the real API.
//
// Admins and regular users are treated the same. Whoever creates a release is
// its first signer and picks 1 to 4 more; only the creator edits it, and every
// signer must approve a build before any signer can promote it to Final.
// Personas: 'admin' = Manivannan, 'release-manager' = Vaishnavi (a regular
// user, not a manager), 'firmware-lead' = Judia.

/** Types in the signer picker and clicks the person. */
async function addSigner(page: Page, name: string): Promise<void> {
  const picker = page.getByRole('combobox', { name: 'Add a signer' });
  await picker.fill(name.split(' ')[0]);
  await page.getByRole('option', { name: new RegExp(name) }).click();
}

async function openReleaseMaster(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Release Master' }).first().click();
  await expect(page).toHaveURL(/\/releases$/);
}

async function createRelease(page: Page, version: string, others: string[]): Promise<string> {
  await page.getByRole('link', { name: 'New release' }).click();
  await expect(page).toHaveURL(/\/releases\/new$/);
  const form = page.getByRole('form', { name: 'New release' });
  await form.getByLabel('Version').fill(version);
  await form.getByLabel('Type').selectOption('Minor');
  await form.getByLabel('Target date').fill('2026-12-01');
  await form.getByLabel('Customer segment / tenant').fill('Enterprise');
  await expect(form.getByRole('button', { name: 'Create release' })).toBeDisabled(); // needs a second signer
  for (const name of others) await addSigner(page, name);
  await form.getByRole('button', { name: 'Create release' }).click();
  await expect(page).toHaveURL(/\/releases\/rel-[0-9a-f]+$/);
  return new URL(page.url()).pathname.split('/')[2];
}

test('a regular user creates a release, two signers approve a build, and it goes Final with every step audited', async ({ page, browser }) => {
  // The creator is a regular user (Vaishnavi), not an admin: the same rules apply to everyone.
  await signInAs(page, 'release-manager');
  await page.goto('/');
  // Opening Test Management first loads its sample runs on this fresh server.
  await page.getByRole('button', { name: 'Test Management', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add Case' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Release Master' }).first().click();
  await expect(page).toHaveURL(/\/releases$/);
  await expect(page.getByText(/No releases yet/)).toBeVisible(); // no sample data

  // 037: create; the creator is the first signer, the picked person the second
  const releaseId = await createRelease(page, 'v2.4.0', ['Manivannan Thangavel']);
  const signers = page.getByRole('region', { name: 'Signers' });
  await expect(signers).toContainText('Signers (2 of 5)');
  await expect(signers).toContainText('Vaishnavi Aasaithambi');
  await expect(signers).toContainText('Manivannan Thangavel');
  await expect(signers).toContainText('Creator');
  await expect(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');

  // 038: a milestone date
  await page.getByLabel('Code Freeze actual date').fill('2026-11-10');
  await page.getByRole('button', { name: 'Save release' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Release saved.' })).toBeVisible();

  // 039 / 040 / 035: register an RC build
  await page.getByRole('tab', { name: /^Builds/ }).click();
  await expect(page).toHaveURL(new RegExp(`/releases/${releaseId}/builds$`));
  const reg = page.getByRole('form', { name: 'Register RC build' });
  await reg.getByLabel('Image name / tag').fill('registry.example.com/bmc:v2.4.0-rc');
  await reg.getByLabel('Commit SHA').fill('abc1234');
  await reg.getByLabel('Artifact URL').fill('https://artifactory.example.com/bmc/2.4.0');
  await reg.getByLabel('SHA-256 checksum').fill('a'.repeat(64));
  await reg.getByLabel('CI/CD pipeline build ID').fill('jenkins-482');
  await reg.getByRole('button', { name: 'Register next RC' }).click();
  const build = page.getByRole('region', { name: 'Build v2.4.0-RC100' });
  await expect(build).toContainText('Pending');

  // 042 / 043: link a run with failures - the gates fail
  await build.getByRole('group', { name: 'Linked test runs' }).getByLabel('[Regression] Full Release v5.67').check();
  await build.getByRole('button', { name: 'Save linked runs' }).click();
  await expect(build).toContainText('Failed');

  // 041: promotion is refused while exit criteria are not met
  await build.getByRole('button', { name: 'Promote to Final' }).click();
  await expect(page.getByRole('alert')).toContainText('Exit criteria not met');

  // 033: override with a reason (any signer may); 045: the creator approves - one of two
  await build.getByLabel('Override reason').fill('Known lab issue, waived for this RC');
  await build.getByRole('button', { name: 'Override' }).click();
  await expect(build).toContainText('Gates overridden');
  await build.getByRole('button', { name: 'Approve' }).click();
  await expect(build.getByRole('group', { name: 'Sign-offs' })).toContainText('Sign-offs (1 / 2)');
  await build.getByRole('button', { name: 'Promote to Final' }).click();
  await expect(page.getByRole('alert')).toContainText('Sign-offs incomplete: 1 of 2 signers approved (waiting for Manivannan Thangavel)');

  // The other signer opens the shared link to that build (a deep link, in their own browser).
  const other = await browser.newContext();
  const page2 = await other.newPage();
  await signInAs(page2, 'admin');
  await page2.goto(`/releases/${releaseId}/builds/rc100`);
  await expect(page2.getByRole('heading', { name: 'Release Master' })).toBeVisible();
  const theirs = page2.getByRole('region', { name: 'Build v2.4.0-RC100' });
  await expect(theirs).toBeVisible();
  await expect(page2.getByRole('form', { name: 'Register RC build' })).toHaveCount(0); // not the creator
  await expect(page2.getByText('Only Vaishnavi Aasaithambi, who created this release')).toBeVisible();
  await expect(theirs.getByRole('button', { name: 'Reject' })).toBeDisabled(); // a rejection needs a comment
  await theirs.getByLabel('Sign-off comment').fill('Re-ran the failing suite, fine');
  await theirs.getByRole('button', { name: 'Approve' }).click();
  await expect(theirs.getByRole('group', { name: 'Sign-offs' })).toContainText('Sign-offs (2 / 2)');
  // Any signer promotes - here the one who did not create the release.
  await theirs.getByRole('button', { name: 'Promote to Final' }).click();
  await expect(page2.getByRole('status').filter({ hasText: 'promoted to Final' })).toBeVisible();
  await expect(theirs).toContainText('Final build, promoted by Manivannan Thangavel');
  await other.close();

  // The creator sees it too, and the signers are locked now.
  await page.reload();
  await expect(page.getByRole('region', { name: 'Build v2.4.0-RC100' })).toContainText('Final build, promoted by');
  await page.getByRole('tab', { name: 'Overview' }).click();
  await expect(page.getByRole('region', { name: 'Signers' })).toContainText('can no longer change');
  await expect(page.getByText('Approved', { exact: true }).first()).toBeVisible();

  // 046: every step is in the audit log, and the chain is intact
  await page.getByRole('tab', { name: 'Audit log' }).click();
  await expect(page.getByText('Log intact')).toBeVisible();
  const log = page.getByRole('table', { name: 'Audit log' });
  for (const action of ['Release created', 'Build registered', 'Test runs linked', 'Gates overridden', 'Signed off', 'Promoted to Final', 'Status changed']) {
    await expect(log).toContainText(action);
  }

  // 036: release notes drafted from the release
  await page.getByRole('tab', { name: 'Release notes' }).click();
  await page.getByRole('button', { name: 'Draft from release' }).click();
  await expect(page.getByLabel('Release notes')).toHaveValue(/## Build v2\.4\.0-RC100 \(Final\)/);
});

test('anyone can read a release and create their own, but only the creator edits and only signers sign', async ({ page, browser, stack }) => {
  await signInAs(page, 'admin');
  await openReleaseMaster(page);
  const releaseId = await createRelease(page, 'v3.0.0', ['Vaishnavi Aasaithambi']);
  await page.getByRole('tab', { name: /^Builds/ }).click();
  const reg = page.getByRole('form', { name: 'Register RC build' });
  await reg.getByLabel('Image name / tag').fill('registry.example.com/bmc:v3');
  await reg.getByLabel('Artifact URL').fill('https://artifactory.example.com/bmc/3');
  await reg.getByLabel('SHA-256 checksum').fill('b'.repeat(64));
  await reg.getByRole('button', { name: 'Register next RC' }).click();
  await expect(page.getByRole('region', { name: 'Build v3.0.0-RC100' })).toBeVisible();

  // Judia is neither the creator nor a signer.
  const outsider = await browser.newContext();
  const page3 = await outsider.newPage();
  await signInAs(page3, 'firmware-lead');
  await page3.goto('/releases');
  await expect(page3.getByRole('table', { name: 'Releases' })).toContainText('v3.0.0');
  await expect(page3.getByRole('link', { name: 'New release' })).toBeVisible(); // anyone can create
  await page3.getByRole('link', { name: 'v3.0.0' }).click();
  await expect(page3).toHaveURL(new RegExp(`/releases/${releaseId}$`));
  await expect(page3.getByText('Created by Manivannan Thangavel', { exact: true })).toBeVisible();
  await expect(page3.getByRole('button', { name: 'Save release' })).toHaveCount(0);
  await expect(page3.getByRole('combobox', { name: 'Add a signer' })).toHaveCount(0);
  await expect(page3.getByRole('button', { name: 'Cancel release' })).toHaveCount(0);
  await page3.getByRole('tab', { name: /^Builds/ }).click();
  const build = page3.getByRole('region', { name: 'Build v3.0.0-RC100' });
  await expect(build.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await expect(build.getByRole('button', { name: 'Promote to Final' })).toHaveCount(0);
  await page3.getByRole('tab', { name: /^Blockers/ }).click();
  await expect(page3.getByRole('form', { name: 'Log blocker' })).toHaveCount(0);

  // The server says no too, whatever the screen shows.
  const api = `${stack.apiUrl}/api/releases/${releaseId}`;
  const edit = await page3.request.patch(api, { data: { title: 'hijacked' } });
  expect(edit.status()).toBe(403);
  expect((await edit.json()).error).toBe('Only Manivannan Thangavel, who created this release, can change it.');
  const sign = await page3.request.post(`${api}/builds/rc100/signoffs`, { data: { decision: 'Approved' } });
  expect(sign.status()).toBe(403);
  expect((await sign.json()).error).toBe('Only the signers of this release can sign off.');
  await outsider.close();

  // A signer who is not the creator signs but cannot register builds.
  const signer = await browser.newContext();
  const page4 = await signer.newPage();
  await signInAs(page4, 'release-manager');
  await page4.goto(`/releases/${releaseId}/builds`);
  await expect(page4.getByRole('form', { name: 'Register RC build' })).toHaveCount(0);
  await expect(page4.getByRole('region', { name: 'Build v3.0.0-RC100' }).getByRole('button', { name: 'Approve' })).toBeVisible();
  await signer.close();
});

test('every release and tab has its own link, Back works, and a release can be cancelled but not deleted', async ({ page }) => {
  await signInAs(page, 'admin');
  await openReleaseMaster(page);
  const releaseId = await createRelease(page, 'v4.0.0', ['Judia Lumina', 'Vaishnavi Aasaithambi']);
  await expect(page.getByRole('region', { name: 'Signers' })).toContainText('Signers (3 of 5)');

  await page.getByRole('tab', { name: /^Blockers/ }).click();
  await expect(page).toHaveURL(new RegExp(`/releases/${releaseId}/blockers$`));
  await page.getByRole('tab', { name: 'Audit log' }).click();
  await expect(page).toHaveURL(new RegExp(`/releases/${releaseId}/audit$`));
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/releases/${releaseId}/blockers$`));
  await expect(page.getByRole('tab', { name: /^Blockers/ })).toHaveAttribute('aria-selected', 'true');
  await page.reload(); // a refresh keeps you where you were
  await expect(page.getByRole('table', { name: 'Release blockers' })).toBeVisible();

  await page.getByRole('link', { name: '← All releases' }).click();
  await expect(page.getByRole('table', { name: 'Releases' })).toContainText('v4.0.0');

  // A release that does not exist says so.
  await page.goto('/releases/rel-nope/builds');
  await expect(page.getByRole('alert')).toContainText('Release not found.');

  // Cancel needs a reason; nothing is deleted and nothing can change afterwards.
  await page.goto(`/releases/${releaseId}`);
  await page.getByText('Cancel this release').click();
  const cancel = page.getByRole('button', { name: 'Cancel release' });
  await expect(cancel).toBeDisabled();
  await page.getByLabel('Reason (kept in the audit log)').fill('Customer postponed');
  await cancel.click();
  await expect(page.getByRole('status').filter({ hasText: 'Cancelled on' })).toContainText('Customer postponed');
  await expect(page.getByRole('button', { name: 'Save release' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete release' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Audit log' }).click();
  await expect(page.getByRole('table', { name: 'Audit log' })).toContainText('Release cancelled');
});

test('the signer picker finds people by name, title or department and enforces 2 to 5 signers', async ({ page }) => {
  await signInAs(page, 'admin');
  await openReleaseMaster(page);
  await page.getByRole('link', { name: 'New release' }).click();
  const picker = page.getByRole('combobox', { name: 'Add a signer' });
  await picker.fill('zzzz-nobody');
  await expect(page.getByText('No one found.')).toBeVisible();
  await picker.fill('Judia');
  await expect(page.getByRole('option', { name: /Judia Lumina/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /Manivannan/ })).toHaveCount(0); // you are already a signer
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Signers' })).toContainText('Who signs off (2 of 5)');
  await picker.fill('Judia');
  await expect(page.getByText('No one found.')).toBeVisible(); // already picked, not offered twice
  await page.getByRole('button', { name: 'Remove Judia Lumina' }).click();
  await expect(page.getByRole('region', { name: 'Signers' })).toContainText('Who signs off (1 of 5)');
  await expect(page.getByRole('button', { name: 'Create release' })).toBeDisabled();
});

test('opening Release Master from the sidebar sets its address, leaving clears it, and Back returns', async ({ page }) => {
  await signInAs(page, 'admin');
  await page.goto('/');
  await expect(page.getByText(/Good (Morning|Afternoon|Evening)/)).toBeVisible();
  await page.getByRole('button', { name: 'Release Master' }).first().click();
  await expect(page).toHaveURL(/\/releases$/);
  await page.getByRole('button', { name: 'Dashboard', exact: true }).first().click();
  await expect(page.getByText(/Good (Morning|Afternoon|Evening)/)).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/');
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Release Master' })).toBeVisible();
  await expect(page).toHaveURL(/\/releases$/);
  await page.goForward();
  await expect(page.getByText(/Good (Morning|Afternoon|Evening)/)).toBeVisible();
});
