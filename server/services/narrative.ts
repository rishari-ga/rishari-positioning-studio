// Buyer narrative coverage, deterministic checks, and source approval (update spec Sections 14 to 17).
// No AI is used here. Checks that need judgment about meaning are left for Pass 2.
import { z } from 'zod';
import { pool, tx } from '../db/pool.js';
import type { Db } from '../db/pool.js';
import type { CurrentUser } from '../auth/identity.js';
import { HttpError, notFound } from '../http.js';
import { audit } from './audit.js';
import { requireAdmin } from './permissions.js';
import { buildIntakeContent } from './intake.js';

import { NARRATIVE_SECTIONS, COVERAGE, fieldCoverage, runChecks } from '../../shared/narrative.js';
import type { Content, Coverage } from '../../shared/narrative.js';
export { NARRATIVE_SECTIONS };

export async function coverageReport(projectId: string, content?: Content, db: Db = pool) {
  const c = content ?? ((await buildIntakeContent(projectId, db)) as unknown as Content);
  const overrides = (await db.query('SELECT field_key, offer_id, status, note FROM coverage_overrides WHERE project_id=$1', [projectId])).rows;
  const scopes: ({ id: string; name: string; availability: string | null } | null)[] = c.focusOffers.length ? c.focusOffers : [null];
  return NARRATIVE_SECTIONS.map((sec) => ({
    ...sec,
    scopes: (sec.offer ? scopes : [null]).map((o) => ({
      offer: o,
      fields: sec.fields.map((f) => {
        const computed = fieldCoverage(c, f.key, o?.id ?? null);
        const ov = overrides.find((x) => x.field_key === f.key && (x.offer_id ?? null) === (o?.id ?? null));
        const e = computed.entry;
        return {
          key: f.key, label: f.label, important: !!f.important, optional: !!f.optional,
          status: (ov?.status ?? computed.status) as Coverage, reason: ov ? `Set by reviewer${ov.note ? `: ${ov.note}` : ''}` : computed.reason,
          overridden: !!ov, questionKey: e?.questionKey ?? null, prompt: e?.prompt ?? null,
          value: e?.value ?? null, evidenceStatus: e?.evidenceStatus ?? null,
        };
      }),
    })),
  }));
}

export const overrideInput = z.object({
  fieldKey: z.string().max(100), offerId: z.string().uuid().nullable().optional(),
  status: z.enum(COVERAGE).nullable(), note: z.string().max(2000).nullable().optional(),
});
export async function setCoverageOverride(admin: CurrentUser, projectId: string, input: z.infer<typeof overrideInput>) {
  requireAdmin(admin);
  if (!NARRATIVE_SECTIONS.some((s) => s.fields.some((f) => f.key === input.fieldKey))) throw new HttpError(400, 'unknown_field', 'Unknown narrative field.');
  await pool.query('DELETE FROM coverage_overrides WHERE project_id=$1 AND field_key=$2 AND offer_id IS NOT DISTINCT FROM $3', [projectId, input.fieldKey, input.offerId ?? null]);
  if (input.status) {
    await pool.query('INSERT INTO coverage_overrides(project_id, offer_id, field_key, status, note, set_by) VALUES ($1,$2,$3,$4,$5,$6)',
      [projectId, input.offerId ?? null, input.fieldKey, input.status, input.note ?? null, admin.id]);
  }
}

