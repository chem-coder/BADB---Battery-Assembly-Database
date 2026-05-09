BEGIN;

CREATE TABLE IF NOT EXISTS public.schema_migrations (
    migration_name text PRIMARY KEY,
    migration_stream text NOT NULL CHECK (migration_stream IN ('dima', 'dalia')),
    applied_at timestamptz DEFAULT now(),
    recorded_at timestamptz NOT NULL DEFAULT now(),
    recorded_by text NOT NULL DEFAULT current_user,
    applied_database text NOT NULL DEFAULT current_database(),
    source text NOT NULL DEFAULT 'manual',
    checksum_sha256 text,
    notes text
);

COMMENT ON TABLE public.schema_migrations IS
    'Manual migration ledger for BADB. Historical rows before d032 are baseline records; exact original applied_at is unknown.';

COMMENT ON COLUMN public.schema_migrations.applied_at IS
    'When the migration was applied if known. Historical baseline rows may be NULL.';

CREATE INDEX IF NOT EXISTS idx_schema_migrations_stream
    ON public.schema_migrations (migration_stream);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_recorded_at
    ON public.schema_migrations (recorded_at);

DO $$
DECLARE
    missing text[];
BEGIN
    SELECT array_agg(check_name ORDER BY check_name)
    INTO missing
    FROM (
        VALUES
            ('raw_submissions table', to_regclass('public.raw_submissions') IS NOT NULL),
            ('departments real names', EXISTS (
                SELECT 1
                FROM public.departments
                WHERE department_id = 1
                  AND name = 'Отдел исследований и разработок ХИТ'
            )),
            ('cycling_cycle_summary.energy_efficiency', EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'cycling_cycle_summary'
                  AND column_name = 'energy_efficiency'
            )),
            ('cycling_cycle_summary.avg_charge_voltage_v', EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'cycling_cycle_summary'
                  AND column_name = 'avg_charge_voltage_v'
            )),
            ('cycling_cycle_summary.avg_discharge_voltage_v', EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'cycling_cycle_summary'
                  AND column_name = 'avg_discharge_voltage_v'
            )),
            ('cycling_sessions.active_mass_mg', EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'cycling_sessions'
                  AND column_name = 'active_mass_mg'
            )),
            ('tape_projects table', to_regclass('public.tape_projects') IS NOT NULL),
            ('electrode_cut_batch_projects table', to_regclass('public.electrode_cut_batch_projects') IS NOT NULL),
            ('battery_projects table', to_regclass('public.battery_projects') IS NOT NULL),
            ('validate_battery_stack function', to_regprocedure('public.validate_battery_stack()') IS NOT NULL),
            ('d031 extra-anode rule', position(
                'anode_count = cathode_count + 1'
                IN pg_get_functiondef('public.validate_battery_stack()'::regprocedure)
            ) > 0)
    ) AS checks(check_name, ok)
    WHERE NOT ok;

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION
            'Cannot create schema_migrations baseline; missing expected migration effects: %',
            array_to_string(missing, ', ');
    END IF;
END
$$;

INSERT INTO public.schema_migrations
    (migration_name, migration_stream, applied_at, source, notes)
VALUES
    ('001_auth_tables.sql', 'dima', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('002_raw_submissions.sql', 'dima', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('003_optimistic_locking.sql', 'dima', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('004_rename_role_manager_to_lead.sql', 'dima', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('005_users_add_position.sql', 'dima', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('006_add_auth_to_dalia_db.sql', 'dima', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('007_fix_user_roles.sql', 'dima', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('008_simplify_coin_layout_and_electrolyte.sql', 'dima', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('008_tapes_nullable_project_recipe.sql', 'dima', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('009_add_token_version.sql', 'dima', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('010_departments.sql', 'dima', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('011_project_confidentiality.sql', 'dima', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('012_activity_log.sql', 'dima', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('013_traceability.sql', 'dima', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('014_feedback.sql', 'dima', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('015_cycling.sql', 'dima', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('016_project_department_access.sql', 'dima', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('017_access_expires_at.sql', 'dima', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('018_department_real_names_and_assignments.sql', 'dima', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('019_cycling_summary_extra_metrics.sql', 'dima', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('020_cycling_active_mass.sql', 'dima', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('d013_add_updated_at_to_tapes_and_batteries.sql', 'dalia', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('d014_touch_parent_updated_at_triggers.sql', 'dalia', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('d015_backfill_updated_at_from_real_history.sql', 'dalia', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('d016_add_pouch_case_size_to_battery_pouch_config.sql', 'dalia', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('d017_add_pouch_case_size_to_electrode_cut_batches.sql', 'dalia', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('d018_generalize_electrode_batch_target_config.sql', 'dalia', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('d019_backfill_existing_electrode_batch_targets_and_pouch_sizes.sql', 'dalia', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('d020_clear_invalid_diameter_for_cut_batch_1.sql', 'dalia', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('d021_drop_legacy_pouch_case_fields_from_electrode_cut_batches.sql', 'dalia', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('d022_add_end_times_to_tape_workflow_steps.sql', 'dalia', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('d023_add_tape_dry_box_state.sql', 'dalia', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('d024_add_coating_sidedness_to_tape_step_coating.sql', 'dalia', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('d025_backfill_coating_sidedness_from_coating_method.sql', 'dalia', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('d026_add_material_sources_and_properties.sql', 'dalia', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('d027_add_material_source_and_property_files.sql', 'dalia', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('d028_tape_projects_many_to_many.sql', 'dalia', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('d029_electrode_cut_batch_projects_many_to_many.sql', 'dalia', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('d030_battery_projects_many_to_many.sql', 'dalia', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('d031_harden_battery_stack_validate_trigger.sql', 'dalia', NULL, 'd032_baseline', 'Historical migration backfilled by d032; exact original applied_at unknown.'),
    ('d032_create_schema_migrations_table.sql', 'dalia', now(), 'manual', 'Creates schema_migrations and records the current migration baseline.')
ON CONFLICT (migration_name) DO NOTHING;

COMMIT;
