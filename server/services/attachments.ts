import crypto from 'node:crypto';
import { pool } from '../db/pool.js';
import type { CurrentUser } from '../auth/identity.js';
import { HttpError, notFound } from '../http.js';
import { storage } from '../storage/adapter.js';
import { config } from '../config.js';
import { audit } from './audit.js';

// PDF, DOCX and TXT only. Type is checked from the file's own bytes, not just its name.
function detectType(name: string, buf: Buffer): { mime: string; ext: string } | null {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf' && buf.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext };
  if (ext === 'docx' && buf[0] === 0x50 && buf[1] === 0x4b && buf.includes(Buffer.from('word/'))) {
    return { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext };
  }
  if (ext === 'txt') {
    if (buf.includes(0)) return null;
    try { new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return null; }
    return { mime: 'text/plain', ext };
  }
  return null;
}

export async function uploadAttachment(user: CurrentUser, projectId: string, file: { originalname: string; buffer: Buffer; size: number }, moduleKey: string | null) {
  if (file.size > config.uploads.maxBytes) throw new HttpError(413, 'file_too_large', 'That file is larger than the upload limit.');
  const t = detectType(file.originalname, file.buffer);
  if (!t) throw new HttpError(415, 'unsupported_file', 'Only PDF, DOCX, and TXT files can be uploaded.');
  const moduleId = moduleKey ? (await pool.query('SELECT id FROM question_modules WHERE key=$1', [moduleKey])).rows[0]?.id ?? null : null;
  const safeName = file.originalname.replace(/[^\w.\- ]+/g, '_').slice(0, 150);
  const key = `projects/${projectId}/${crypto.randomUUID()}.${t.ext}`;
  await storage.put(key, file.buffer, t.mime);
  const r = await pool.query(
    `INSERT INTO attachments(project_id, module_id, storage_key, original_name, mime_type, size_bytes, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, module_id, original_name, mime_type, size_bytes, created_at`,
    [projectId, moduleId, key, safeName, t.mime, file.size, user.id]);
  await audit({ projectId, actorId: user.id, action: 'attachment.uploaded', targetType: 'attachment', targetId: r.rows[0].id, detail: { size: file.size, mime: t.mime } });
  return r.rows[0];
}

export async function deleteAttachment(user: CurrentUser, projectId: string, id: string) {
  const r = await pool.query('UPDATE attachments SET deleted_at=now() WHERE id=$1 AND project_id=$2 AND deleted_at IS NULL RETURNING storage_key', [id, projectId]);
  if (!r.rows[0]) throw notFound();
  await storage.remove(r.rows[0].storage_key);
  await audit({ projectId, actorId: user.id, action: 'attachment.deleted', targetType: 'attachment', targetId: id });
}

// Short-lived signed link, issued only after the caller passed a project access check.
const TTL_SECONDS = 300;
const sign = (payload: string) => crypto.createHmac('sha256', config.downloadSecret).update(payload).digest('base64url');

export async function createDownloadLink(user: CurrentUser, projectId: string, id: string) {
  const a = (await pool.query('SELECT id FROM attachments WHERE id=$1 AND project_id=$2 AND deleted_at IS NULL', [id, projectId])).rows[0];
  if (!a) throw notFound();
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = `${id}.${user.id}.${exp}`;
  return { url: `/api/files/${id}?u=${user.id}&exp=${exp}&sig=${sign(payload)}`, expiresInSeconds: TTL_SECONDS };
}

export async function readSignedDownload(user: CurrentUser, id: string, q: { u?: string; exp?: string; sig?: string }) {
  const exp = Number(q.exp);
  if (!q.sig || !q.u || !exp || exp < Date.now() / 1000) throw new HttpError(410, 'link_expired', 'This download link has expired.');
  // The link is bound to the signed-in user who requested it.
  if (q.u !== user.id) throw notFound();
  const expected = sign(`${id}.${q.u}.${exp}`);
  if (expected.length !== q.sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(q.sig))) throw notFound();
  const a = (await pool.query('SELECT * FROM attachments WHERE id=$1 AND deleted_at IS NULL', [id])).rows[0];
  if (!a) throw notFound();
  return { meta: a, body: await storage.get(a.storage_key) };
}
