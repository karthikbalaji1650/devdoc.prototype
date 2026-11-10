import { test, expect } from '@playwright/test';
import { startStack, type Stack } from './backendHarness';

// DDS-SRS-076: single sign-on over OpenID Connect (the harness's fake
// provider: real redirects, PKCE, an RS256 ID token checked against its
// published keys), then a JWT access token used on the API and revoked by
// signing out.
// One API + dev server on fixed ports for the file, so its tests run in turn.
test.describe.configure({ mode: 'serial' });
let stack: Stack;
test.beforeAll(async () => {
  process.env.E2E_SSO = '1';
  stack = await startStack(4255, 5355);
  delete process.env.E2E_SSO;
});
test.afterAll(() => stack?.stop());

test('sign in with the provider, then use and revoke a JWT access token', async ({ page }) => {
  const [admin] = stack.users;
  await page.addInitScript(() => localStorage.setItem('devdoc_studio_welcome_seen_v1', '1'));
  await page.goto(stack.frontendUrl);
  await page.getByRole('button', { name: 'Sign in with Test IdP' }).click();

  // Provider -> API callback -> back to the app, signed in, address bar clean.
  await expect(page.getByRole('heading', { name: 'Engineering workspace' })).toBeVisible();
  expect(new URL(page.url()).search).toBe('');
  await expect(page.getByText(admin.name).first()).toBeVisible();

  // A JWT from Settings -> Profile works as a Bearer token on the API...
  await page.getByRole('button', { name: 'Settings' }).first().click();
  await page.getByRole('button', { name: 'Create token' }).click();
  const token = (await page.getByRole('status').locator('code').textContent())!.trim();
  expect(token.split('.')).toHaveLength(3);
  const me = await page.request.get(`${stack.apiUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  expect((await me.json()).user.email).toBe(admin.email);

  // ...until the session it came from signs out.
  await page.getByRole('button', { name: /log ?out|sign ?out/i }).first().click();
  await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
  const after = await page.request.get(`${stack.apiUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  expect(after.status()).toBe(401);
});

test('an email with no DevDoc Studio account is refused, with the reason', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('devdoc_studio_welcome_seen_v1', '1'));
  // The fake provider signs the next person in as someone DevDoc Studio does not know.
  await page.request.post(`${stack.apiUrl}/__e2e/idp/next-user`, { data: { email: 'stranger@example.com' } });
  await page.goto(stack.frontendUrl);
  await page.getByRole('button', { name: 'Sign in with Test IdP' }).click();
  await expect(page.getByRole('alert')).toHaveText('There is no DevDoc Studio account for stranger@example.com. Ask an admin to add you.');
  await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
});
