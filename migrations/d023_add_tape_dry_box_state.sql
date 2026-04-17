BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'tape_availability_status'
  ) THEN
    CREATE TYPE tape_availability_status AS ENUM (
      'in_dry_box',
      'out_of_dry_box',
      'depleted'
    );
  END IF;
END $$;

ALTER TABLE tapes
ADD COLUMN IF NOT EXISTS availability_status tape_availability_status NOT NULL DEFAULT 'out_of_dry_box';

CREATE TABLE IF NOT EXISTS tape_dry_box_state (
  tape_id INTEGER PRIMARY KEY REFERENCES tapes(tape_id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  temperature_c NUMERIC,
  atmosphere TEXT,
  other_parameters TEXT,
  comments TEXT,
  updated_by INTEGER REFERENCES users(user_id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tape_dry_box_state_removed_after_started_chk
    CHECK (
      removed_at IS NULL OR started_at IS NULL OR removed_at >= started_at
    )
);

INSERT INTO tape_dry_box_state (
  tape_id,
  started_at,
  removed_at,
  temperature_c,
  atmosphere,
  other_parameters,
  comments,
  updated_by,
  updated_at
)
SELECT DISTINCT ON (s.tape_id)
  s.tape_id,
  s.started_at,
  NULL,
  d.temperature_c,
  d.atmosphere,
  d.other_parameters,
  s.comments,
  s.performed_by,
  now()
FROM tape_process_steps s
JOIN operation_types ot
  ON ot.operation_type_id = s.operation_type_id
LEFT JOIN tape_step_drying d
  ON d.step_id = s.step_id
WHERE ot.code = 'drying_pressed_tape'
ORDER BY s.tape_id, s.started_at DESC NULLS LAST, s.step_id DESC
ON CONFLICT (tape_id) DO NOTHING;

UPDATE tapes t
SET availability_status = 'in_dry_box'
WHERE EXISTS (
  SELECT 1
  FROM tape_dry_box_state ds
  WHERE ds.tape_id = t.tape_id
);

COMMIT;
