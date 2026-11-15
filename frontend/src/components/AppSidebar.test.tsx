import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppSidebar, resetAppSidebar } from './AppSidebar';
import { makeUser } from '../test/fixtures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

/** Renders the sidebar next to a stand-in for the page content, the way
 * every screen lays it out. */
function renderScreen(onNavigate = vi.fn(), onLogout = vi.fn()) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <div>
        <AppSidebar user={makeUser()} activeView="dashboard" onNavigate={onNavigate} onLogout={onLogout} />
        <main>
          <p>page content</p>
        </main>
      </div>,
    ),
  );
  return { onNavigate, onLogout };
}

function unmount() {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
}

const toggle = () => host!.querySelector<HTMLButtonElement>('button[aria-controls="app-sidebar-panel"]')!;
const isOpen = () => toggle().getAttribute('aria-expanded') === 'true';
const panel = () => host!.querySelector<HTMLElement>('#app-sidebar-panel')!;
const navButton = (label: string) =>
  [...host!.querySelectorAll<HTMLButtonElement>('nav button')].find((b) => b.textContent?.includes(label))!;
const pointerDown = (el: Element) => act(() => { el.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
const click = (el: Element) => act(() => { (el as HTMLElement).click(); });

/** Lets two frames pass: the sidebar paints closed first, then opens. */
const nextFrames = () =>
  act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });

/** Swaps the whole screen, the way navigating to another page does: the
 * old screen's sidebar goes away and the new screen mounts its own. */
function showScreen(name: string | null, onNavigate = vi.fn()) {
  act(() =>
    root!.render(
      name === null ? (
        <p>loading…</p>
      ) : (
        <div key={name}>
          <AppSidebar user={makeUser()} activeView="dashboard" onNavigate={onNavigate} onLogout={vi.fn()} />
          <main>
            <p>{name} content</p>
          </main>
        </div>
      ),
    ),
  );
}

function closeIt() {
  pointerDown(host!.querySelector('main p')!);
  expect(isOpen()).toBe(false);
}

beforeEach(() => resetAppSidebar());
afterEach(() => {
  unmount();
  vi.restoreAllMocks();
});

describe('AppSidebar open/close behaviour', () => {
  it('1. is open when the app loads', () => {
    renderScreen();
    expect(isOpen()).toBe(true);
  });

  it('1. is open on load on a narrow (phone) viewport too', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390);
    renderScreen();
    expect(isOpen()).toBe(true);
  });

  it('2. closes when the page content is clicked', () => {
    renderScreen();
    pointerDown(host!.querySelector('main p')!);
    expect(isOpen()).toBe(false);
  });

  it('2. does not close when something inside the sidebar is pressed', () => {
    renderScreen();
    pointerDown(panel());
    pointerDown(navButton('Coder'));
    expect(isOpen()).toBe(true);
  });

  it('3. a nav button while closed opens the bar and goes to that screen', async () => {
    const { onNavigate } = renderScreen();
    closeIt();
    click(navButton('Release Master'));
    expect(onNavigate).toHaveBeenCalledWith('operations', 'releases');
    await nextFrames();
    expect(isOpen()).toBe(true);
  });

  it('3. on a new screen, the bar first shows closed and then opens, so it animates instead of snapping open', async () => {
    renderScreen(vi.fn(() => showScreen('coder')));
    closeIt();
    click(navButton('Coder'));
    expect(host!.textContent).toContain('coder content');
    expect(isOpen()).toBe(false); // the new screen's first paint
    await nextFrames();
    expect(isOpen()).toBe(true);
  });

  it('3. a screen that is still loading opens its bar once it appears, not before', async () => {
    renderScreen(vi.fn(() => showScreen(null)));
    closeIt();
    click(navButton('Settings'));
    await nextFrames();
    showScreen('settings');
    expect(isOpen()).toBe(false);
    await nextFrames();
    expect(isOpen()).toBe(true);
  });

  it('3. a nav button while open navigates and leaves the bar open', () => {
    const { onNavigate } = renderScreen();
    click(navButton('Coder'));
    expect(isOpen()).toBe(true);
    expect(onNavigate).toHaveBeenCalledWith('coder', undefined);
  });

  it('4. the open/close button opens it when closed and closes it when open', () => {
    renderScreen();
    click(toggle());
    expect(isOpen()).toBe(false);
    click(toggle());
    expect(isOpen()).toBe(true);
  });

  it('4. clicking the empty space of the closed bar opens it', () => {
    renderScreen();
    closeIt();
    click(panel());
    expect(isOpen()).toBe(true);
  });

  it('clicking the empty space of the open bar does not close it', () => {
    renderScreen();
    click(panel());
    expect(isOpen()).toBe(true);
  });

  it('stays closed when moving to another screen (one shared state, not one per screen)', () => {
    renderScreen();
    closeIt();
    unmount();
    renderScreen(); // the next screen mounts its own sidebar
    expect(isOpen()).toBe(false);
  });

  it('stays open when moving to another screen', () => {
    renderScreen();
    unmount();
    renderScreen();
    expect(isOpen()).toBe(true);
  });

  it('keeps the labels in the page while closed so they can fade instead of popping in', () => {
    renderScreen();
    closeIt();
    expect(navButton('Release Master')).toBeTruthy();
    expect(host!.textContent).toContain('DevDoc');
  });

  it('closed: hidden labels and the sign-out button are out of the keyboard and screen-reader path', () => {
    renderScreen();
    closeIt();
    const signOut = host!.querySelector<HTMLButtonElement>('button[title="Sign Out"]')!;
    expect(signOut.tabIndex).toBe(-1);
    expect(signOut.getAttribute('aria-hidden')).toBe('true');
    // nav buttons keep a name for screen readers even with the label faded
    expect(navButton('Coder').getAttribute('aria-label')).toBe('Coder');
  });

  it('has no Data Management entry, even for an admin (it lives in Settings → System & Storage)', () => {
    unmount();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<AppSidebar user={makeUser({ role: 'admin' })} activeView="settings" onNavigate={vi.fn()} onLogout={vi.fn()} />));
    const labels = [...host.querySelectorAll('nav button')].map((b) => b.getAttribute('aria-label'));
    expect(labels).toContain('Settings');
    expect(labels).not.toContain('Data Management');
  });

  it('signing out leaves the bar open for the next sign-in', () => {
    const { onLogout } = renderScreen();
    closeIt();
    click(panel()); // reopen so the sign-out button is reachable
    click(host!.querySelector('button[title="Sign Out"]')!);
    expect(onLogout).toHaveBeenCalled();
    unmount();
    renderScreen();
    expect(isOpen()).toBe(true);
  });
});
