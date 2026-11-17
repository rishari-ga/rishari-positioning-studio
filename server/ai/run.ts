import crypto from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { HttpError } from '../http.js';
import { audit } from '../services/audit.js';
import { getProvider } from './provider.js';
import { composeInstructions, RISHARI_WRITING_STANDARD, RISHARI_WRITING_STANDARD_VERSION } from './standard.js';
import { checkOutput, fixDashes, unverifiedQuotes, type QualityIssue } from './quality.js';

// A versioned prompt. Change `body`, bump `version`; jobs record the version they used.
export type PromptDef = { key: string; version: number; tier: 'intake' | 'strategy'; effort: 'none' | 'low' | 'medium' | 'high'; maxOutputTokens: number; body: string };

export const fingerprint = (v: unknown) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 32);

export function aiStatus() {
  return { enabled: config.ai.enabled && !!getProvider(), intakeModel: config.ai.intakeModel, strategyModel: config.ai.strategyModel };
}

async function promptVersionId(p: PromptDef): Promise<string> {
  // The stored body includes the writing standard, so the record shows exactly what the model saw.
  const body = `${RISHARI_WRITING_STANDARD}\n\n---\n${p.body}`;
  const r = await pool.query(
    `INSERT INTO prompt_versions(key, version, body) VALUES ($1,$2,$3)
     ON CONFLICT (key, version) DO UPDATE SET key=EXCLUDED.key RETURNING id, body`,
    [p.key, p.version, body],
  );
  if (r.rows[0].body !== body) throw new Error(`Prompt ${p.key} v${p.version} changed without a version bump.`);
  return r.rows[0].id;
}

export async function usage(projectId: string | null) {
  const q = await pool.query(
    `SELECT coalesce(sum(cost_cents),0)::int AS total,
            coalesce(sum(cost_cents) FILTER (WHERE project_id=$1),0)::int AS project,
            count(*) FILTER (WHERE project_id=$1)::int AS project_jobs
     FROM generation_jobs WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AND status IN ('succeeded','failed','running')`,
    [projectId],
  );
  const row = q.rows[0];
  return { projectCents: row.project, projectJobs: row.project_jobs, totalCents: row.total, projectCapCents: config.ai.projectMonthlyCapCents, totalCapCents: config.ai.totalMonthlyCapCents };
}

function costCents(model: string, input: number | null, output: number | null): number | null {
  const base = Object.keys(config.ai.prices).find((k) => model === k || model.startsWith(`${k}-`));
  if (!base || input == null || output == null || (input === 0 && output === 0)) return null;
  const [pi, po] = config.ai.prices[base];
  return Math.max(1, Math.ceil(((input * pi + output * po) / 1_000_000) * 100));
}

export type RunOptions<T> = {
  projectId: string;
  task: string;
  prompt: PromptDef;
  input: string;
  schema: z.ZodType<T>;
  source: unknown;               // what the output depends on; unchanged source reuses the last result
  quoteSource?: string;          // text that any quoted client words must appear in
  snapshotId?: string | null;
  userId: string;
  reuse?: boolean;
};

export type RunResult<T> = { output: T; jobId: string; cached: boolean; quality: QualityIssue[]; unverifiedQuotes: string[] };

