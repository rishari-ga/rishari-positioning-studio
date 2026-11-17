-- Rishari Positioning Studio: initial schema (SPEC.md Section 17)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Users and roles ---------------------------------------------------------
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_subject  text UNIQUE,              -- Clerk user id (or dev id); null until first sign-in
  email         text NOT NULL UNIQUE,     -- stored lowercase
  display_name  text,
  is_admin      boolean NOT NULL DEFAULT false,  -- only set by the server-side grant script
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Projects and memberships ------------------------------------------------
CREATE TABLE projects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  company_name  text,
  status        text NOT NULL DEFAULT 'discovery'
                CHECK (status IN ('discovery','submitted','in_review','strategy','complete','archived')),
  is_fictional  boolean NOT NULL DEFAULT false,
  created_by    uuid NOT NULL REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE project_memberships (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'client_primary' CHECK (role IN ('client_primary','client_participant')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);
-- MVP: one primary client per project.
CREATE UNIQUE INDEX one_primary_client ON project_memberships(project_id) WHERE role = 'client_primary';

CREATE TABLE invitations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email        text NOT NULL,
  token_hash   text NOT NULL UNIQUE,
  role         text NOT NULL DEFAULT 'client_primary',
  created_by   uuid NOT NULL REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  accepted_at  timestamptz,
  accepted_by  uuid REFERENCES users(id),
  revoked_at   timestamptz
);

CREATE TABLE scope_settings (
  project_id                uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  ai_usage_cap_cents        integer NOT NULL DEFAULT 500,
  ai_usage_spent_cents      integer NOT NULL DEFAULT 0,
  max_personas              integer NOT NULL DEFAULT 5,
  notes                     text,
  updated_by                uuid REFERENCES users(id),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- Offers (Module 3). Clients add offers; only admins set in_scope. -------
CREATE TABLE offers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name             text NOT NULL,
  description      text,
  intended_customer text,
  availability     text CHECK (availability IN ('available','pilot','planned')),
  pricing_approach text,
  delivery_model   text,
  priority         integer,
  in_scope         boolean NOT NULL DEFAULT false,
  scope_set_by     uuid REFERENCES users(id),
  scope_set_at     timestamptz,
  sort_order       integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

-- Question definitions and versions --------------------------------------
CREATE TABLE question_modules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key          text NOT NULL UNIQUE,
  position     integer NOT NULL,
  title        text NOT NULL,
  why          text NOT NULL,
  opening      text,
  active       boolean NOT NULL DEFAULT true,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE questions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id        uuid NOT NULL REFERENCES question_modules(id) ON DELETE CASCADE,
  key              text NOT NULL UNIQUE,
  position         integer NOT NULL,
  current_version  integer NOT NULL DEFAULT 1,
  active           boolean NOT NULL DEFAULT true
);

CREATE TABLE question_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id   uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  version       integer NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('core','field','offer_list','labeled_examples')),
  input_type    text NOT NULL CHECK (input_type IN ('short_text','long_text','url','single_select','multi_select','offer_list','labeled_examples')),
  prompt        text NOT NULL,
  help_text     text,
  thinking_prompts jsonb NOT NULL DEFAULT '[]',
  options       jsonb NOT NULL DEFAULT '[]',
  allow_not_sure boolean NOT NULL DEFAULT true,
  required      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, version)
);

-- Answers and revisions ---------------------------------------------------
CREATE TABLE answers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  question_id      uuid NOT NULL REFERENCES questions(id),
  question_version integer NOT NULL,
  value            jsonb,
  status           text NOT NULL DEFAULT 'answered' CHECK (status IN ('answered','not_sure','discuss','empty')),
  context_note     text,
  revision         integer NOT NULL DEFAULT 1,
  updated_by       uuid NOT NULL REFERENCES users(id),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, question_id)
);

CREATE TABLE answer_revisions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id    uuid NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  revision     integer NOT NULL,
  value        jsonb,
  status       text NOT NULL,
  context_note text,
  created_by   uuid NOT NULL REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (answer_id, revision)
);

CREATE TABLE module_progress (
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  module_id    uuid NOT NULL REFERENCES question_modules(id) ON DELETE CASCADE,
  marked_for_discussion boolean NOT NULL DEFAULT false,
  client_correction text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, module_id)
);

-- Summaries (Pass 2 fills these; kept separate from answers) -------------
CREATE TABLE summaries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  module_id         uuid NOT NULL REFERENCES question_modules(id),
  source_fingerprint text NOT NULL,
  content           jsonb NOT NULL,
  client_correction text,
  generation_job_id uuid,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Attachments -------------------------------------------------------------
CREATE TABLE attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  module_id     uuid REFERENCES question_modules(id),
  storage_key   text NOT NULL UNIQUE,
  original_name text NOT NULL,
  mime_type     text NOT NULL,
  size_bytes    integer NOT NULL,
  uploaded_by   uuid NOT NULL REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

