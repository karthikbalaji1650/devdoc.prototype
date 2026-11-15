import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { makeUser } from '../../test/fixtures';
import type { SettingsTab } from './SettingsPage';

// The admin-only panels talk to the server; stand-ins show which ones render.
vi.mock('./TestServersPanel', () => ({ TestServersPanel: () => <div>[test servers panel]</div> }));
vi.mock('./CiTokensPanel', () => ({ CiTokensPanel: () => <div>[ci tokens panel]</div> }));
vi.mock('./TrackersPanel', () => ({ TrackersPanel: () => <div>[trackers panel]</div> }));
vi.mock('./ServerDataPanel', () => ({ ServerDataPanel: () => <div>[backup and reset panel]</div> }));
vi.mock('./SessionAuditTable', () => ({
  SessionAuditTable: ({ ownOnly }: { ownOnly?: boolean }) => <div>[audit log: {ownOnly ? 'own' : 'everyone'}]</div>,
}));

const { SettingsPage } = await import('./SettingsPage');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

function renderSettings(role: 'admin' | 'user', activeTab: SettingsTab = 'data') {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <SettingsPage
        user={makeUser({ role })}
        onNavigate={vi.fn()}
        onLogout={vi.fn()}
        onUpdateAvatar={vi.fn()}
        activeTab={activeTab}
        onTabChange={vi.fn()}
      />,
    ),
  );
  return host.textContent ?? '';
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const ADMIN_ONLY = ['[test servers panel]', '[ci tokens panel]', '[trackers panel]', '[backup and reset panel]'];

describe('Settings → System & Storage', () => {
  it('is offered to a non-admin as well', () => {
    renderSettings('user', 'profile');
    const tabs = [...host!.querySelectorAll('aside button')].map((b) => b.textContent);
    expect(tabs.some((t) => t?.includes('System & Storage'))).toBe(true);
  });

  it('a non-admin sees the VS Code URL and only their own sign-ins, nothing admin-only', () => {
    const text = renderSettings('user');
    expect(text).toContain('VS Code + Cline Server URL');
    expect(text).toContain('[audit log: own]');
    for (const panel of ADMIN_ONLY) expect(text).not.toContain(panel);
  });

  it('an admin sees every panel and everyone\'s sign-ins', () => {
    const text = renderSettings('admin');
    expect(text).toContain('VS Code + Cline Server URL');
    expect(text).toContain('[audit log: everyone]');
    for (const panel of ADMIN_ONLY) expect(text).toContain(panel);
  });
});
