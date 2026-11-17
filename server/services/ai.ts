// Pass 2 AI features. Every call goes through runAi (versioned prompt, writing standard, validation,
// caps, job record). Client answers never depend on these succeeding.
import { z } from 'zod';
import { pool, tx } from '../db/pool.js';
import type { CurrentUser } from '../auth/identity.js';
import { HttpError, notFound } from '../http.js';
import { audit } from './audit.js';
import { requireAdmin, requireClientMember, requireProjectAccess } from './permissions.js';
import { buildIntakeContent, loadQuestionnaire, focusOffers } from './intake.js';
import { approvedSourceForGeneration } from './narrative.js';
import { runAi, aiStatus, fingerprint, usage, listJobs } from '../ai/run.js';
import { clientMaterial } from '../ai/standard.js';
import { materialText, allKeys, allAnswerText, valueText } from '../ai/material.js';
import { renderPrompt, buildSourceBrief, type Content } from '../../shared/narrative.js';
import * as P from '../ai/prompts.js';

const uuid = z.string().uuid();

async function project(projectId: string) {
  const p = (await pool.query('SELECT id, name, company_name, is_fictional FROM projects WHERE id=$1', [projectId])).rows[0];
  if (!p) throw notFound();
  return { ...p, label: (p.company_name || p.name) as string };
}

// Real client material goes to the AI provider only after Rishari has reviewed the data-use page.
// Fictional projects are exempt so the features can be tested.
async function assertAllowed(projectId: string) {
  const s = aiStatus();
  if (!s.enabled) throw new HttpError(503, 'ai_unavailable', 'AI features are turned off right now. Nothing you entered is affected.');
  const p = await project(projectId);
  if (p.is_fictional) return p;
  const du = (await pool.query("SELECT value FROM site_settings WHERE key='data_use'")).rows[0]?.value;
  if (!du?.reviewed) throw new HttpError(409, 'data_use_not_reviewed', 'Mark the data-use page as reviewed before using AI with real client projects.');
  return p;
}

export async function aiOverview(admin: CurrentUser, projectId: string) {
  requireAdmin(admin);
  const p = await project(projectId);
  const du = (await pool.query("SELECT value FROM site_settings WHERE key='data_use'")).rows[0]?.value;
  return { ...aiStatus(), dataUseReviewed: !!du?.reviewed, fictional: p.is_fictional, usage: await usage(projectId), jobs: await listJobs(projectId) };
}

// ------------------------------------------------------------------ Follow-ups

export const followupRequest = z.object({ questionKey: z.string().max(80), offerId: uuid.nullable().optional(), personaId: uuid.nullable().optional() });
export const followupAnswer = z.object({ answer: z.string().max(10_000).nullable(), status: z.enum(['answered', 'skipped', 'not_sure', 'discuss']) });

type FollowupRow = { id: string; round: number; kind: string; question: string; answer: string | null; status: string };

