import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getStoredVscodeUrl } from './CoderView';

describe('getStoredVscodeUrl', () => {
  afterEach(() => { vi.unstubAllEnvs(); });
  beforeEach(() => { localStorage.clear(); });

  // The direct http://host:8080 default used to be blocked by this app's
  // own CSP (frame-src) - a real bug, since it made the Coder screen's
  // iframe appear to just not load. The same-origin /vscode/ proxy
  // (nginx.conf.template) is the fix.
  it('defaults to the same-origin /vscode/ proxy, not a cross-origin port', () => {
    const url = getStoredVscodeUrl();
    expect(url).toBe(`${window.location.origin}/vscode/`);
    expect(url).not.toContain(':8080');
  });

  it('prefers a value the user saved in localStorage', () => {
    localStorage.setItem('devdoc_vscode_url', 'http://example.com:9000');
    expect(getStoredVscodeUrl()).toBe('http://example.com:9000');
  });

  it('prefers VITE_VSCODE_URL over the default when nothing is stored', () => {
    vi.stubEnv('VITE_VSCODE_URL', 'http://configured-elsewhere:1234');
    expect(getStoredVscodeUrl()).toBe('http://configured-elsewhere:1234');
  });
});
