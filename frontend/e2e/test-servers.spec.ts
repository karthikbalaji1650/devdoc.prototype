import { test, expect } from '@playwright/test';
import { signInThroughBackend, startStack, type Stack } from './backendHarness';

// DDS-SRS-019 / 075: an admin registers a remote test server; its API key
// is stored encrypted and never shown again; the connection check calls
// the endpoint with it. The endpoint here is the test API's own health route.
let stack: Stack;
test.beforeAll(async () => { stack = await startStack(4188, 5270); });
test.afterAll(() => stack?.stop());
test.beforeEach(async () => { await stack.reset(); });

test('an admin registers, tests, edits and deletes a test server', async ({ page }) => {
  const [admin] = stack.users;
  await signInThroughBackend(page, stack, admin);
  await page.getByRole('button', { name: 'Data Management' }).click();

  await page.getByRole('button', { name: 'Add server' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Lab Test PC 1');
  await page.getByLabel('API endpoint URL').fill(`${stack.apiUrl}/api/health`);
  await page.getByLabel('Authentication').selectOption('apiKey');
  await page.getByLabel('API key', { exact: true }).fill('e2e-secret-key');
  await page.getByLabel('Payload parameters (JSON)').fill('{"bmcIp": "192.168.1.100"}');
  await page.getByRole('button', { name: 'Register server' }).click();

  await expect(page.getByText('Saved "Lab Test PC 1".')).toBeVisible();
  await expect(page.getByText('1 payload parameter')).toBeVisible();
  await expect(page.getByText('e2e-secret-key')).toHaveCount(0);

  await page.getByRole('button', { name: 'Test connection to Lab Test PC 1' }).click();
  await expect(page.getByText(/Connected · HTTP 200 in \d+ ms/)).toBeVisible();

  // Editing without retyping the key keeps the stored one.
  await page.getByRole('button', { name: 'Edit Lab Test PC 1' }).click();
  await expect(page.getByLabel('API key', { exact: true })).toHaveValue('');
  await expect(page.getByText('A value is stored. Leave blank to keep it.')).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill('Lab Test PC 2');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Saved "Lab Test PC 2".')).toBeVisible();

  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Delete Lab Test PC 2' }).click();
  await expect(page.getByText('No test servers registered yet.')).toBeVisible();
});
