// Persona and connected-plan update (persona spec Section 12), plus the buyer narrative tests that still apply.
// Real Postgres, fictional data only.
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
import { renderPrompt, TERMS } from '../shared/narrative.js';
import { MODULES } from '../server/seed/questions.js';
import { approvedSourceForGeneration } from '../server/services/narrative.js';

let app: Express;
const ADMIN = 'reviewer@fictional-rishari.test';
const CLIENT = 'founder@fictional-harbor.test';
let pid = '';
let audit = '';     // available service
let portal = '';    // planned product
let ops = '';       // persona: Operations manager
let finance = '';   // persona: Finance director
let clerk = '';     // persona with no direct fit

async function as(email: string) {
  const agent = request.agent(app);
  await agent.post('/api/dev/login').send({ email }).expect(200);
  return agent;
}
const put = (a: request.Agent, key: string, body: object, scope: { offerId?: string; personaId?: string } = {}) => {
  const q = new URLSearchParams(Object.entries(scope).filter(([, v]) => v) as [string, string][]).toString();
  return a.put(`/api/projects/${pid}/answers/${key}${q ? `?${q}` : ''}`).send(body);
};
let idem = 0;
const submit = (a: request.Agent) => a.post(`/api/projects/${pid}/submit`).send({ confirmed: true, idempotencyKey: `persona-${++idem}-key` }).expect(200);
type Summary = { scope: string; personaId: string | null; title: string; goal: string | null; problem: string | null; links: { offerName: string | null; fit: string; fitLabel: string; capability: string | null; howItHelps: string | null; benefit: string | null; planned: boolean }[];
  plan: { label: string; value: string | null }[]; success: { label: string; value: string | null; evidence: string | null }[]; consequences: { label: string; value: string | null }[]; missing: string[]; uncertain: string[] };
const connections = async (a: request.Agent): Promise<Summary[]> => (await a.get(`/api/projects/${pid}/connections`).expect(200)).body;

beforeAll(async () => { app = createApp(); });

describe('data migration', () => {
  it('keeps answers, versions, and stakeholders, and carries stakeholders into personas for confirmation', async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    // Rebuild the database as the buyer-narrative update left it: migrations 001 and 002 only.
    for (const f of ['001_init.sql', '002_buyer_narrative.sql']) await pool.query(fs.readFileSync(path.join('server/db/migrations', f), 'utf8'));
    await pool.query("CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()); INSERT INTO schema_migrations(name) VALUES ('001_init.sql'),('002_buyer_narrative.sql')");
    const u = (await pool.query("INSERT INTO users(email, is_admin) VALUES ('old@fictional.test', true) RETURNING id")).rows[0].id;
    const p = (await pool.query("INSERT INTO projects(name, created_by, is_fictional) VALUES ('Old fictional', $1, true) RETURNING id", [u])).rows[0].id;
    const m = (await pool.query("INSERT INTO question_modules(key, position, title, why) VALUES ('buying', 6, 'Buying roles and timing', 'Old') RETURNING id")).rows[0].id;
    const q = (await pool.query("INSERT INTO questions(module_id, key, position) VALUES ($1, 'm6_roles', 2) RETURNING id", [m])).rows[0].id;
    await pool.query("INSERT INTO question_versions(question_id, version, kind, input_type, prompt) VALUES ($1, 1, 'core', 'long_text', 'Who evaluates, pays, uses, or can block the purchase?')", [q]);
    await pool.query("INSERT INTO answers(project_id, question_id, question_version, value, status, updated_by) VALUES ($1,$2,1,$3,'answered',$4)", [p, q, JSON.stringify('The partner signs; the office manager uses it.'), u]);
    await pool.query("INSERT INTO stakeholders(project_id, label, roles, desired_outcome, created_by) VALUES ($1, 'Office manager', ARRAY['user','internal_champion'], 'Fewer late nights', $2)", [p, u]);

    await migrate();
    await seedContent();

    const ans = (await pool.query('SELECT value, question_version, persona_id FROM answers WHERE project_id=$1', [p])).rows;
    expect(ans).toEqual([{ value: 'The partner signs; the office manager uses it.', question_version: 1, persona_id: null }]);
    expect((await pool.query('SELECT count(*)::int AS n FROM stakeholders')).rows[0].n).toBe(1);
    const persona = (await pool.query('SELECT role_title, purchase_roles, goal, needs_confirmation FROM personas WHERE project_id=$1', [p])).rows[0];
    expect(persona).toEqual({ role_title: 'Office manager', purchase_roles: expect.arrayContaining(['uses', 'recommends']), goal: 'Fewer late nights', needs_confirmation: true });
    expect((await pool.query("SELECT active FROM question_modules WHERE key='buying'")).rows[0].active).toBe(false);
    const order = (await pool.query('SELECT key FROM question_modules WHERE active ORDER BY position')).rows.map((r) => r.key);
    expect(order.slice(0, 9)).toEqual(['business', 'origin', 'offers', 'customer_company', 'customer_personas', 'problems', 'solution', 'success', 'nothing_changes']);
    expect((await pool.query("SELECT title FROM question_modules WHERE key='business'")).rows[0].title).toBe('Your company');
  });
});

