import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./backendAuthService', () => ({ isBackendConfigured: vi.fn(() => false) }));
import { isBackendConfigured } from './backendAuthService';

async function load() {
  vi.resetModules();
  return import('./aiService');
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

describe('AI config storage', () => {
  it('defaults to the offline built-in provider', async () => {
    const { getStoredAiConfig } = await load();
    expect(getStoredAiConfig().provider).toBe('builtin');
  });

  it('round-trips a saved config', async () => {
    const { getStoredAiConfig, saveStoredAiConfig } = await load();
    saveStoredAiConfig({ provider: 'gemini', apiKey: 'secret', model: 'gemini-1.5-flash' });
    expect(getStoredAiConfig()).toEqual({ provider: 'gemini', apiKey: 'secret', model: 'gemini-1.5-flash' });
  });
});

describe('rephraseText — no backend configured (the default)', () => {
  it('uses the offline heuristic when no provider is configured', async () => {
    const { rephraseText, saveStoredAiConfig } = await load();
    saveStoredAiConfig({ provider: 'builtin' });
    const result = await rephraseText('the system do a thing', 'professional');
    expect(typeof result).toBe('string');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls Gemini directly when the user has entered their own key', async () => {
    const { rephraseText, saveStoredAiConfig } = await load();
    saveStoredAiConfig({ provider: 'gemini', apiKey: 'my-own-key' });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Rephrased.' }] } }] }), { status: 200 }));
    const result = await rephraseText('hello', 'professional');
    expect(result).toBe('Rephrased.');
    expect(fetchMock.mock.calls[0][0]).toContain('generativelanguage.googleapis.com');
    expect(fetchMock.mock.calls[0][0]).toContain('key=my-own-key');
  });

  it('falls back to the offline heuristic without a key, even with gemini selected', async () => {
    const { rephraseText, saveStoredAiConfig } = await load();
    saveStoredAiConfig({ provider: 'gemini' }); // no apiKey
    const result = await rephraseText('hello', 'professional');
    expect(typeof result).toBe('string');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('rephraseText — backend proxy preference', () => {
  beforeEach(() => vi.mocked(isBackendConfigured).mockReturnValue(true));

  it('uses the backend proxy when configured and the user has not entered a personal key', async () => {
    const { rephraseText, saveStoredAiConfig } = await load();
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:4000');
    saveStoredAiConfig({ provider: 'gemini' }); // no personal apiKey
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ text: 'Proxied result.' }), { status: 200 }));

    const result = await rephraseText('hello', 'professional');

    expect(result).toBe('Proxied result.');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/ai/rephrase');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body)).toMatchObject({ provider: 'gemini', text: 'hello' });
  });

  it('never proxies a provider the user has their own key for - that stays a direct call', async () => {
    const { rephraseText, saveStoredAiConfig } = await load();
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:4000');
    saveStoredAiConfig({ provider: 'openai', apiKey: 'my-own-key' });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'Direct result.' } }] }), { status: 200 }));

    const result = await rephraseText('hello', 'professional');

    expect(result).toBe('Direct result.');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('falls back to the offline heuristic if the proxy call fails', async () => {
    const { rephraseText, saveStoredAiConfig } = await load();
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:4000');
    saveStoredAiConfig({ provider: 'gemini' });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'This server has no gemini API key configured.' }), { status: 501 }));

    const result = await rephraseText('hello', 'professional');

    expect(typeof result).toBe('string');
    expect(result).not.toBe('undefined');
  });

  it('never proxies ollama (no server-side key involved)', async () => {
    const { rephraseText, saveStoredAiConfig } = await load();
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:4000');
    saveStoredAiConfig({ provider: 'ollama', baseUrl: 'http://localhost:11434' });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ response: 'Local result.' }), { status: 200 }));

    const result = await rephraseText('hello', 'professional');

    expect(result).toBe('Local result.');
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/api/generate');
  });
});
