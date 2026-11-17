import crypto from 'node:crypto';
import { z } from 'zod';
import { pool, tx } from '../db/pool.js';
import type { Db } from '../db/pool.js';
import type { CurrentUser } from '../auth/identity.js';
import { HttpError, notFound } from '../http.js';
import { ACK, EVIDENCE_LABELS } from '../../shared/content.js';
import { audit } from './audit.js';
import { renderPrompt } from '../../shared/narrative.js';
import type { FocusOffer } from '../../shared/narrative.js';
export { renderPrompt };

const MAX_TEXT = 20000;
export const EVIDENCE_STATUSES = ['observed', 'customer_reported', 'founder_belief', 'planned', 'unknown'] as const;
export const STAKEHOLDER_ROLES = ['primary_buyer', 'internal_champion', 'user', 'approver', 'beneficiary'] as const;

export async function loadQuestionnaire(db: Db = pool) {
  const modules = (await db.query('SELECT id, key, position, title, why, opening FROM question_modules WHERE active ORDER BY position')).rows;
  const questions = (await db.query(`
    SELECT q.id, q.key, q.module_id, q.position, qv.version, qv.kind, qv.input_type, qv.prompt, qv.help_text,
           qv.thinking_prompts, qv.options, qv.allow_not_sure, qv.per_offer, qv.planned_prompt, qv.probe_of,
           qv.narrative_field, qv.asks_evidence, qv.allow_not_applicable, qv.reuse_from, qv.probe_always, qv.na_label
    FROM questions q JOIN question_versions qv ON qv.question_id=q.id AND qv.version=q.current_version
    WHERE q.active ORDER BY q.position`)).rows;
  return modules.map((m) => ({ ...m, questions: questions.filter((q) => q.module_id === m.id) }));
}

// Offers that get the detailed narrative questions: the ones Rishari marked in scope, or before
// scope is set, the client's top-priority offer. Listing more offers never adds questions by itself.
export async function focusOffers(projectId: string, db: Db = pool): Promise<FocusOffer[]> {
  const offers = (await db.query(
    `SELECT id, name, availability, in_scope, priority FROM offers WHERE project_id=$1 AND deleted_at IS NULL
     ORDER BY priority NULLS LAST, sort_order, created_at`, [projectId])).rows;
  const inScope = offers.filter((o) => o.in_scope);
  const chosen = inScope.length ? inScope : offers.slice(0, 1);
  return chosen.map((o) => ({ id: o.id, name: o.name, availability: o.availability }));
}

export async function getDiscoveryState(projectId: string, userId: string | null) {
  const [modules, answers, offers, progress, ack, project, snapshots, attachments, stakeholders, clarifications, focus] = await Promise.all([
    loadQuestionnaire(),
    pool.query('SELECT question_id, offer_id, value, status, context_note, evidence_status, reused_from_key, revision, updated_at FROM answers WHERE project_id=$1', [projectId]),
    pool.query(`SELECT id, name, description, intended_customer, availability, pricing_approach, delivery_model, priority, sort_order, updated_at
                FROM offers WHERE project_id=$1 AND deleted_at IS NULL ORDER BY sort_order, created_at`, [projectId]),
    pool.query('SELECT module_id, marked_for_discussion, client_correction FROM module_progress WHERE project_id=$1', [projectId]),
    userId ? pool.query('SELECT ack_version, created_at FROM acknowledgments WHERE project_id=$1 AND user_id=$2 AND ack_version=$3', [projectId, userId, ACK.version]) : Promise.resolve({ rows: [] }),
    pool.query('SELECT id, name, company_name, status FROM projects WHERE id=$1', [projectId]),
    pool.query("SELECT version, created_at FROM source_snapshots WHERE project_id=$1 AND kind='client_intake' ORDER BY version DESC", [projectId]),
    pool.query('SELECT id, module_id, original_name, mime_type, size_bytes, created_at FROM attachments WHERE project_id=$1 AND deleted_at IS NULL ORDER BY created_at', [projectId]),
    pool.query(`SELECT id, offer_id, label, roles, desired_outcome, wants_to_prevent, needs_to_believe, decision_role, evidence_status, sort_order
                FROM stakeholders WHERE project_id=$1 AND deleted_at IS NULL ORDER BY sort_order, created_at`, [projectId]),
    pool.query(`SELECT id, question_key, offer_id, note, status, created_at FROM clarification_requests WHERE project_id=$1 AND status='open' ORDER BY created_at`, [projectId]),
    focusOffers(projectId),
  ]);
  return {
    project: project.rows[0],
    acknowledged: ack.rows.length > 0,
    ackVersion: ACK.version,
    modules,
    focusOffers: focus,
    answers: answers.rows,
    offers: offers.rows,
    progress: progress.rows,
    submissions: snapshots.rows,
    attachments: attachments.rows,
    stakeholders: stakeholders.rows,
    clarifications: clarifications.rows,
  };
}

