// Provisions a Rishari admin. Run on the server only (Render Shell or locally):
//   npm run admin:grant -- someone@rishari.com
//   npm run admin:revoke -- someone@rishari.com
// The person then signs in with that exact email (verified in Clerk) and is linked automatically.
import { pool } from '../db/pool.js';
import { migrate } from '../db/migrate.js';
import { audit } from '../services/audit.js';

async function main() {
  const [mode, raw] = [process.argv[2], process.argv[3]];
  const email = raw?.toLowerCase().trim();
  if (!['grant', 'revoke'].includes(mode) || !email || !email.includes('@')) {
    console.error('Usage: tsx server/scripts/grant-admin.ts grant|revoke email@example.com');
    process.exit(1);
  }
  await migrate();
  const isAdmin = mode === 'grant';
  const r = await pool.query(
    `INSERT INTO users(email, is_admin) VALUES ($1,$2)
     ON CONFLICT (email) DO UPDATE SET is_admin=EXCLUDED.is_admin RETURNING id`,
    [email, isAdmin],
  );
  if (isAdmin) {
    const member = await pool.query('SELECT 1 FROM project_memberships WHERE user_id=$1', [r.rows[0].id]);
    if (member.rows[0]) console.warn('Warning: this user is also a client member of a project. Use a separate email for admin work.');
  }
  await audit({ actorId: null, action: isAdmin ? 'admin.granted' : 'admin.revoked', targetType: 'user', targetId: r.rows[0].id, detail: { via: 'cli' } });
  console.log(`${isAdmin ? 'Granted' : 'Revoked'} admin for ${email}`);
  await pool.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
