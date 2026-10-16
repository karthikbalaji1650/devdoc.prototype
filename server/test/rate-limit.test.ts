import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createTestDb, TEST_USERS } from './helpers.js';

// The rate limiter (routes/auth.ts) is a module-level singleton so its
// counter actually persists across requests - which is the whole
// point, but it means two tests sharing the same loopback IP would
// also share a budget. vi.resetModules() + a fresh import gives each
// test its own limiter instance, same pattern used elsewhere in this
// codebase for other module-level state (documentsStoreService.test.ts).
async function freshApp() {
  vi.resetModules();
  const { createApp } = await import('../src/app.js');
  return createApp(await createTestDb());
}

describe('login rate limiting', () => {
  // Each test drives 9-11 real bcrypt (cost 12) verifications - already
  // close to the default 5s test timeout on its own, and tips over it
  // when the full suite runs several files' worth of bcrypt work
  // concurrently. A slower machine, not a slower test; give it room.
  it('blocks further attempts after repeated failures, but the limit itself does not misfire early', async () => {
    const app = await freshApp();
    const user = TEST_USERS[0];

    let last;
    for (let i = 0; i < 10; i++) {
      last = await request(app).post('/api/auth/login').send({ email: user.email, password: 'wrong' });
    }
    expect(last!.status).toBe(401); // the 10th failure is still just a normal rejection

    const blocked = await request(app).post('/api/auth/login').send({ email: user.email, password: user.password });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/too many/i);
  }, 15000);

  it('does not count a successful login against the limit', async () => {
    const app = await freshApp();
    const user = TEST_USERS[1];

    for (let i = 0; i < 9; i++) {
      await request(app).post('/api/auth/login').send({ email: user.email, password: 'wrong' });
    }
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password: user.password });
    expect(res.status).toBe(200); // the 10th attempt, correct this time, still gets through
  }, 15000);
});
