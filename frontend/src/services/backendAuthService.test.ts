import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

async function load() {
  vi.resetModules();
  return import('./backendAuthService');
}

const fetchMock = vi.fn();
beforeEach(() => vi.stubGlobal('fetch', fetchMock));
afterEach(() => { fetchMock.mockReset(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('isBackendConfigured', () => {
  it('is false when VITE_API_BASE_URL is not set (the default, browser-only demo)', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    const { isBackendConfigured } = await load();
    expect(isBackendConfigured()).toBe(false);
  });

  it('is true once it is set', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:4000');
    const { isBackendConfigured } = await load();
    expect(isBackendConfigured()).toBe(true);
  });
});

describe('loginWithBackend', () => {
  beforeEach(() => vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:4000/'));

  it('posts credentials with the cookie included and maps the returned user', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      user: { id: 'usr-01', name: 'Manivannan Thangavel', email: 'mani@x.com', title: 'Manager', department: 'Eng', role: 'admin', avatarBg: 'x', initials: 'MT' },
    }), { status: 200 }));
    const { loginWithBackend } = await load();
    const user = await loginWithBackend('mani@x.com', 'secret');

    expect(user).toMatchObject({ id: 'usr-01', name: 'Manivannan Thangavel', role: 'admin' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/auth/login'); // trailing slash on the base URL is stripped
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body)).toEqual({ email: 'mani@x.com', password: 'secret' });
  });

  it('fills in reasonable defaults for a user with no title, department or avatar set', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      user: { id: 'usr-09', name: 'New Person', email: 'new@x.com', title: null, department: null, role: 'firmware-lead', avatarBg: null, initials: null },
    }), { status: 200 }));
    const { loginWithBackend } = await load();
    const user = await loginWithBackend('new@x.com', 'secret');
    expect(user.title).toBe('');
    expect(user.initials).toBe('NE');
  });

  it('throws with the server\'s own error message on rejected credentials', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Invalid email or password.' }), { status: 401 }));
    const { loginWithBackend } = await load();
    await expect(loginWithBackend('x@x.com', 'wrong')).rejects.toThrow('Invalid email or password.');
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('gateway error', { status: 502 }));
    const { loginWithBackend } = await load();
    await expect(loginWithBackend('x@x.com', 'w')).rejects.toThrow('Sign-in failed (502).');
  });

  it('propagates a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { loginWithBackend } = await load();
    await expect(loginWithBackend('x@x.com', 'w')).rejects.toThrow('Failed to fetch');
  });
});

describe('logoutBackend', () => {
  it('posts to the logout endpoint with the cookie included', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:4000');
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const { logoutBackend } = await load();
    await logoutBackend();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/auth/logout');
    expect(init.credentials).toBe('include');
  });

  it('does not throw when the API is unreachable', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:4000');
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { logoutBackend } = await load();
    await expect(logoutBackend()).resolves.toBeUndefined();
  });
});

describe('checkBackendSession', () => {
  beforeEach(() => vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:4000/'));
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  it('is valid when the server still has the session, and sends the cookie', async () => {
    fetchMock.mockResolvedValue(json(200, { user: { id: 'u1', name: 'Mani', email: 'm@x', role: 'admin' } }));
    const { checkBackendSession } = await load();
    await expect(checkBackendSession()).resolves.toBe('valid');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/auth/me');
    expect(init.credentials).toBe('include');
  });

  it('is signed-out when the server answers 401 (session ended)', async () => {
    fetchMock.mockResolvedValue(json(401, { error: 'Not signed in.' }));
    const { checkBackendSession } = await load();
    await expect(checkBackendSession()).resolves.toBe('signed-out');
  });

  it('is unknown, never signed-out, when the server errors or cannot be reached', async () => {
    const { checkBackendSession } = await load();
    fetchMock.mockResolvedValue(json(500, { error: 'boom' }));
    await expect(checkBackendSession()).resolves.toBe('unknown');
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(checkBackendSession()).resolves.toBe('unknown');
  });
});
