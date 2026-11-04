import type { Page } from '@playwright/test';

export type Role = 'admin' | 'release-manager' | 'firmware-lead';

const USERS: Record<Role, { id: string; name: string; title: string; initials: string }> = {
  admin: { id: 'usr-01', name: 'Manivannan Thangavel', title: 'Admin', initials: 'MT' },
  'release-manager': { id: 'usr-02', name: 'Vaishnavi Aasaithambi', title: 'Release Manager', initials: 'VA' },
  'firmware-lead': { id: 'usr-03', name: 'Judia Lumina', title: 'Firmware Lead', initials: 'JL' },
};

/** Browser-only demo (no backend): starts the app already signed in, once per
 * browser context. Specs that need a server use ./fixtures instead.
 * Marks the first-run welcome guide as already seen, so it doesn't cover
 * the screen and block every other test's clicks - tests that actually
 * exercise the welcome guide clear that flag themselves. */
export async function signInAs(page: Page, role: Role = 'admin'): Promise<void> {
  const u = USERS[role];
  await page.addInitScript(([user, userRole]) => {
    if (sessionStorage.getItem('e2e-signed-in')) return;
    sessionStorage.setItem('e2e-signed-in', '1');
    localStorage.setItem('devdoc_studio_user_session_v1', JSON.stringify({
      user: { ...user, email: `${user.id}@example.com`, department: 'Engineering', role: userRole, avatarBg: 'x' },
      token: 'e2e', loginTime: new Date().toISOString(), isAuthenticated: true,
    }));
    localStorage.setItem('devdoc_studio_welcome_seen_v1', '1');
  }, [u, role] as const);
}