export async function recordAcknowledgment(user: CurrentUser, projectId: string, version: string) {
  if (version !== ACK.version) throw new HttpError(409, 'ack_outdated', 'Please reload the page and review the current text.');
  await pool.query(
    `INSERT INTO acknowledgments(project_id, user_id, ack_version, text_shown) VALUES ($1,$2,$3,$4)
     ON CONFLICT (project_id, user_id, ack_version) DO NOTHING`,
    [projectId, user.id, ACK.version, ACK.text],
  );
  await pool.query(
    `INSERT INTO approvals(project_id, approval_type, target_type, target_id, target_version, actor_id)
     SELECT $1,'client_process_ack','project',$1,$2,$3
     WHERE NOT EXISTS (SELECT 1 FROM approvals WHERE project_id=$1 AND approval_type='client_process_ack' AND actor_id=$3 AND target_version=$2)`,
    [projectId, ACK.version, user.id],
  );
  await audit({ projectId, actorId: user.id, action: 'acknowledgment.recorded', detail: { version: ACK.version } });
}

async function requireAcknowledged(userId: string, projectId: string, db: Db = pool) {
  const r = await db.query('SELECT 1 FROM acknowledgments WHERE project_id=$1 AND user_id=$2 AND ack_version=$3', [projectId, userId, ACK.version]);
  if (!r.rows[0]) throw new HttpError(409, 'ack_required', 'Please review and accept the welcome information first.');
}

const textValue = z.string().max(MAX_TEXT);
const exampleValue = z.array(z.object({ text: z.string().max(MAX_TEXT), label: z.enum(EVIDENCE_LABELS) })).max(20);

function validateValue(inputType: string, options: string[], value: unknown): unknown {
  if (value === null || value === undefined) return null;
  switch (inputType) {
    case 'short_text': case 'long_text': return textValue.parse(value);
    case 'url': {
      // Stored as a reference only. The app never fetches URLs.
      const s = z.string().max(2000).parse(value).trim();
      if (s && !/^https?:\/\/|^[\w-]+(\.[\w-]+)+/.test(s)) throw new HttpError(400, 'invalid_url', 'That does not look like a web address.');
      return s;
    }
    case 'single_select': {
      const s = z.string().parse(value);
      if (!options.includes(s)) throw new HttpError(400, 'invalid_option', 'Please choose one of the listed options.');
      return s;
    }
    case 'multi_select': {
      const arr = z.array(z.string()).max(options.length).parse(value);
      if (arr.some((v) => !options.includes(v))) throw new HttpError(400, 'invalid_option', 'Please choose from the listed options.');
      return [...new Set(arr)];
    }
    case 'labeled_examples': return exampleValue.parse(value);
    default: throw new HttpError(400, 'not_answerable', 'This question is answered elsewhere on the page.');
  }
}

export const saveAnswerInput = z.object({
  value: z.unknown().optional(),
  status: z.enum(['answered', 'not_sure', 'discuss', 'empty', 'not_applicable']),
  contextNote: z.string().max(MAX_TEXT).nullable().optional(),
  evidenceStatus: z.enum(EVIDENCE_STATUSES).nullable().optional(),
  reusedFromKey: z.string().max(100).nullable().optional(),
  baseRevision: z.number().int().nonnegative().optional(),
});

