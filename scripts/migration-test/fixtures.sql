-- ============================================================================
-- Migration rehearsal fixtures — synthetic edge cases layered on the d040
-- baseline (real data from sql_backups/local_only/0424_badb_app_v1_full.sql).
--
-- These cover edge cases the real dump data does NOT contain, so the
-- d041 -> d042 -> d043 rehearsal exercises them. See run.sh and
-- docs/current/release_readiness.md "Lab Database Verification".
--
-- THROWAWAY DATABASES ONLY. Never run against badb_app_v1 or the lab DB.
-- ============================================================================

BEGIN;

-- (1) d042: a project with NULL lead_id must be SKIPPED (the backfill is
--     WHERE lead_id IS NOT NULL). It must gain no participant and no access row.
INSERT INTO projects (name, created_by, lead_id)
VALUES ('zz-migtest-null-lead', 4, NULL);

-- (2) d042: a lead who ALREADY has a non-admin access grant must be UPGRADED to
--     'admin' via ON CONFLICT (user_id, project_id) DO UPDATE. User 4 leads
--     project 1; pre-seed a 'view' grant so the upsert has something to flip.
INSERT INTO user_project_access (user_id, project_id, access_level, granted_by, granted_at)
VALUES (4, 1, 'view', 4, now())
ON CONFLICT (user_id, project_id) DO UPDATE SET access_level = 'view';

-- (3) d043: an electrode source with NULL cut_batch_id must get an id +
--     is_primary and stay OUTSIDE the (battery_id, role, cut_batch_id) partial
--     unique index (which is WHERE cut_batch_id IS NOT NULL). Battery 1 has only
--     a 'cathode' source, so adding an 'anode' is safe under the old PK.
INSERT INTO battery_electrode_sources (battery_id, role, tape_id, cut_batch_id, source_notes)
VALUES (1, 'anode', NULL, NULL, 'zz-migtest null cut_batch');

COMMIT;
