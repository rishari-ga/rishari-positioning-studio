-- When a client last did something in a project. Used to show "Active now" to Rishari,
-- so updates can wait until no one is mid-discovery. Additive; existing rows start empty.
ALTER TABLE project_memberships ADD COLUMN IF NOT EXISTS last_active_at timestamptz;
