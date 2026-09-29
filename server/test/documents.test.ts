import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import type { Db } from '../src/db.js';
import { createTestDb, TEST_USERS } from './helpers.js';

const admin = TEST_USERS[0]; // Manivannan, role admin
const author = TEST_USERS[1]; // Vaishnavi, release-manager
const other = TEST_USERS[2]; // Judia, firmware-lead

const doc = (id: string, overrides: Record<string, unknown> = {}) => ({
  metadata: {
    id, title: 'Firmware Report', docNumber: 'FW-1', author: author.name, date: '2026-09-28',
    version: '1.0', classification: 'INTERNAL ONLY', status: 'DRAFT', templateType: 'technical-analysis',
    ...overrides,
  },
  sections: [{ id: 's1', title: 'Purpose', level: 1, type: 'richText', content: 'x' }],
});

let db: Db;
let app: Express;
async function signedIn(user: typeof author) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: user.email, password: user.password });
  return agent;
}

beforeEach(async () => { db = await createTestDb(); app = createApp(db); });

describe('authentication is required', () => {
  it('every documents route is 401 without a session', async () => {
    expect((await request(app).get('/api/documents')).status).toBe(401);
    expect((await request(app).get('/api/documents/d1')).status).toBe(401);
    expect((await request(app).put('/api/documents/d1').send(doc('d1'))).status).toBe(401);
    expect((await request(app).delete('/api/documents/d1')).status).toBe(401);
  });
});

describe('PUT /api/documents/:id (create and update)', () => {
  it('creates a document, forcing the author to the signed-in user', async () => {
    const agent = await signedIn(author);
    const res = await agent.put('/api/documents/d1').send(doc('d1', { author: 'Someone Else' }));
    expect(res.status).toBe(200);
    expect(res.body.document.metadata.author).toBe(author.name);
  });

  it('lets the author update their own document', async () => {
    const agent = await signedIn(author);
    await agent.put('/api/documents/d1').send(doc('d1'));
    const res = await agent.put('/api/documents/d1').send(doc('d1', { title: 'Updated title' }));
    expect(res.status).toBe(200);
    expect(res.body.document.metadata.title).toBe('Updated title');
  });

  it('refuses to let someone else edit it, even by guessing the id', async () => {
    const asAuthor = await signedIn(author);
    await asAuthor.put('/api/documents/d1').send(doc('d1'));
    const asOther = await signedIn(other);
    const res = await asOther.put('/api/documents/d1').send(doc('d1', { title: 'Hijacked' }));
    expect(res.status).toBe(403);
  });

  it('lets an admin edit any document', async () => {
    const asAuthor = await signedIn(author);
    await asAuthor.put('/api/documents/d1').send(doc('d1'));
    const asAdmin = await signedIn(admin);
    const res = await asAdmin.put('/api/documents/d1').send(doc('d1', { title: 'Admin edit' }));
    expect(res.status).toBe(200);
    expect(res.body.document.metadata.title).toBe('Admin edit');
  });

  it('rejects a malformed body', async () => {
    const agent = await signedIn(author);
    expect((await agent.put('/api/documents/d1').send({ title: 'not a real document' })).status).toBe(400);
  });

  it('rejects an invalid status', async () => {
    const agent = await signedIn(author);
    expect((await agent.put('/api/documents/d1').send(doc('d1', { status: 'MADE_UP' }))).status).toBe(400);
  });
});

describe('GET /api/documents', () => {
  it('a non-admin only sees in-progress documents', async () => {
    const asAuthor = await signedIn(author);
    await asAuthor.put('/api/documents/a').send(doc('a', { status: 'DRAFT' }));
    await asAuthor.put('/api/documents/b').send(doc('b', { status: 'APPROVED' }));
    const res = await asAuthor.get('/api/documents');
    expect(res.body.documents.map((d: { metadata: { id: string } }) => d.metadata.id)).toEqual(['a']);
  });

  it('an admin sees every document', async () => {
    const asAuthor = await signedIn(author);
    await asAuthor.put('/api/documents/a').send(doc('a', { status: 'DRAFT' }));
    await asAuthor.put('/api/documents/b').send(doc('b', { status: 'APPROVED' }));
    const asAdmin = await signedIn(admin);
    const res = await asAdmin.get('/api/documents');
    expect(res.body.documents).toHaveLength(2);
  });

  it('a document that is not visible to you 404s on direct fetch too', async () => {
    const asAuthor = await signedIn(author);
    await asAuthor.put('/api/documents/a').send(doc('a', { status: 'APPROVED' }));
    const asOther = await signedIn(other);
    const res = await asOther.get('/api/documents/a');
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/documents/:id', () => {
  it('soft-deletes: the document disappears from the list but the row is not destroyed', async () => {
    const asAuthor = await signedIn(author);
    await asAuthor.put('/api/documents/a').send(doc('a'));
    const del = await asAuthor.delete('/api/documents/a');
    expect(del.status).toBe(204);
    expect((await asAuthor.get('/api/documents/a')).status).toBe(404);
    const { rows } = await db.query('SELECT deleted_at FROM documents WHERE id = $1', ['a']);
    expect(rows[0].deleted_at).not.toBeNull();
  });

  it('refuses to let a non-author delete it', async () => {
    const asAuthor = await signedIn(author);
    await asAuthor.put('/api/documents/a').send(doc('a'));
    const asOther = await signedIn(other);
    expect((await asOther.delete('/api/documents/a')).status).toBe(403);
  });

  it('404s for an id that was never created', async () => {
    const agent = await signedIn(author);
    expect((await agent.delete('/api/documents/does-not-exist')).status).toBe(404);
  });
});

describe('DELETE /api/documents/:id/purge', () => {
  it('actually removes the row, even one already soft-deleted', async () => {
    const asAuthor = await signedIn(author);
    await asAuthor.put('/api/documents/a').send(doc('a'));
    await asAuthor.delete('/api/documents/a'); // soft-delete first, matching the real Doc Bin flow
    const purge = await asAuthor.delete('/api/documents/a/purge');
    expect(purge.status).toBe(204);
    const { rows } = await db.query('SELECT * FROM documents WHERE id = $1', ['a']);
    expect(rows).toHaveLength(0);
  });

  it('works on a document that was never soft-deleted first', async () => {
    const asAuthor = await signedIn(author);
    await asAuthor.put('/api/documents/a').send(doc('a'));
    expect((await asAuthor.delete('/api/documents/a/purge')).status).toBe(204);
    const { rows } = await db.query('SELECT * FROM documents WHERE id = $1', ['a']);
    expect(rows).toHaveLength(0);
  });

  it('refuses to let a non-author purge it', async () => {
    const asAuthor = await signedIn(author);
    await asAuthor.put('/api/documents/a').send(doc('a'));
    const asOther = await signedIn(other);
    expect((await asOther.delete('/api/documents/a/purge')).status).toBe(403);
    const { rows } = await db.query('SELECT * FROM documents WHERE id = $1', ['a']);
    expect(rows).toHaveLength(1); // still there
  });

  it('lets an admin purge any document', async () => {
    const asAuthor = await signedIn(author);
    await asAuthor.put('/api/documents/a').send(doc('a'));
    const asAdmin = await signedIn(admin);
    expect((await asAdmin.delete('/api/documents/a/purge')).status).toBe(204);
  });

  it('404s for an id that was never created', async () => {
    const agent = await signedIn(author);
    expect((await agent.delete('/api/documents/does-not-exist/purge')).status).toBe(404);
  });
});