// Returns the open follow-up for a question (creating one if the AI thinks it would help), or null.
// Never more than two per question and scope, never two open at once, never repeated for unchanged answers.
export async function nextFollowup(user: CurrentUser, projectId: string, input: z.infer<typeof followupRequest>): Promise<{ followup: FollowupRow | null }> {
  await requireClientMember(user, projectId);
  const offerId = input.offerId ?? null, personaId = input.personaId ?? null;
  const mods = await loadQuestionnaire();
  const q = mods.flatMap((m) => m.questions).find((x) => x.key === input.questionKey);
  if (!q) throw notFound();
  if (q.kind !== 'core' || q.input_type !== 'long_text') return { followup: null };
  const prior: FollowupRow[] = (await pool.query(
    `SELECT id, round, kind, question, answer, status, answer_fingerprint FROM ai_followups
     WHERE project_id=$1 AND question_id=$2 AND offer_id IS NOT DISTINCT FROM $3 AND persona_id IS NOT DISTINCT FROM $4 ORDER BY round`,
    [projectId, q.id, offerId, personaId])).rows;
  const open = prior.find((f) => f.status === 'open');
  if (open) return { followup: open };
  if (prior.length >= 2) return { followup: null };
  const a = (await pool.query(
    `SELECT value, status FROM answers WHERE project_id=$1 AND question_id=$2 AND offer_id IS NOT DISTINCT FROM $3 AND persona_id IS NOT DISTINCT FROM $4`,
    [projectId, q.id, offerId, personaId])).rows[0];
  const text = typeof a?.value === 'string' ? a.value.trim() : '';
  if (!a || a.status !== 'answered' || text.split(/\s+/).length < 4) return { followup: null };
  const fp = fingerprint({ text, prior: prior.map((f) => [f.question, f.answer, f.status]) });
  if ((prior as (FollowupRow & { answer_fingerprint: string })[]).some((f) => f.answer_fingerprint === fp)) return { followup: null };
  // A "no follow-up needed" decision for this exact text is remembered too.
  const decided = (await pool.query(
    `SELECT 1 FROM generation_jobs WHERE project_id=$1 AND task=$2 AND source_fingerprint IS NOT NULL AND status='succeeded' AND output->>'needed'='false' AND source_fingerprint=$3`,
    [projectId, `followup:${q.key}`, fingerprint({ source: { fp }, standard: 1 })])).rowCount;
  if (decided) return { followup: null };

  let p;
  try { p = await assertAllowed(projectId); } catch { return { followup: null }; }
  const focus = await focusOffers(projectId);
  const offer = focus.find((o) => o.id === offerId) ?? null;
  const persona = personaId ? (await pool.query('SELECT role_title FROM personas WHERE id=$1 AND project_id=$2', [personaId, projectId])).rows[0] ?? null : null;
  const content = await buildIntakeContent(projectId, pool) as unknown as Content;
  const later = mods.flatMap((m) => m.questions).filter((x) => x.kind === 'core' && x.position > q.position && x.module_id === q.module_id).map((x) => `- ${x.prompt}`).slice(0, 8).join('\n');
  const input2 = [
    `Question: ${renderPrompt(q, offer, persona)}`,
    q.help_text ? `Help shown with it: ${q.help_text}` : '',
    offer ? `Offer: ${offer.name}${offer.availability === 'planned' ? ' (planned, not available yet)' : ''}` : '',
    persona ? `Persona: ${persona.role_title}` : '',
    `Round: ${prior.length + 1} of 2`,
    'Their answer and earlier follow-ups:',
    clientMaterial([text, ...prior.map((f) => `Follow-up: ${f.question}\nReply: ${f.answer ?? f.status}`)].join('\n\n')),
    'Other answers so far, for spotting contradictions:',
    clientMaterial(materialText(content, { company: p.label }).slice(0, 12_000)),
    later ? `Questions they will see later in this chapter:\n${later}` : '',
  ].filter(Boolean).join('\n\n');
  try {
    const r = await runAi({ projectId, task: `followup:${q.key}`, prompt: P.FOLLOWUP, input: input2, schema: P.followupSchema, source: { fp }, userId: user.id });
    if (!r.output.needed || !r.output.question.trim()) return { followup: null };
    const row = (await pool.query(
      `INSERT INTO ai_followups(project_id, question_id, offer_id, persona_id, round, kind, question, answer_fingerprint, generation_job_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING RETURNING id, round, kind, question, answer, status`,
      [projectId, q.id, offerId, personaId, prior.length + 1, r.output.kind, r.output.question.trim(), fp, r.jobId])).rows[0];
    return { followup: row ?? null };
  } catch {
    return { followup: null }; // AI trouble never blocks the client
  }
}

export async function answerFollowup(user: CurrentUser, projectId: string, id: string, input: z.infer<typeof followupAnswer>) {
  await requireClientMember(user, projectId);
  const r = (await pool.query(
    `UPDATE ai_followups SET answer=$3, status=$4, answered_at=now() WHERE id=$1 AND project_id=$2 RETURNING id, round, kind, question, answer, status`,
    [id, projectId, input.status === 'answered' ? (input.answer ?? '').trim() || null : input.answer?.trim() || null, input.status])).rows[0];
  if (!r) throw notFound();
  return r;
}

export async function listFollowups(projectId: string) {
  return (await pool.query(
    `SELECT f.id, q.key AS question_key, f.offer_id, f.persona_id, f.round, f.kind, f.question, f.answer, f.status
     FROM ai_followups f JOIN questions q ON q.id=f.question_id WHERE f.project_id=$1 ORDER BY f.created_at`, [projectId])).rows;
}

// ------------------------------------------------------------------ Chapter summaries

