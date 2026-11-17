-- Pass 2: runtime AI. Additive only.
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS output jsonb;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS quality_issues jsonb NOT NULL DEFAULT '[]';
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS writing_standard_version integer;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS generation_jobs_reuse ON generation_jobs (project_id, task, source_fingerprint, prompt_version_id) WHERE status = 'succeeded';
CREATE INDEX IF NOT EXISTS generation_jobs_month ON generation_jobs (created_at);

-- Up to two AI follow-up questions per core question and scope, one at a time.
CREATE TABLE IF NOT EXISTS ai_followups (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  question_id        uuid NOT NULL REFERENCES questions(id),
  offer_id           uuid REFERENCES offers(id) ON DELETE CASCADE,
  persona_id         uuid REFERENCES personas(id) ON DELETE CASCADE,
  round              integer NOT NULL CHECK (round IN (1, 2)),
  kind               text NOT NULL,
  question           text NOT NULL,
  answer             text,
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','skipped','not_sure','discuss')),
  answer_fingerprint text NOT NULL,
  generation_job_id  uuid REFERENCES generation_jobs(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  answered_at        timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_followups_round ON ai_followups (project_id, question_id, coalesce(offer_id, '00000000-0000-0000-0000-000000000000'), coalesce(persona_id, '00000000-0000-0000-0000-000000000000'), round);

-- Summaries are per chapter; remember which questions produced "nothing worth summarizing".
ALTER TABLE summaries ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS summaries_module ON summaries (project_id, module_id);

-- Flags can come from fixed rules or from AI review.
ALTER TABLE flags ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'rule' CHECK (origin IN ('rule','ai'));

-- Admin-only call briefing, editable and reorderable.
CREATE TABLE IF NOT EXISTS briefings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_snapshot_id uuid NOT NULL REFERENCES source_snapshots(id) ON DELETE CASCADE,
  content            jsonb NOT NULL,
  generation_job_id  uuid REFERENCES generation_jobs(id) ON DELETE SET NULL,
  edited_by          uuid REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS briefings_project ON briefings (project_id, created_at DESC);

-- Positioning options keep the generated text and the reviewer's edited direction separately.
ALTER TABLE positioning_options ADD COLUMN IF NOT EXISTS edited_content jsonb;
ALTER TABLE positioning_options ADD COLUMN IF NOT EXISTS batch integer NOT NULL DEFAULT 1;

-- Strategy versions record the direction they follow; sections record their review results.
ALTER TABLE strategy_versions ADD COLUMN IF NOT EXISTS direction_approval_id uuid REFERENCES approvals(id);
ALTER TABLE strategy_sections ADD COLUMN IF NOT EXISTS generated_content jsonb;
ALTER TABLE strategy_sections ADD COLUMN IF NOT EXISTS review jsonb NOT NULL DEFAULT '[]';
ALTER TABLE strategy_sections ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;
ALTER TABLE strategy_sections ADD COLUMN IF NOT EXISTS generation_job_id uuid REFERENCES generation_jobs(id) ON DELETE SET NULL;