-- Flags and guidance (Pass 2) --------------------------------------------
CREATE TABLE guidance_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text NOT NULL UNIQUE,
  issue         text NOT NULL,
  action        text NOT NULL,
  example       text NOT NULL,
  why           text NOT NULL,
  client_question text NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE flags (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  guidance_key    text REFERENCES guidance_entries(key),
  issue           text NOT NULL,
  priority        text NOT NULL CHECK (priority IN ('high','medium','low')),
  source_refs     jsonb NOT NULL DEFAULT '[]',
  noticed         text NOT NULL,
  suggested_action text NOT NULL,
  example         text,
  why             text,
  client_question text,
  decision        text CHECK (decision IN ('accepted','dismissed','agenda','clarification_requested','assumption','resolved')),
  decided_by      uuid REFERENCES users(id),
  decided_at      timestamptz,
  generation_job_id uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Review notes (admin only, separate from answers) -----------------------
CREATE TABLE review_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  topic_type  text NOT NULL CHECK (topic_type IN ('project','module','question','offer','flag')),
  topic_id    uuid,
  note_type   text NOT NULL CHECK (note_type IN ('confirmed','interpretation','assumption')),
  body        text NOT NULL,
  author_id   uuid NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Immutable source snapshots ----------------------------------------------
CREATE TABLE source_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version         integer NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('client_intake','reviewed_source')),
  content         jsonb NOT NULL,
  content_hash    text NOT NULL,
  idempotency_key text NOT NULL,
  created_by      uuid NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version),
  UNIQUE (project_id, idempotency_key)
);
CREATE FUNCTION forbid_snapshot_change() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'source snapshots are immutable'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER snapshots_immutable BEFORE UPDATE ON source_snapshots
  FOR EACH ROW EXECUTE FUNCTION forbid_snapshot_change();

-- Strategy (Pass 2 and 3) -------------------------------------------------
CREATE TABLE positioning_options (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_snapshot_id uuid NOT NULL REFERENCES source_snapshots(id),
  content            jsonb NOT NULL,
  chosen             boolean NOT NULL DEFAULT false,
  generation_job_id  uuid,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE strategy_versions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version            integer NOT NULL,
  source_snapshot_id uuid NOT NULL REFERENCES source_snapshots(id),
  status             text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','shared','approved','final')),
  created_by         uuid NOT NULL REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);

CREATE TABLE strategy_sections (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_version_id uuid NOT NULL REFERENCES strategy_versions(id) ON DELETE CASCADE,
  project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key                 text NOT NULL,
  content             jsonb NOT NULL,
  locked              boolean NOT NULL DEFAULT false,
  prompt_version_id   uuid,
  model               text,
  edited_by           uuid REFERENCES users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (strategy_version_id, key)
);

-- Approvals and acknowledgments ------------------------------------------
CREATE TABLE approvals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  approval_type  text NOT NULL CHECK (approval_type IN (
                   'client_process_ack','client_intake_confirmation','admin_source',
                   'admin_direction','admin_share','client_strategy','admin_final_release')),
  target_type    text NOT NULL,
  target_id      uuid NOT NULL,
  target_version text NOT NULL,
  scope          jsonb NOT NULL DEFAULT '{}',
  decision       text NOT NULL DEFAULT 'approved' CHECK (decision IN ('approved','changes_requested')),
  stale          boolean NOT NULL DEFAULT false,
  actor_id       uuid NOT NULL REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE acknowledgments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id),
  ack_version  text NOT NULL,
  text_shown   text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id, ack_version)
);

-- Comments and change requests (Pass 3) ----------------------------------
CREATE TABLE comments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  strategy_version_id uuid NOT NULL REFERENCES strategy_versions(id) ON DELETE CASCADE,
  section_key         text NOT NULL,
  body                text NOT NULL,
  author_id           uuid NOT NULL REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE change_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  strategy_version_id uuid NOT NULL REFERENCES strategy_versions(id) ON DELETE CASCADE,
  body                text NOT NULL,
  status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open','addressed','declined')),
  author_id           uuid NOT NULL REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- AI jobs and prompts (Pass 2) -------------------------------------------
CREATE TABLE prompt_versions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL,
  version     integer NOT NULL,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (key, version)
);

CREATE TABLE generation_jobs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task               text NOT NULL,
  status             text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  model              text,
  prompt_version_id  uuid REFERENCES prompt_versions(id),
  source_snapshot_id uuid REFERENCES source_snapshots(id),
  source_fingerprint text,
  input_tokens       integer,
  output_tokens      integer,
  cost_cents         integer,
  error              text,
  idempotency_key    text,
  requested_by       uuid REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  finished_at        timestamptz,
  UNIQUE (project_id, idempotency_key)
);

-- Site configuration (data-use page) -------------------------------------
CREATE TABLE site_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_by  uuid REFERENCES users(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Audit events ------------------------------------------------------------
CREATE TABLE audit_events (
  id          bigserial PRIMARY KEY,
  project_id  uuid REFERENCES projects(id) ON DELETE SET NULL,
  actor_id    uuid REFERENCES users(id),
  action      text NOT NULL,
  target_type text,
  target_id   text,
  detail      jsonb NOT NULL DEFAULT '{}',   -- never client content or secrets
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX answers_project ON answers(project_id);
CREATE INDEX attachments_project ON attachments(project_id);
CREATE INDEX notes_project ON review_notes(project_id);
CREATE INDEX audit_project ON audit_events(project_id, created_at);
