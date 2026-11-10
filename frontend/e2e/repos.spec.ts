import { test, expect } from '@playwright/test';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { signInThroughBackend, startStack, type Stack } from './backendHarness';

// DDS-SRS-030: connect existing code. A real git server (git daemon) and the
// real code-editor bridge (sandbox/file_bridge.py): the API clones, pulls
// and removes a repository in the bridge's workspace.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GIT_PORT = 9418 + 7;
const BRIDGE_PORT = 18091;
let stack: Stack;
let dir: string;
let daemon: ChildProcess;
let bridge: ChildProcess;
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=qa@example.com', '-c', 'user.name=QA', ...args], { cwd, stdio: 'pipe' }).toString();

async function waitFor(url: string) {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${url} did not come up`);
}

test.beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'devdoc-repos-'));
  // The "remote": a bare repository with one commit, served over git://.
  git(dir, 'init', '-q', '--bare', '-b', 'main', 'bmc-fw.git');
  git(dir, 'clone', '-q', 'bmc-fw.git', 'work');
  git(path.join(dir, 'work'), 'commit', '-q', '--allow-empty', '-m', 'Initial firmware tree');
  git(path.join(dir, 'work'), 'push', '-q', 'origin', 'HEAD:main');
  daemon = spawn('git', ['daemon', '--reuseaddr', '--export-all', `--base-path=${dir}`, `--port=${GIT_PORT}`, '--listen=127.0.0.1', dir], { stdio: 'ignore' });
  // The bridge, with its workspace in the temp dir.
  bridge = spawn('python3', ['-I', path.join(ROOT, 'sandbox', 'file_bridge.py')], {
    cwd: dir, stdio: 'ignore', env: { ...process.env, BRIDGE_PORT: String(BRIDGE_PORT), BRIDGE_TOKEN: 'e2e-bridge-token' },
  });
  await waitFor(`http://127.0.0.1:${BRIDGE_PORT}/health`);
  process.env.BRIDGE_URL = `http://127.0.0.1:${BRIDGE_PORT}`;
  process.env.BRIDGE_TOKEN = 'e2e-bridge-token';
  stack = await startStack(4244, 5344);
});
test.afterAll(() => {
  stack?.stop();
  bridge?.kill();
  daemon?.kill();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test('a repository is connected, pulled and removed from the code editor workspace', async ({ page }) => {
  test.setTimeout(60_000);
  const [admin] = stack.users;
  await signInThroughBackend(page, stack, admin);
  await page.getByRole('button', { name: 'Coder' }).first().click();
  await page.getByRole('button', { name: 'Repositories' }).click();
  const dialog = page.getByRole('dialog', { name: 'Repositories' });
  await expect(dialog.getByText('No repositories connected yet.')).toBeVisible();

  const form = dialog.getByRole('form', { name: 'Connect repository' });
  await form.getByLabel('Repository URL').fill(`git://127.0.0.1:${GIT_PORT}/bmc-fw.git`);
  await form.getByRole('button', { name: 'Connect and clone' }).click();
  await expect(dialog.getByText('Cloned into repos/bmc-fw.')).toBeVisible();
  const state = dialog.getByTestId('repo-state');
  await expect(state).toContainText('main @');
  await expect(state).toContainText('Initial firmware tree');
  // It is really in the bridge's workspace.
  expect(git(path.join(dir, 'vscode-workspace', 'repos', 'bmc-fw'), 'log', '-1', '--format=%s').trim()).toBe('Initial firmware tree');

  // A new commit upstream; Pull brings it in.
  git(path.join(dir, 'work'), 'commit', '-q', '--allow-empty', '-m', 'Add RTC driver');
  git(path.join(dir, 'work'), 'push', '-q', 'origin', 'HEAD:main');
  await dialog.getByRole('button', { name: 'Pull bmc-fw' }).click();
  await expect(state).toContainText('Add RTC driver');

  page.once('dialog', (d) => void d.accept());
  await dialog.getByRole('button', { name: 'Remove bmc-fw' }).click();
  await expect(dialog.getByText('No repositories connected yet.')).toBeVisible();
  expect(() => git(path.join(dir, 'vscode-workspace', 'repos', 'bmc-fw'), 'status')).toThrow();
});
