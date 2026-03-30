-- 003_optimistic_locking.sql
-- Optimistic locking: version column for concurrent editing

-- Tables edited by multiple users (Excel + Web UI simultaneously)
ALTER TABLE tapes ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE electrodes ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE batteries ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE tape_recipes ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- DO NOT add version to raw_submissions (append-only, never edited)
-- DO NOT add version to reference tables (drying_atmospheres, mixing_methods, etc.)
