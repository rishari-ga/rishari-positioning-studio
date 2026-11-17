import crypto from 'node:crypto';
import { pool, tx } from '../db/pool.js';
import type { CurrentUser } from '../auth/identity.js';
import { HttpError, notFound } from '../http.js';
import { audit } from './audit.js';
import { requireAdmin } from './permissions.js';
import { storage } from '../storage/adapter.js';

const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

export async function createProject(admin: CurrentUser, input: { name: string; companyName?: string; isFictional?: boolean }) {
  requireAdmin(admin);
  return tx(async (c) => {
    const p = await c.query(
      'INSERT INTO projects(name, company_name, is_fictional, created_by) VALUES ($1,$2,$3,$4) RETURNING *',
      [input.name, input.companyName ?? null, input.isFictional ?? false, admin.id],
    );
    await c.query('INSERT INTO scope_settings(project_id, updated_by) VALUES ($1,$2)', [p.rows[0].id, admin.id]);
    await audit({ projectId: p.rows[0].id, actorId: admin.id, action: 'project.created' }, c);
    return p.rows[0];
  });
}

export async function listProjectsForAdmin(admin: CurrentUser) {
  requireAdmin(admin);
  const r = await pool.query(`
    SELECT p.*, u.email AS client_email,
      (SELECT count(*) FROM answers a WHERE a.project_id=p.id AND a.status <> 'empty')::int AS answer_count,
      (SELECT max(version) FROM source_snapshots s WHERE s.project_id=p.id AND s.kind='client_intake') AS submitted_version,
      (SELECT max(last_active_at) FROM project_memberships mm WHERE mm.project_id=p.id) AS last_active_at,
      (SELECT count(*) FROM questions q JOIN question_versions qv ON qv.question_id=q.id AND qv.version=q.current_version
         JOIN question_modules qm ON qm.id=q.module_id WHERE q.active AND qm.active AND qv.kind='core' AND NOT qv.per_offer AND NOT qv.per_persona)::int AS core_total,
      (SELECT count(*) FROM answers a JOIN questions q ON q.id=a.question_id JOIN question_versions qv ON qv.question_id=q.id AND qv.version=q.current_version
         JOIN question_modules qm ON qm.id=q.module_id WHERE a.project_id=p.id AND a.status <> 'empty' AND q.active AND qm.active AND qv.kind='core' AND NOT qv.per_offer AND NOT qv.per_persona)::int AS core_answered,
      (SELECT count(*) FROM flags f WHERE f.project_id=p.id AND (f.decision IS NULL OR f.decision NOT IN ('dismissed','resolved')))::int AS open_flags,
      CASE
        WHEN EXISTS (SELECT 1 FROM strategy_versions v WHERE v.project_id=p.id) THEN 'Framework drafted'
        WHEN EXISTS (SELECT 1 FROM approvals a WHERE a.project_id=p.id AND a.approval_type='admin_direction' AND NOT a.stale) THEN 'Direction approved'
        WHEN EXISTS (SELECT 1 FROM approvals a WHERE a.project_id=p.id AND a.approval_type='admin_source' AND NOT a.stale) THEN 'Source approved'
        WHEN EXISTS (SELECT 1 FROM source_snapshots s WHERE s.project_id=p.id) THEN 'Submitted'
        WHEN EXISTS (SELECT 1 FROM acknowledgments k WHERE k.project_id=p.id) THEN 'In discovery'
        WHEN EXISTS (SELECT 1 FROM invitations i WHERE i.project_id=p.id) THEN 'Invited'
        ELSE 'Not started' END AS stage
    FROM projects p
    LEFT JOIN project_memberships m ON m.project_id=p.id AND m.role='client_primary'
    LEFT JOIN users u ON u.id=m.user_id
    ORDER BY p.created_at DESC`);
  return r.rows;
}

export async function listProjectsForClient(user: CurrentUser) {
  const r = await pool.query(
    `SELECT p.id, p.name, p.company_name, p.status FROM projects p
     JOIN project_memberships m ON m.project_id=p.id WHERE m.user_id=$1 ORDER BY p.created_at DESC`,
    [user.id],
  );
  return r.rows;
}

