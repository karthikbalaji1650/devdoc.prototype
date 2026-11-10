// Specs that edit documents (or anything else the server stores) run
// against a real API. Each Playwright worker gets its own API + dev server
// (backendHarness.ts), on ports from its index, so workers never share
// data; every test starts from a reset server.
//
// Use: import { test, expect, signInAs, seedDocuments } from './fixtures';
import { test as base, expect, request, type Page } from '@playwright/test';
import { startStack, type Stack } from './backendHarness';

export type Role = 'admin' | 'release-manager' | 'firmware-lead';

// The users backend/tests/e2e_server.py seeds, in this order.
const ROLE_INDEX: Record<Role, number> = { admin: 0, 'release-manager': 1, 'firmware-lead': 2 };
const ROLE_TITLES: Record<Role, string> = { admin: 'Admin', 'release-manager': 'Release Manager', 'firmware-lead': 'Firmware Lead' };

export const test = base.extend<{ resetServer: void }, { stack: Stack }>({
  stack: [async ({}, use, workerInfo) => {
    const stack = await startStack(4300 + workerInfo.parallelIndex, 5300 + workerInfo.parallelIndex);
    await use(stack);
    await stack.stop();
  }, { scope: 'worker', timeout: 90_000 }],
  baseURL: async ({ stack }, use) => { await use(stack.frontendUrl); },
  resetServer: [async ({ stack }, use) => { await stack.reset(); await use(); }, { auto: true }],
});
export { expect };

let current: Stack | null = null;
test.beforeEach(({ stack }) => { current = stack; });
const stackNow = (): Stack => { if (!current) throw new Error('no backend stack'); return current; };

/** Signs in as `role` on the real API (session cookie in this browser
 * context), and starts the app signed in, with the welcome guide seen. */
export async function signInAs(page: Page, role: Role = 'admin'): Promise<void> {
  const stack = stackNow();
  const user = stack.users[ROLE_INDEX[role]];
  const res = await page.request.post(`${stack.apiUrl}/api/auth/login`, { data: { email: user.email, password: user.password } });
  if (!res.ok()) throw new Error(`login failed: ${res.status()}`);
  const { user: profile } = await res.json();
  await page.addInitScript(([p, title]) => {
    if (sessionStorage.getItem('e2e-signed-in')) return;
    sessionStorage.setItem('e2e-signed-in', '1');
    localStorage.setItem('devdoc_studio_user_session_v1', JSON.stringify({
      user: { ...p, title, department: 'Engineering', avatarBg: 'x', initials: p.name.split(' ').map((w: string) => w[0]).join('') },
      token: 'e2e', loginTime: new Date().toISOString(), isAuthenticated: true,
    }));
    localStorage.setItem('devdoc_studio_welcome_seen_v1', '1');
  }, [profile, ROLE_TITLES[role]] as const);
}

export interface SeedDoc {
  id: string;
  title: string;
  docNumber: string;
  author: string;
  status?: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED';
}

/** Saves these documents on the server (as the admin, so each keeps its
 * author), then opens the app so it loads them. */
export async function seedDocuments(page: Page, docs: SeedDoc[]): Promise<void> {
  const stack = stackNow();
  const admin = stack.users[0];
  const ctx = await request.newContext();
  try {
    const login = await ctx.post(`${stack.apiUrl}/api/auth/login`, { data: { email: admin.email, password: admin.password } });
    if (!login.ok()) throw new Error(`seed login failed: ${login.status()}`);
    for (const d of docs) {
      const res = await ctx.put(`${stack.apiUrl}/api/documents/${encodeURIComponent(d.id)}`, { data: {
        metadata: {
          id: d.id, title: d.title, docNumber: d.docNumber, author: d.author, date: '2026-09-25',
          version: '1.0', classification: 'INTERNAL ONLY', status: d.status ?? 'DRAFT', templateType: 'technical-analysis',
        },
        sections: [{ id: 's1', title: 'Purpose', level: 1, type: 'richText', content: 'Sample content' }],
      } });
      if (!res.ok()) throw new Error(`seeding ${d.id} failed: ${res.status()} ${await res.text()}`);
    }
  } finally {
    await ctx.dispose();
  }
  await page.goto('/');
}

/** A document as the server holds it now (as the signed-in page's user). */
export async function serverDocument(page: Page, id: string): Promise<{ metadata: { title: string } } | null> {
  const res = await page.request.get(`${stackNow().apiUrl}/api/documents/${encodeURIComponent(id)}`);
  return res.ok() ? (await res.json()).document : null;
}