describe('personas and connected plans', () => {
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
    await admin.put(`/api/admin/projects/${pid}/offers/${audit}/scope`).send({ inScope: true }).expect(200);
    await admin.put(`/api/admin/projects/${pid}/offers/${portal}/scope`).send({ inScope: true }).expect(200);
  });

  it('shows and defines "persona", and keeps "your company" separate from "customer company"', async () => {
    const c = await as(CLIENT);
    const d = (await c.get(`/api/projects/${pid}/discovery`).expect(200)).body;
    const titles = d.modules.map((m: { title: string }) => m.title);
    expect(titles).toEqual(expect.arrayContaining(['Your company', 'Your products and services', 'Your customer company', 'Your customer personas', 'Their problems', 'Your solution and plan', 'What success looks like', 'What happens if nothing changes']));
    expect(titles).not.toEqual(expect.arrayContaining(['Customer situation', 'Best-fit customers', 'Buying roles and timing']));
    expect(TERMS.definitions.find((x) => x.term === 'Persona')!.text).toBe('A type of person involved in buying or using your product or service. A persona describes their role, goals, problems, and part in the decision.');
    expect(TERMS.definitions.find((x) => x.term === 'Your company')!.text).toBe('The business you are completing this discovery for.');
    expect(TERMS.definitions.find((x) => x.term === 'Customer company')!.text).toBe('The business that buys or uses your products or services.');
    const cc = d.modules.find((m: { key: string }) => m.key === 'customer_company');
    for (const q of cc.questions) expect(q.prompt).not.toMatch(/your company/i);
    expect(d.modules.find((m: { key: string }) => m.key === 'business').opening).toBe('Your company is the business you are completing this discovery for.');
    expect(d.modules.find((m: { key: string }) => m.key === 'customer_personas').why).toContain('personas');
  });

  it('writes the new chapters at about a 10th grade reading level, without marketing jargon', () => {
    const syll = (w: string) => { w = w.toLowerCase().replace(/[^a-z]/g, ''); if (w.length <= 3) return 1; w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, ''); const m = w.match(/[aeiouy]{1,2}/g); return Math.max(1, m ? m.length : 1); };
    const grade = (t: string) => { const s = t.split(/[.!?]+\s|[.!?]+$|\n/).filter((x) => x.trim().split(/\s+/).length > 1); const w = t.split(/\s+/).filter((x) => /[a-z]/i.test(x)); return 0.39 * (w.length / s.length) + 11.8 * (w.reduce((a, x) => a + syll(x), 0) / w.length) - 15.59; };
    const keys = ['customer_company', 'customer_personas', 'problems', 'solution', 'success', 'nothing_changes'];
    const parts = [TERMS.intro, ...TERMS.definitions.map((x) => x.text)];
    for (const m of MODULES.filter((x) => keys.includes(x.key))) { parts.push(m.why); for (const q of m.questions) { parts.push(q.prompt); if (q.help) parts.push(q.help); } }
    const all = parts.map((p) => (/[.?!]$/.test(p.trim()) ? p : `${p}.`)).join('\n');
    expect(grade(all)).toBeLessThanOrEqual(10);
    expect(all.toLowerCase()).not.toMatch(/\b(leverage|synergy|value proposition|icp|ideal customer profile|pain point|funnel|touchpoint|stakeholder|go-to-market)\b/);
    for (const m of MODULES.filter((x) => keys.includes(x.key))) for (const q of m.questions) expect(q.prompt.split('?').length - 1).toBeLessThanOrEqual(1); // one question at a time
  });

  it('collects a customer company with one priority and keeps other groups separate', async () => {
    const c = await as(CLIENT);
    const g1 = (await c.post(`/api/projects/${pid}/customer-groups`).send({ name: 'Small accounting firms (fictional)' }).expect(200)).body.id;
    const g2 = (await c.post(`/api/projects/${pid}/customer-groups`).send({ name: 'Regional law firms (fictional)' }).expect(200)).body.id;
    let groups = (await pool.query('SELECT id, is_priority FROM customer_groups WHERE project_id=$1 ORDER BY sort_order', [pid])).rows;
    expect(groups).toEqual([{ id: g1, is_priority: true }, { id: g2, is_priority: false }]);
    await c.put(`/api/projects/${pid}/customer-groups/${g2}`).send({ name: 'Regional law firms (fictional)', isPriority: true }).expect(200);
    await c.put(`/api/projects/${pid}/customer-groups/${g1}`).send({ name: 'Small accounting firms (fictional)', isPriority: true }).expect(200);
    groups = (await pool.query('SELECT id, is_priority FROM customer_groups WHERE project_id=$1 ORDER BY sort_order', [pid])).rows;
    expect(groups.filter((g) => g.is_priority).map((g) => g.id)).toEqual([g1]);
  });

  it('collects role-based personas with several purchase roles each', async () => {
    const c = await as(CLIENT);
    ops = (await c.post(`/api/projects/${pid}/personas`).send({ roleTitle: 'Operations manager', responsibility: 'Keeps client work moving', purchaseRoles: ['identifies_need', 'uses', 'implements'], goal: 'Get client documents in on time', problem: 'Chasing missing files by email', evidenceStatus: 'observed' }).expect(200)).body.id;
    finance = (await c.post(`/api/projects/${pid}/personas`).send({ roleTitle: 'Finance director', purchaseRoles: ['approves', 'can_block'], goal: 'Predictable costs', problem: 'Surprise overtime at year end' }).expect(200)).body.id;
    clerk = (await c.post(`/api/projects/${pid}/personas`).send({ roleTitle: 'Front desk coordinator', purchaseRoles: ['uses'], goal: 'Answer client calls quickly', problem: 'Calls about status they cannot see' }).expect(200)).body.id;
    await c.post(`/api/projects/${pid}/personas`).send({ roleTitle: 'Ghost', purchaseRoles: ['ceo'] }).expect(400);
    await c.post(`/api/projects/${pid}/personas`).send({ roleTitle: 'X', purchaseRoles: [], age: 41 }).expect(400); // no biographies
    const d = (await c.get(`/api/projects/${pid}/discovery`)).body;
    expect(d.personas.map((p: { role_title: string }) => p.role_title)).toEqual(['Operations manager', 'Finance director', 'Front desk coordinator']);
    expect(d.personas[0].purchase_roles).toEqual(['identifies_need', 'uses', 'implements']);
  });

  it('scopes persona answers to a persona and company answers to the company', async () => {
    const c = await as(CLIENT);
    await put(c, 'p_work', { value: 'Hours lost to follow-up emails.', status: 'answered' }).expect(400);                         // persona required
    await put(c, 'cc_goal', { value: 'Grow without hiring.', status: 'answered' }, { personaId: ops }).expect(400);             // company question
    await put(c, 'p_work', { value: 'Hours lost to follow-up emails.', status: 'answered', evidenceStatus: 'observed' }, { personaId: ops }).expect(200);
    await put(c, 'p_work', { value: 'Approvals stall.', status: 'answered' }, { personaId: finance }).expect(200);
    const rows = (await pool.query("SELECT a.persona_id, a.value FROM answers a JOIN questions q ON q.id=a.question_id WHERE q.key='p_work'")).rows;
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.persona_id === ops).value).toBe('Hours lost to follow-up emails.');
    const stranger = await as('stranger@fictional.test');
    await stranger.put(`/api/projects/${pid}/answers/p_work?personaId=${ops}`).send({ value: 'x', status: 'answered' }).expect(404);
  });

  it('lets one offer help different personas in different ways, and different offers address different problems', async () => {
    const c = await as(CLIENT);
    await put(c, 'cc_problem', { value: 'Year-end work piles up at once.', status: 'answered', evidenceStatus: 'observed' }).expect(200);
    await c.post(`/api/projects/${pid}/links`).send({ fit: 'direct', offerId: audit, capability: 'A records review in the first two weeks', howItHelps: 'Finds missing documents before deadlines', outOfScope: 'Tax filing' }).expect(200);
    await c.post(`/api/projects/${pid}/links`).send({ personaId: ops, fit: 'direct', offerId: audit, capability: 'Missing-document checklist', howItHelps: 'They send one request instead of many', benefit: 'Less time chasing files' }).expect(200);
    await c.post(`/api/projects/${pid}/links`).send({ personaId: finance, fit: 'indirect', offerId: audit, capability: 'Upfront scoping', howItHelps: 'Work is planned before the busy season', benefit: 'Fewer surprise overtime costs' }).expect(200);
    await c.post(`/api/projects/${pid}/links`).send({ personaId: ops, fit: 'planned', offerId: portal, capability: 'Client upload page', howItHelps: 'Clients upload files themselves', benefit: 'No inbox searching' }).expect(200);
    const s = await connections(c);
    const opsS = s.find((x) => x.personaId === ops)!, finS = s.find((x) => x.personaId === finance)!;
    expect(opsS.links.map((l) => l.offerName)).toEqual(['Records Audit', 'Client Portal']);
    expect(finS.links[0]).toMatchObject({ offerName: 'Records Audit', fit: 'indirect', benefit: 'Fewer surprise overtime costs' });
    expect(opsS.links[0].benefit).not.toBe(finS.links[0].benefit);
    expect(opsS.links[1]).toMatchObject({ offerName: 'Client Portal', planned: true });
    const company = s.find((x) => x.scope === 'company')!;
    expect(company.links).toHaveLength(1);
    expect(company.title).toBe('Small accounting firms (fictional)');
  });

  it('allows a persona with no direct fit, without inventing one', async () => {
    const c = await as(CLIENT);
    await c.post(`/api/projects/${pid}/links`).send({ personaId: clerk, fit: 'direct' }).expect(400); // must name an offer
    await c.post(`/api/projects/${pid}/links`).send({ personaId: clerk, fit: 'none', offerId: audit }).expect(200);
    const row = (await pool.query('SELECT offer_id FROM solution_links WHERE persona_id=$1', [clerk])).rows[0];
    expect(row.offer_id).toBeNull();
    const s = (await connections(c)).find((x) => x.personaId === clerk)!;
    expect(s.links).toEqual([expect.objectContaining({ offerName: null, fitLabel: 'Nothing we offer fits yet' })]);
    const admin = await as(ADMIN);
    await admin.post(`/api/admin/projects/${pid}/checks`).expect(200);
    const flags = (await admin.get(`/api/admin/projects/${pid}/flags`)).body;
    expect(flags.some((f: { check_key: string; persona_id: string }) => f.check_key === 'problem_without_offer' && f.persona_id === clerk)).toBe(false);
  });

  it('keeps company and persona success separate, and company and persona consequences separate', async () => {
    const c = await as(CLIENT);
    await put(c, 'sc_company', { value: 'The firm finishes year-end work without overtime.', status: 'answered', evidenceStatus: 'founder_belief' }).expect(200);
    await put(c, 'sp_do', { value: 'Start client work on day one instead of waiting for files.', status: 'answered', evidenceStatus: 'customer_reported' }, { personaId: ops }).expect(200);
    await put(c, 'nc_keep', { value: 'Deadlines keep slipping each spring.', status: 'answered', evidenceStatus: 'observed' }).expect(200);
    await put(c, 'np_keep', { value: 'Weeks of follow-up emails.', status: 'answered' }, { personaId: ops }).expect(200);
    const s = await connections(c);
    const company = s.find((x) => x.scope === 'company')!, opsS = s.find((x) => x.personaId === ops)!;
    expect(company.success[0]).toMatchObject({ value: 'The firm finishes year-end work without overtime.', evidence: "It's my belief" });
    expect(opsS.success[0]).toMatchObject({ value: 'Start client work on day one instead of waiting for files.', evidence: 'Customers have told us' });
    expect(company.consequences[0].value).toBe('Deadlines keep slipping each spring.');
    expect(opsS.consequences[0].value).toBe('Weeks of follow-up emails.');
    expect(s.find((x) => x.personaId === finance)!.success[0].value).toBeNull(); // not borrowed from anyone else
  });

  it('captures both how the solution works and the customer plan', async () => {
    const c = await as(CLIENT);
    await put(c, 'pl_steps', { value: 'Kickoff call, document request, review, handoff.', status: 'answered' }).expect(200);
    await put(c, 'pl_we', { value: 'We run the review and the checklist.', status: 'answered' }).expect(200);
    const admin = await as(ADMIN);
    await admin.post(`/api/admin/projects/${pid}/checks`).expect(200);
    let flags = (await admin.get(`/api/admin/projects/${pid}/flags`)).body;
    expect(flags.some((f: { check_key: string }) => f.check_key === 'plan_missing_customer_role')).toBe(true);
    await put(c, 'pl_customer', { value: 'Send last year\'s files in week one.', status: 'answered' }).expect(200);
    await put(c, 'pl_personas', { value: 'Sends the document request to clients.', status: 'answered' }, { personaId: ops }).expect(200);
    const company = (await connections(c)).find((x) => x.scope === 'company')!;
    expect(company.links[0].capability).toBe('A records review in the first two weeks');                       // mechanism
    expect(company.plan.find((p) => p.label === 'Main steps')!.value).toBe('Kickoff call, document request, review, handoff.'); // plan
    expect((await connections(c)).find((x) => x.personaId === ops)!.plan[0].value).toBe('Sends the document request to clients.');
  });

  it('reuses existing answers only when the client confirms them', async () => {
    // An answer to a question this update retired.
    const qid = (await pool.query("SELECT id FROM questions WHERE key='n_fail_harder'")).rows[0].id;
    const uid = (await pool.query('SELECT id FROM users WHERE email=$1', [CLIENT])).rows[0].id;
    await pool.query("INSERT INTO answers(project_id, question_id, offer_id, question_version, value, status, updated_by) VALUES ($1,$2,$3,1,$4,'answered',$5)", [pid, qid, audit, JSON.stringify('Penalties for late filings.'), uid]);
    const c = await as(CLIENT);
    const d = (await c.get(`/api/projects/${pid}/discovery`)).body;
    expect(d.earlierAnswers.find((e: { question_key: string }) => e.question_key === 'n_fail_harder')).toMatchObject({ value: 'Penalties for late filings.', offer_name: 'Records Audit' });
    const admin = await as(ADMIN);
    const cov = (await admin.get(`/api/admin/projects/${pid}/narrative`)).body.coverage;
    const risk = cov.find((s: { key: string }) => s.key === 'customer_company').scopes[0].fields.find((f: { key: string }) => f.key === 'company.consequence_risk');
    expect(risk.status).toBe('needs_clarification');
    expect(risk.reason).toMatch(/earlier answer/i);
    await put(c, 'nc_harder', { value: 'Penalties for late filings.', status: 'answered', reusedFromKey: 'n_fail_harder' }).expect(200);
    await put(c, 'nc_harder', { value: 'x', status: 'answered', reusedFromKey: 'm1_what' }).expect(400);
  });

  it('keeps unknowns unknown and never fills blank connections', async () => {
    const c = await as(CLIENT);
    await put(c, 'p_personal', { value: null, status: 'not_sure' }, { personaId: finance }).expect(200);
    await put(c, 'sp_personal', { value: null, status: 'not_applicable' }, { personaId: finance }).expect(200);
    const fin = (await connections(c)).find((x) => x.personaId === finance)!;
    expect(fin.success.find((x) => x.label === 'What it means for them personally')!.value).toBe('Not applicable');
    expect(fin.missing).toEqual(expect.arrayContaining(['Success', 'Consequences if nothing changes']));
    expect(fin.plan[0].value).toBeNull();
    await submit(c);
    const admin = await as(ADMIN);
    const brief = (await admin.get(`/api/admin/projects/${pid}/source-brief`).expect(200)).body.markdown as string;
    const finSection = brief.split('## Persona: Finance director')[1].split('## ')[0];
    expect(finSection).toContain('_Not provided_');
    expect(finSection).not.toContain('Start client work on day one');
  });

  it('flags unsupported consequences, features posing as success, planned capabilities treated as current, and unexplained links', async () => {
    const c = await as(CLIENT);
    await put(c, 'np_prevent', { value: 'Losing every client.', status: 'answered', evidenceStatus: 'founder_belief' }, { personaId: finance }).expect(200);
    await put(c, 'sp_do', { value: 'Missing-document checklist', status: 'answered' }, { personaId: ops }).expect(200);
    await c.post(`/api/projects/${pid}/links`).send({ personaId: finance, fit: 'direct', offerId: portal, capability: 'Upload page', howItHelps: 'Files arrive on time', benefit: 'Fewer delays' }).expect(200);
    await c.post(`/api/projects/${pid}/links`).send({ fit: 'direct', offerId: portal }).expect(200);
    const admin = await as(ADMIN);
    await admin.post(`/api/admin/projects/${pid}/checks`).expect(200);
    const flags = (await admin.get(`/api/admin/projects/${pid}/flags`)).body as Record<string, unknown>[];
    const has = (k: string, persona: string | null = null) => flags.find((f) => f.check_key === k && (f.persona_id ?? null) === persona);
    expect(has('unsupported_failure', finance)).toBeTruthy();
    expect(has('persona_success_unclear', ops)).toBeTruthy();
    expect(has('planned_as_available', finance)).toBeTruthy();
    expect(has('offer_without_explanation', null)).toBeTruthy();
    for (const f of [has('unsupported_failure', finance)!, has('persona_success_unclear', ops)!]) {
      for (const k of ['noticed', 'suggested_action', 'example', 'why', 'client_question']) expect(f[k]).toBeTruthy();
      expect((f.source_refs as unknown[]).length).toBeGreaterThan(0);
    }
    expect(String(has('persona_success_unclear', ops)!.example)).toContain("'A dashboard' is a feature.");
  });

  it('flags a persona benefit that repeats the company benefit', async () => {
    const c = await as(CLIENT);
    await put(c, 'sp_do', { value: 'The firm finishes year-end work without overtime.', status: 'answered' }, { personaId: finance }).expect(200);
    const admin = await as(ADMIN);
    await admin.post(`/api/admin/projects/${pid}/checks`).expect(200);
    const flags = (await admin.get(`/api/admin/projects/${pid}/flags`)).body;
    expect(flags.some((f: { check_key: string; persona_id: string }) => f.check_key === 'persona_company_confused' && f.persona_id === finance)).toBe(true);
  });

  it('shows the connected structure and new fields in admin review, approval, and the source brief', async () => {
    const c = await as(CLIENT);
    await c.put(`/api/projects/${pid}/connection-review`).send({ personaId: ops, markedForDiscussion: true, correction: 'They also approve small purchases.' }).expect(200);
    await submit(c);
    const admin = await as(ADMIN);
    const adminConn = (await admin.get(`/api/projects/${pid}/connections`).expect(200)).body as Summary[];
    expect(adminConn.map((s) => s.title)).toEqual(['Small accounting firms (fictional)', 'Operations manager', 'Finance director', 'Front desk coordinator']);
    const cov = (await admin.get(`/api/admin/projects/${pid}/narrative`)).body.coverage;
    const personaSec = cov.find((s: { key: string }) => s.key === 'persona');
    expect(personaSec.scopes.map((s: { persona: { name: string } }) => s.persona.name)).toEqual(['Operations manager', 'Finance director', 'Front desk coordinator']);
    const sa = (await admin.get(`/api/admin/projects/${pid}/source-approval`).expect(200)).body;
    expect(sa.basis.assumptions.some((a: { kind: string }) => a.kind === 'connection')).toBe(true);
    const ids = sa.basis.assumptions.map((a: { id: string }) => a.id);
    await admin.post(`/api/admin/projects/${pid}/source-approval`).send({ snapshotVersion: sa.basis.snapshot.version, acceptedAssumptions: ids }).expect(200);
    const brief = (await admin.get(`/api/admin/projects/${pid}/source-brief`)).body;
    expect(brief.approved).toBe(true);
    expect(brief.version).toBe(sa.basis.snapshot.version);
    expect(brief.markdown).toContain('## Persona: Operations manager');
    expect(brief.markdown).toContain('Records Audit (Helps directly)');
    expect(brief.markdown).toContain('Client Portal (Planned, not available yet, planned)');
    expect(brief.markdown).toContain('Client correction:** They also approve small purchases.');
    expect(brief.markdown).toContain('## Accepted assumptions');
    expect((await approvedSourceForGeneration(pid)).version).toBe(sa.basis.snapshot.version);
  });

  it('still uses real offer names and planned wording for the offer questions that remain', async () => {
    const c = await as(CLIENT);
    const d = (await c.get(`/api/projects/${pid}/discovery`)).body;
    const qs = d.modules.flatMap((m: { questions: unknown[] }) => m.questions);
    const alt = qs.find((q: { key: string }) => q.key === 'n_alt_offer');
    expect(renderPrompt(alt, d.focusOffers.find((o: { id: string }) => o.id === audit))).toBe('If a customer did not choose Records Audit, what would they use or do instead to solve this particular problem?');
    expect(renderPrompt(alt, d.focusOffers.find((o: { id: string }) => o.id === portal))).toBe('How are intended customers handling this problem today, before Client Portal is available?');
    const heading = qs.find((q: { key: string }) => q.key === 'sp_do').heading_template;
    expect(heading.replace('{persona}', 'Operations manager')).toBe('What success looks like for Operations manager');
  });

  it('keeps connection tools away from other clients and non-admins', async () => {
    const stranger = await as('stranger2@fictional.test');
    await stranger.get(`/api/projects/${pid}/connections`).expect(404);
    await stranger.post(`/api/projects/${pid}/links`).send({ fit: 'none' }).expect(404);
    await stranger.post(`/api/projects/${pid}/personas`).send({ roleTitle: 'x', purchaseRoles: [] }).expect(404);
    const c = await as(CLIENT);
    await c.get(`/api/admin/projects/${pid}/source-brief`).expect(403);
  });

  it('seeds the guidance library and question text without em dashes', async () => {
    const admin = await as(ADMIN);
    const g = (await admin.get('/api/admin/guidance').expect(200)).body;
    expect(g).toHaveLength(24);
    expect(JSON.stringify(g)).not.toMatch(/[–—]/);
    const qs = (await pool.query('SELECT prompt, planned_prompt, help_text, heading_template, part_label FROM question_versions')).rows;
    expect(JSON.stringify(qs)).not.toMatch(/[–—]/);
    const du = (await pool.query("SELECT value FROM site_settings WHERE key='data_use'")).rows[0].value;
    expect(JSON.stringify(du)).not.toMatch(/[–—]/);
    expect(du.sections.map((s: { heading: string }) => s.heading)).toContain('How Rishari uses AI-assisted tools');
  });
});

afterAll(async () => { await pool.end(); });
