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
      (SELECT max(last_active_at) FROM project_memberships mm WHERE mm.project_id=p.id) AS last_active_at
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
