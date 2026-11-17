// Pass 1 acceptance tests (SPEC.md Section 20: tests 1, 2, 3, 4, 5, 7, 8) plus authorization checks.
// Runs against a real Postgres database using fictional data only.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { pool } from '../server/db/pool.js';
import { migrate } from '../server/db/migrate.js';
import { seedContent } from '../server/seed/seed.js';
import { createApp } from '../server/app.js';
import { ACK } from '../shared/content.js';

let app: Express;
const ADMIN = 'reviewer@fictional-rishari.test';
const CLIENT_A = 'founder-a@fictional-client.test';
const CLIENT_B = 'founder-b@fictional-client.test';
let projectA = '';
let projectB = '';

async function as(email: string) {
  const agent = request.agent(app);
  await agent.post('/api/dev/login').send({ email }).expect(200);
  return agent;
}

async function invite(admin: request.Agent, projectId: string, email: string) {
  const r = await admin.post(`/api/admin/projects/${projectId}/invitations`).send({ email }).expect(200);
  return r.body.token as string;
}

beforeAll(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate();
  await seedContent();
  // Admin provisioned server-side, the same way grant-admin.ts does it.
  await pool.query('INSERT INTO users(email, is_admin) VALUES ($1, true)', [ADMIN]);
  app = createApp();

  const admin = await as(ADMIN);
  projectA = (await admin.post('/api/admin/projects').send({ name: 'Fictional A', companyName: 'Northwind Fictional Co', isFictional: true }).expect(200)).body.id;
  projectB = (await admin.post('/api/admin/projects').send({ name: 'Fictional B', companyName: 'Contoso Fictional Ltd', isFictional: true }).expect(200)).body.id;
  const tokA = await invite(admin, projectA, CLIENT_A);
  const tokB = await invite(admin, projectB, CLIENT_B);
  await (await as(CLIENT_A)).post('/api/invitations/accept').send({ token: tokA }).expect(200);
  await (await as(CLIENT_B)).post('/api/invitations/accept').send({ token: tokB }).expect(200);
});

afterAll(async () => { await pool.end(); });

describe('accounts and access', () => {
  it('signing in does not make the first new user an admin or grant project access', async () => {
    const stranger = await as('first-stranger@fictional.test');
    const me = await stranger.get('/api/me').expect(200);
    expect(me.body.user.isAdmin).toBe(false);
    expect(me.body.projects).toEqual([]);
    await stranger.get(`/api/projects/${projectA}/discovery`).expect(404);
    await stranger.get('/api/admin/projects').expect(403);
  });

  it('an invitation only works for the invited email', async () => {
    const admin = await as(ADMIN);
    const p = (await admin.post('/api/admin/projects').send({ name: 'Fictional C', isFictional: true })).body.id;
    const tok = await invite(admin, p, 'invited@fictional.test');
    const wrong = await as('someone-else@fictional.test');
    await wrong.post('/api/invitations/accept').send({ token: tok }).expect(403);
    const right = await as('invited@fictional.test');
    await right.post('/api/invitations/accept').send({ token: tok }).expect(200);
    await right.get(`/api/projects/${p}/discovery`).expect(200);
  });

  it('clients cannot create projects', async () => {
    const a = await as(CLIENT_A);
    await a.post('/api/admin/projects').send({ name: 'Nope' }).expect(403);
  });
});

describe('Test 1: welcome and acknowledgment', () => {
  it('blocks answers until acknowledged, then records version, user, project, and time', async () => {
    const a = await as(CLIENT_A);
    const before = await a.get(`/api/projects/${projectA}/discovery`).expect(200);
    expect(before.body.acknowledged).toBe(false);
    await a.put(`/api/projects/${projectA}/answers/m1_what`).send({ value: 'x', status: 'answered' }).expect(409);
    await a.post(`/api/projects/${projectA}/acknowledgment`).send({ version: 'old-version' }).expect(409);
    await a.post(`/api/projects/${projectA}/acknowledgment`).send({ version: ACK.version }).expect(200);
    const row = (await pool.query('SELECT * FROM acknowledgments WHERE project_id=$1', [projectA])).rows[0];
    expect(row.ack_version).toBe(ACK.version);
    expect(row.text_shown).toBe(ACK.text);
    expect(row.created_at).toBeTruthy();
    expect((await a.get(`/api/projects/${projectA}/discovery`)).body.acknowledged).toBe(true);
  });
});

describe('Test 3: prelaunch and serving early customers together', () => {
  it('accepts both stages at once', async () => {
    const a = await as(CLIENT_A);
    await a.put(`/api/projects/${projectA}/answers/m1_stage`).send({ value: ['Prelaunch', 'Serving early customers'], status: 'answered' }).expect(200);
    await a.put(`/api/projects/${projectA}/answers/m1_stage`).send({ value: ['Not a real option'], status: 'answered' }).expect(400);
  });
});

