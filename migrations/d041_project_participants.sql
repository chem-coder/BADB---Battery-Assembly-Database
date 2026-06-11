BEGIN;

CREATE TABLE IF NOT EXISTS public.project_participants (
  participant_id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES public.projects(project_id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
  display_order INTEGER NOT NULL DEFAULT 0,
  role_in_team TEXT NOT NULL DEFAULT '',
  notes TEXT,
  created_by INTEGER REFERENCES public.users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INTEGER REFERENCES public.users(user_id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT project_participants_unique_project_user UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_participants_project_order
  ON public.project_participants(project_id, display_order, participant_id);

CREATE INDEX IF NOT EXISTS idx_project_participants_user
  ON public.project_participants(user_id);

COMMENT ON TABLE public.project_participants IS
  'Per-project team membership and functional role; membership is a project view access source.';

COMMENT ON COLUMN public.project_participants.role_in_team IS
  'Functional role or job description for this user on this project.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_participants TO "Dalia";
GRANT USAGE, SELECT ON SEQUENCE public.project_participants_participant_id_seq TO "Dalia";

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    INSERT INTO public.schema_migrations (
      migration_name,
      migration_stream,
      applied_at,
      source,
      notes
    )
    VALUES (
      'd041_project_participants.sql',
      'dalia',
      now(),
      'manual',
      'Adds per-project participant/team-role records separate from access grants.'
    )
    ON CONFLICT (migration_name) DO NOTHING;
  END IF;
END $$;

COMMIT;
