import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LoginPage } from './LoginPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../../services/backendAuthService', () => ({
  isBackendConfigured: vi.fn(() => false),
  loginWithBackend: vi.fn(),
}));
import { isBackendConfigured, loginWithBackend } from '../../services/backendAuthService';

let root: Root | null = null;
let host: HTMLElement | null = null;
function render(node: React.ReactNode) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}
async function flush(ms = 0) {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
}
// Bypasses React's value tracker the same way a real keystroke would,
// so the component's onChange actually fires (a plain `.value =` set
// does not, since React patches the native setter).
function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('LoginPage — no backend configured (the default, demo mode)', () => {
  it('signs in a known demo email regardless of password, unchanged from before this session', async () => {
    vi.mocked(isBackendConfigured).mockReturnValue(false);
    const onLogin = vi.fn();
    const el = render(<LoginPage onLogin={onLogin} />);
    const email = el.querySelector<HTMLInputElement>('input[type=email]')!;
    const password = el.querySelector<HTMLInputElement>('input[type=password]')!;
    act(() => type(email, 'mani.thangavel@sanmina.com'));
    act(() => type(password, 'anything'));
    act(() => { el.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush(500);
    expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({ name: 'Manivannan Thangavel' }));
    expect(loginWithBackend).not.toHaveBeenCalled();
  });
});

describe('LoginPage — backend configured', () => {
  it('checks the password against the API and signs in on success', async () => {
    vi.mocked(isBackendConfigured).mockReturnValue(true);
    vi.mocked(loginWithBackend).mockResolvedValue({
      id: 'usr-01', name: 'Manivannan Thangavel', email: 'mani@x.com', title: 'Manager', department: 'Eng',
      role: 'admin', avatarBg: 'x', initials: 'MT',
    });
    const onLogin = vi.fn();
    const el = render(<LoginPage onLogin={onLogin} />);
    const password = el.querySelector<HTMLInputElement>('input[type=password]')!;
    act(() => type(password, 'real-password'));
    act(() => { el.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();
    expect(loginWithBackend).toHaveBeenCalledWith('mani.thangavel@sanmina.com', 'real-password');
    expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({ name: 'Manivannan Thangavel' }));
  });

  it('shows the server\'s rejection message and does not sign in', async () => {
    vi.mocked(isBackendConfigured).mockReturnValue(true);
    vi.mocked(loginWithBackend).mockRejectedValue(new Error('Invalid email or password.'));
    const onLogin = vi.fn();
    const el = render(<LoginPage onLogin={onLogin} />);
    act(() => { el.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();
    expect(el.querySelector('[role="alert"]')?.textContent).toBe('Invalid email or password.');
    expect(onLogin).not.toHaveBeenCalled();
  });
});
