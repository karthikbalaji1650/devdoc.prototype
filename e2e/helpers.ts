import type { Page } from '@playwright/test';

export type Role = 'admin' | 'release-manager' | 'firmware-lead';

const USERS: Record<Role, { id: string; name: string; title: string; initials: string }> = {
  admin: { id: 'usr-01', name: 'Manivannan Thangavel', title: 'Admin', initials: 'MT' },
  'release-manager': { id: 'usr-02', name: 'Vaishnavi Aasaithambi', title: 'Release Manager', initials: 'VA' },
  'firmware-lead': { id: 'usr-03', name: 'Judia Lumina', title: 'Firmware Lead', initials: 'JL' },
};

/** Starts the app already signed in (once per browser context, so reloads keep their data). */
export async function signInAs(page: Page, role: Role = 'admin'): Promise<void> {
  const u = USERS[role];
  await page.addInitScript(([user, userRole]) => {
    if (sessionStorage.getItem('e2e-signed-in')) return;
    sessionStorage.setItem('e2e-signed-in', '1');
    localStorage.setItem('devdoc_studio_user_session_v1', JSON.stringify({
      user: { ...user, email: `${user.id}@example.com`, department: 'Engineering', role: userRole, avatarBg: 'x' },
      token: 'e2e', loginTime: new Date().toISOString(), isAuthenticated: true,
    }));
  }, [u, role] as const);
}

interface SeedDoc {
  id: string;
  title: string;
  docNumber: string;
  author: string;
  status?: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED';
}

/** Replaces the document store, then reloads so the app picks it up. The sample-doc seed is
 * marked done so tests control exactly which documents exist. */
export async function seedDocuments(page: Page, docs: SeedDoc[]): Promise<void> {
  await page.goto('/');
  await page.evaluate((list) => {
    const store: Record<string, unknown> = {};
    for (const d of list) {
      store[d.id] = {
        updatedAt: new Date().toISOString(),
        doc: {
          metadata: {
            id: d.id, title: d.title, docNumber: d.docNumber, author: d.author, date: '2026-09-25',
            version: '1.0', classification: 'INTERNAL ONLY', status: d.status ?? 'DRAFT', templateType: 'technical-analysis',
          },
          sections: [{ id: 's1', title: 'Purpose', level: 1, type: 'richText', content: 'Sample content' }],
        },
      };
    }
    localStorage.setItem('devdoc_studio_documents_v1', JSON.stringify(store));
    localStorage.setItem('devdoc_studio_sample_docs_seeded_v1', '1');
  }, docs);
  await page.reload();
}
