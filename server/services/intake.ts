import crypto from 'node:crypto';
import { z } from 'zod';
import { pool, tx } from '../db/pool.js';
import type { Db } from '../db/pool.js';
import type { CurrentUser } from '../auth/identity.js';
import { HttpError, notFound } from '../http.js';
import { ACK, EVIDENCE_LABELS } from '../../shared/content.js';
import { audit } from './audit.js';

const MAX_TEXT = 20000;

export async function loadQuestionnaire(db: Db = pool) {
  const modules = (await db.query('SELECT id, key, position, title, why, opening FROM question_modules WHERE active ORDER BY position')).rows;
  const questions = (await db.query(`
    SELECT q.id, q.key, q.module_id, q.position, qv.version, qv.kind, qv.input_type, qv.prompt, qv.help_text,
           qv.thinking_prompts, qv.options, qv.allow_not_sure
    FROM questions q JOIN question_versions qv ON qv.question_id=q.id AND qv.version=q.current_version
    WHERE q.active ORDER BY q.position`)).rows;
  return modules.map((m) => ({ ...m, questions: questions.filter((q) => q.module_id === m.id) }));
}

export async function getDiscoveryState(projectId: string, userId: string | null) {
  const [modules, answers, offers, progress, ack, project, snapshots, attachments] = await Promise.all([
    loadQuestionnaire(),
    pool.query('SELECT question_id, value, status, context_note, revision, updated_at FROM answers WHERE project_id=$1', [projectId]),
    pool.query(`SELECT id, name, description, intended_customer, availability, pricing_approach, delivery_model, priority, sort_order, updated_at
                FROM offers WHERE project_id=$1 AND deleted_at IS NULL ORDER BY sort_order, created_at`, [projectId]),
    pool.query('SELECT module_id, marked_for_discussion, client_correction FROM module_progress WHERE project_id=$1', [projectId]),
    userId ? pool.query('SELECT ack_version, created_at FROM acknowledgments WHERE project_id=$1 AND user_id=$2 AND ack_version=$3', [projectId, userId, ACK.version]) : Promise.resolve({ rows: [] }),
    pool.query('SELECT id, name, company_name, status FROM projects WHERE id=$1', [projectId]),
    pool.query("SELECT version, created_at FROM source_snapshots WHERE project_id=$1 AND kind='client_intake' ORDER BY version DESC", [projectId]),
    pool.query('SELECT id, module_id, original_name, mime_type, size_bytes, created_at FROM attachments WHERE project_id=$1 AND deleted_at IS NULL ORDER BY created_at', [projectId]),
  ]);
  return {
    project: project.rows[0],
    acknowledged: ack.rows.length > 0,
    ackVersion: ACK.version,
    modules,
    answers: answers.rows,
    offers: offers.rows,
    progress: progress.rows,
    submissions: snapshots.rows,
    attachments: attachments.rows,
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
  status: z.enum(['answered', 'not_sure', 'discuss', 'empty']),
  contextNote: z.string().max(MAX_TEXT).nullable().optional(),
  baseRevision: z.number().int().nonnegative().optional(),
});

// Saves the client's own words exactly as written. Every save is kept as a revision.
export async function saveAnswer(user: CurrentUser, projectId: string, questionKey: string, input: z.infer<typeof saveAnswerInput>) {
  return tx(async (c) => {
    await requireAcknowledged(user.id, projectId, c);
    const q = (await c.query(
      `SELECT q.id, q.current_version, qv.input_type, qv.options, qv.allow_not_sure
       FROM questions q JOIN question_versions qv ON qv.question_id=q.id AND qv.version=q.current_version
       WHERE q.key=$1 AND q.active`, [questionKey])).rows[0];
    if (!q) throw notFound();
    if ((input.status === 'not_sure') && !q.allow_not_sure) throw new HttpError(400, 'not_sure_unavailable', 'Please answer this one directly.');
    const value = validateValue(q.input_type, q.options, input.value);

    const existing = (await c.query('SELECT id, revision FROM answers WHERE project_id=$1 AND question_id=$2 FOR UPDATE', [projectId, q.id])).rows[0];
    if (existing && input.baseRevision !== undefined && input.baseRevision !== existing.revision) {
      const cur = (await c.query('SELECT value, status, context_note, revision FROM answers WHERE id=$1', [existing.id])).rows[0];
      throw Object.assign(new HttpError(409, 'conflict', 'This answer changed in another window. Reload to see the latest version.'), { current: cur });
    }
    const revision = existing ? existing.revision + 1 : 1;
    const saved = existing
      ? (await c.query(
          `UPDATE answers SET value=$2, status=$3, context_note=$4, revision=$5, question_version=$6, updated_by=$7, updated_at=now()
           WHERE id=$1 RETURNING id, revision, updated_at`,
          [existing.id, JSON.stringify(value), input.status, input.contextNote ?? null, revision, q.current_version, user.id])).rows[0]
      : (await c.query(
          `INSERT INTO answers(project_id, question_id, question_version, value, status, context_note, revision, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,1,$7) RETURNING id, revision, updated_at`,
          [projectId, q.id, q.current_version, JSON.stringify(value), input.status, input.contextNote ?? null, user.id])).rows[0];
    await c.query(
      `INSERT INTO answer_revisions(answer_id, project_id, revision, value, status, context_note, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [saved.id, projectId, saved.revision, JSON.stringify(value), input.status, input.contextNote ?? null, user.id],
    );
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
  const r = await pool.query('UPDATE offers SET deleted_at=now() WHERE id=$1 AND project_id=$2 AND deleted_at IS NULL RETURNING id', [offerId, projectId]);
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

// Builds the intake snapshot content. Original answers are copied verbatim.
async function buildIntakeContent(projectId: string, db: Db) {
  const modules = await loadQuestionnaire(db);
  const answers = (await db.query('SELECT question_id, question_version, value, status, context_note, revision FROM answers WHERE project_id=$1', [projectId])).rows;
  const offers = (await db.query(`SELECT id, name, description, intended_customer, availability, pricing_approach, delivery_model, priority
                                  FROM offers WHERE project_id=$1 AND deleted_at IS NULL ORDER BY sort_order, created_at`, [projectId])).rows;
  const progress = (await db.query('SELECT module_id, marked_for_discussion, client_correction FROM module_progress WHERE project_id=$1', [projectId])).rows;
  const attachments = (await db.query('SELECT id, module_id, original_name, mime_type, size_bytes FROM attachments WHERE project_id=$1 AND deleted_at IS NULL', [projectId])).rows;
  return {
    modules: modules.map((m) => ({
      key: m.key, title: m.title,
      markedForDiscussion: progress.find((p) => p.module_id === m.id)?.marked_for_discussion ?? false,
      clientCorrection: progress.find((p) => p.module_id === m.id)?.client_correction ?? null,
      answers: m.questions.map((q: { id: string; key: string; prompt: string; version: number }) => {
        const a = answers.find((x) => x.question_id === q.id);
        return { questionKey: q.key, questionVersion: a?.question_version ?? q.version, prompt: q.prompt, value: a?.value ?? null, status: a?.status ?? 'empty', contextNote: a?.context_note ?? null, revision: a?.revision ?? 0 };
      }),
    })),
    offers,
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
    await c.query(`UPDATE projects SET status='submitted' WHERE id=$1 AND status='discovery'`, [projectId]);
    await audit({ projectId, actorId: user.id, action: 'intake.submitted', targetType: 'source_snapshot', targetId: snap.id, detail: { version } }, c);
    return snap;
  });
}
