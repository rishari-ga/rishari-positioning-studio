// Buyer narrative update tests (update spec Section 18). Real Postgres, fictional data only.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { pool } from '../server/db/pool.js';
import { migrate } from '../server/db/migrate.js';
import { seedContent } from '../server/seed/seed.js';
import { createApp } from '../server/app.js';
import { ACK } from '../shared/content.js';
import { renderPrompt } from '../shared/narrative.js';
import { approvedSourceForGeneration } from '../server/services/narrative.js';

let app: Express;
const ADMIN = 'reviewer@fictional-rishari.test';
const CLIENT = 'founder@fictional-harbor.test';
let pid = '';
let audit = '';   // available service offer
let portal = '';  // planned offer

async function as(email: string) {
  const agent = request.agent(app);
  await agent.post('/api/dev/login').send({ email }).expect(200);
  return agent;
}
const put = (a: request.Agent, key: string, body: object, offerId?: string) =>
  a.put(`/api/projects/${pid}/answers/${key}${offerId ? `?offerId=${offerId}` : ''}`).send(body);
const latestContent = async () => (await pool.query("SELECT content FROM source_snapshots WHERE project_id=$1 ORDER BY version DESC LIMIT 1", [pid])).rows[0].content;
const entry = (content: { modules: { answers: { questionKey: string; offerId: string | null }[] }[] }, key: string, offerId: string | null) =>
  content.modules.flatMap((m) => m.answers).find((e) => e.questionKey === key && e.offerId === offerId) as Record<string, unknown>;
let idem = 0;
const submit = (a: request.Agent) => a.post(`/api/projects/${pid}/submit`).send({ confirmed: true, idempotencyKey: `narrative-${++idem}-key` }).expect(200);

describe('existing project data survives the migration', () => {
  it('keeps answers and their original question versions when 002 is applied', async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    // Recreate the database exactly as Pass 1 left it: only migration 001 plus Pass 1 style content.
    const sql001 = fs.readFileSync(path.join('server/db/migrations', '001_init.sql'), 'utf8');
    await pool.query(sql001);
    await pool.query("CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()); INSERT INTO schema_migrations(name) VALUES ('001_init.sql')");
    const u = (await pool.query("INSERT INTO users(email, is_admin) VALUES ('old-admin@fictional.test', true) RETURNING id")).rows[0].id;
    const p = (await pool.query("INSERT INTO projects(name, created_by, is_fictional) VALUES ('Old fictional project', $1, true) RETURNING id", [u])).rows[0].id;
    const m = (await pool.query("INSERT INTO question_modules(key, position, title, why) VALUES ('alternatives', 7, 'Alternatives', 'Old why') RETURNING id")).rows[0].id;
    const q = (await pool.query("INSERT INTO questions(module_id, key, position) VALUES ($1, 'm7_instead', 1) RETURNING id", [m])).rows[0].id;
    await pool.query("INSERT INTO question_versions(question_id, version, kind, input_type, prompt) VALUES ($1, 1, 'core', 'long_text', 'What would customers do if your company were unavailable?')", [q]);
    await pool.query("INSERT INTO answers(project_id, question_id, question_version, value, status, updated_by) VALUES ($1,$2,1,$3,'answered',$4)", [p, q, JSON.stringify('Keep using spreadsheets.'), u]);

    await migrate();
    await seedContent();

    const a = (await pool.query('SELECT value, question_version, offer_id FROM answers WHERE project_id=$1', [p])).rows;
    expect(a).toHaveLength(1);
    expect(a[0].value).toBe('Keep using spreadsheets.');
    expect(a[0].question_version).toBe(1);
    expect(a[0].offer_id).toBeNull();
    const versions = (await pool.query("SELECT version, prompt FROM question_versions qv JOIN questions q ON q.id=qv.question_id WHERE q.key='m7_instead' ORDER BY version")).rows;
    expect(versions.map((v) => v.version)).toEqual([1, 2]);
    expect(versions[0].prompt).toBe('What would customers do if your company were unavailable?');
    expect(versions[1].prompt).toContain('broader need');
    expect((await pool.query("SELECT current_version FROM questions WHERE key='m7_instead'")).rows[0].current_version).toBe(2);
    // Re-running the seed changes nothing further.
    await seedContent();
    expect((await pool.query("SELECT count(*)::int AS n FROM question_versions qv JOIN questions q ON q.id=qv.question_id WHERE q.key='m7_instead'")).rows[0].n).toBe(2);
  });
});