// Creates an invitation link. Nothing is emailed: the admin shares the link themselves.
export async function createInvitation(admin: CurrentUser, projectId: string, email: string) {
  requireAdmin(admin);
  const token = crypto.randomBytes(24).toString('base64url');
  const r = await tx(async (c) => {
    const existing = await c.query("SELECT 1 FROM project_memberships WHERE project_id=$1 AND role='client_primary'", [projectId]);
    if (existing.rows[0]) throw new HttpError(409, 'already_has_client', 'This project already has a primary client.');
    await c.query('UPDATE invitations SET revoked_at=now() WHERE project_id=$1 AND accepted_at IS NULL AND revoked_at IS NULL', [projectId]);
    const inv = await c.query(
      `INSERT INTO invitations(project_id, email, token_hash, created_by, expires_at)
       VALUES ($1,$2,$3,$4, now() + interval '14 days') RETURNING id, email, expires_at`,
      [projectId, email.toLowerCase().trim(), hashToken(token), admin.id],
    );
    await audit({ projectId, actorId: admin.id, action: 'invitation.created', targetType: 'invitation', targetId: inv.rows[0].id }, c);
    return inv.rows[0];
  });
  return { ...r, token };
}

// The invited person must sign in with the same verified email the invitation was created for.
export async function acceptInvitation(user: CurrentUser, token: string) {
  return tx(async (c) => {
    const inv = (await c.query('SELECT * FROM invitations WHERE token_hash=$1 FOR UPDATE', [hashToken(token)])).rows[0];
    if (!inv || inv.revoked_at || new Date(inv.expires_at) < new Date()) throw new HttpError(404, 'invitation_invalid', 'This invitation link is no longer valid. Ask Rishari for a new one.');
    if (inv.accepted_at) {
      if (inv.accepted_by === user.id) return { projectId: inv.project_id };
      throw new HttpError(404, 'invitation_invalid', 'This invitation link has already been used.');
    }
    if (inv.email !== user.email) throw new HttpError(403, 'email_mismatch', 'Please sign in with the email address this invitation was sent to.');
    if (user.isAdmin) throw new HttpError(400, 'admin_cannot_accept', 'Admins cannot accept client invitations.');
    await c.query('INSERT INTO project_memberships(project_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [inv.project_id, user.id, inv.role]);
    await c.query('UPDATE invitations SET accepted_at=now(), accepted_by=$2 WHERE id=$1', [inv.id, user.id]);
    await audit({ projectId: inv.project_id, actorId: user.id, action: 'invitation.accepted', targetType: 'invitation', targetId: inv.id }, c);
    return { projectId: inv.project_id };
  });
}

export async function getProjectOverview(projectId: string) {
  const p = (await pool.query('SELECT * FROM projects WHERE id=$1', [projectId])).rows[0];
  if (!p) throw notFound();
  const client = (await pool.query(
    `SELECT u.id, u.email, u.display_name FROM project_memberships m JOIN users u ON u.id=m.user_id
     WHERE m.project_id=$1 AND m.role='client_primary'`, [projectId])).rows[0] ?? null;
  const invitation = (await pool.query(
    `SELECT id, email, expires_at, accepted_at FROM invitations WHERE project_id=$1 AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    [projectId])).rows[0] ?? null;
  const scope = (await pool.query('SELECT * FROM scope_settings WHERE project_id=$1', [projectId])).rows[0];
  const ack = (await pool.query('SELECT ack_version, created_at FROM acknowledgments WHERE project_id=$1 ORDER BY created_at DESC LIMIT 1', [projectId])).rows[0] ?? null;
  const snapshots = (await pool.query(
    `SELECT id, version, kind, content_hash, created_at FROM source_snapshots WHERE project_id=$1 ORDER BY version DESC`, [projectId])).rows;
  return { project: p, client, invitation, scope, acknowledgment: ack, snapshots };
}

// Records that a client is working in a project. Throttled to one write a minute per person,
// and only ever touches the caller's own membership row.
export async function touchActivity(userId: string, projectId: string) {
  await pool.query(
    `UPDATE project_memberships SET last_active_at=now()
     WHERE project_id=$1 AND user_id=$2 AND (last_active_at IS NULL OR last_active_at < now() - interval '1 minute')`,
    [projectId, userId],
  );
}

// Permanently deletes a project: answers, personas, uploads (including the files), notes, flags,
// snapshots, approvals, and generated drafts. The caller must type the project's name to confirm.
// Client sign-in records that belong to no other project are anonymized. Audit events keep only
// the fact that a deletion happened.
export async function deleteProject(admin: CurrentUser, projectId: string, confirmName: unknown) {
  requireAdmin(admin);
  const p = (await pool.query('SELECT id, name, company_name, is_fictional FROM projects WHERE id=$1', [projectId])).rows[0];
  if (!p) throw new HttpError(404, 'not_found', 'Not found.');
  const label = (p.company_name || p.name) as string;
  if (typeof confirmName !== 'string' || confirmName.trim() !== label.trim()) {
    throw new HttpError(400, 'confirm_mismatch', `Type the project name exactly to confirm: ${label}`);
  }
  const keys = (await pool.query('SELECT storage_key FROM attachments WHERE project_id=$1', [projectId])).rows.map((r) => r.storage_key as string);
  const clients = (await pool.query(
    `SELECT m.user_id FROM project_memberships m JOIN users u ON u.id=m.user_id
     WHERE m.project_id=$1 AND NOT u.is_admin
       AND NOT EXISTS (SELECT 1 FROM project_memberships o WHERE o.user_id=m.user_id AND o.project_id<>$1)`,
    [projectId],
  )).rows.map((r) => r.user_id as string);
  await tx(async (c) => {
    await c.query('DELETE FROM projects WHERE id=$1', [projectId]);
    for (const id of clients) {
      await c.query(
        `UPDATE users SET email = 'deleted-' || id || '@deleted.invalid', display_name = NULL, auth_subject = NULL WHERE id=$1`,
        [id],
      );
    }
  });
  // Files go after the records, so a storage hiccup can never leave records pointing at missing files.
  let fileErrors = 0;
  for (const k of keys) { try { await storage.remove(k); } catch { fileErrors++; } }
  await audit({ actorId: admin.id, action: 'project.deleted', targetType: 'project', targetId: projectId, detail: { fictional: p.is_fictional, files: keys.length, fileErrors, anonymizedUsers: clients.length } });
  return { deleted: true, files: keys.length, fileErrors, anonymizedUsers: clients.length };
}

// Everything the admin Overview needs in one call: progress, coverage, open flags, activity, AI spend, and stage.
export async function projectDashboard(admin: CurrentUser, projectId: string) {
  requireAdmin(admin);
  const p = (await pool.query('SELECT id FROM projects WHERE id=$1', [projectId])).rows[0];
  if (!p) throw notFound();
  const { buildIntakeContent, loadQuestionnaire } = await import('./intake.js');
  const { coverageReport, approvedSourceForGeneration } = await import('./narrative.js');
  const { usage } = await import('../ai/run.js');
  const content = await buildIntakeContent(projectId, pool);
  const coreKeys = new Set((await loadQuestionnaire()).flatMap((m) => m.questions).filter((q) => q.kind === 'core').map((q) => q.key as string));
  // Same basis as the projects list: company-level core questions.
  const core = content.modules.flatMap((m) => m.answers).filter((e) => coreKeys.has(e.questionKey) && !e.offerId && !e.personaId);
  const answered = core.filter((e) => e.status !== 'empty').length;
  const cov = await coverageReport(projectId, content as never);
  const important = cov.flatMap((s) => s.scopes.flatMap((sc) => sc.fields)).filter((f) => f.important);
  const captured = important.filter((f) => f.status === 'captured' || f.status === 'not_applicable').length;
  const flags = (await pool.query(
    `SELECT priority, count(*)::int AS n FROM flags WHERE project_id=$1 AND (decision IS NULL OR decision NOT IN ('dismissed','resolved')) GROUP BY priority`, [projectId])).rows;
  const at = async (sql: string) => ((await pool.query(sql, [projectId])).rows[0]?.t as string | null) ?? null;
  const stages = [
    { key: 'invited', label: 'Client invited', at: await at(`SELECT min(created_at) AS t FROM invitations WHERE project_id=$1`) },
    { key: 'started', label: 'Discovery started', at: await at(`SELECT min(created_at) AS t FROM acknowledgments WHERE project_id=$1`) },
    { key: 'submitted', label: 'Submitted', at: await at(`SELECT max(created_at) AS t FROM source_snapshots WHERE project_id=$1 AND kind='client_intake'`) },
    { key: 'source', label: 'Source approved', at: (await approvedSourceForGeneration(projectId)) ? await at(`SELECT max(created_at) AS t FROM approvals WHERE project_id=$1 AND approval_type='admin_source' AND NOT stale`) : null },
    { key: 'direction', label: 'Direction approved', at: await at(`SELECT max(created_at) AS t FROM approvals WHERE project_id=$1 AND approval_type='admin_direction' AND NOT stale`) },
    { key: 'draft', label: 'Framework drafted', at: await at(`SELECT max(created_at) AS t FROM strategy_versions WHERE project_id=$1`) },
  ];
  const lastActive = await at(`SELECT max(last_active_at) AS t FROM project_memberships WHERE project_id=$1`);
  const u = await usage(projectId);
  return {
    completion: { answered, total: core.length, pct: core.length ? Math.round((answered / core.length) * 100) : 0 },
    coverage: { captured, total: important.length, pct: important.length ? Math.round((captured / important.length) * 100) : 0 },
    flags: { high: flags.find((f) => f.priority === 'high')?.n ?? 0, medium: flags.find((f) => f.priority === 'medium')?.n ?? 0, low: flags.find((f) => f.priority === 'low')?.n ?? 0 },
    lastActive,
    ai: { cents: u.projectCents, capCents: u.projectCapCents },
    stages,
  };
}
