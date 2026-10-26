import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeDoc } from '../test/fixtures';

vi.mock('./backendAuthService', () => ({ isBackendConfigured: vi.fn(() => false) }));
import { isBackendConfigured } from './backendAuthService';

async function load() {
  vi.resetModules();
  return import('./aiTestCaseGeneratorService');
}
async function configure(provider: string, overrides: Record<string, unknown> = {}) {
  const { saveStoredAiConfig } = await import('./aiService');
  saveStoredAiConfig({ provider: provider as never, ...overrides });
}

const fetchMock = vi.fn();
beforeEach(() => vi.stubGlobal('fetch', fetchMock));
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  localStorage.clear();
  vi.mocked(isBackendConfigured).mockReturnValue(false);
});

describe('generateTestCasesFromTaDoc — no backend configured (the default)', () => {
  it('uses the built-in generator with no provider configured', async () => {
    const { generateTestCasesFromTaDoc } = await load();
    await configure('builtin');
    const { suite, testCases } = await generateTestCasesFromTaDoc(makeDoc('a'));
    expect(suite.id).toBeTruthy();
    expect(testCases.length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('generateTestCasesFromTaDoc — backend proxy preference', () => {
  beforeEach(() => vi.mocked(isBackendConfigured).mockReturnValue(true));

  it('uses the proxy when configured and the user has no personal key, and assigns ids to the result', async () => {
    const { generateTestCasesFromTaDoc } = await load();
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:4000');
    await configure('gemini'); // no apiKey
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      suiteTitle: 'Proxied Suite', suiteDescription: 'desc', module: 'Firmware Core',
      testCases: [{ title: 'Boots correctly', steps: [], expectedResult: 'Boots' }],
    }), { status: 200 }));

    const { suite, testCases } = await generateTestCasesFromTaDoc(makeDoc('a', { docNumber: 'WH3-1' }));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/ai/generate-test-cases');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body).provider).toBe('gemini');
    expect(suite.title).toBe('Proxied Suite');
    expect(testCases).toHaveLength(1);
    expect(testCases[0].id).toBeTruthy();
    expect(testCases[0].customId).toContain('WH31');
  });

  it('does not proxy when the user has entered their own key', async () => {
    const { generateTestCasesFromTaDoc } = await load();
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:4000');
    await configure('gemini', { apiKey: 'my-own-key' });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ suiteTitle: 'Direct Suite', testCases: [] }) }] } }],
    }), { status: 200 }));

    const { suite } = await generateTestCasesFromTaDoc(makeDoc('a'));

    expect(suite.title).toBe('Direct Suite');
    expect(fetchMock.mock.calls[0][0]).toContain('generativelanguage.googleapis.com');
  });

  it('falls back to the built-in generator if the proxy call fails', async () => {
    const { generateTestCasesFromTaDoc } = await load();
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:4000');
    await configure('gemini');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'no key' }), { status: 501 }));

    const { suite, testCases } = await generateTestCasesFromTaDoc(makeDoc('a'));

    expect(suite.id).toBeTruthy();
    expect(testCases.length).toBeGreaterThan(0); // the built-in generator always produces at least one case
  });
});
