// Client-side Google OAuth via Google Identity Services (GIS).
// This app has no backend, so we use GIS's public-client token flow:
// no client secret is ever generated or transmitted — only a Client ID,
// which is not a secret and is safe to ship in frontend code.
//
// Scope is limited to drive.file: the app can only see/create files it
// creates itself, never the user's whole Drive.

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const TOKEN_STORAGE_KEY = 'devdoc_google_access_token_v1';
const CLIENT_ID_STORAGE_KEY = 'devdoc_google_client_id_v1';
const SCRIPT_LOAD_TIMEOUT_MS = 10_000;

/** Thrown by getClientId() when there's nothing configured anywhere -
 * its own type so callers (the export button) can tell "needs a Client
 * ID" apart from every other failure and offer to collect one, instead
 * of just showing a generic "Export failed". */
export class GoogleClientIdMissingError extends Error {
  constructor() {
    super('Google export is not configured: no Client ID set.');
    this.name = 'GoogleClientIdMissingError';
  }
}

export function getStoredClientId(): string | null {
  try {
    return localStorage.getItem(CLIENT_ID_STORAGE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

/** A Client ID entered this way takes priority over VITE_GOOGLE_CLIENT_ID
 * (lets anyone try the feature without rebuilding the app), and clears
 * any cached token client / access token - both were only ever valid
 * for whichever Client ID was in effect when they were issued. */
export function saveStoredClientId(clientId: string): void {
  localStorage.setItem(CLIENT_ID_STORAGE_KEY, clientId.trim());
  tokenClient = null;
  clearGoogleAuth();
}

export function isGoogleExportConfigured(): boolean {
  return Boolean(getStoredClientId() || (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined));
}

interface StoredToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GoogleTokenClient {
  callback: (response: GoogleTokenResponse) => void;
  error_callback?: (error: { type?: string; message?: string }) => void;
  requestAccessToken: (opts?: { prompt?: string }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback?: (error: { type?: string; message?: string }) => void;
          }) => GoogleTokenClient;
        };
      };
    };
  }
}

let tokenClient: GoogleTokenClient | null = null;

function getClientId(): string {
  const clientId = getStoredClientId() || (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined);
  if (!clientId) {
    throw new GoogleClientIdMissingError();
  }
  return clientId;
}

function loadStoredToken(): string | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed: StoredToken = JSON.parse(raw);
    // 30s safety margin before real expiry
    if (parsed.expiresAt > Date.now() + 30_000) return parsed.accessToken;
    return null;
  } catch {
    return null;
  }
}

function storeToken(accessToken: string, expiresInSeconds: number): void {
  const record: StoredToken = {
    accessToken,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  };
  sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(record));
}

function waitForGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - start > SCRIPT_LOAD_TIMEOUT_MS) {
        clearInterval(interval);
        reject(new Error('Could not reach Google. Check your internet connection and try again.'));
      }
    }, 100);
  });
}

/** Thrown when the user closes the consent popup or denies access. */
export class GoogleAuthCancelledError extends Error {
  constructor() {
    super('Google sign-in was cancelled.');
    this.name = 'GoogleAuthCancelledError';
  }
}

export async function getGoogleAccessToken(): Promise<string> {
  const cached = loadStoredToken();
  if (cached) return cached;

  // Checked before waiting on Google's script: no point waiting on a
  // network round trip just to fail on a missing Client ID anyway.
  const clientId = getClientId();
  await waitForGoogleIdentityServices();

  if (!tokenClient) {
    tokenClient = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: () => {},
    });
  }

  return new Promise<string>((resolve, reject) => {
    tokenClient!.callback = (response) => {
      if (response.error || !response.access_token) {
        if (response.error === 'access_denied') {
          reject(new GoogleAuthCancelledError());
        } else {
          reject(new Error(response.error_description || response.error || 'Google sign-in failed.'));
        }
        return;
      }
      storeToken(response.access_token, response.expires_in ?? 3600);
      resolve(response.access_token);
    };
    tokenClient!.error_callback = (error) => {
      if (error.type === 'popup_closed' || error.type === 'popup_failed_to_open') {
        reject(new GoogleAuthCancelledError());
      } else {
        reject(new Error(error.message || 'Google sign-in failed.'));
      }
    };
    tokenClient!.requestAccessToken({ prompt: '' });
  });
}

export function clearGoogleAuth(): void {
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
}