export async function chapterSummary(user: CurrentUser, projectId: string, moduleKey: string, generate: boolean) {
  await requireProjectAccess(user, projectId);
  const m = (await pool.query('SELECT id, key, title FROM question_modules WHERE key=$1 AND active', [moduleKey])).rows[0];
  if (!m) throw notFound();
  const existing = (await pool.query('SELECT content, client_correction, source_fingerprint, updated_at FROM summaries WHERE project_id=$1 AND module_id=$2', [projectId, m.id])).rows[0];
  const content = await buildIntakeContent(projectId, pool) as unknown as Content;
  const mod = content.modules.find((x) => x.key === moduleKey);
  const answered = (mod?.answers ?? []).filter((e) => valueText(e.value).trim() || ['not_sure', 'discuss'].includes(e.status));
  if (!answered.length) return { status: 'empty' as const, summary: null, clientCorrection: existing?.client_correction ?? null };
  const p = await project(projectId);
  const sub: Content = { ...content, modules: [{ key: moduleKey, answers: answered }], summaries: [] };
  const material = materialText(sub, { company: p.label });
  const fp = fingerprint(material);
  if (existing && existing.source_fingerprint === fp) return { status: 'ready' as const, summary: existing.content, clientCorrection: existing.client_correction };
  if (!generate) return { status: existing ? ('outdated' as const) : ('missing' as const), summary: existing?.content ?? null, clientCorrection: existing?.client_correction ?? null };
  try {
    await assertAllowed(projectId);
    const r = await runAi({ projectId, task: `summary:${moduleKey}`, prompt: P.SUMMARY, input: `Chapter: ${m.title}\n\n${clientMaterial(material)}`, schema: P.summarySchema, source: material, userId: user.id });
    await pool.query(
      `INSERT INTO summaries(project_id, module_id, source_fingerprint, content, generation_job_id, client_correction)
       VALUES ($1,$2,$3,$4,$5,NULL)
       ON CONFLICT (project_id, module_id) DO UPDATE SET source_fingerprint=EXCLUDED.source_fingerprint, content=EXCLUDED.content,
         generation_job_id=EXCLUDED.generation_job_id, updated_at=now()`,
      [projectId, m.id, fp, JSON.stringify(r.output), r.jobId]);
    return { status: 'ready' as const, summary: r.output, clientCorrection: existing?.client_correction ?? null };
  } catch {
    return { status: 'unavailable' as const, summary: existing?.content ?? null, clientCorrection: existing?.client_correction ?? null };
  }
}

export const summaryCorrection = z.object({ correction: z.string().max(4000).nullable() });
export async function correctSummary(user: CurrentUser, projectId: string, moduleKey: string, correction: string | null) {
  await requireClientMember(user, projectId);
  const m = (await pool.query('SELECT id FROM question_modules WHERE key=$1 AND active', [moduleKey])).rows[0];
  if (!m) throw notFound();
  const r = await pool.query('UPDATE summaries SET client_correction=$3, updated_at=now() WHERE project_id=$1 AND module_id=$2', [projectId, m.id, correction?.trim() || null]);
  if (!r.rowCount) throw new HttpError(409, 'no_summary', 'There is no summary to correct yet.');
  return { ok: true };
}

// ------------------------------------------------------------------ Admin: snapshot helpers

async function latestSnapshot(projectId: string) {
  const s = (await pool.query(`SELECT id, version, content FROM source_snapshots WHERE project_id=$1 AND kind='client_intake' ORDER BY version DESC LIMIT 1`, [projectId])).rows[0];
  if (!s) throw new HttpError(409, 'no_submission', 'The client has not submitted discovery yet.');
  return s as { id: string; version: number; content: Content };
}

// ------------------------------------------------------------------ AI review flags

