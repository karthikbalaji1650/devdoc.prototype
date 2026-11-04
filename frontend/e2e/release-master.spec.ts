import { test, expect, signInAs } from './fixtures';

// Release management (DDS-SRS-033 - 046) against the real API.
const MANAGER = 'Vaishnavi Aasaithambi';

test('a release manager takes an RC from registration to Final, and every step is audited', async ({ page }) => {
  await signInAs(page, 'release-manager');
  await page.goto('/');
  // Opening Test Management first loads its sample runs on this fresh server.
  await page.getByRole('button', { name: 'Test Management', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add Case' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Release Master' }).first().click();
  await expect(page.getByRole('tab', { name: /v13\.04\.00/ })).toBeVisible(); // sample data loaded

  // 037: create a release
  await page.getByRole('button', { name: 'New release' }).click();
  const form = page.getByRole('form', { name: 'New release' });
  await form.getByLabel('Version').fill('v2.4.0');
  await form.getByLabel('Type').selectOption('Minor');
  await form.getByLabel('Target date').fill('2026-12-01');
  await form.getByLabel('Customer segment / tenant').fill('Enterprise');
  await form.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('tab', { name: 'v2.4.0 · Planned' })).toHaveAttribute('aria-selected', 'true');

  // 045: assign every sign-off role to this manager; 038: a milestone date
  for (const role of ['QA Lead', 'Dev Lead', 'Product Owner']) await page.getByLabel(`User for ${role}`).fill(MANAGER);
  await page.getByLabel('Code Freeze actual date').fill('2026-11-10');
  await page.getByRole('button', { name: 'Save release' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Release saved.' })).toBeVisible();

  // 039 / 040 / 035: register an RC build
  await page.getByRole('tab', { name: /^Builds/ }).click();
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

  // 033: override with a reason; 045: sign off every role
  await build.getByLabel('Override reason').fill('Known lab issue, waived for this RC');
  await build.getByRole('button', { name: 'Override' }).click();
  await expect(build).toContainText('Gates overridden');
  for (const [i, role] of ['QA Lead', 'Dev Lead', 'Product Owner'].entries()) {
    await build.getByRole('button', { name: `Approve as ${role}` }).click();
    await expect(build.getByRole('group', { name: 'Sign-offs' })).toContainText(`Sign-offs (${i + 1} / 3)`);
  }
  await build.getByRole('button', { name: 'Promote to Final' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'promoted to Final' })).toBeVisible();
  await expect(build).toContainText('Final build, promoted by');
  await expect(page.getByRole('tab', { name: 'v2.4.0 · Approved' })).toBeVisible();

  // 046: every step is in the audit log, and the chain is intact
  await page.getByRole('tab', { name: 'Audit log' }).click();
  await expect(page.getByText('Log intact')).toBeVisible();
  const log = page.getByRole('table', { name: 'Audit log' });
  for (const action of ['Release created', 'Sign-off roles changed', 'Build registered', 'Test runs linked', 'Gates overridden', 'Signed off', 'Promoted to Final']) {
    await expect(log).toContainText(action);
  }

  // 036: release notes drafted from the release
  await page.getByRole('tab', { name: 'Release notes' }).click();
  await page.getByRole('button', { name: 'Draft from release' }).click();
  await expect(page.getByLabel('Release notes')).toHaveValue(/## Build v2\.4\.0-RC100 \(Final\)/);
});

test('others can see releases but not change them', async ({ page }) => {
  await signInAs(page, 'firmware-lead');
  await page.goto('/');
  await page.getByRole('button', { name: 'Release Master' }).first().click();
  await expect(page.getByRole('tab', { name: /v13\.04\.00/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New release' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save release' })).toHaveCount(0);
  await page.getByRole('tab', { name: /v13\.04\.00/ }).click();
  await page.getByRole('tab', { name: /^Blockers/ }).click();
  await expect(page.getByRole('table', { name: 'Release blockers' })).toContainText('WH3-1310');
  await expect(page.getByRole('form', { name: 'Log blocker' })).toHaveCount(0);
});
