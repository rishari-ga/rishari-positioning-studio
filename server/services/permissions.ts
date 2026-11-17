import type { CurrentUser } from '../auth/identity.js';
import type { Db } from '../db/pool.js';
import { pool } from '../db/pool.js';
import { forbidden, notFound } from '../http.js';

// All authorization decisions come from the database, never from the browser.

export function requireAdmin(user: CurrentUser): void {
  if (!user.isAdmin) throw forbidden();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ProjectAccess = { projectId: string; asAdmin: boolean; role: string | null };

// Clients get 404 (not 403) for projects they are not members of, so project IDs cannot be probed.
export async function requireProjectAccess(user: CurrentUser, projectId: string, db: Db = pool): Promise<ProjectAccess> {
  if (!UUID.test(projectId)) throw notFound();
  const p = await db.query('SELECT id FROM projects WHERE id=$1', [projectId]);
  if (!p.rows[0]) throw notFound();
  if (user.isAdmin) return { projectId, asAdmin: true, role: null };
  const m = await db.query('SELECT role FROM project_memberships WHERE project_id=$1 AND user_id=$2', [projectId, user.id]);
  if (!m.rows[0]) throw notFound();
  return { projectId, asAdmin: false, role: m.rows[0].role };
}

// For client-only actions (answering, acknowledging, submitting). Admins act through admin routes.
export async function requireClientMember(user: CurrentUser, projectId: string, db: Db = pool): Promise<ProjectAccess> {
  const a = await requireProjectAccess(user, projectId, db);
  if (a.asAdmin) throw forbidden();
  return a;
}

export function assertUuid(id: string): void {
  if (!UUID.test(id)) throw notFound();
}