export async function aiReview(admin: CurrentUser, projectId: string) {
  requireAdmin(admin);
  const p = await assertAllowed(projectId);
  const snap = await latestSnapshot(projectId);
  const existing = (await pool.query(`SELECT issue FROM flags WHERE project_id=$1 AND (decision IS NULL OR decision NOT IN ('dismissed','resolved'))`, [projectId])).rows.map((r) => r.issue);
  const material = materialText(snap.content, { company: p.label });
  const input = `${clientMaterial(material)}\n\nIssues already flagged:\n${existing.map((e) => `- ${e}`).join('\n') || '- None'}`;
  const r = await runAi({ projectId, task: 'ai_review', prompt: P.AI_REVIEW, input, schema: P.aiReviewSchema, source: { material, existing }, snapshotId: snap.id, userId: admin.id });
  const keys = allKeys(snap.content);
  const entries = snap.content.modules.flatMap((m) => m.answers);
  let created = 0;
  await tx(async (db) => {
    for (const f of r.output.flags) {
      const dup = (await db.query(`SELECT 1 FROM flags WHERE project_id=$1 AND lower(issue)=lower($2) AND (decision IS NULL OR decision NOT IN ('dismissed','resolved'))`, [projectId, f.issue])).rowCount;
      if (dup) continue;
      const refs = f.questionKeys.filter((k) => keys.has(k)).map((k) => {
        const e = entries.find((x) => x.questionKey === k)!;
        return { questionKey: k, offerId: e.offerId, personaId: e.personaId ?? null, prompt: e.prompt };
      });
      const persona = f.personaName ? (snap.content.personas ?? []).find((x) => x.role_title.toLowerCase() === f.personaName.toLowerCase()) : null;
      const offer = f.offerName ? snap.content.focusOffers.find((x) => x.name.toLowerCase() === f.offerName.toLowerCase()) : null;
      await db.query(
        `INSERT INTO flags(project_id, offer_id, persona_id, check_key, issue, priority, source_refs, noticed, suggested_action, example, why, client_question, origin, generation_job_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'ai',$13)`,
        [projectId, offer?.id ?? null, persona?.id ?? null, `ai_${f.kind}`, f.issue, f.priority, JSON.stringify(refs), f.noticed, f.suggestedAction, f.example, f.why, f.clientQuestion, r.jobId]);
      created++;
    }
    await audit({ projectId, actorId: admin.id, action: 'ai.review_flags', detail: { found: r.output.flags.length, created } }, db);
  });
  return { found: r.output.flags.length, created, cached: r.cached };
}

// ------------------------------------------------------------------ Call briefing

export async function generateBriefing(admin: CurrentUser, projectId: string) {
  requireAdmin(admin);
  const p = await assertAllowed(projectId);
  const snap = await latestSnapshot(projectId);
  const flags = (await pool.query(`SELECT issue, noticed, decision FROM flags WHERE project_id=$1 AND (decision IS NULL OR decision NOT IN ('dismissed','resolved'))`, [projectId])).rows;
  const notes = (await pool.query(`SELECT note_type, body FROM review_notes WHERE project_id=$1 ORDER BY created_at`, [projectId])).rows;
  const material = materialText(snap.content, { company: p.label });
  const input = [
    clientMaterial(material),
    `Open review flags:\n${flags.map((f) => `- ${f.issue}: ${f.noticed}${f.decision ? ` (${f.decision})` : ''}`).join('\n') || '- None'}`,
    `Reviewer notes (Rishari's, not the client's):\n${notes.map((n) => `- [${n.note_type}] ${n.body}`).join('\n') || '- None'}`,
  ].join('\n\n');
  const r = await runAi({ projectId, task: 'briefing', prompt: P.BRIEFING, input, schema: P.briefingSchema, source: { material, flags, notes }, quoteSource: allAnswerText(snap.content), snapshotId: snap.id, userId: admin.id, reuse: false });
  const keys = allKeys(snap.content);
  // Keep only quotes found verbatim in the client's answers, and only real answer keys.
  const out = {
    ...r.output,
    usefulLanguage: r.output.usefulLanguage.filter((u) => !r.unverifiedQuotes.includes(u.quote) && keys.has(u.questionKey)),
    priorities: r.output.priorities.map((x) => ({ ...x, questionKeys: x.questionKeys.filter((k) => keys.has(k)) })),
  };
  const row = (await pool.query(
    `INSERT INTO briefings(project_id, source_snapshot_id, content, generation_job_id) VALUES ($1,$2,$3,$4) RETURNING id, content, created_at, updated_at`,
    [projectId, snap.id, JSON.stringify(out), r.jobId])).rows[0];
  await audit({ projectId, actorId: admin.id, action: 'ai.briefing', targetType: 'briefing', targetId: row.id });
  return { ...row, sourceVersion: snap.version, droppedQuotes: r.unverifiedQuotes.length };
}

