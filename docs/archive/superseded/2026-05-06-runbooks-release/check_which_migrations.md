# check which migrations

Created: 2026-05-06
Edited: 2026-05-06
Status: raw inbox
Converted from: `check_which_migrations.txt`

psql -U $env:DB_USER -d $env:DB_NAME -c "
SELECT
  to_regclass('public.auth_log')                         AS auth_log,
  to_regclass('public.user_project_access')             AS user_project_access,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='users' AND column_name='token_version'
  ) AS has_token_version,
  to_regclass('public.departments')                     AS departments,
  to_regclass('public.activity_log')                    AS activity_log,
  to_regclass('public.field_changelog')                 AS field_changelog,
  to_regclass('public.feedback')                        AS feedback,
  to_regclass('public.cycling_sessions')                AS cycling_sessions,
  to_regclass('public.project_department_access')       AS project_department_access,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='user_project_access' AND column_name='expires_at'
  ) AS upa_expires_at,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='tapes' AND column_name='updated_at'
  ) AS tapes_updated_at,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='battery_pouch_config' AND column_name='pouch_case_size_code'
  ) AS battery_pouch_case_size_code,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='electrode_cut_batches' AND column_name='target_form_factor'
  ) AS cut_batch_target_form_factor,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='tape_process_steps' AND column_name='ended_at'
  ) AS tape_process_steps_ended_at,
  to_regclass('public.tape_dry_box_state')             AS tape_dry_box_state,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='tape_step_coating' AND column_name='coating_sidedness'
  ) AS coating_sidedness,
  to_regclass('public.material_sources')               AS material_sources,
  to_regclass('public.material_properties')            AS material_properties,
  to_regclass('public.material_source_files')          AS material_source_files,
  to_regclass('public.material_property_files')        AS material_property_files;
"

-- d031 battery stack trigger hardening check.
-- Expected on current local badb_app_v1: true,false,true
--   1) allows equal counts or one extra anode
--   2) does not allow one extra cathode
--   3) includes UPDATE handling
psql -U $env:DB_USER -d $env:DB_NAME -c "
SELECT
  (position('anode_count = cathode_count + 1' in pg_get_functiondef('public.validate_battery_stack()'::regprocedure)) > 0) AS allows_extra_anode,
  (position('cathode_count = anode_count + 1' in pg_get_functiondef('public.validate_battery_stack()'::regprocedure)) > 0) AS allows_extra_cathode,
  (position('TG_OP = ''UPDATE''' in pg_get_functiondef('public.validate_battery_stack()'::regprocedure)) > 0) AS handles_update;
"
