import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('../../services/sessionAuditApiService', () => ({
  isSessionAuditAvailable: () => true,
  fetchSessionAudit: async () => [
    {
      id: 'a1', userId: 'usr-x', userName: 'Ada Author', role: 'user',
      loginTime: '2026-11-15T09:00:00Z', logoutTime: '2026-11-15T09:30:00Z',
      expiresAt: '2026-11-15T17:00:00Z', status: 'signed-out',
    },
  ],
}));

const { SessionAuditTable } = await import('./SessionAuditTable');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

async function render(ownOnly: boolean) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<SessionAuditTable ownOnly={ownOnly} />));
  const headers = [...host.querySelectorAll('th')].map((th) => th.textContent);
  const cells = [...host.querySelectorAll('tbody tr:first-child td')].map((td) => td.textContent);
  return { headers, cells };
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe('SessionAuditTable', () => {
  it('for everyone (admin): shows who signed in and their role', async () => {
    const { headers, cells } = await render(false);
    expect(headers).toEqual(['User', 'Role', 'Login', 'Logout', 'Duration']);
    expect(cells[0]).toBe('Ada Author');
    expect(cells).toHaveLength(5);
  });

  it('own sign-ins only: drops the User and Role columns, which would repeat your own', async () => {
    const { headers, cells } = await render(true);
    expect(headers).toEqual(['Login', 'Logout', 'Duration']);
    expect(cells).toHaveLength(3);
    expect(cells.join(' ')).not.toContain('Ada Author');
    expect(cells[2]).toBe('30m');
  });
});