// Requests only the specific missing detail. Nothing is sent: the client sees it next time they open discovery.
export const clarificationInput = z.object({ questionKey: z.string().max(100), offerId: z.string().uuid().nullable().optional(), note: z.string().max(2000).nullable().optional() });
export async function requestClarification(admin: CurrentUser, projectId: string, input: z.infer<typeof clarificationInput>, flagId: string | null = null, db: Db = pool) {
  requireAdmin(admin);
  const q = (await db.query('SELECT 1 FROM questions WHERE key=$1 AND active', [input.questionKey])).rows[0];
  if (!q) throw new HttpError(400, 'unknown_question', 'Unknown question.');
  const open = (await db.query(`SELECT id FROM clarification_requests WHERE project_id=$1 AND question_key=$2 AND offer_id IS NOT DISTINCT FROM $3 AND status='open'`,
    [projectId, input.questionKey, input.offerId ?? null])).rows[0];
  if (open) return open;
  const r = (await db.query(
    `INSERT INTO clarification_requests(project_id, question_key, offer_id, note, flag_id, requested_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [projectId, input.questionKey, input.offerId ?? null, input.note ?? null, flagId, admin.id])).rows[0];
  await audit({ projectId, actorId: admin.id, action: 'clarification.requested', targetType: 'question', targetId: input.questionKey }, db);
  return r;
}

export async function listClarifications(admin: CurrentUser, projectId: string) {
  requireAdmin(admin);
  return (await pool.query('SELECT * FROM clarification_requests WHERE project_id=$1 ORDER BY created_at DESC', [projectId])).rows;
}

export async function runProjectChecks(admin: CurrentUser, projectId: string) {
  requireAdmin(admin);
  return tx(async (db) => {
    const content = (await buildIntakeContent(projectId, db)) as unknown as Content;
    const hits = runChecks(content);
    let created = 0;
    for (const h of hits) {
      const open = (await db.query(
        `SELECT id FROM flags WHERE project_id=$1 AND check_key=$2 AND offer_id IS NOT DISTINCT FROM $3 AND (decision IS NULL OR decision NOT IN ('dismissed','resolved'))`,
        [projectId, h.check, h.offerId])).rows[0];
      if (open) continue;
      const g = (await db.query('SELECT * FROM guidance_entries WHERE key=$1', [h.check])).rows[0];
      if (!g) continue;
      const refs = h.refs.map((e) => ({ questionKey: e.questionKey, offerId: e.offerId, prompt: e.prompt }));
      await db.query(
        `INSERT INTO flags(project_id, offer_id, guidance_key, check_key, issue, priority, source_refs, noticed, suggested_action, example, why, client_question)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [projectId, h.offerId, g.key, h.check, g.issue, h.priority, JSON.stringify(refs), h.noticed, g.action, g.example, g.why, g.client_question]);
      created++;
    }
    await audit({ projectId, actorId: admin.id, action: 'checks.run', detail: { found: hits.length, created } }, db);
    return { found: hits.length, created };
  });
}

export async function listFlags(admin: CurrentUser, projectId: string) {
  requireAdmin(admin);
  return (await pool.query(
    `SELECT f.*, o.name AS offer_name FROM flags f LEFT JOIN offers o ON o.id=f.offer_id WHERE f.project_id=$1
     ORDER BY (f.decision IN ('dismissed','resolved')) NULLS FIRST, CASE f.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, f.created_at`, [projectId])).rows;
}

export const flagDecisionInput = z.object({
  decision: z.enum(['accepted', 'dismissed', 'agenda', 'clarification_requested', 'assumption', 'resolved']),
  reviewerNote: z.string().max(4000).nullable().optional(),
});
export async function decideFlag(admin: CurrentUser, projectId: string, flagId: string, input: z.infer<typeof flagDecisionInput>) {
  requireAdmin(admin);
  return tx(async (db) => {
    const f = (await db.query('UPDATE flags SET decision=$3, reviewer_note=$4, decided_by=$5, decided_at=now() WHERE id=$1 AND project_id=$2 RETURNING *',
      [flagId, projectId, input.decision, input.reviewerNote ?? null, admin.id])).rows[0];
    if (!f) throw notFound();
    if (input.decision === 'clarification_requested') {
      const ref = (f.source_refs as { questionKey: string; offerId: string | null }[]).find((r) => r.questionKey);
      if (!ref) throw new HttpError(400, 'no_question', 'This flag has no linked question to ask about. Add it to the agenda instead.');
      await requestClarification(admin, projectId, { questionKey: ref.questionKey, offerId: ref.offerId, note: f.client_question }, f.id, db);
    }
    await audit({ projectId, actorId: admin.id, action: 'flag.decided', targetType: 'flag', targetId: flagId, detail: { decision: input.decision } }, db);
    return f;
  });
}

export async function listGuidance(admin: CurrentUser) {
  requireAdmin(admin);
  return (await pool.query('SELECT * FROM guidance_entries ORDER BY key')).rows;
}
export const guidanceInput = z.object({
  issue: z.string().trim().min(1).max(500), action: z.string().trim().min(1).max(1000), example: z.string().trim().min(1).max(2000),
  why: z.string().trim().min(1).max(1000), clientQuestion: z.string().trim().min(1).max(1000),
});
export async function updateGuidance(admin: CurrentUser, key: string, input: z.infer<typeof guidanceInput>) {
  requireAdmin(admin);
  if (/[–—]/.test(Object.values(input).join(' '))) throw new HttpError(400, 'em_dash', 'Please remove em and en dashes. Use a period, comma, or parentheses.');
  const r = await pool.query('UPDATE guidance_entries SET issue=$2, action=$3, example=$4, why=$5, client_question=$6, updated_at=now() WHERE key=$1 RETURNING key',
    [key, input.issue, input.action, input.example, input.why, input.clientQuestion]);
  if (!r.rows[0]) throw notFound();
}