describe('Test 4: multiple offers do not expand scope', () => {
  it('offers start out of scope and clients cannot set scope', async () => {
    const a = await as(CLIENT_A);
    await a.post(`/api/projects/${projectA}/offers`).send({ name: 'Fictional Audit', availability: 'available', priority: 1 }).expect(200);
    await a.post(`/api/projects/${projectA}/offers`).send({ name: 'Fictional Platform', availability: 'planned' }).expect(200);
    await a.post(`/api/projects/${projectA}/offers`).send({ name: 'Sneaky', inScope: true }).expect(400);
    const offers = (await pool.query('SELECT in_scope FROM offers WHERE project_id=$1 AND deleted_at IS NULL', [projectA])).rows;
    expect(offers).toHaveLength(2);
    expect(offers.every((o) => o.in_scope === false)).toBe(true);
    const oid = (await pool.query('SELECT id FROM offers WHERE project_id=$1 LIMIT 1', [projectA])).rows[0].id;
    await a.put(`/api/admin/projects/${projectA}/offers/${oid}/scope`).send({ inScope: true }).expect(403);
    const admin = await as(ADMIN);
    await admin.put(`/api/admin/projects/${projectA}/offers/${oid}/scope`).send({ inScope: true }).expect(200);
  });
});

describe('Test 5: progress survives logout', () => {
  it('keeps answers exactly as written across sessions', async () => {
    const words = "We help small fictional clinics stop losing paperwork.\nIt's messy today.";
    const a = await as(CLIENT_A);
    const r1 = await a.put(`/api/projects/${projectA}/answers/m1_what`).send({ value: words, status: 'answered' }).expect(200);
    await a.post('/api/dev/logout').expect(200);
    await a.get(`/api/projects/${projectA}/discovery`).expect(401);
    const again = await as(CLIENT_A);
    const d = (await again.get(`/api/projects/${projectA}/discovery`).expect(200)).body;
    const q = d.modules.flatMap((m: { questions: { id: string; key: string }[] }) => m.questions).find((x: { key: string }) => x.key === 'm1_what');
    const ans = d.answers.find((x: { question_id: string }) => x.question_id === q.id);
    expect(ans.value).toBe(words);
    expect(ans.revision).toBe(r1.body.revision);
  });

  it('rejects a stale save instead of overwriting newer work', async () => {
    const a = await as(CLIENT_A);
    const r = await a.put(`/api/projects/${projectA}/answers/m2_belief`).send({ value: 'first', status: 'answered' }).expect(200);
    await a.put(`/api/projects/${projectA}/answers/m2_belief`).send({ value: 'second', status: 'answered', baseRevision: r.body.revision }).expect(200);
    await a.put(`/api/projects/${projectA}/answers/m2_belief`).send({ value: 'stale', status: 'answered', baseRevision: r.body.revision }).expect(409);
    const revs = (await pool.query("SELECT count(*)::int AS n FROM answer_revisions r JOIN answers a ON a.id=r.answer_id JOIN questions q ON q.id=a.question_id WHERE q.key='m2_belief'")).rows[0].n;
    expect(revs).toBe(2);
  });
});

describe('Test 2: an early-stage client without proof points can finish', () => {
  it('submits with uncertainty, no offers, no uploads, and no proof', async () => {
    const b = await as(CLIENT_B);
    await b.post(`/api/projects/${projectB}/acknowledgment`).send({ version: ACK.version }).expect(200);
    await b.put(`/api/projects/${projectB}/answers/m1_what`).send({ value: 'Fictional prelaunch idea.', status: 'answered' }).expect(200);
    await b.put(`/api/projects/${projectB}/answers/m9_learned`).send({ value: null, status: 'not_sure' }).expect(200);
    await b.put(`/api/projects/${projectB}/answers/m5_first`).send({ value: null, status: 'discuss' }).expect(200);
    await b.put(`/api/projects/${projectB}/modules/fit/progress`).send({ markedForDiscussion: true }).expect(200);
    await b.post(`/api/projects/${projectB}/submit`).send({ confirmed: false, idempotencyKey: 'abcdefgh-1' }).expect(400);
    const s1 = await b.post(`/api/projects/${projectB}/submit`).send({ confirmed: true, idempotencyKey: 'abcdefgh-1' }).expect(200);
    const retry = await b.post(`/api/projects/${projectB}/submit`).send({ confirmed: true, idempotencyKey: 'abcdefgh-1' }).expect(200);
    expect(retry.body.id).toBe(s1.body.id);
    const snaps = (await pool.query('SELECT * FROM source_snapshots WHERE project_id=$1', [projectB])).rows;
    expect(snaps).toHaveLength(1);
    expect(snaps[0].content.modules.find((m: { key: string }) => m.key === 'fit').markedForDiscussion).toBe(true);
    const approval = (await pool.query("SELECT * FROM approvals WHERE project_id=$1 AND approval_type='client_intake_confirmation'", [projectB])).rows[0];
    expect(approval.target_id).toBe(snaps[0].id);
    expect(approval.target_version).toBe('1');
  });

  it('snapshots cannot be changed after submission', async () => {
    await expect(pool.query("UPDATE source_snapshots SET content='{}' WHERE project_id=$1", [projectB])).rejects.toThrow(/immutable/);
  });
});

