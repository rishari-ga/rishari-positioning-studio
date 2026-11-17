-- Buyer narrative update. Additive only: no existing rows are changed or removed.

-- Question definitions: narrative metadata --------------------------------
ALTER TABLE questions ADD COLUMN seed_revision integer NOT NULL DEFAULT 1;

ALTER TABLE question_versions
  ADD COLUMN from_seed boolean NOT NULL DEFAULT true,
  ADD COLUMN per_offer boolean NOT NULL DEFAULT false,         -- asked once per focus offer
  ADD COLUMN planned_prompt text,                              -- wording used when the offer is planned
  ADD COLUMN probe_of text,                                    -- key of the core question this optional probe belongs to
  ADD COLUMN narrative_field text,                             -- e.g. character.buyer_role, problem.internal
  ADD COLUMN asks_evidence boolean NOT NULL DEFAULT false,     -- show "How do you know this?"
  ADD COLUMN allow_not_applicable boolean NOT NULL DEFAULT false,
  ADD COLUMN reuse_from text[] NOT NULL DEFAULT '{}',          -- earlier question keys that may already answer this
  ADD COLUMN probe_always boolean NOT NULL DEFAULT false,      -- a companion field shown with its core question from the start
  ADD COLUMN na_label text;                                    -- wording for the not-applicable choice

ALTER TABLE question_versions DROP CONSTRAINT IF EXISTS question_versions_kind_check;
ALTER TABLE question_versions ADD CONSTRAINT question_versions_kind_check
  CHECK (kind IN ('core','field','offer_list','labeled_examples','probe','stakeholder_map'));
ALTER TABLE question_versions DROP CONSTRAINT IF EXISTS question_versions_input_type_check;
ALTER TABLE question_versions ADD CONSTRAINT question_versions_input_type_check
  CHECK (input_type IN ('short_text','long_text','url','single_select','multi_select','offer_list','labeled_examples','stakeholder_map'));

-- Answers: optional offer, evidence status, not applicable, reuse ---------
ALTER TABLE answers
  ADD COLUMN offer_id uuid REFERENCES offers(id),
  ADD COLUMN evidence_status text CHECK (evidence_status IN ('observed','customer_reported','founder_belief','planned','unknown')),
  ADD COLUMN reused_from_key text;                              -- set when the client confirmed an earlier answer covers this

ALTER TABLE answers DROP CONSTRAINT IF EXISTS answers_status_check;
ALTER TABLE answers ADD CONSTRAINT answers_status_check
  CHECK (status IN ('answered','not_sure','discuss','empty','not_applicable'));

-- One answer per question per offer (company-level answers have no offer).
ALTER TABLE answers DROP CONSTRAINT IF EXISTS answers_project_id_question_id_key;
CREATE UNIQUE INDEX answers_unique_scope ON answers (project_id, question_id, COALESCE(offer_id, '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE answer_revisions
  ADD COLUMN offer_id uuid,
  ADD COLUMN evidence_status text,
  ADD COLUMN reused_from_key text;

-- Stakeholder map (Section 13) ---------------------------------------------
CREATE TABLE stakeholders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  offer_id        uuid REFERENCES offers(id),
  label           text NOT NULL,
  roles           text[] NOT NULL DEFAULT '{}',
  desired_outcome text,
  wants_to_prevent text,
  needs_to_believe text,
  decision_role   text,
  evidence_status text CHECK (evidence_status IN ('observed','customer_reported','founder_belief','planned','unknown')),
  sort_order      integer NOT NULL DEFAULT 0,
  created_by      uuid NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT stakeholder_roles_valid CHECK (roles <@ ARRAY['primary_buyer','internal_champion','user','approver','beneficiary']::text[])
);
CREATE INDEX stakeholders_project ON stakeholders(project_id);

-- Coverage overrides set by the reviewer (Section 14). Defaults are computed. -
CREATE TABLE coverage_overrides (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  offer_id      uuid REFERENCES offers(id),
  field_key     text NOT NULL,
  status        text NOT NULL CHECK (status IN ('not_asked','captured','needs_clarification','hypothesis','not_applicable')),
  note          text,
  set_by        uuid NOT NULL REFERENCES users(id),
  set_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX coverage_overrides_unique ON coverage_overrides (project_id, field_key, COALESCE(offer_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Requests for specific missing information (Section 17) -------------------
CREATE TABLE clarification_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  question_key  text NOT NULL,
  offer_id      uuid REFERENCES offers(id),
  note          text,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','withdrawn')),
  flag_id       uuid REFERENCES flags(id),
  requested_by  uuid NOT NULL REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  answered_at   timestamptz
);
CREATE INDEX clarification_project ON clarification_requests(project_id, status);

-- Flags: offer scope and a reviewer note -----------------------------------
ALTER TABLE flags
  ADD COLUMN offer_id uuid REFERENCES offers(id),
  ADD COLUMN check_key text,              -- which deterministic check raised it
  ADD COLUMN reviewer_note text;
CREATE UNIQUE INDEX flags_open_check ON flags (project_id, check_key, COALESCE(offer_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE check_key IS NOT NULL AND (decision IS NULL OR decision NOT IN ('dismissed','resolved'));

-- Approvals: what the reviewer explicitly accepted -------------------------
ALTER TABLE approvals ADD COLUMN accepted_assumptions jsonb NOT NULL DEFAULT '[]';