export async function getBriefing(admin: CurrentUser, projectId: string) {
  requireAdmin(admin);
  const b = (await pool.query(
    `SELECT b.id, b.content, b.created_at, b.updated_at, b.edited_by, s.version AS source_version,
            (SELECT max(version) FROM source_snapshots x WHERE x.project_id=b.project_id AND x.kind='client_intake') AS latest_version
     FROM briefings b JOIN source_snapshots s ON s.id=b.source_snapshot_id WHERE b.project_id=$1 ORDER BY b.created_at DESC LIMIT 1`, [projectId])).rows[0];
  return b ?? null;
}

export const briefingEdit = z.object({ content: P.briefingSchema });
export async function saveBriefing(admin: CurrentUser, projectId: string, id: string, content: z.infer<typeof P.briefingSchema>) {
  requireAdmin(admin);
  const r = await pool.query('UPDATE briefings SET content=$3, edited_by=$4, updated_at=now() WHERE id=$1 AND project_id=$2', [id, projectId, JSON.stringify(content), admin.id]);
  if (!r.rowCount) throw notFound();
  await audit({ projectId, actorId: admin.id, action: 'briefing.edited', targetType: 'briefing', targetId: id });
  return { ok: true };
}

// ------------------------------------------------------------------ Positioning options and direction

async function approvedSource(projectId: string) {
  const a = await approvedSourceForGeneration(projectId);
  if (!a) throw new HttpError(409, 'source_not_approved', 'Approve the source on the Source approval tab first.');
  const ap = (await pool.query('SELECT accepted_assumptions FROM approvals WHERE id=$1', [a.approval_id])).rows[0];
  return { ...a, content: a.content as Content, assumptions: (ap?.accepted_assumptions ?? []) as { text: string }[] };
}

function strategyInput(label: string, src: { version: number; content: Content; assumptions: { text: string }[] }) {
  const brief = buildSourceBrief(src.content, { company: label, version: src.version, assumptions: src.assumptions });
  return `Approved source brief (version ${src.version}):\n${clientMaterial(brief)}\n\nAll approved answers:\n${clientMaterial(materialText(src.content, { company: label }))}`;
}

export async function generateOptions(admin: CurrentUser, projectId: string) {
  requireAdmin(admin);
  const p = await assertAllowed(projectId);
  const src = await approvedSource(projectId);
  const input = strategyInput(p.label, src);
  const r = await runAi({ projectId, task: 'positioning_options', prompt: P.OPTIONS, input, schema: P.optionsSchema, source: { v: src.version, input }, snapshotId: src.id, userId: admin.id, reuse: false });
  const batch = ((await pool.query('SELECT max(batch) AS b FROM positioning_options WHERE project_id=$1', [projectId])).rows[0].b ?? 0) + 1;
  for (const o of r.output.options) {
    await pool.query(`INSERT INTO positioning_options(project_id, source_snapshot_id, content, generation_job_id, batch) VALUES ($1,$2,$3,$4,$5)`,
      [projectId, src.id, JSON.stringify({ ...o, unresolvedDecisions: r.output.unresolvedDecisions }), r.jobId, batch]);
  }
  await audit({ projectId, actorId: admin.id, action: 'ai.positioning_options', detail: { count: r.output.options.length, batch } });
  return { batch, count: r.output.options.length };
}