export async function runAi<T>(o: RunOptions<T>): Promise<RunResult<T>> {
  const provider = getProvider();
  if (!config.ai.enabled || !provider) throw new HttpError(503, 'ai_unavailable', 'AI features are turned off right now. Nothing you entered is affected.');
  const pvId = await promptVersionId(o.prompt);
  const fp = fingerprint({ source: o.source, standard: RISHARI_WRITING_STANDARD_VERSION });

  if (o.reuse !== false) {
    const prior = (await pool.query(
      `SELECT id, output, quality_issues FROM generation_jobs
       WHERE project_id=$1 AND task=$2 AND source_fingerprint=$3 AND prompt_version_id=$4 AND status='succeeded' AND output IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`,
      [o.projectId, o.task, fp, pvId],
    )).rows[0];
    if (prior) return { output: o.schema.parse(prior.output), jobId: prior.id, cached: true, quality: prior.quality_issues, unverifiedQuotes: [] };
  }

  const u = await usage(o.projectId);
  if (u.projectCents >= u.projectCapCents) throw new HttpError(429, 'ai_project_cap', 'This project reached its monthly AI limit. Raise AI_PROJECT_MONTHLY_CAP_USD to continue.');
  if (u.totalCents >= u.totalCapCents) throw new HttpError(429, 'ai_total_cap', 'The monthly AI limit for the studio was reached. Raise AI_TOTAL_MONTHLY_CAP_USD to continue.');

  const model = o.prompt.tier === 'strategy' ? config.ai.strategyModel : config.ai.intakeModel;
  const job = (await pool.query(
    `INSERT INTO generation_jobs(project_id, task, status, model, prompt_version_id, source_snapshot_id, source_fingerprint, requested_by, writing_standard_version)
     VALUES ($1,$2,'running',$3,$4,$5,$6,$7,$8) RETURNING id`,
    [o.projectId, o.task, model, pvId, o.snapshotId ?? null, fp, o.userId, RISHARI_WRITING_STANDARD_VERSION],
  )).rows[0].id as string;

  const jsonSchema = providerSchema(o.schema);
  const instructions = composeInstructions(o.prompt.body);
  let inTok = 0, outTok = 0, attempts = 0, feedback = '';
  try {
    for (;;) {
      attempts++;
      const res = await provider.generate({
        model, instructions, input: feedback ? `${o.input}\n\n${feedback}` : o.input,
        schemaName: o.task.replace(/[^a-z0-9_]/gi, '_'), jsonSchema, effort: o.prompt.effort, maxOutputTokens: o.prompt.maxOutputTokens,
      });
      inTok += res.inputTokens ?? 0; outTok += res.outputTokens ?? 0;
      let parsed: T;
      try { parsed = o.schema.parse(JSON.parse(res.text)); }
      catch {
        if (attempts < 2) { feedback = 'Your previous response did not match the required format. Return only valid JSON for the schema.'; continue; }
        throw new Error('Response did not match the expected structure.');
      }
      const issues = checkOutput(parsed);
      if (issues.length && attempts < 2) {
        feedback = `Revise your previous answer. Writing issues found: ${issues.map((i) => i.detail).join(' ')} Keep the meaning the same.`;
        continue;
      }
      const fixed = fixDashes(parsed);
      const remaining = checkOutput(fixed);
      const badQuotes = o.quoteSource ? unverifiedQuotes(fixed, o.quoteSource) : [];
      const cents = costCents(model, inTok, outTok);
      await pool.query(
        `UPDATE generation_jobs SET status='succeeded', output=$2, quality_issues=$3, input_tokens=$4, output_tokens=$5, cost_cents=$6, attempts=$7, finished_at=now() WHERE id=$1`,
        [job, JSON.stringify(fixed), JSON.stringify([...remaining, ...badQuotes.map((q) => ({ path: 'quote', kind: 'unverified_quote', detail: `Quote not found in the client's answers: "${q.slice(0, 80)}"` }))]), inTok, outTok, cents, attempts],
      );
      await audit({ projectId: o.projectId, actorId: o.userId, action: 'ai.job_succeeded', targetType: 'generation_job', targetId: job, detail: { task: o.task, model, cents } });
      return { output: fixed, jobId: job, cached: false, quality: remaining, unverifiedQuotes: badQuotes };
    }
  } catch (e) {
    // Record what failed without any client content.
    const msg = e instanceof Error ? e.message.replace(/\s+/g, ' ').slice(0, 300) : 'Unknown error';
    await pool.query(
      `UPDATE generation_jobs SET status='failed', error=$2, input_tokens=$3, output_tokens=$4, cost_cents=$5, attempts=$6, finished_at=now() WHERE id=$1`,
      [job, msg, inTok || null, outTok || null, costCents(model, inTok, outTok), attempts],
    );
    await audit({ projectId: o.projectId, actorId: o.userId, action: 'ai.job_failed', targetType: 'generation_job', targetId: job, detail: { task: o.task, model } });
    throw new HttpError(502, 'ai_failed', "The AI step didn't work this time. Nothing you entered was lost. Try again in a minute.");
  }
}

// OpenAI's strict structured outputs do not accept string length limits, so those stay in our own
// validation (and in the prompt) and are removed from the schema sent to the model.
export function providerSchema(schema: z.ZodType): Record<string, unknown> {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).filter(([k]) => !['maxLength', 'minLength', '$schema'].includes(k)).map(([k, x]) => [k, strip(x)]));
    }
    return v;
  };
  return strip(z.toJSONSchema(schema)) as Record<string, unknown>;
}

export async function listJobs(projectId: string) {
  return (await pool.query(
    `SELECT j.id, j.task, j.status, j.model, j.input_tokens, j.output_tokens, j.cost_cents, j.attempts, j.error, j.quality_issues,
            j.created_at, j.finished_at, p.key AS prompt_key, p.version AS prompt_version, s.version AS source_version
     FROM generation_jobs j LEFT JOIN prompt_versions p ON p.id=j.prompt_version_id LEFT JOIN source_snapshots s ON s.id=j.source_snapshot_id
     WHERE j.project_id=$1 ORDER BY j.created_at DESC LIMIT 100`,
    [projectId],
  )).rows;
}
