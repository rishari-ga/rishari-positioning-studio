import { pool } from '../db/pool.js';
import { MODULES, DATA_USE_DEFAULT } from './questions.js';
import type { Db } from '../db/pool.js';

// Inserts seed content only where it does not already exist, so admin edits are never overwritten.
export async function seedContent(db: Db = pool): Promise<void> {
  for (const [mi, m] of MODULES.entries()) {
    const mod = await db.query(
      `INSERT INTO question_modules(key, position, title, why, opening) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (key) DO NOTHING RETURNING id`,
      [m.key, mi + 1, m.title, m.why, m.opening ?? null],
    );
    const moduleId = mod.rows[0]?.id ?? (await db.query('SELECT id FROM question_modules WHERE key=$1', [m.key])).rows[0].id;
    for (const [qi, q] of m.questions.entries()) {
      const ins = await db.query(
        `INSERT INTO questions(module_id, key, position) VALUES ($1,$2,$3) ON CONFLICT (key) DO NOTHING RETURNING id`,
        [moduleId, q.key, qi + 1],
      );
      if (!ins.rows[0]) continue;
      await db.query(
        `INSERT INTO question_versions(question_id, version, kind, input_type, prompt, help_text, thinking_prompts, options, allow_not_sure)
         VALUES ($1,1,$2,$3,$4,$5,$6,$7,$8)`,
        [ins.rows[0].id, q.kind, q.input, q.prompt, q.help ?? null, JSON.stringify(q.thinking ?? []), JSON.stringify(q.options ?? []), q.allowNotSure ?? true],
      );
    }
  }
  await db.query(
    `INSERT INTO site_settings(key, value) VALUES ('data_use', $1) ON CONFLICT (key) DO NOTHING`,
    [JSON.stringify(DATA_USE_DEFAULT)],
  );
}