describe('Test 7: client A cannot access client B records or files', () => {
  it('blocks reads, writes, uploads, and downloads across projects', async () => {
    const a = await as(CLIENT_A);
    const b = await as(CLIENT_B);
    await a.get(`/api/projects/${projectB}/discovery`).expect(404);
    await a.put(`/api/projects/${projectB}/answers/m1_what`).send({ value: 'x', status: 'answered' }).expect(404);
    await a.post(`/api/projects/${projectB}/offers`).send({ name: 'x' }).expect(404);
    await a.post(`/api/projects/${projectB}/attachments`).attach('file', Buffer.from('hello'), 'note.txt').expect(404);

    const up = await b.post(`/api/projects/${projectB}/attachments`).field('moduleKey', 'business').attach('file', Buffer.from('Fictional notes for testing.'), 'notes.txt').expect(200);
    await a.get(`/api/projects/${projectB}/attachments/${up.body.id}/link`).expect(404);
    await a.get(`/api/projects/${projectA}/attachments/${up.body.id}/link`).expect(404);
    const link = (await b.get(`/api/projects/${projectB}/attachments/${up.body.id}/link`).expect(200)).body.url;
    await a.get(link).expect(404); // a link issued to B is useless to A
    const dl = await b.get(link).expect(200);
    expect(dl.text).toBe('Fictional notes for testing.');
    await a.delete(`/api/projects/${projectB}/attachments/${up.body.id}`).expect(404);
  });

  it('rejects unsupported and disguised files', async () => {
    const b = await as(CLIENT_B);
    await b.post(`/api/projects/${projectB}/attachments`).attach('file', Buffer.from('MZ fake exe'), 'tool.exe').expect(415);
    await b.post(`/api/projects/${projectB}/attachments`).attach('file', Buffer.from('not really a pdf'), 'fake.pdf').expect(415);
  });

  it('rejects malformed and probing project IDs', async () => {
    const a = await as(CLIENT_A);
    await a.get('/api/projects/not-a-uuid/discovery').expect(404);
    await a.get('/api/projects/00000000-0000-0000-0000-000000000000/discovery').expect(404);
  });
});

describe('Test 8: clients cannot access private notes', () => {
  it('keeps notes, activity, and admin views away from clients', async () => {
    const admin = await as(ADMIN);
    await admin.post(`/api/admin/projects/${projectA}/notes`).send({ topicType: 'project', noteType: 'assumption', body: 'Fictional private reviewer note.' }).expect(200);
    const a = await as(CLIENT_A);
    await a.get(`/api/admin/projects/${projectA}/notes`).expect(403);
    await a.get(`/api/admin/projects/${projectA}/activity`).expect(403);
    await a.get(`/api/admin/projects/${projectA}/answers`).expect(403);
    const d = await a.get(`/api/projects/${projectA}/discovery`).expect(200);
    expect(JSON.stringify(d.body)).not.toContain('Fictional private reviewer note.');
    expect(d.body.offers[0]).not.toHaveProperty('in_scope');
  });

  it('admins cannot answer on behalf of a client', async () => {
    const admin = await as(ADMIN);
    await admin.put(`/api/projects/${projectA}/answers/m1_what`).send({ value: 'x', status: 'answered' }).expect(403);
  });
});

describe('data-use page', () => {
  it('cannot be marked reviewed while placeholders remain, and only admins can edit it', async () => {
    const admin = await as(ADMIN);
    const cur = (await admin.get('/api/admin/data-use').expect(200)).body.value;
    await admin.put('/api/admin/data-use').send({ ...cur, reviewed: true }).expect(400);
    const a = await as(CLIENT_A);
    await a.put('/api/admin/data-use').send({ ...cur, reviewed: false }).expect(403);
  });
});

describe('audit log hygiene', () => {
  it('never stores client answer text in audit events', async () => {
    const rows = (await pool.query('SELECT detail FROM audit_events')).rows;
    expect(JSON.stringify(rows)).not.toContain('paperwork');
  });
});

describe('Test 21 (partial): seeded application text contains no em dashes', () => {
  it('has no em dashes in questions, guidance, or fixed copy', async () => {
    const { MODULES, DATA_USE_DEFAULT } = await import('../server/seed/questions.js');
    const content = await import('../shared/content.js');
    const dbText = (await pool.query("SELECT string_agg(prompt || coalesce(help_text,''), ' ') AS t FROM question_versions")).rows[0].t;
    for (const t of [JSON.stringify(MODULES), JSON.stringify(DATA_USE_DEFAULT), JSON.stringify(content), dbText]) {
      expect(t.includes('\u2014')).toBe(false);
    }
  });
});
