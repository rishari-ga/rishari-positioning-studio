import { z } from 'zod';
import { pool } from '../db/pool.js';
import type { CurrentUser } from '../auth/identity.js';
import { HttpError, notFound } from '../http.js';
import { NOTE_TYPES } from '../../shared/content.js';
import { audit } from './audit.js';
import { requireAdmin } from './permissions.js';

// Review notes stay separate from client answers and are never returned by client routes.
export const noteInput = z.object({
  topicType: z.enum(['project', 'module', 'question', 'offer', 'flag']),
  topicId: z.string().uuid().nullable().optional(),
  noteType: z.enum(NOTE_TYPES),
  body: z.string().trim().min(1).max(20000),
});

export async function listNotes(admin: CurrentUser, projectId: string) {
  requireAdmin(admin);
  return (await pool.query(
    `SELECT n.*, u.email AS author_email, u.display_name AS author_name FROM review_notes n JOIN users u ON u.id=n.author_id
     WHERE n.project_id=$1 ORDER BY n.created_at DESC`, [projectId])).rows;
}

export async function addNote(admin: CurrentUser, projectId: string, input: z.infer<typeof noteInput>) {
  requireAdmin(admin);
  const r = await pool.query(
    `INSERT INTO review_notes(project_id, topic_type, topic_id, note_type, body, author_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [projectId, input.topicType, input.topicId ?? null, input.noteType, input.body, admin.id]);
  await audit({ projectId, actorId: admin.id, action: 'note.added', targetType: 'review_note', targetId: r.rows[0].id });
  return r.rows[0];
}

export async function updateNote(admin: CurrentUser, projectId: string, noteId: string, input: { noteType?: string; body?: string }) {
  requireAdmin(admin);
  const parsed = noteInput.pick({ noteType: true, body: true }).partial().parse(input);
  const r = await pool.query(
    `UPDATE review_notes SET note_type=COALESCE($3,note_type), body=COALESCE($4,body), updated_at=now()
     WHERE id=$1 AND project_id=$2 RETURNING *`, [noteId, projectId, parsed.noteType ?? null, parsed.body ?? null]);
  if (!r.rows[0]) throw notFound();
  return r.rows[0];
}

export async function setOfferScope(admin: CurrentUser, projectId: string, offerId: string, inScope: boolean) {
  requireAdmin(admin);
  const r = await pool.query(
    `UPDATE offers SET in_scope=$3, scope_set_by=$4, scope_set_at=now() WHERE id=$1 AND project_id=$2 AND deleted_at IS NULL RETURNING id, in_scope`,
    [offerId, projectId, inScope, admin.id]);
  if (!r.rows[0]) throw notFound();
  await audit({ projectId, actorId: admin.id, action: 'offer.scope_set', targetType: 'offer', targetId: offerId, detail: { inScope } });
  return r.rows[0];
}

export async function adminOffers(admin: CurrentUser, projectId: string) {
  requireAdmin(admin);
  return (await pool.query('SELECT * FROM offers WHERE project_id=$1 AND deleted_at IS NULL ORDER BY sort_order, created_at', [projectId])).rows;
}

export async function answerHistory(admin: CurrentUser, projectId: string, questionId: string) {
  requireAdmin(admin);
  return (await pool.query(
    `SELECT r.revision, r.value, r.status, r.context_note, r.created_at FROM answer_revisions r JOIN answers a ON a.id=r.answer_id
     WHERE a.project_id=$1 AND a.question_id=$2 ORDER BY r.revision DESC`, [projectId, questionId])).rows;
}

export async function getSnapshot(admin: CurrentUser, projectId: string, version: number) {
  requireAdmin(admin);
  const s = (await pool.query('SELECT * FROM source_snapshots WHERE project_id=$1 AND version=$2', [projectId, version])).rows[0];
  if (!s) throw notFound();
  return s;
}

export async function activity(admin: CurrentUser, projectId: string) {
  requireAdmin(admin);
  return (await pool.query(
    `SELECT e.action, e.target_type, e.detail, e.created_at, u.email AS actor_email FROM audit_events e LEFT JOIN users u ON u.id=e.actor_id
     WHERE e.project_id=$1 ORDER BY e.created_at DESC LIMIT 200`, [projectId])).rows;
}

// Data-use page (Section 8)
const dataUseInput = z.object({
  sections: z.array(z.object({ heading: z.string().trim().min(1).max(200), body: z.string().max(20000) })).min(1).max(20),
  reviewed: z.boolean(),
});

export async function getDataUse() {
  return (await pool.query("SELECT value, updated_at FROM site_settings WHERE key='data_use'")).rows[0] ?? { value: { reviewed: false, sections: [] } };
}

export async function saveDataUse(admin: CurrentUser, input: unknown) {
  requireAdmin(admin);
  const v = dataUseInput.parse(input);
  if (v.reviewed && v.sections.some((s) => /to be completed/i.test(s.body))) {
    throw new HttpError(400, 'placeholders_remaining', 'Replace every placeholder before marking this page as reviewed.');
  }
  await pool.query(
    `INSERT INTO site_settings(key, value, updated_by, updated_at) VALUES ('data_use',$1,$2,now())
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()`,
    [JSON.stringify(v), admin.id]);
  await audit({ actorId: admin.id, action: 'data_use.saved', detail: { reviewed: v.reviewed } });
}
