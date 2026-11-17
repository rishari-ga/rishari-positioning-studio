import type { Db } from '../db/pool.js';
import { pool } from '../db/pool.js';

// Audit details must contain identifiers and metadata only, never client content or secrets.
export async function audit(
  e: { projectId?: string | null; actorId?: string | null; action: string; targetType?: string; targetId?: string; detail?: Record<string, unknown> },
  db: Db = pool,
): Promise<void> {
  await db.query(
    'INSERT INTO audit_events(project_id, actor_id, action, target_type, target_id, detail) VALUES ($1,$2,$3,$4,$5,$6)',
    [e.projectId ?? null, e.actorId ?? null, e.action, e.targetType ?? null, e.targetId ?? null, JSON.stringify(e.detail ?? {})],
  );
}