beforeAll(async () => {
  app = createApp();
});

describe('buyer narrative', () => {
  beforeAll(async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migrate();
    await seedContent();
    await pool.query('INSERT INTO users(email, is_admin) VALUES ($1, true)', [ADMIN]);
    const admin = await as(ADMIN);
    pid = (await admin.post('/api/admin/projects').send({ name: 'Harbor fictional', isFictional: true }).expect(200)).body.id;
    const tok = (await admin.post(`/api/admin/projects/${pid}/invitations`).send({ email: CLIENT }).expect(200)).body.token;
    const c = await as(CLIENT);
    await c.post('/api/invitations/accept').send({ token: tok }).expect(200);
    await c.post(`/api/projects/${pid}/acknowledgment`).send({ version: ACK.version }).expect(200);
    await c.post(`/api/projects/${pid}/offers`).send({ name: 'Records Audit', availability: 'available', priority: 1 }).expect(200);
    await c.post(`/api/projects/${pid}/offers`).send({ name: 'Client Portal', availability: 'planned', priority: 2 }).expect(200);
    const offers = (await pool.query('SELECT id, name FROM offers WHERE project_id=$1', [pid])).rows;
    audit = offers.find((o) => o.name === 'Records Audit').id;
    portal = offers.find((o) => o.name === 'Client Portal').id;
  });

  it('asks narrative questions only for the top-priority offer until scope is set', async () => {
    const c = await as(CLIENT);
    const d = (await c.get(`/api/projects/${pid}/discovery`).expect(200)).body;
    expect(d.focusOffers.map((o: { name: string }) => o.name)).toEqual(['Records Audit']);
    await put(c, 'n_alt_offer', { value: 'x', status: 'answered' }, portal).expect(404);
    const admin = await as(ADMIN);
    await admin.put(`/api/admin/projects/${pid}/offers/${audit}/scope`).send({ inScope: true }).expect(200);
    await admin.put(`/api/admin/projects/${pid}/offers/${portal}/scope`).send({ inScope: true }).expect(200);
    const d2 = (await c.get(`/api/projects/${pid}/discovery`).expect(200)).body;
    expect(d2.focusOffers.map((o: { name: string }) => o.name).sort()).toEqual(['Client Portal', 'Records Audit']);
  });

  it('uses the real offer name in alternatives questions and never says "product"', async () => {
    const c = await as(CLIENT);
    const d = (await c.get(`/api/projects/${pid}/discovery`).expect(200)).body;
    const qs = d.modules.flatMap((m: { questions: unknown[] }) => m.questions);
    const alt = qs.find((q: { key: string }) => q.key === 'n_alt_offer');
    const auditOffer = d.focusOffers.find((o: { id: string }) => o.id === audit);
    expect(renderPrompt(alt, auditOffer)).toBe('If a customer did not choose Records Audit, what would they use or do instead to solve this particular problem?');
    const company = qs.find((q: { key: string }) => q.key === 'm7_instead');
    expect(company.prompt).toBe('If customers did not work with your company, how would they address the broader need you help with?');
    for (const q of qs as { prompt: string; planned_prompt: string | null }[]) {
      expect(`${q.prompt} ${q.planned_prompt ?? ''}`.toLowerCase()).not.toMatch(/\bproduct\b/);
    }
  });

  it('gives a planned offer planned-tense wording', async () => {
    const c = await as(CLIENT);
    const d = (await c.get(`/api/projects/${pid}/discovery`).expect(200)).body;
    const qs = d.modules.flatMap((m: { questions: unknown[] }) => m.questions);
    const portalOffer = d.focusOffers.find((o: { id: string }) => o.id === portal);
    expect(renderPrompt(qs.find((q: { key: string }) => q.key === 'n_alt_offer'), portalOffer)).toBe('How are intended customers handling this problem today, before Client Portal is available?');
    expect(renderPrompt(qs.find((q: { key: string }) => q.key === 'n_result_first'), portalOffer)).toContain('Once Client Portal is available');
    expect(renderPrompt(qs.find((q: { key: string }) => q.key === 'n_action_ready'), portalOffer)).toContain('When Client Portal is available');
  });

  it('keeps offer and company answers in their own scope', async () => {
    const c = await as(CLIENT);
    await put(c, 'n_alt_offer', { value: 'Hire a bookkeeper.', status: 'answered' }).expect(400);         // offer required
    await put(c, 'm1_what', { value: 'x', status: 'answered' }, audit).expect(400);                        // company question
    await put(c, 'n_alt_offer', { value: 'Hire a bookkeeper.', status: 'answered' }, audit).expect(200);
    await put(c, 'n_alt_offer', { value: 'Keep a paper binder.', status: 'answered' }, portal).expect(200);
    const rows = (await pool.query("SELECT a.offer_id, a.value FROM answers a JOIN questions q ON q.id=a.question_id WHERE q.key='n_alt_offer' AND a.project_id=$1", [pid])).rows;
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.offer_id === audit).value).toBe('Hire a bookkeeper.');
  });

  it('reuses an existing answer only when the client confirms it', async () => {
    const c = await as(CLIENT);
    await put(c, 'm4_better', { value: 'Close the month without late nights.', status: 'answered' }).expect(200);
    const admin = await as(ADMIN);
    const before = (await admin.get(`/api/admin/projects/${pid}/narrative`).expect(200)).body.coverage;
    const goal = before.find((s: { key: string }) => s.key === 'character').scopes.find((x: { offer: { id: string } }) => x.offer?.id === audit)
      .fields.find((f: { key: string }) => f.key === 'character.desired_outcome');
    expect(goal.status).toBe('needs_clarification');
    expect(goal.reason).toMatch(/earlier answer/i);
    expect((await pool.query("SELECT count(*)::int AS n FROM answers a JOIN questions q ON q.id=a.question_id WHERE q.key='n_char_goal'")).rows[0].n).toBe(0);

    await put(c, 'n_char_goal', { value: 'Close the month without late nights.', status: 'answered', reusedFromKey: 'm6_now' }, audit).expect(400);
    await put(c, 'n_char_goal', { value: 'Close the month without late nights.', status: 'answered', reusedFromKey: 'm4_better', evidenceStatus: 'customer_reported' }, audit).expect(200);
    const row = (await pool.query("SELECT value, reused_from_key, evidence_status FROM answers a JOIN questions q ON q.id=a.question_id WHERE q.key='n_char_goal'")).rows[0];
    expect(row).toEqual({ value: 'Close the month without late nights.', reused_from_key: 'm4_better', evidence_status: 'customer_reported' });
  });

  it('keeps unknown emotions unknown', async () => {
    const c = await as(CLIENT);
    await put(c, 'n_prob_internal', { value: null, status: 'not_sure' }, audit).expect(200);
    await put(c, 'n_prob_philosophical', { value: null, status: 'not_applicable' }, audit).expect(200);
    await put(c, 'n_char_buyer', { value: null, status: 'not_applicable' }, audit).expect(400); // not allowed on this question
    const admin = await as(ADMIN);
    const cov = (await admin.get(`/api/admin/projects/${pid}/narrative`)).body.coverage;
    const fields = cov.find((s: { key: string }) => s.key === 'problem').scopes.find((x: { offer: { id: string } }) => x.offer?.id === audit).fields;
    expect(fields.find((f: { key: string }) => f.key === 'problem.internal')).toMatchObject({ status: 'needs_clarification', value: null });
    expect(fields.find((f: { key: string }) => f.key === 'problem.philosophical').status).toBe('not_applicable');
  });

  it('does not mistake a technical mechanism for the customer plan', async () => {
    const c = await as(CLIENT);
    await put(c, 'n_plan_how', { value: 'Documents sync nightly through an API.', status: 'answered' }, audit).expect(200);
    const admin = await as(ADMIN);
    const plan = (await admin.get(`/api/admin/projects/${pid}/narrative`)).body.coverage.find((s: { key: string }) => s.key === 'plan')
      .scopes.find((x: { offer: { id: string } }) => x.offer?.id === audit).fields;
    expect(plan.find((f: { key: string }) => f.key === 'plan.path').status).toBe('not_asked');
    expect(plan.find((f: { key: string }) => f.key === 'plan.mechanism').status).toBe('captured');
    await admin.post(`/api/admin/projects/${pid}/checks`).expect(200);
    const flags = (await admin.get(`/api/admin/projects/${pid}/flags`)).body;
    expect(flags.some((f: { check_key: string; offer_id: string }) => f.check_key === 'plan_is_technology' && f.offer_id === audit)).toBe(true);
  });

  it('keeps stakeholder outcomes distinct', async () => {
    const c = await as(CLIENT);
    await c.post(`/api/projects/${pid}/stakeholders`).send({ offerId: audit, label: 'Practice manager', roles: ['primary_buyer', 'user'], desiredOutcome: 'Fewer late invoices', evidenceStatus: 'observed' }).expect(200);
    await c.post(`/api/projects/${pid}/stakeholders`).send({ offerId: audit, label: 'Managing partner', roles: ['approver'], desiredOutcome: 'Lower audit risk', wantsToPrevent: 'A missed filing' }).expect(200);
    await c.post(`/api/projects/${pid}/stakeholders`).send({ offerId: audit, label: 'Someone', roles: ['ceo'] }).expect(400);
    await c.post(`/api/projects/${pid}/stakeholders`).send({ offerId: audit, label: 'Hacker', roles: [], projectId: 'x' }).expect(400);
    const rows = (await pool.query('SELECT label, roles, desired_outcome FROM stakeholders WHERE project_id=$1 ORDER BY sort_order', [pid])).rows;
    expect(rows.map((r) => r.desired_outcome)).toEqual(['Fewer late invoices', 'Lower audit risk']);
    expect(rows[0].roles).toEqual(['primary_buyer', 'user']);
  });

  it('flags an unsupported failure claim with every required part', async () => {
    const c = await as(CLIENT);
    await put(c, 'n_fail_continue', { value: 'Firms will lose every client.', status: 'answered', evidenceStatus: 'founder_belief' }, audit).expect(200);
    const admin = await as(ADMIN);
    await admin.post(`/api/admin/projects/${pid}/checks`).expect(200);
    const f = (await admin.get(`/api/admin/projects/${pid}/flags`)).body.find((x: { check_key: string; offer_id: string }) => x.check_key === 'unsupported_failure' && x.offer_id === audit);
    expect(f).toBeTruthy();
    expect(f.source_refs.some((r: { questionKey: string }) => r.questionKey === 'n_fail_continue')).toBe(true);
    for (const k of ['noticed', 'suggested_action', 'example', 'why', 'client_question']) expect(f[k]).toBeTruthy();
    expect(f.decision).toBeNull();
    // Running the checks again does not duplicate an open flag.
    const r = (await admin.post(`/api/admin/projects/${pid}/checks`).expect(200)).body;
    expect((await admin.get(`/api/admin/projects/${pid}/flags`)).body.filter((x: { check_key: string; offer_id: string }) => x.check_key === 'unsupported_failure' && x.offer_id === audit)).toHaveLength(1);
    expect(r.created).toBe(0);
    // A disposition that requests clarification reaches the client's discovery.
    await admin.patch(`/api/admin/projects/${pid}/flags/${f.id}`).send({ decision: 'clarification_requested' }).expect(200);
    const d = (await c.get(`/api/projects/${pid}/discovery`)).body;
    expect(d.clarifications.some((x: { question_key: string }) => x.question_key === 'n_fail_continue')).toBe(true);
    await put(c, 'n_fail_support', { value: 'Two clients told us they switched firms over late statements.', status: 'answered' }, audit).expect(200);
  });

  it('captures success and failure explicitly in the submitted snapshot', async () => {
    const c = await as(CLIENT);
    await put(c, 'n_success_business', { value: 'Month-end closes on time.', status: 'answered', evidenceStatus: 'founder_belief' }, audit).expect(200);
    await put(c, 'n_success_person', { value: 'The manager stops working weekends.', status: 'answered' }, audit).expect(200);
    await submit(c);
    const content = await latestContent();
    expect(entry(content, 'n_success_business', audit)).toMatchObject({ narrativeField: 'success.organization', value: 'Month-end closes on time.', evidenceStatus: 'founder_belief' });
    expect(entry(content, 'n_success_person', audit)).toMatchObject({ narrativeField: 'success.personal' });
    expect(entry(content, 'n_fail_continue', audit)).toMatchObject({ narrativeField: 'failure.continues', value: 'Firms will lose every client.' });
    expect(entry(content, 'n_prob_internal', audit)).toMatchObject({ status: 'not_sure', value: null });
    expect(content.stakeholders).toHaveLength(2);
  });

  it('approves only the exact latest version, with every assumption accepted, and goes stale on resubmission', async () => {
    const admin = await as(ADMIN);
    const sa = (await admin.get(`/api/admin/projects/${pid}/source-approval`).expect(200)).body;
    expect(sa.basis.assumptions.length).toBeGreaterThan(0);
    const ids = sa.basis.assumptions.map((a: { id: string }) => a.id);
    await admin.post(`/api/admin/projects/${pid}/source-approval`).send({ snapshotVersion: sa.basis.snapshot.version, acceptedAssumptions: ids.slice(1) }).expect(400);
    await admin.post(`/api/admin/projects/${pid}/source-approval`).send({ snapshotVersion: sa.basis.snapshot.version + 1, acceptedAssumptions: ids }).expect(409);
    await admin.post(`/api/admin/projects/${pid}/source-approval`).send({ snapshotVersion: sa.basis.snapshot.version, acceptedAssumptions: ids }).expect(200);
    const src = await approvedSourceForGeneration(pid);
    expect(src.version).toBe(sa.basis.snapshot.version);
    expect(src.id).toBe(sa.basis.snapshot.id);

    const c = await as(CLIENT);
    await put(c, 'n_success_signal', { value: 'Fewer reminder emails.', status: 'answered' }, audit).expect(200);
    await submit(c);
    expect(await approvedSourceForGeneration(pid)).toBeNull();
    const old = (await pool.query("SELECT stale FROM approvals WHERE project_id=$1 AND approval_type='admin_source'", [pid])).rows;
    expect(old.every((a) => a.stale)).toBe(true);
  });

  it('keeps narrative tools away from clients', async () => {
    const c = await as(CLIENT);
    await c.get(`/api/admin/projects/${pid}/narrative`).expect(403);
    await c.post(`/api/admin/projects/${pid}/checks`).expect(403);
    await c.get(`/api/admin/projects/${pid}/source-approval`).expect(403);
    await c.put(`/api/admin/projects/${pid}/coverage`).send({ fieldKey: 'plan.path', status: 'captured' }).expect(403);
    await c.get('/api/admin/guidance').expect(403);
    const other = await as('stranger@fictional.test');
    await other.post(`/api/projects/${pid}/stakeholders`).send({ label: 'x', roles: [] }).expect(404);
  });

  it('seeds all eighteen guidance entries without em dashes and refuses em dashes in edits', async () => {
    const admin = await as(ADMIN);
    const g = (await admin.get('/api/admin/guidance').expect(200)).body;
    expect(g).toHaveLength(18);
    expect(JSON.stringify(g)).not.toMatch(/[\u2013\u2014]/);
    const one = g.find((x: { key: string }) => x.key === 'success_only_functionality');
    expect(one.example).toContain("'Automated reminders' describes a capability.");
    await admin.put('/api/admin/guidance/success_only_functionality').send({ issue: 'A \u2014 B', action: 'a', example: 'b', why: 'c', clientQuestion: 'd' }).expect(400);
    const qs = (await pool.query('SELECT prompt, planned_prompt, help_text FROM question_versions')).rows;
    expect(JSON.stringify(qs)).not.toMatch(/[\u2013\u2014]/);
  });
});

afterAll(async () => { await pool.end(); });
