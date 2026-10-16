import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createTestDb, TEST_USERS } from './helpers.js';

// testExec.ts holds job/script state in module-level Maps, same as the
// rate limiter - vi.resetModules() + a fresh import gives each test its
// own state instead of sharing it across tests (rate-limit.test.ts).
async function freshApp() {
  vi.resetModules();
  const { createApp } = await import('../src/app.js');
  return createApp(await createTestDb());
}

const user = TEST_USERS[0];

async function signedIn(app: Awaited<ReturnType<typeof freshApp>>) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: user.email, password: user.password });
  return agent;
}

const ROBOT_SCRIPT = '*** Settings ***\nDocumentation     RTC Suite\n\n*** Test Cases ***\nTC-001_Drift_Check\n    Log    hi\n';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('POST /api/test-exec/scripts', () => {
  it('requires auth', async () => {
    const app = await freshApp();
    const res = await request(app).post('/api/test-exec/scripts').send({ suiteId: 's1', suiteTitle: 'Suite', robotCode: ROBOT_SCRIPT });
    expect(res.status).toBe(401);
  });

  it('rejects a missing suiteId, suiteTitle, or robotCode', async () => {
    const app = await freshApp();
    const agent = await signedIn(app);
    expect((await agent.post('/api/test-exec/scripts').send({ suiteTitle: 'Suite', robotCode: 'x' })).status).toBe(400);
    expect((await agent.post('/api/test-exec/scripts').send({ suiteId: 's1', robotCode: 'x' })).status).toBe(400);
    expect((await agent.post('/api/test-exec/scripts').send({ suiteId: 's1', suiteTitle: 'Suite' })).status).toBe(400);
  });

  it('accepts a valid push', async () => {
    const app = await freshApp();
    const agent = await signedIn(app);
    const res = await agent.post('/api/test-exec/scripts').send({ suiteId: 's1', suiteTitle: 'Suite', robotCode: ROBOT_SCRIPT });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('POST /api/test-exec/runs', () => {
  it('requires auth', async () => {
    const app = await freshApp();
    const res = await request(app).post('/api/test-exec/runs').send({ suiteId: 's1' });
    expect(res.status).toBe(401);
  });

  it('rejects starting a run for a suite with no pushed script', async () => {
    const app = await freshApp();
    const agent = await signedIn(app);
    const res = await agent.post('/api/test-exec/runs').send({ suiteId: 'never-pushed' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no script/i);
  });

  it('starts a run and returns a jobId once a script has been pushed', async () => {
    const app = await freshApp();
    const agent = await signedIn(app);
    await agent.post('/api/test-exec/scripts').send({ suiteId: 's1', suiteTitle: 'Suite', robotCode: ROBOT_SCRIPT });
    const res = await agent.post('/api/test-exec/runs').send({ suiteId: 's1' });
    expect(res.status).toBe(200);
    expect(typeof res.body.jobId).toBe('string');
    expect(res.body.jobId.length).toBeGreaterThan(0);
  });
});

describe('GET /api/test-exec/runs/:jobId', () => {
  it('requires auth', async () => {
    const app = await freshApp();
    const res = await request(app).get('/api/test-exec/runs/job-nonexistent');
    expect(res.status).toBe(401);
  });

  it('404s for an unknown job id', async () => {
    const app = await freshApp();
    const agent = await signedIn(app);
    const res = await agent.get('/api/test-exec/runs/job-nonexistent');
    expect(res.status).toBe(404);
  });

  it('reports running, then completed results shaped like RobotResultsJson, matching the suite\'s own test ids', async () => {
    const app = await freshApp();
    const agent = await signedIn(app);
    await agent.post('/api/test-exec/scripts').send({ suiteId: 's1', suiteTitle: 'RTC Suite', robotCode: ROBOT_SCRIPT });
    const { body: { jobId } } = await agent.post('/api/test-exec/runs').send({ suiteId: 's1' });

    const immediate = await agent.get(`/api/test-exec/runs/${jobId}`);
    expect(immediate.status).toBe(200);
    expect(immediate.body.status).toBe('running');

    await wait(500);

    const done = await agent.get(`/api/test-exec/runs/${jobId}`);
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('completed');
    expect(done.body.results._schema).toBe('devdoc-robot-results-v1');
    expect(done.body.results.suiteTitle).toBe('RTC Suite');
    expect(done.body.results.results.length).toBeGreaterThan(0);
    // The name-extraction regex mirrors the client's own fuzzy
    // parseRobotOutputXml matching, which greedily eats underscores -
    // "TC-001_Drift_Check" lands on "TC-001-Drift", not just "TC-001".
    expect(done.body.results.results[0].customId).toBe('TC-001-Drift');
    expect(done.body.results.summary.total).toBe(done.body.results.results.length);
  });
});
