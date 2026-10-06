import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The service keeps a module-level token client, so each test gets a fresh copy.
async function load() {
  vi.resetModules();
  return import('./googleAuthService');
}

type TokenConfig = { client_id: string; scope: string };
interface FakeClient {
  callback: (r: Record<string, unknown>) => void;
  error_callback?: (e: { type?: string; message?: string }) => void;
  requestAccessToken: ReturnType<typeof vi.fn>;
}

/** Stands in for Google's script: hands back a client whose popup outcome the test controls. */
function installFakeGoogle(onRequest: (client: FakeClient) => void) {
  const configs: TokenConfig[] = [];
  const clients: FakeClient[] = [];
  (window as unknown as { google: unknown }).google = {
    accounts: {
      oauth2: {
        initTokenClient: (config: TokenConfig) => {
          configs.push(config);
          const client: FakeClient = {
            callback: () => {},
            requestAccessToken: vi.fn(() => onRequest(client)),
          };
          clients.push(client);
          return client;
        },
      },
    },
  };
  return { configs, clients };
}

beforeEach(() => vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id.apps.googleusercontent.com'));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  delete (window as unknown as { google?: unknown }).google;
});

describe('getGoogleAccessToken', () => {
  it('requests a token with the configured client id and the drive.file scope only', async () => {
    const { configs } = installFakeGoogle((c) => c.callback({ access_token: 'tok-1', expires_in: 3600 }));
    const { getGoogleAccessToken } = await load();
    await expect(getGoogleAccessToken()).resolves.toBe('tok-1');
    expect(configs[0]).toMatchObject({
      client_id: 'test-client-id.apps.googleusercontent.com',
      scope: 'https://www.googleapis.com/auth/drive.file',
    });
  });

  it('caches the token so the popup is not shown again', async () => {
    const { clients } = installFakeGoogle((c) => c.callback({ access_token: 'tok-1', expires_in: 3600 }));
    const { getGoogleAccessToken } = await load();
    await getGoogleAccessToken();
    await expect(getGoogleAccessToken()).resolves.toBe('tok-1');
    expect(clients[0].requestAccessToken).toHaveBeenCalledTimes(1);
  });

  it('ignores an expired cached token and asks again', async () => {
    sessionStorage.setItem('devdoc_google_access_token_v1', JSON.stringify({ accessToken: 'old', expiresAt: Date.now() - 1000 }));
    installFakeGoogle((c) => c.callback({ access_token: 'fresh', expires_in: 3600 }));
    const { getGoogleAccessToken } = await load();
    await expect(getGoogleAccessToken()).resolves.toBe('fresh');
  });

  it('treats a token about to expire (inside the 30 s margin) as expired', async () => {
    sessionStorage.setItem('devdoc_google_access_token_v1', JSON.stringify({ accessToken: 'stale', expiresAt: Date.now() + 10_000 }));
    installFakeGoogle((c) => c.callback({ access_token: 'fresh', expires_in: 3600 }));
    const { getGoogleAccessToken } = await load();
    await expect(getGoogleAccessToken()).resolves.toBe('fresh');
  });

  it('uses a valid stored token without touching Google at all', async () => {
    sessionStorage.setItem('devdoc_google_access_token_v1', JSON.stringify({ accessToken: 'kept', expiresAt: Date.now() + 600_000 }));
    const { getGoogleAccessToken } = await load();
    await expect(getGoogleAccessToken()).resolves.toBe('kept');
  });

  it('reports a dedicated error when no client id is configured anywhere', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    installFakeGoogle(() => {});
    const { getGoogleAccessToken, GoogleClientIdMissingError } = await load();
    await expect(getGoogleAccessToken()).rejects.toBeInstanceOf(GoogleClientIdMissingError);
  });

  it('uses a client id the user entered at runtime, even with no build-time one set', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    const { configs } = installFakeGoogle((c) => c.callback({ access_token: 'tok-1', expires_in: 3600 }));
    const { getGoogleAccessToken, saveStoredClientId } = await load();
    saveStoredClientId('user-entered-id.apps.googleusercontent.com');
    await expect(getGoogleAccessToken()).resolves.toBe('tok-1');
    expect(configs[0].client_id).toBe('user-entered-id.apps.googleusercontent.com');
  });

  it('prefers a runtime-entered client id over the build-time one', async () => {
    const { configs } = installFakeGoogle((c) => c.callback({ access_token: 'tok-1', expires_in: 3600 }));
    const { getGoogleAccessToken, saveStoredClientId } = await load();
    saveStoredClientId('override-id');
    await getGoogleAccessToken();
    expect(configs[0].client_id).toBe('override-id');
  });

  it('reports a cancelled sign-in when access is denied', async () => {
    installFakeGoogle((c) => c.callback({ error: 'access_denied' }));
    const { getGoogleAccessToken, GoogleAuthCancelledError } = await load();
    await expect(getGoogleAccessToken()).rejects.toBeInstanceOf(GoogleAuthCancelledError);
  });

  it('reports a cancelled sign-in when the popup is closed or blocked', async () => {
    installFakeGoogle((c) => c.error_callback?.({ type: 'popup_closed' }));
    const { getGoogleAccessToken, GoogleAuthCancelledError } = await load();
    await expect(getGoogleAccessToken()).rejects.toBeInstanceOf(GoogleAuthCancelledError);
  });

  it('surfaces other Google errors with their description', async () => {
    installFakeGoogle((c) => c.callback({ error: 'invalid_client', error_description: 'The OAuth client was not found.' }));
    const { getGoogleAccessToken } = await load();
    await expect(getGoogleAccessToken()).rejects.toThrow('The OAuth client was not found.');
  });

  it('gives up with a connection message if Google\'s script never loads', async () => {
    vi.useFakeTimers();
    const { getGoogleAccessToken } = await load();
    const result = getGoogleAccessToken().catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(11_000);
    expect(await result).toMatchObject({ message: expect.stringMatching(/Could not reach Google/) });
  });
});

