// "Active now" tracking and permanent project deletion. Real Postgres, fictional data only.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { pool } from '../server/db/pool.js';
import { migrate } from '../server/db/migrate.js';
import { seedContent } from '../server/seed/seed.js';
import { createApp } from '../server/app.js';
import { ACK } from '../shared/content.js';
import { storage } from '../server/storage/adapter.js';

let app: Express;
const ADMIN = 'ops-admin@fictional-rishari.test';
const CLIENT = 'ops-client@fictional-harbor.test';
const OTHER = 'ops-other@fictional-bay.test';

async function as(email: string) {
  const a = request.agent(app);
  await a.post('/api/dev/login').send({ email }).expect(200);
  return a;
}
async function projectWithClient(admin: request.Agent, name: string, email: string) {
  const pid = (await admin.post('/api/admin/projects').send({ name, companyName: name, isFictional: true }).expect(200)).body.id as string;
  const tok = (await admin.post(`/api/admin/projects/${pid}/invitations`).send({ email }).expect(200)).body.token;
  const c = await as(email);
  await c.post('/api/invitations/accept').send({ token: tok }).expect(200);
  await c.post(`/api/projects/${pid}/acknowledgment`).send({ version: ACK.version }).expect(200);
  return { pid, c };
}

beforeAll(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate();
  await seedContent();
  await pool.query('INSERT INTO users(email, is_admin) VALUES ($1, true)', [ADMIN]);
  app = createApp();
});

describe('client activity', () => {
  it('records when a client works in a project, and shows it only to admins', async () => {
    const admin = await as(ADMIN);
    const { pid, c } = await projectWithClient(admin, 'Activity Fictional Co', CLIENT);
    let row = (await admin.get('/api/admin/projects').expect(200)).body.find((r: { id: string }) => r.id === pid);
    const before = row.last_active_at;
    await pool.query('UPDATE project_memberships SET last_active_at = NULL WHERE project_id=$1', [pid]);
    await c.put(`/api/projects/${pid}/answers/cc_goal`).send({ value: 'Grow without hiring.', status: 'answered' }).expect(200);
    await new Promise((r) => setTimeout(r, 50));
    row = (await admin.get('/api/admin/projects').expect(200)).body.find((r: { id: string }) => r.id === pid);
    expect(row.last_active_at).toBeTruthy();
    expect(Date.now() - new Date(row.last_active_at).getTime()).toBeLessThan(60_000);
    void before;
    await c.get('/api/admin/projects').expect(403);
  });

  it('does not count admin visits as client activity', async () => {
    const admin = await as(ADMIN);
    const { pid } = await projectWithClient(admin, 'Admin Visit Fictional Co', 'ops-visit@fictional.test');
    await pool.query('UPDATE project_memberships SET last_active_at = NULL WHERE project_id=$1', [pid]);
    await admin.get(`/api/projects/${pid}/discovery`).expect(200);
    await new Promise((r) => setTimeout(r, 50));
    const row = (await admin.get('/api/admin/projects').expect(200)).body.find((r: { id: string }) => r.id === pid);
    expect(row.last_active_at).toBeNull();
  });
});

describe('project deletion', () => {
  it('requires an admin and the exact project name', async () => {
    const admin = await as(ADMIN);
    const { pid, c } = await projectWithClient(admin, 'Guarded Fictional Co', 'ops-guard@fictional.test');
    await c.delete(`/api/admin/projects/${pid}`).send({ confirmName: 'Guarded Fictional Co' }).expect(403);
    await admin.delete(`/api/admin/projects/${pid}`).send({ confirmName: 'guarded fictional' }).expect(400);
    await admin.delete(`/api/admin/projects/${pid}`).send({}).expect(400);
    expect((await pool.query('SELECT 1 FROM projects WHERE id=$1', [pid])).rowCount).toBe(1);
  });

  it('removes every record and uploaded file, anonymizes the client, and leaves other projects alone', async () => {
    const admin = await as(ADMIN);
    const { pid, c } = await projectWithClient(admin, 'Doomed Fictional Co', 'ops-doomed@fictional.test');
    const keep = await projectWithClient(admin, 'Keeper Fictional Co', OTHER);
    await c.put(`/api/projects/${pid}/answers/cc_goal`).send({ value: 'Delete me.', status: 'answered' }).expect(200);
    await keep.c.put(`/api/projects/${keep.pid}/answers/cc_goal`).send({ value: 'Keep me.', status: 'answered' }).expect(200);
    const persona = (await c.post(`/api/projects/${pid}/personas`).send({ roleTitle: 'Operations manager', purchaseRoles: ['uses'] }).expect(200)).body.id;
    await c.put(`/api/projects/${pid}/answers/p_work?personaId=${persona}`).send({ value: 'x', status: 'answered' }).expect(200);
    const up = (await c.post(`/api/projects/${pid}/attachments`).attach('file', Buffer.from('fictional notes'), 'notes.txt').expect(200)).body;
    const key = (await pool.query('SELECT storage_key FROM attachments WHERE id=$1', [up.id])).rows[0].storage_key;
    expect((await storage.get(key)).length).toBeGreaterThan(0);
    await c.post(`/api/projects/${pid}/submit`).send({ confirmed: true, idempotencyKey: 'ops-doomed-submit-1' }).expect(200);
    await admin.post(`/api/admin/projects/${pid}/notes`).send({ topicType: 'project', topicId: null, noteType: 'assumption', body: 'Internal note' }).expect(200);

    const r = (await admin.delete(`/api/admin/projects/${pid}`).send({ confirmName: 'Doomed Fictional Co' }).expect(200)).body;
    expect(r).toMatchObject({ deleted: true, files: 1, fileErrors: 0, anonymizedUsers: 1 });

    for (const t of ['projects', 'answers', 'personas', 'attachments', 'source_snapshots', 'review_notes', 'project_memberships', 'invitations']) {
      const col = t === 'projects' ? 'id' : 'project_id';
      expect((await pool.query(`SELECT count(*)::int AS n FROM ${t} WHERE ${col}=$1`, [pid])).rows[0].n, t).toBe(0);
    }
    await expect(storage.get(key)).rejects.toBeTruthy();
    expect((await pool.query("SELECT count(*)::int AS n FROM users WHERE email='ops-doomed@fictional.test'")).rows[0].n).toBe(0);
    const ev = (await pool.query("SELECT detail FROM audit_events WHERE action='project.deleted'")).rows.at(-1).detail;
    expect(JSON.stringify(ev)).not.toContain('Delete me');
    // The other client's project is untouched, and the deleted client can no longer see anything.
    await keep.c.get(`/api/projects/${keep.pid}/discovery`).expect(200);
    expect((await pool.query("SELECT count(*)::int AS n FROM answers WHERE project_id=$1", [keep.pid])).rows[0].n).toBe(1);
    await c.get(`/api/projects/${pid}/discovery`).expect(404);
  });
});

afterAll(async () => { await pool.end(); });