export async function strategyState(admin: CurrentUser, projectId: string) {
  requireAdmin(admin);
  const src = await approvedSourceForGeneration(projectId);
  const options = (await pool.query(
    `SELECT o.id, o.content, o.edited_content, o.chosen, o.batch, o.created_at, s.version AS source_version
     FROM positioning_options o JOIN source_snapshots s ON s.id=o.source_snapshot_id WHERE o.project_id=$1 ORDER BY o.batch DESC, o.created_at`, [projectId])).rows;
  const direction = (await pool.query(
    `SELECT a.id, a.target_id AS option_id, a.target_version, a.stale, a.scope, a.created_at, u.email AS actor_email
     FROM approvals a JOIN users u ON u.id=a.actor_id WHERE a.project_id=$1 AND a.approval_type='admin_direction' ORDER BY a.created_at DESC LIMIT 1`, [projectId])).rows[0] ?? null;
  const version = (await pool.query(
    `SELECT v.id, v.version, v.status, v.created_at, v.direction_approval_id, s.version AS source_version FROM strategy_versions v JOIN source_snapshots s ON s.id=v.source_snapshot_id
     WHERE v.project_id=$1 ORDER BY v.version DESC LIMIT 1`, [projectId])).rows[0] ?? null;
  const sections = version ? (await pool.query(
    `SELECT id, key, content, locked, model, review, position, updated_at, edited_by IS NOT NULL AS edited FROM strategy_sections WHERE strategy_version_id=$1 ORDER BY position`, [version.id])).rows : [];
  const versions = (await pool.query('SELECT version, status, created_at FROM strategy_versions WHERE project_id=$1 ORDER BY version DESC', [projectId])).rows;
  return {
    sourceApproved: src ? { version: src.version } : null,
    options, direction, version, sections, versions,
    directionCurrent: !!(direction && !direction.stale && src && options.find((o) => o.id === direction.option_id)?.source_version === src.version),
  };
}

export const directionInput = z.object({ optionId: uuid, edited: P.directionSchema, note: z.string().max(2000).nullable().optional() });
export async function approveDirection(admin: CurrentUser, projectId: string, input: z.infer<typeof directionInput>) {
  requireAdmin(admin);
  const src = await approvedSource(projectId);
  return tx(async (db) => {
    const o = (await db.query('SELECT id, source_snapshot_id FROM positioning_options WHERE id=$1 AND project_id=$2', [input.optionId, projectId])).rows[0];
    if (!o) throw notFound();
    if (o.source_snapshot_id !== src.id) throw new HttpError(409, 'option_outdated', 'This option was made from an older source version. Generate new options first.');
    await db.query('UPDATE positioning_options SET chosen = (id=$2), edited_content = CASE WHEN id=$2 THEN $3::jsonb ELSE edited_content END WHERE project_id=$1', [projectId, input.optionId, JSON.stringify(input.edited)]);
    await db.query(`UPDATE approvals SET stale=true WHERE project_id=$1 AND approval_type IN ('admin_direction') AND NOT stale`, [projectId]);
    const a = (await db.query(
      `INSERT INTO approvals(project_id, approval_type, target_type, target_id, target_version, scope, actor_id)
       VALUES ($1,'admin_direction','positioning_option',$2,$3,$4,$5) RETURNING id, created_at`,
      [projectId, input.optionId, `source-v${src.version}:${fingerprint(input.edited).slice(0, 12)}`, JSON.stringify({ sourceVersion: src.version, note: input.note ?? null }), admin.id])).rows[0];
    await audit({ projectId, actorId: admin.id, action: 'approval.admin_direction', targetType: 'positioning_option', targetId: input.optionId }, db);
    return a;
  });
}

// ------------------------------------------------------------------ Framework drafting

async function currentDirection(projectId: string) {
  const src = await approvedSource(projectId);
  const d = (await pool.query(
    `SELECT a.id, o.edited_content, o.source_snapshot_id FROM approvals a JOIN positioning_options o ON o.id=a.target_id
     WHERE a.project_id=$1 AND a.approval_type='admin_direction' AND NOT a.stale ORDER BY a.created_at DESC LIMIT 1`, [projectId])).rows[0];
  if (!d) throw new HttpError(409, 'direction_not_approved', 'Approve a positioning direction before drafting the framework.');
  if (d.source_snapshot_id !== src.id) throw new HttpError(409, 'direction_outdated', 'The approved direction was made from an older source version. Choose a direction again.');
  return { src, directionId: d.id as string, direction: d.edited_content };
}

const sectionTitle = (key: string) => P.ALL_SECTIONS.find(([k]) => k === key)?.[1] ?? key;

