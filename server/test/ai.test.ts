import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import type { Db } from '../src/db.js';
import { createTestDb, TEST_USERS } from './helpers.js';

const user = TEST_USERS[0];
let db: Db;
let app: ReturnType<typeof createApp>;
const fetchMock = vi.fn();

beforeEach(async () => {
  db = await createTestDb();
  app = createApp(db);
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('GEMINI_API_KEY', '');
  vi.stubEnv('OPENAI_API_KEY', '');
});
afterEach(() => { fetchMock.mockReset(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function signedIn() {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: user.email, password: user.password });
  return agent;
}

describe('GET /api/ai/providers', () => {
  it('requires auth', async () => {
    expect((await request(app).get('/api/ai/providers')).status).toBe(401);
  });

  it('lists only the providers with a server-side key configured', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    const agent = await signedIn();
    const res = await agent.get('/api/ai/providers');
    expect(res.body.providers).toEqual(['gemini']);
  });

  it('is empty when nothing is configured', async () => {
    const agent = await signedIn();
    expect((await agent.get('/api/ai/providers')).body.providers).toEqual([]);
  });
});

describe('POST /api/ai/rephrase', () => {
  it('requires auth', async () => {
    expect((await request(app).post('/api/ai/rephrase').send({ provider: 'gemini', text: 'x', instruction: 'y' })).status).toBe(401);
  });

  it('rejects an invalid provider', async () => {
    const agent = await signedIn();
    const res = await agent.post('/api/ai/rephrase').send({ provider: 'carrier-pigeon', text: 'x', instruction: 'y' });
    expect(res.status).toBe(400);
  });

  it('rejects empty text or instruction', async () => {
    const agent = await signedIn();
    expect((await agent.post('/api/ai/rephrase').send({ provider: 'gemini', text: '', instruction: 'y' })).status).toBe(400);
    expect((await agent.post('/api/ai/rephrase').send({ provider: 'gemini', text: 'x', instruction: '' })).status).toBe(400);
  });

  it('reports 501 when the server has no key for that provider', async () => {
    const agent = await signedIn();
    const res = await agent.post('/api/ai/rephrase').send({ provider: 'gemini', text: 'x', instruction: 'y' });
    expect(res.status).toBe(501);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls Gemini with the server-side key and returns the rephrased text', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Rephrased.' }] } }],
    }), { status: 200 }));
    const agent = await signedIn();
    const res = await agent.post('/api/ai/rephrase').send({ provider: 'gemini', text: 'hello', instruction: 'make it formal' });
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('Rephrased.');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('key=test-key');
    expect(url).not.toContain('undefined');
  });

  it('calls OpenAI with the server-side key, never exposing it to the client', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'Rephrased by OpenAI.' } }],
    }), { status: 200 }));
    const agent = await signedIn();
    const res = await agent.post('/api/ai/rephrase').send({ provider: 'openai', text: 'hello', instruction: 'make it formal' });
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('Rephrased by OpenAI.');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer test-key');
    expect(JSON.stringify(res.body)).not.toContain('test-key'); // the key itself never comes back to the client
  });

  it('surfaces the provider\'s own error message with a 502', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Quota exceeded' } }), { status: 429 }));
    const agent = await signedIn();
    const res = await agent.post('/api/ai/rephrase').send({ provider: 'gemini', text: 'x', instruction: 'y' });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('Quota exceeded');
  });

  it('502s on a network failure rather than crashing', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const agent = await signedIn();
    const res = await agent.post('/api/ai/rephrase').send({ provider: 'gemini', text: 'x', instruction: 'y' });
    expect(res.status).toBe(502);
  });
});
