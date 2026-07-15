-- d046_indexes_and_timestamps.sql
-- Schema-hygiene pass: adds missing indexes on hot foreign-key/join columns and
-- brings two tables in line with the project's created_at/updated_at convention.
--
-- WHY (indexes): every list/read query LEFT JOINs these columns to projects,
-- and cascade deletes walk the FKs -- but these columns had no index, so those
-- lookups were sequential scans. Harmless at today's tiny row counts, a real
-- cost as the lab's data grows. electrode_cut_batches.tape_id in particular had
-- NO index at all despite being an ON DELETE CASCADE foreign key.
--
-- WHY (timestamps): cycling_sessions is updated after insert (status, cycles,
-- notes) but had no updated_at/updated_by; the materials catalog had neither
-- created_at nor created_by while every sibling catalog table has them. Added
-- NULLABLE with no backfill default -- existing rows keep an honest "unknown"
-- (NULL) rather than being stamped with a fake migration-time date.
--
-- Forward-only and idempotent: IF NOT EXISTS throughout, so re-running (or
-- running against a DB that already has some of these) is a safe no-op.

-- Missing indexes on FK / join columns
CREATE INDEX IF NOT EXISTS idx_electrode_cut_batches_tape_id
  ON electrode_cut_batches (tape_id);
CREATE INDEX IF NOT EXISTS idx_user_project_access_project_id
  ON user_project_access (project_id);
CREATE INDEX IF NOT EXISTS idx_tapes_project_id
  ON tapes (project_id);
CREATE INDEX IF NOT EXISTS idx_batteries_project_id
  ON batteries (project_id);

-- Timestamp / actor columns for consistency
ALTER TABLE cycling_sessions ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE cycling_sessions ADD COLUMN IF NOT EXISTS updated_by integer
  REFERENCES users(user_id);

ALTER TABLE materials ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS created_by integer
  REFERENCES users(user_id);