export async function draftFramework(admin: CurrentUser, projectId: string) {
  requireAdmin(admin);
  const p = await assertAllowed(projectId);
  const { src, directionId, direction } = await currentDirection(projectId);
  const base = `${strategyInput(p.label, src)}\n\nApproved direction (chosen and edited by the strategist):\n${JSON.stringify(direction, null, 2)}`;
  const prev = (await pool.query('SELECT id FROM strategy_versions WHERE project_id=$1 ORDER BY version DESC LIMIT 1', [projectId])).rows[0];
  const locked = prev ? (await pool.query('SELECT key, content, model, prompt_version_id, generated_content, review FROM strategy_sections WHERE strategy_version_id=$1 AND locked', [prev.id])).rows : [];
  const lockedKeys = new Set(locked.map((l) => l.key));
  const drafted: Record<string, { section: z.infer<typeof P.sectionSchema>; jobId: string }> = {};
  for (const [group, defs] of Object.entries(P.SECTION_GROUPS) as [P.GroupKey, readonly (readonly [string, string])[]][]) {
    const wanted = defs.filter(([k]) => !lockedKeys.has(k));
    if (!wanted.length) continue;
    const already = Object.values(drafted).map((d) => `### ${d.section.title}\n${d.section.body}`).join('\n\n');
    const lockedText = locked.map((l) => `### ${sectionTitle(l.key)} (locked by the strategist; keep consistent with it)\n${l.content.body}`).join('\n\n');
    const input = `${base}\n\n${already || lockedText ? `Sections already written:\n${[lockedText, already].filter(Boolean).join('\n\n')}\n\n` : ''}Write these sections now, using these exact keys:\n${wanted.map(([k, t]) => `- ${k}: ${t}`).join('\n')}`;
    const r = await runAi({ projectId, task: `framework:${group}`, prompt: P.FRAMEWORK, input, schema: P.frameworkSchema, source: input, quoteSource: allAnswerText(src.content), snapshotId: src.id, userId: admin.id, reuse: false });
    for (const s of r.output.sections) if (wanted.some(([k]) => k === s.key)) drafted[s.key] = { section: { ...s, title: sectionTitle(s.key) }, jobId: r.jobId };
  }
  const order = P.ALL_SECTIONS.map(([k]) => k);
  const v = await tx(async (db) => {
    const version = ((await db.query('SELECT max(version) AS v FROM strategy_versions WHERE project_id=$1', [projectId])).rows[0].v ?? 0) + 1;
    const sv = (await db.query(`INSERT INTO strategy_versions(project_id, version, source_snapshot_id, created_by, direction_approval_id) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [projectId, version, src.id, admin.id, directionId])).rows[0];
    for (const key of order) {
      const l = locked.find((x) => x.key === key);
      if (l) {
        await db.query(`INSERT INTO strategy_sections(strategy_version_id, project_id, key, content, locked, prompt_version_id, model, generated_content, review, position)
          VALUES ($1,$2,$3,$4,true,$5,$6,$7,$8,$9)`, [sv.id, projectId, key, JSON.stringify(l.content), l.prompt_version_id, l.model, JSON.stringify(l.generated_content), JSON.stringify(l.review), order.indexOf(key)]);
        continue;
      }
      const d = drafted[key];
      const content = d?.section ?? { key, title: sectionTitle(key), body: '_This section was not produced. Regenerate it or write it by hand._', claims: [] };
      const job = d ? (await db.query('SELECT model, prompt_version_id FROM generation_jobs WHERE id=$1', [d.jobId])).rows[0] : null;
      await db.query(`INSERT INTO strategy_sections(strategy_version_id, project_id, key, content, generated_content, prompt_version_id, model, generation_job_id, position)
        VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8)`, [sv.id, projectId, key, JSON.stringify(content), job?.prompt_version_id ?? null, job?.model ?? null, d?.jobId ?? null, order.indexOf(key)]);
    }
    await audit({ projectId, actorId: admin.id, action: 'strategy.drafted', targetType: 'strategy_version', targetId: sv.id, detail: { version, locked: locked.length } }, db);
    return { id: sv.id as string, version };
  });
  await checkFramework(admin, projectId, v.id).catch(() => null); // review comments are helpful, not required
  return v;
}

export async function checkFramework(admin: CurrentUser, projectId: string, versionId?: string) {
  requireAdmin(admin);
  const p = await assertAllowed(projectId);
  const { src, direction } = await currentDirection(projectId);
  const v = versionId ?? (await pool.query('SELECT id FROM strategy_versions WHERE project_id=$1 ORDER BY version DESC LIMIT 1', [projectId])).rows[0]?.id;
  if (!v) throw new HttpError(409, 'no_draft', 'There is no framework draft yet.');
  const sections = (await pool.query('SELECT key, content FROM strategy_sections WHERE strategy_version_id=$1 ORDER BY position', [v])).rows;
  const draft = sections.map((s) => `### [${s.key}] ${s.content.title}\n${s.content.body}`).join('\n\n');
  const input = `${strategyInput(p.label, src)}\n\nApproved direction:\n${JSON.stringify(direction)}\n\nDraft to review:\n${draft}`;
  const r = await runAi({ projectId, task: 'framework_check', prompt: P.CHECK, input, schema: P.checkSchema, source: input, snapshotId: src.id, userId: admin.id });
  for (const s of sections) {
    const mine = r.output.comments.filter((c) => c.sectionKey === s.key);
    await pool.query('UPDATE strategy_sections SET review=$2 WHERE strategy_version_id=$1 AND key=$3', [v, JSON.stringify(mine), s.key]);
  }
  return { comments: r.output.comments.length };
}

export const sectionEdit = z.object({ body: z.string().max(20_000).optional(), locked: z.boolean().optional() });
export async function editSection(admin: CurrentUser, projectId: string, sectionId: string, input: z.infer<typeof sectionEdit>) {
  requireAdmin(admin);
  return tx(async (db) => {
    const s = (await db.query('SELECT id, content, locked FROM strategy_sections WHERE id=$1 AND project_id=$2 FOR UPDATE', [sectionId, projectId])).rows[0];
    if (!s) throw notFound();
    if (input.body !== undefined) {
      if (s.locked && input.locked !== false) throw new HttpError(409, 'locked', 'Unlock this section to edit it.');
      await db.query('UPDATE strategy_sections SET content=$2, edited_by=$3, updated_at=now() WHERE id=$1', [sectionId, JSON.stringify({ ...s.content, body: input.body }), admin.id]);
    }
    if (input.locked !== undefined) await db.query('UPDATE strategy_sections SET locked=$2, updated_at=now() WHERE id=$1', [sectionId, input.locked]);
    await audit({ projectId, actorId: admin.id, action: 'strategy.section_edited', targetType: 'strategy_section', targetId: sectionId, detail: { body: input.body !== undefined, locked: input.locked } }, db);
    return { ok: true };
  });
}

export const reviseInput = z.object({ instruction: z.string().min(3).max(2000) });
export async function reviseSection(admin: CurrentUser, projectId: string, sectionId: string, instruction: string) {
  requireAdmin(admin);
  const p = await assertAllowed(projectId);
  const s = (await pool.query('SELECT id, key, content, locked, strategy_version_id FROM strategy_sections WHERE id=$1 AND project_id=$2', [sectionId, projectId])).rows[0];
  if (!s) throw notFound();
  if (s.locked) throw new HttpError(409, 'locked', 'This section is locked. Unlock it to regenerate.');
  const { src, direction } = await currentDirection(projectId);
  const others = (await pool.query('SELECT key, content FROM strategy_sections WHERE strategy_version_id=$1 AND id<>$2 ORDER BY position', [s.strategy_version_id, sectionId])).rows;
  const input = `${strategyInput(p.label, src)}\n\nApproved direction:\n${JSON.stringify(direction)}\n\nOther sections:\n${others.map((o) => `### ${o.content.title}\n${o.content.body}`).join('\n\n')}\n\nSection to rewrite (key ${s.key}):\n${s.content.body}\n\nStrategist's instruction:\n${clientMaterial(instruction)}`;
  const r = await runAi({ projectId, task: `revise:${s.key}`, prompt: P.REVISE, input, schema: P.sectionSchema, source: input, quoteSource: allAnswerText(src.content), snapshotId: src.id, userId: admin.id, reuse: false });
  const job = (await pool.query('SELECT model, prompt_version_id FROM generation_jobs WHERE id=$1', [r.jobId])).rows[0];
  const content = { ...r.output, key: s.key, title: sectionTitle(s.key) };
  await pool.query(`UPDATE strategy_sections SET content=$2, generated_content=$2, model=$3, prompt_version_id=$4, generation_job_id=$5, edited_by=NULL, review='[]', updated_at=now() WHERE id=$1`,
    [sectionId, JSON.stringify(content), job.model, job.prompt_version_id, r.jobId]);
  await audit({ projectId, actorId: admin.id, action: 'strategy.section_revised', targetType: 'strategy_section', targetId: sectionId });
  return { ok: true };
}
