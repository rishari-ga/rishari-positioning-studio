-- Personas and connected plans. Additive only: existing rows are never changed or removed.

-- Modules can be re-titled, re-ordered or retired by the seed, unless a reviewer edited them.
ALTER TABLE question_modules
  ADD COLUMN seed_revision integer NOT NULL DEFAULT 1,
  ADD COLUMN edited_by_admin boolean NOT NULL DEFAULT false;

-- Questions can be scoped to a persona, and can carry an intro shown before them.
ALTER TABLE question_versions
  ADD COLUMN per_persona boolean NOT NULL DEFAULT false,
  ADD COLUMN heading_template text,           -- e.g. "What this problem means for {persona}"
  ADD COLUMN part_label text;                 -- e.g. "Part A: How your product or service helps"

ALTER TABLE question_versions DROP CONSTRAINT IF EXISTS question_versions_kind_check;
ALTER TABLE question_versions ADD CONSTRAINT question_versions_kind_check
  CHECK (kind IN ('core','field','offer_list','labeled_examples','probe','stakeholder_map','customer_groups','personas','solution_links','persona_fields','intro'));
ALTER TABLE question_versions DROP CONSTRAINT IF EXISTS question_versions_input_type_check;
ALTER TABLE question_versions ADD CONSTRAINT question_versions_input_type_check
  CHECK (input_type IN ('short_text','long_text','url','single_select','multi_select','offer_list','labeled_examples','stakeholder_map','customer_groups','personas','solution_links','persona_fields','intro'));

-- Customer companies (customer groups). One is the priority; others stay separate.
CREATE TABLE customer_groups (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text,
  is_priority  boolean NOT NULL DEFAULT false,
  sort_order   integer NOT NULL DEFAULT 0,
  created_by   uuid NOT NULL REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE UNIQUE INDEX one_priority_group ON customer_groups(project_id) WHERE is_priority AND deleted_at IS NULL;

-- Personas: a type of person involved in buying or using the offer.
CREATE TABLE personas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  customer_group_id uuid REFERENCES customer_groups(id),
  role_title        text NOT NULL,
  responsibility    text,
  purchase_roles    text[] NOT NULL DEFAULT '{}',
  goal              text,
  problem           text,
  is_priority       boolean NOT NULL DEFAULT true,
  evidence_status   text CHECK (evidence_status IN ('observed','customer_reported','founder_belief','planned','unknown')),
  mapped_from_stakeholder_id uuid REFERENCES stakeholders(id),   -- carried over from the earlier stakeholder map
  needs_confirmation boolean NOT NULL DEFAULT false,               -- true until the client confirms a carried-over persona
  sort_order        integer NOT NULL DEFAULT 0,
  created_by        uuid NOT NULL REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  CONSTRAINT persona_roles_valid CHECK (purchase_roles <@ ARRAY['identifies_need','recommends','evaluates','approves','uses','implements','can_block']::text[])
);
CREATE INDEX personas_project ON personas(project_id);

-- Answers can be scoped to a persona (company answers have no persona).
ALTER TABLE answers ADD COLUMN persona_id uuid REFERENCES personas(id);
ALTER TABLE answer_revisions ADD COLUMN persona_id uuid;
DROP INDEX IF EXISTS answers_unique_scope;
CREATE UNIQUE INDEX answers_unique_scope ON answers (project_id, question_id,
  COALESCE(offer_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(persona_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Connections: which product or service addresses which problem, for the company or a persona.
-- Many-to-many: several links per problem, and the same offer can link to many personas.
CREATE TABLE solution_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  persona_id    uuid REFERENCES personas(id),             -- null = the customer company's problem
  offer_id      uuid REFERENCES offers(id),               -- null with fit 'none' or 'unknown'
  fit           text NOT NULL CHECK (fit IN ('direct','indirect','planned','none','unknown')),
  capability    text,       -- company: what it does; persona: which part addresses their problem
  how_it_helps  text,       -- company: how that addresses the problem; persona: how it changes the way they work
  benefit       text,       -- persona: intended benefit
  out_of_scope  text,       -- company: what is outside its scope
  evidence_status text CHECK (evidence_status IN ('observed','customer_reported','founder_belief','planned','unknown')),
  sort_order    integer NOT NULL DEFAULT 0,
  created_by    uuid NOT NULL REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  CONSTRAINT link_offer_matches_fit CHECK ((fit IN ('none','unknown')) OR offer_id IS NOT NULL)
);
CREATE INDEX solution_links_project ON solution_links(project_id);

-- Corrections and discussion flags from the "Check the connection" screen.
CREATE TABLE connection_reviews (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  persona_id            uuid REFERENCES personas(id),     -- null = company summary
  marked_for_discussion boolean NOT NULL DEFAULT false,
  correction            text,
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX connection_reviews_scope ON connection_reviews (project_id, COALESCE(persona_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Flags and coverage can point at a persona.
ALTER TABLE flags ADD COLUMN persona_id uuid REFERENCES personas(id);
DROP INDEX IF EXISTS flags_open_check;
CREATE UNIQUE INDEX flags_open_check ON flags (project_id, check_key,
  COALESCE(offer_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(persona_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE check_key IS NOT NULL AND (decision IS NULL OR decision NOT IN ('dismissed','resolved'));

ALTER TABLE coverage_overrides ADD COLUMN persona_id uuid REFERENCES personas(id);
DROP INDEX IF EXISTS coverage_overrides_unique;
CREATE UNIQUE INDEX coverage_overrides_unique ON coverage_overrides (project_id, field_key,
  COALESCE(offer_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(persona_id, '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE clarification_requests ADD COLUMN persona_id uuid REFERENCES personas(id);

-- Carry the earlier stakeholder map into personas, marked for client confirmation.
-- The stakeholder rows themselves are left untouched.
INSERT INTO personas (project_id, role_title, purchase_roles, goal, evidence_status, mapped_from_stakeholder_id, needs_confirmation, is_priority, sort_order, created_by, created_at)
SELECT s.project_id, s.label,
  ARRAY(SELECT DISTINCT r FROM unnest(ARRAY[
    CASE WHEN 'primary_buyer' = ANY(s.roles) THEN 'approves' END,
    CASE WHEN 'approver' = ANY(s.roles) THEN 'evaluates' END,
    CASE WHEN 'approver' = ANY(s.roles) THEN 'approves' END,
    CASE WHEN 'internal_champion' = ANY(s.roles) THEN 'recommends' END,
    CASE WHEN 'user' = ANY(s.roles) THEN 'uses' END]) AS r WHERE r IS NOT NULL),
  s.desired_outcome, s.evidence_status, s.id, true, true, s.sort_order, s.created_by, s.created_at
FROM stakeholders s WHERE s.deleted_at IS NULL;
