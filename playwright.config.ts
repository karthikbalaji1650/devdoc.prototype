import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile-smoke\.spec\.ts/ },
    // backend-login.spec.ts and remote-test-execution.spec.ts each start a
    // second, fixed-port dev server and API instance — running them three
    // times over would triple-spawn on the same ports. They're about the
    // app talking to the API, not rendering, so one engine is enough;
    // everything else still runs on all three.
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testIgnore: /backend-login\.spec\.ts|remote-test-execution\.spec\.ts|mobile-smoke\.spec\.ts/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: /backend-login\.spec\.ts|remote-test-execution\.spec\.ts|mobile-smoke\.spec\.ts/ },
    // Not the full suite (it assumes a desktop layout throughout) - a
    // focused smoke check that the app is at least usable on a phone.
    // See the "Mobile" note in the README: this is baseline coverage,
    // not full responsive support.
    { name: 'Mobile Chrome', use: { ...devices['Pixel 7'] }, testMatch: /mobile-smoke\.spec\.ts/ },
    { name: 'Mobile Safari', use: { ...devices['iPhone 14'] }, testMatch: /mobile-smoke\.spec\.ts/ },
  ],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
