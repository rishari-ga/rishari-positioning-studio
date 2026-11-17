// Creates a clearly labeled fictional project and an invitation link for local testing or demos.
//   npm run demo:seed -- reviewer@example.com client@example.com
import crypto from 'node:crypto';
import { pool } from '../db/pool.js';
import { migrate } from '../db/migrate.js';
import { seedContent } from '../seed/seed.js';
import { config } from '../config.js';

async function main() {
  const [adminEmail, clientEmail] = process.argv.slice(2).map((s) => s?.toLowerCase());
  if (!adminEmail || !clientEmail) { console.error('Usage: npm run demo:seed -- admin@example.com client@example.com'); process.exit(1); }
  await migrate();
  await seedContent();
  const admin = (await pool.query('SELECT id FROM users WHERE email=$1 AND is_admin', [adminEmail])).rows[0];
  if (!admin) { console.error('That admin does not exist yet. Run npm run admin:grant first.'); process.exit(1); }
  const p = (await pool.query(
    `INSERT INTO projects(name, company_name, is_fictional, created_by) VALUES ('Fictional demo project','Harbor Lane Fictional Co',true,$1) RETURNING id`, [admin.id])).rows[0];
  await pool.query('INSERT INTO scope_settings(project_id, updated_by) VALUES ($1,$2)', [p.id, admin.id]);
  const token = crypto.randomBytes(24).toString('base64url');
  await pool.query(
    `INSERT INTO invitations(project_id, email, token_hash, created_by, expires_at) VALUES ($1,$2,$3,$4, now() + interval '14 days')`,
    [p.id, clientEmail, crypto.createHash('sha256').update(token).digest('hex'), admin.id]);
  console.log(`Fictional project created: ${p.id}`);
  console.log(`Invitation link for ${clientEmail}: ${config.appUrl}/invite/${token}`);
  await pool.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
