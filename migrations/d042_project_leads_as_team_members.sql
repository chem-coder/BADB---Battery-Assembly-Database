BEGIN;

INSERT INTO public.project_participants (
  project_id,
  user_id,
  display_order,
  role_in_team,
  notes,
  created_by,
  updated_by
)
SELECT
  p.project_id,
  p.lead_id,
  COALESCE(existing.max_order, 0) + 1,
  'Руководитель проекта',
  NULL,
  COALESCE(p.updated_by, p.created_by, p.lead_id),
  COALESCE(p.updated_by, p.created_by, p.lead_id)
FROM public.projects p
LEFT JOIN LATERAL (
  SELECT MAX(pp.display_order) AS max_order
  FROM public.project_participants pp
  WHERE pp.project_id = p.project_id
) existing ON true
WHERE p.lead_id IS NOT NULL
ON CONFLICT (project_id, user_id) DO NOTHING;

INSERT INTO public.user_project_access (
  user_id,
  project_id,
  granted_by,
  access_level,
  expires_at
)
SELECT
  p.lead_id,
  p.project_id,
  COALESCE(p.updated_by, p.created_by, p.lead_id),
  'admin',
  NULL
FROM public.projects p
WHERE p.lead_id IS NOT NULL
ON CONFLICT (user_id, project_id) DO UPDATE SET
  access_level = 'admin',
  granted_by = EXCLUDED.granted_by,
  granted_at = now(),
  expires_at = NULL;

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
      'd042_project_leads_as_team_members.sql',
      'dalia',
      now(),
      'manual',
      'Backfills project leads into project_participants and ensures lead admin access.'
    )
    ON CONFLICT (migration_name) DO NOTHING;
  END IF;
END $$;

COMMIT;