describe('clearGoogleAuth', () => {
  it('forgets the stored token so the next export asks again', async () => {
    const { clients } = installFakeGoogle((c) => c.callback({ access_token: 'tok-1', expires_in: 3600 }));
    const { getGoogleAccessToken, clearGoogleAuth } = await load();
    await getGoogleAccessToken();
    clearGoogleAuth();
    await getGoogleAccessToken();
    expect(clients[0].requestAccessToken).toHaveBeenCalledTimes(2);
  });
});

describe('isGoogleExportConfigured', () => {
  it('is false with nothing set anywhere', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    const { isGoogleExportConfigured } = await load();
    expect(isGoogleExportConfigured()).toBe(false);
  });

  it('is true from the build-time env var alone', async () => {
    const { isGoogleExportConfigured } = await load();
    expect(isGoogleExportConfigured()).toBe(true);
  });

  it('is true once a runtime client id is saved, even with no build-time one', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    const { isGoogleExportConfigured, saveStoredClientId } = await load();
    expect(isGoogleExportConfigured()).toBe(false);
    saveStoredClientId('an-id');
    expect(isGoogleExportConfigured()).toBe(true);
  });
});

describe('saveStoredClientId', () => {
  it('discards any cached token and token client, since both were only valid for the previous client id', async () => {
    const { clients, configs } = installFakeGoogle((c) => c.callback({ access_token: 'tok-1', expires_in: 3600 }));
    const { getGoogleAccessToken, saveStoredClientId } = await load();
    await getGoogleAccessToken(); // caches a token under the build-time client id

    saveStoredClientId('a-different-id');
    await getGoogleAccessToken();

    expect(configs).toHaveLength(2); // a fresh token client was created, not the cached one reused
    expect(configs[1].client_id).toBe('a-different-id');
    expect(clients[1].requestAccessToken).toHaveBeenCalledTimes(1); // asked again, the old token wasn't reused
  });
});