// ---- Source approval (checkpoint C, Section 16) -----------------------------
async function approvalBasis(projectId: string, db: Db = pool) {
  const snap = (await db.query(`SELECT id, version, content, created_at FROM source_snapshots WHERE project_id=$1 AND kind='client_intake' ORDER BY version DESC LIMIT 1`, [projectId])).rows[0];
  if (!snap) return null;
  const content = snap.content as Content;
  const coverage = await coverageReport(projectId, content, db);
  const flags = (await db.query(`SELECT id, issue, noticed, decision, offer_id FROM flags WHERE project_id=$1 AND (decision IS NULL OR decision IN ('accepted','agenda','clarification_requested','assumption'))`, [projectId])).rows;
  const assumptions: { id: string; kind: 'coverage' | 'flag'; text: string; offerName: string | null }[] = [];
  for (const sec of coverage) for (const sc of sec.scopes) for (const f of sc.fields) {
    if (!f.important || f.status === 'captured' || f.status === 'not_applicable') continue;
    assumptions.push({ id: `coverage:${f.key}:${sc.offer?.id ?? 'company'}`, kind: 'coverage', offerName: sc.offer?.name ?? null,
      text: `${f.label}: ${f.status.replace('_', ' ')}. ${f.reason}` });
  }
  for (const fl of flags) {
    assumptions.push({ id: `flag:${fl.id}`, kind: 'flag', offerName: content.focusOffers.find((o) => o.id === fl.offer_id)?.name ?? null, text: `${fl.issue} ${fl.noticed}` });
  }
  return { snapshot: { id: snap.id, version: snap.version, createdAt: snap.created_at }, content, coverage, assumptions };
}

export async function getSourceApproval(admin: CurrentUser, projectId: string) {
  requireAdmin(admin);
  const basis = await approvalBasis(projectId);
  const approvals = (await pool.query(
    `SELECT a.id, a.target_version, a.scope, a.accepted_assumptions, a.stale, a.created_at, u.email AS actor_email FROM approvals a JOIN users u ON u.id=a.actor_id
     WHERE a.project_id=$1 AND a.approval_type='admin_source' ORDER BY a.created_at DESC`, [projectId])).rows;
  return { basis, approvals };
}

export const approveSourceInput = z.object({ snapshotVersion: z.number().int().positive(), acceptedAssumptions: z.array(z.string().max(200)).max(500), note: z.string().max(4000).nullable().optional() });
export async function approveSource(admin: CurrentUser, projectId: string, input: z.infer<typeof approveSourceInput>) {
  requireAdmin(admin);
  return tx(async (db) => {
    await db.query('SELECT id FROM projects WHERE id=$1 FOR UPDATE', [projectId]);
    const basis = await approvalBasis(projectId, db);
    if (!basis) throw new HttpError(409, 'no_submission', 'The client has not submitted discovery yet.');
    if (basis.snapshot.version !== input.snapshotVersion) throw new HttpError(409, 'stale_version', 'A newer submission exists. Review the latest version before approving.');
    const accepted = new Set(input.acceptedAssumptions);
    const missing = basis.assumptions.filter((a) => !accepted.has(a.id));
    if (missing.length) throw new HttpError(400, 'assumptions_not_accepted', `Accept or resolve each open assumption first (${missing.length} remaining).`);
    const inScope = (await db.query('SELECT id, name FROM offers WHERE project_id=$1 AND in_scope AND deleted_at IS NULL', [projectId])).rows;
    await db.query(`UPDATE approvals SET stale=true WHERE project_id=$1 AND approval_type='admin_source' AND NOT stale`, [projectId]);
    const a = (await db.query(
      `INSERT INTO approvals(project_id, approval_type, target_type, target_id, target_version, scope, accepted_assumptions, actor_id)
       VALUES ($1,'admin_source','source_snapshot',$2,$3,$4,$5,$6) RETURNING id, created_at`,
      [projectId, basis.snapshot.id, String(basis.snapshot.version), JSON.stringify({ inScopeOffers: inScope, focusOffers: basis.content.focusOffers, note: input.note ?? null }),
        JSON.stringify(basis.assumptions.map((x) => ({ id: x.id, text: x.text, offerName: x.offerName }))), admin.id])).rows[0];
    await db.query(`UPDATE projects SET status='in_review' WHERE id=$1 AND status IN ('discovery','submitted')`, [projectId]);
    await audit({ projectId, actorId: admin.id, action: 'source.approved', targetType: 'source_snapshot', targetId: basis.snapshot.id, detail: { version: basis.snapshot.version, assumptions: basis.assumptions.length } }, db);
    return a;
  });
}

// The approved source a strategy draft must use (Pass 2 generation reads this, never live answers).
export async function approvedSourceForGeneration(projectId: string, db: Db = pool) {
  return (await db.query(
    `SELECT s.id, s.version, s.content, a.id AS approval_id FROM approvals a JOIN source_snapshots s ON s.id=a.target_id
     WHERE a.project_id=$1 AND a.approval_type='admin_source' AND NOT a.stale ORDER BY a.created_at DESC LIMIT 1`, [projectId])).rows[0] ?? null;
}
