-- d022_add_end_times_to_tape_workflow_steps.sql
--
-- Goal:
-- Add explicit end-time fields for tape workflow records that already have
-- a start time plus a duration input.
--
-- Included:
-- 1. tape_process_steps.ended_at
--    Used for whole-step workflows whose start is stored in tape_process_steps
--    and whose duration lives in a subtype table:
--      - tape_step_drying.target_duration_min
--
-- 2. tape_step_mixing.dry_end_time
-- 3. tape_step_mixing.wet_end_time
--    Mixing already stores separate dry/wet starts and durations, so the end
--    times belong in the mixing subtype table itself.
--
-- Not included:
-- - tape_step_calendering: no explicit duration field exists yet
-- - electrode_drying: already has start_time / end_time

BEGIN;

ALTER TABLE tape_process_steps
  ADD COLUMN IF NOT EXISTS ended_at timestamptz;

ALTER TABLE tape_step_mixing
  ADD COLUMN IF NOT EXISTS dry_end_time timestamptz,
  ADD COLUMN IF NOT EXISTS wet_end_time timestamptz;

ALTER TABLE tape_process_steps
  DROP CONSTRAINT IF EXISTS tape_process_steps_ended_at_not_before_started_at_chk;

ALTER TABLE tape_process_steps
  ADD CONSTRAINT tape_process_steps_ended_at_not_before_started_at_chk
  CHECK (
    ended_at IS NULL OR
    started_at IS NULL OR
    ended_at >= started_at
  );

ALTER TABLE tape_step_mixing
  DROP CONSTRAINT IF EXISTS tape_step_mixing_dry_end_time_not_before_start_chk;

ALTER TABLE tape_step_mixing
  ADD CONSTRAINT tape_step_mixing_dry_end_time_not_before_start_chk
  CHECK (
    dry_end_time IS NULL OR
    dry_start_time IS NULL OR
    dry_end_time >= dry_start_time
  );

ALTER TABLE tape_step_mixing
  DROP CONSTRAINT IF EXISTS tape_step_mixing_wet_end_time_not_before_start_chk;

ALTER TABLE tape_step_mixing
  ADD CONSTRAINT tape_step_mixing_wet_end_time_not_before_start_chk
  CHECK (
    wet_end_time IS NULL OR
    wet_start_time IS NULL OR
    wet_end_time >= wet_start_time
  );

-- Backfill drying step end times from started_at + target_duration_min
UPDATE tape_process_steps s
SET ended_at = s.started_at + make_interval(mins => d.target_duration_min)
FROM operation_types ot,
     tape_step_drying d
WHERE ot.operation_type_id = s.operation_type_id
  AND d.step_id = s.step_id
  AND ot.code IN ('drying_am', 'drying_tape', 'drying_pressed_tape')
  AND s.started_at IS NOT NULL
  AND d.target_duration_min IS NOT NULL
  AND s.ended_at IS NULL;

-- Backfill dry/wet mixing end times from start + duration
UPDATE tape_step_mixing
SET dry_end_time = dry_start_time + make_interval(mins => dry_duration_min)
WHERE dry_start_time IS NOT NULL
  AND dry_duration_min IS NOT NULL
  AND dry_end_time IS NULL;

UPDATE tape_step_mixing
SET wet_end_time = wet_start_time + make_interval(mins => wet_duration_min)
WHERE wet_start_time IS NOT NULL
  AND wet_duration_min IS NOT NULL
  AND wet_end_time IS NULL;

COMMIT;