// Saves the client's own words exactly as written. Every save is kept as a revision.
export async function saveAnswer(user: CurrentUser, projectId: string, questionKey: string, offerId: string | null, input: z.infer<typeof saveAnswerInput>) {
  return tx(async (c) => {
    await requireAcknowledged(user.id, projectId, c);
    const q = (await c.query(
      `SELECT q.id, q.current_version, qv.input_type, qv.options, qv.allow_not_sure, qv.per_offer, qv.allow_not_applicable, qv.asks_evidence, qv.reuse_from
       FROM questions q JOIN question_versions qv ON qv.question_id=q.id AND qv.version=q.current_version
       WHERE q.key=$1 AND q.active`, [questionKey])).rows[0];
    if (!q) throw notFound();
    // Offer-specific questions are answered per focus offer; company questions never carry an offer.
    if (offerId) {
      if (!q.per_offer) throw new HttpError(400, 'not_offer_question', 'This question is about the whole company.');
      const focus = await focusOffers(projectId, c);
      if (!focus.some((o) => o.id === offerId)) throw notFound();
    } else if (q.per_offer) {
      const focus = await focusOffers(projectId, c);
      if (focus.length) throw new HttpError(400, 'offer_required', 'Choose which offer this answer is about.');
    }
    if (input.status === 'not_sure' && !q.allow_not_sure) throw new HttpError(400, 'not_sure_unavailable', 'Please answer this one directly.');
    if (input.status === 'not_applicable' && !q.allow_not_applicable) throw new HttpError(400, 'na_unavailable', 'This question needs an answer or "I\'m not sure yet."');
    if (input.evidenceStatus && !q.asks_evidence) throw new HttpError(400, 'evidence_unavailable', 'This question does not take an evidence label.');
    if (input.reusedFromKey && !(q.reuse_from as string[]).includes(input.reusedFromKey)) throw new HttpError(400, 'invalid_reuse', 'That earlier answer is not linked to this question.');
    const value = input.status === 'not_applicable' ? null : validateValue(q.input_type, q.options, input.value);

    const existing = (await c.query(
      `SELECT id, revision FROM answers WHERE project_id=$1 AND question_id=$2 AND offer_id IS NOT DISTINCT FROM $3 FOR UPDATE`,
      [projectId, q.id, offerId])).rows[0];
    if (existing && input.baseRevision !== undefined && input.baseRevision !== existing.revision) {
      throw new HttpError(409, 'conflict', 'This answer changed in another window. Reload to see the latest version.');
    }
    const revision = existing ? existing.revision + 1 : 1;
    const params = [JSON.stringify(value), input.status, input.contextNote ?? null, input.evidenceStatus ?? null, input.reusedFromKey ?? null];
    const saved = existing
      ? (await c.query(
          `UPDATE answers SET value=$2, status=$3, context_note=$4, evidence_status=$5, reused_from_key=$6, revision=$7, question_version=$8, updated_by=$9, updated_at=now()
           WHERE id=$1 RETURNING id, revision, updated_at`,
          [existing.id, ...params, revision, q.current_version, user.id])).rows[0]
      : (await c.query(
          `INSERT INTO answers(project_id, question_id, offer_id, question_version, value, status, context_note, evidence_status, reused_from_key, revision, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10) RETURNING id, revision, updated_at`,
          [projectId, q.id, offerId, q.current_version, ...params, user.id])).rows[0];
    await c.query(
      `INSERT INTO answer_revisions(answer_id, project_id, offer_id, revision, value, status, context_note, evidence_status, reused_from_key, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [saved.id, projectId, offerId, saved.revision, ...params, user.id],
    );
    if (input.status !== 'empty') {
      await c.query(
        `UPDATE clarification_requests SET status='answered', answered_at=now()
         WHERE project_id=$1 AND question_key=$2 AND offer_id IS NOT DISTINCT FROM $3 AND status='open'`,
        [projectId, questionKey, offerId]);
    }
    return { revision: saved.revision, updatedAt: saved.updated_at };
  });
}

// Offers: clients describe them; only admins decide scope (in_scope is never accepted from clients).
export const offerInput = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  intendedCustomer: z.string().max(2000).nullable().optional(),
  availability: z.enum(['available', 'pilot', 'planned']).nullable().optional(),
  pricingApproach: z.string().max(2000).nullable().optional(),
  deliveryModel: z.string().max(2000).nullable().optional(),
  priority: z.number().int().min(1).max(20).nullable().optional(),
}).strict();

export async function upsertOffer(user: CurrentUser, projectId: string, offerId: string | null, input: z.infer<typeof offerInput>) {
  await requireAcknowledged(user.id, projectId);
  const vals = [input.name, input.description ?? null, input.intendedCustomer ?? null, input.availability ?? null, input.pricingApproach ?? null, input.deliveryModel ?? null, input.priority ?? null];
  if (offerId) {
    const r = await pool.query(
      `UPDATE offers SET name=$3, description=$4, intended_customer=$5, availability=$6, pricing_approach=$7, delivery_model=$8, priority=$9, updated_at=now()
       WHERE id=$1 AND project_id=$2 AND deleted_at IS NULL RETURNING id`, [offerId, projectId, ...vals]);
    if (!r.rows[0]) throw notFound();
    return r.rows[0];
  }
  const count = (await pool.query('SELECT count(*)::int AS n FROM offers WHERE project_id=$1 AND deleted_at IS NULL', [projectId])).rows[0].n;
  if (count >= 30) throw new HttpError(400, 'too_many_offers', 'You can list up to 30 offers.');
  const r = await pool.query(
    `INSERT INTO offers(project_id, name, description, intended_customer, availability, pricing_approach, delivery_model, priority, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [projectId, ...vals, count]);
  return r.rows[0];
}

export async function deleteOffer(user: CurrentUser, projectId: string, offerId: string) {
  await requireAcknowledged(user.id, projectId);
  // Soft delete: answers given for this offer are kept, never silently removed.
  const r = await pool.query('UPDATE offers SET deleted_at=now() WHERE id=$1 AND project_id=$2 AND deleted_at IS NULL RETURNING id', [offerId, projectId]);
  if (!r.rows[0]) throw notFound();
}

// Stakeholder map (Section 13): one row per person, several roles allowed.
export const stakeholderInput = z.object({
  offerId: z.string().uuid().nullable().optional(),
  label: z.string().trim().min(1).max(200),
  roles: z.array(z.enum(STAKEHOLDER_ROLES)).max(5),
  desiredOutcome: z.string().max(MAX_TEXT).nullable().optional(),
  wantsToPrevent: z.string().max(MAX_TEXT).nullable().optional(),
  needsToBelieve: z.string().max(MAX_TEXT).nullable().optional(),
  decisionRole: z.string().max(2000).nullable().optional(),
  evidenceStatus: z.enum(EVIDENCE_STATUSES).nullable().optional(),
}).strict();

export async function upsertStakeholder(user: CurrentUser, projectId: string, id: string | null, input: z.infer<typeof stakeholderInput>) {
  await requireAcknowledged(user.id, projectId);
  if (input.offerId) {
    const focus = await focusOffers(projectId);
    if (!focus.some((o) => o.id === input.offerId)) throw notFound();
  }
  const vals = [input.offerId ?? null, input.label, [...new Set(input.roles)], input.desiredOutcome ?? null, input.wantsToPrevent ?? null, input.needsToBelieve ?? null, input.decisionRole ?? null, input.evidenceStatus ?? null];
  if (id) {
    const r = await pool.query(
      `UPDATE stakeholders SET offer_id=$3, label=$4, roles=$5, desired_outcome=$6, wants_to_prevent=$7, needs_to_believe=$8, decision_role=$9, evidence_status=$10, updated_at=now()
       WHERE id=$1 AND project_id=$2 AND deleted_at IS NULL RETURNING id`, [id, projectId, ...vals]);
    if (!r.rows[0]) throw notFound();
    return r.rows[0];
  }
  const n = (await pool.query('SELECT count(*)::int AS n FROM stakeholders WHERE project_id=$1 AND deleted_at IS NULL', [projectId])).rows[0].n;
  if (n >= 25) throw new HttpError(400, 'too_many_people', 'You can list up to 25 people.');
  const r = await pool.query(
    `INSERT INTO stakeholders(project_id, offer_id, label, roles, desired_outcome, wants_to_prevent, needs_to_believe, decision_role, evidence_status, sort_order, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, [projectId, ...vals, n, user.id]);
  return r.rows[0];
}

export async function deleteStakeholder(user: CurrentUser, projectId: string, id: string) {
  await requireAcknowledged(user.id, projectId);
  const r = await pool.query('UPDATE stakeholders SET deleted_at=now() WHERE id=$1 AND project_id=$2 AND deleted_at IS NULL RETURNING id', [id, projectId]);
  if (!r.rows[0]) throw notFound();
}

export async function setModuleProgress(user: CurrentUser, projectId: string, moduleKey: string, input: { markedForDiscussion?: boolean; clientCorrection?: string | null }) {
  await requireAcknowledged(user.id, projectId);
  const m = (await pool.query('SELECT id FROM question_modules WHERE key=$1', [moduleKey])).rows[0];
  if (!m) throw notFound();
  await pool.query(
    `INSERT INTO module_progress(project_id, module_id, marked_for_discussion, client_correction) VALUES ($1,$2,COALESCE($3,false),$4)
     ON CONFLICT (project_id, module_id) DO UPDATE SET
       marked_for_discussion=COALESCE($3, module_progress.marked_for_discussion),
       client_correction=CASE WHEN $5 THEN $4 ELSE module_progress.client_correction END, updated_at=now()`,
    [projectId, m.id, input.markedForDiscussion ?? null, input.clientCorrection ?? null, input.clientCorrection !== undefined],
  );
}

// Builds the intake snapshot content. Original answers are copied verbatim, per offer where relevant.
export async function buildIntakeContent(projectId: string, db: Db) {
  const modules = await loadQuestionnaire(db);
  const focus = await focusOffers(projectId, db);
  const answers = (await db.query('SELECT question_id, offer_id, question_version, value, status, context_note, evidence_status, reused_from_key, revision FROM answers WHERE project_id=$1', [projectId])).rows;
  const offers = (await db.query(`SELECT id, name, description, intended_customer, availability, pricing_approach, delivery_model, priority, in_scope
                                  FROM offers WHERE project_id=$1 AND deleted_at IS NULL ORDER BY sort_order, created_at`, [projectId])).rows;
  const progress = (await db.query('SELECT module_id, marked_for_discussion, client_correction FROM module_progress WHERE project_id=$1', [projectId])).rows;
  const attachments = (await db.query('SELECT id, module_id, original_name, mime_type, size_bytes FROM attachments WHERE project_id=$1 AND deleted_at IS NULL', [projectId])).rows;
  const stakeholders = (await db.query(`SELECT id, offer_id, label, roles, desired_outcome, wants_to_prevent, needs_to_believe, decision_role, evidence_status
                                        FROM stakeholders WHERE project_id=$1 AND deleted_at IS NULL ORDER BY sort_order, created_at`, [projectId])).rows;
  type Q = { id: string; key: string; prompt: string; planned_prompt: string | null; version: number; per_offer: boolean; narrative_field: string | null; probe_of: string | null; reuse_from: string[] };
  const entry = (q: Q, offer: FocusOffer | null) => {
    const a = answers.find((x) => x.question_id === q.id && (x.offer_id ?? null) === (offer?.id ?? null));
    return {
      questionKey: q.key, questionVersion: a?.question_version ?? q.version, prompt: renderPrompt(q, offer), offerId: offer?.id ?? null,
      narrativeField: q.narrative_field, probeOf: q.probe_of, reuseFrom: q.reuse_from ?? [],
      value: a?.value ?? null, status: a?.status ?? 'empty', contextNote: a?.context_note ?? null,
      evidenceStatus: a?.evidence_status ?? null, reusedFromKey: a?.reused_from_key ?? null, revision: a?.revision ?? 0,
    };
  };
  return {
    focusOffers: focus,
    modules: modules.map((m) => ({
      key: m.key, title: m.title,
      markedForDiscussion: progress.find((p) => p.module_id === m.id)?.marked_for_discussion ?? false,
      clientCorrection: progress.find((p) => p.module_id === m.id)?.client_correction ?? null,
      answers: (m.questions as Q[]).filter((q) => q.key !== 'n_stakeholders').flatMap((q) =>
        q.per_offer && focus.length ? focus.map((o) => entry(q, o)) : [entry(q, null)]),
    })),
    offers,
    stakeholders,
    attachments,
  };
}

export async function submitIntake(user: CurrentUser, projectId: string, input: { confirmed: boolean; idempotencyKey: string }) {
  if (!input.confirmed) throw new HttpError(400, 'confirmation_required', 'Please confirm before submitting.');
  return tx(async (c) => {
    await requireAcknowledged(user.id, projectId, c);
    await c.query('SELECT id FROM projects WHERE id=$1 FOR UPDATE', [projectId]);
    const prior = (await c.query('SELECT id, version, created_at FROM source_snapshots WHERE project_id=$1 AND idempotency_key=$2', [projectId, input.idempotencyKey])).rows[0];
    if (prior) return prior; // safe retry: no duplicate submission
    const content = await buildIntakeContent(projectId, c);
    const hash = crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');
    const version = ((await c.query('SELECT max(version) AS v FROM source_snapshots WHERE project_id=$1', [projectId])).rows[0].v ?? 0) + 1;
    const snap = (await c.query(
      `INSERT INTO source_snapshots(project_id, version, kind, content, content_hash, idempotency_key, created_by)
       VALUES ($1,$2,'client_intake',$3,$4,$5,$6) RETURNING id, version, created_at`,
      [projectId, version, JSON.stringify(content), hash, input.idempotencyKey, user.id])).rows[0];
    await c.query(
      `INSERT INTO approvals(project_id, approval_type, target_type, target_id, target_version, actor_id)
       VALUES ($1,'client_intake_confirmation','source_snapshot',$2,$3,$4)`, [projectId, snap.id, String(version), user.id]);
    // A newer intake makes any source approval built on an older one stale (never silently carried over).
    await c.query(`UPDATE approvals SET stale=true WHERE project_id=$1 AND approval_type IN ('admin_source','admin_direction','admin_share','client_strategy','admin_final_release') AND NOT stale`, [projectId]);
    await c.query(`UPDATE projects SET status='submitted' WHERE id=$1 AND status='discovery'`, [projectId]);
    await audit({ projectId, actorId: user.id, action: 'intake.submitted', targetType: 'source_snapshot', targetId: snap.id, detail: { version } }, c);
    return snap;
  });
}
