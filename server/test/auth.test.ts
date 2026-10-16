import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import type { Db } from '../src/db.js';
import { createTestDb, TEST_USERS } from './helpers.js';

let db: Db;
beforeEach(async () => { db = await createTestDb(); });

describe('POST /api/auth/login', () => {
  it('signs in with the right password and sets a session cookie', async () => {
    const app = createApp(db);
    const res = await request(app).post('/api/auth/login').send({ email: TEST_USERS[0].email, password: TEST_USERS[0].password });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 'usr-01', name: 'Manivannan Thangavel', role: 'admin' });
    expect(res.body.user.password_hash).toBeUndefined();
    expect(res.headers['set-cookie']?.[0]).toMatch(/devdoc_sid=.+HttpOnly/);
  });

  // Regression: the session cookie used to be Secure whenever
  // NODE_ENV=production, which this project's own docker-compose demo
  // sets - but that demo runs over plain HTTP, so the browser accepted
  // the cookie on login then silently dropped it on the next request,
  // breaking sign-in right after it looked like it worked.
  //
  // auth.ts computes COOKIE_OPTS once at module load, so the env var
  // has to be stubbed *before* a fresh import, same pattern as
  // rate-limit.test.ts and testExec.test.ts use for their own
  // module-level state.
  describe('the Secure cookie attribute', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('is not set by default - needed for plain-HTTP deployments like the docker-compose demo', async () => {
      vi.stubEnv('COOKIE_SECURE', '');
      vi.resetModules();
      const { createApp: freshCreateApp } = await import('../src/app.js');
      const app = freshCreateApp(db);
      const res = await request(app).post('/api/auth/login').send({ email: TEST_USERS[0].email, password: TEST_USERS[0].password });
      expect(res.headers['set-cookie']?.[0]).not.toMatch(/Secure/);
    });

    it('is set when COOKIE_SECURE=true, for a real HTTPS deployment', async () => {
      vi.stubEnv('COOKIE_SECURE', 'true');
      vi.resetModules();
      const { createApp: freshCreateApp } = await import('../src/app.js');
      const app = freshCreateApp(db);
      const res = await request(app).post('/api/auth/login').send({ email: TEST_USERS[0].email, password: TEST_USERS[0].password });
      expect(res.headers['set-cookie']?.[0]).toMatch(/Secure/);
    });
  });

  it('matches email case-insensitively', async () => {
    const app = createApp(db);
    const res = await request(app).post('/api/auth/login').send({ email: TEST_USERS[0].email.toUpperCase(), password: TEST_USERS[0].password });
    expect(res.status).toBe(200);
  });

  it('rejects a wrong password with the same message as an unknown email', async () => {
    const app = createApp(db);
    const wrongPassword = await request(app).post('/api/auth/login').send({ email: TEST_USERS[0].email, password: 'nope' });
    const unknownEmail = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'nope' });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error).toBe(unknownEmail.body.error);
  });

  it('rejects a missing email or password', async () => {
    const app = createApp(db);
    expect((await request(app).post('/api/auth/login').send({ password: 'x' })).status).toBe(400);
    expect((await request(app).post('/api/auth/login').send({ email: 'x@example.com' })).status).toBe(400);
  });
});

describe('session cookie', () => {
  it('GET /api/auth/me identifies the signed-in user', async () => {
    const app = createApp(db);
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: TEST_USERS[1].email, password: TEST_USERS[1].password });
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Vaishnavi Aasaithambi');
  });

  it('GET /api/auth/me is 401 without a session', async () => {
    const app = createApp(db);
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('logout invalidates the session immediately (not just clears the cookie)', async () => {
    const app = createApp(db);
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ email: TEST_USERS[0].email, password: TEST_USERS[0].password });
    const sid = login.headers['set-cookie'][0].match(/devdoc_sid=([^;]+)/)![1];

    await agent.post('/api/auth/logout');
    // Replay the old cookie value directly (bypassing the agent's jar, which
    // already dropped it) to prove the server-side session row is gone.
    const res = await request(app).get('/api/auth/me').set('Cookie', `devdoc_sid=${sid}`);
    expect(res.status).toBe(401);
  });

  it('a made-up session id is rejected', async () => {
    const app = createApp(db);
    const res = await request(app).get('/api/auth/me').set('Cookie', 'devdoc_sid=not-a-real-session');
    expect(res.status).toBe(401);
  });
});
