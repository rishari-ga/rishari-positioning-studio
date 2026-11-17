import { pool } from '../db/pool.js';
import { MODULES, DATA_USE_DEFAULT } from './questions.js';
import type { SeedQuestion } from './questions.js';
import { GUIDANCE } from './guidance.js';
import type { Db } from '../db/pool.js';

function versionValues(questionId: string, version: number, q: SeedQuestion) {
  return [
    questionId, version, q.kind, q.input, q.prompt, q.help ?? null, JSON.stringify(q.thinking ?? []), JSON.stringify(q.options ?? []),
    q.allowNotSure ?? true, q.perOffer ?? false, q.plannedPrompt ?? null, q.probeOf ?? null, q.field ?? null,
    q.evidence ?? false, q.allowNA ?? false, q.reuseFrom ?? [], q.probeAlways ?? false, q.naLabel ?? null,
  ];
}
const INSERT_VERSION = `INSERT INTO question_versions(question_id, version, kind, input_type, prompt, help_text, thinking_prompts, options,
  allow_not_sure, per_offer, planned_prompt, probe_of, narrative_field, asks_evidence, allow_not_applicable, reuse_from, probe_always, na_label, from_seed)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,true)`;

// Adds seed content where it does not exist yet. A question whose seed revision increases gets a new
// version only if its current version still came from the seed, so reviewer edits are never overwritten.
// Old versions stay in place, and existing answers keep the version they were given against.
export async function seedContent(db: Db = pool): Promise<void> {
  for (const [mi, m] of MODULES.entries()) {
    const mod = await db.query(
      `INSERT INTO question_modules(key, position, title, why, opening) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (key) DO NOTHING RETURNING id`,
      [m.key, mi + 1, m.title, m.why, m.opening ?? null],
    );
    const moduleId = mod.rows[0]?.id ?? (await db.query('SELECT id FROM question_modules WHERE key=$1', [m.key])).rows[0].id;
    for (const [qi, q] of m.questions.entries()) {
      const revision = q.revision ?? 1;
      const existing = (await db.query(
        `SELECT q.id, q.current_version, q.seed_revision, qv.from_seed FROM questions q
         JOIN question_versions qv ON qv.question_id=q.id AND qv.version=q.current_version WHERE q.key=$1`, [q.key])).rows[0];
      if (!existing) {
        const ins = await db.query(
          `INSERT INTO questions(module_id, key, position, seed_revision) VALUES ($1,$2,$3,$4) RETURNING id`,
          [moduleId, q.key, qi + 1, revision]);
        await db.query(INSERT_VERSION, versionValues(ins.rows[0].id, 1, q));
        continue;
      }
      // Keep seeded order current as new questions are interleaved.
      await db.query('UPDATE questions SET position=$2 WHERE id=$1', [existing.id, qi + 1]);
      if (revision > existing.seed_revision && existing.from_seed) {
        const next = existing.current_version + 1;
        await db.query(INSERT_VERSION, versionValues(existing.id, next, q));
        await db.query('UPDATE questions SET current_version=$2, seed_revision=$3 WHERE id=$1', [existing.id, next, revision]);
      }
    }
  }
  for (const g of GUIDANCE) {
    await db.query(
      `INSERT INTO guidance_entries(key, issue, action, example, why, client_question) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (key) DO NOTHING`,
      [g.key, g.issue, g.action, g.example, g.why, g.clientQuestion],
    );
  }
  await db.query(
    `INSERT INTO site_settings(key, value) VALUES ('data_use', $1) ON CONFLICT (key) DO NOTHING`,
    [JSON.stringify(DATA_USE_DEFAULT)],
  );
}
