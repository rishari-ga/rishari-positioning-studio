import { pool } from '../db/pool.js';
import { ALL_MODULES, MODULES, RETIRED_MODULES, RETIRED_QUESTIONS, DATA_USE_DEFAULT } from './questions.js';
import type { SeedQuestion } from './questions.js';
import { GUIDANCE } from './guidance.js';
import type { Db } from '../db/pool.js';

function versionValues(questionId: string, version: number, q: SeedQuestion) {
  return [
    questionId, version, q.kind, q.input, q.prompt, q.help ?? null, JSON.stringify(q.thinking ?? []), JSON.stringify(q.options ?? []),
    q.allowNotSure ?? true, q.perOffer ?? false, q.plannedPrompt ?? null, q.probeOf ?? null, q.field ?? null,
    q.evidence ?? false, q.allowNA ?? false, q.reuseFrom ?? [], q.probeAlways ?? false, q.naLabel ?? null,
    q.perPersona ?? false, q.heading ?? null, q.part ?? null,
  ];
}
const INSERT_VERSION = `INSERT INTO question_versions(question_id, version, kind, input_type, prompt, help_text, thinking_prompts, options,
  allow_not_sure, per_offer, planned_prompt, probe_of, narrative_field, asks_evidence, allow_not_applicable, reuse_from, probe_always, na_label,
  per_persona, heading_template, part_label, from_seed)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,true)`;

// Adds seed content where it does not exist yet, and applies seed revisions only to content a reviewer
// has not edited. Old question versions stay in place; existing answers keep the version they were given against.
// Retired chapters and questions are switched off, never deleted, so their answers remain available.
export async function seedContent(db: Db = pool): Promise<void> {
  const activeOrder = MODULES.map((m) => m.key);
  for (const m of ALL_MODULES) {
    const position = activeOrder.includes(m.key) ? activeOrder.indexOf(m.key) + 1 : 100 + RETIRED_MODULES.indexOf(m.key);
    const active = !RETIRED_MODULES.includes(m.key);
    const revision = m.revision ?? 1;
    const existing = (await db.query('SELECT id, seed_revision, edited_by_admin FROM question_modules WHERE key=$1', [m.key])).rows[0];
    let moduleId: string;
    if (!existing) {
      moduleId = (await db.query(
        `INSERT INTO question_modules(key, position, title, why, opening, active, seed_revision) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [m.key, position, m.title, m.why, m.opening ?? null, active, revision])).rows[0].id;
    } else {
      moduleId = existing.id;
      await db.query('UPDATE question_modules SET position=$2, active=$3 WHERE id=$1', [moduleId, position, active]);
      if (revision > existing.seed_revision && !existing.edited_by_admin) {
        await db.query('UPDATE question_modules SET title=$2, why=$3, opening=$4, seed_revision=$5, updated_at=now() WHERE id=$1',
          [moduleId, m.title, m.why, m.opening ?? null, revision]);
      }
    }
    for (const [qi, q] of m.questions.entries()) {
      const revision = q.revision ?? 1;
      const existingQ = (await db.query(
        `SELECT q.id, q.current_version, q.seed_revision, qv.from_seed FROM questions q
         JOIN question_versions qv ON qv.question_id=q.id AND qv.version=q.current_version WHERE q.key=$1`, [q.key])).rows[0];
      if (!existingQ) {
        const ins = await db.query(
          `INSERT INTO questions(module_id, key, position, seed_revision, active) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [moduleId, q.key, qi + 1, revision, !RETIRED_QUESTIONS.includes(q.key)]);
        await db.query(INSERT_VERSION, versionValues(ins.rows[0].id, 1, q));
        continue;
      }
      // Keep seeded order current as questions are interleaved.
      await db.query('UPDATE questions SET position=$2 WHERE id=$1', [existingQ.id, qi + 1]);
      if (revision > existingQ.seed_revision && existingQ.from_seed) {
        const next = existingQ.current_version + 1;
        await db.query(INSERT_VERSION, versionValues(existingQ.id, next, q));
        await db.query('UPDATE questions SET current_version=$2, seed_revision=$3 WHERE id=$1', [existingQ.id, next, revision]);
      }
    }
  }
  if (RETIRED_QUESTIONS.length) await db.query('UPDATE questions SET active=false WHERE key = ANY($1) AND active', [RETIRED_QUESTIONS]);
  for (const g of GUIDANCE) {
    await db.query(
      `INSERT INTO guidance_entries(key, issue, action, example, why, client_question) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (key) DO NOTHING`,
      [g.key, g.issue, g.action, g.example, g.why, g.clientQuestion],
    );
  }
  // The data-use page is seeded once. A reviewer's saved version is never overwritten.
  await db.query(
    `INSERT INTO site_settings(key, value) VALUES ('data_use', $1) ON CONFLICT (key) DO NOTHING`,
    [JSON.stringify(DATA_USE_DEFAULT)],
  );
  // Refresh the default draft only if nobody has saved the page yet.
  await db.query(
    `UPDATE site_settings SET value=$1 WHERE key='data_use' AND updated_by IS NULL AND value <> $1::jsonb`,
    [JSON.stringify(DATA_USE_DEFAULT)],
  );
}
