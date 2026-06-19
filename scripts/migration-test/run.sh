#!/usr/bin/env bash
# ============================================================================
# Migration rehearsal — proves d041 -> d042 -> d043 apply cleanly on top of a
# faithful d040 baseline WITH DATA, lose nothing, and land on the same schema a
# fresh install produces.
#
# THROWAWAY DATABASES ONLY. Hard-guarded against badb_app_v1 / lab / prod.
# Never connects to the lab database.
#
# Usage:  bash scripts/migration-test/run.sh
# Requires: a local PostgreSQL (Postgres.app) running, role "Dalia".
# ============================================================================
set -euo pipefail
export PGOPTIONS='--client-min-messages=warning'
export PGUSER="${PGUSER:-Dalia}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TEST_DB="badb_migration_test"
FRESH_DB="badb_migration_test_fresh"
DUMP="${DUMP:-$ROOT/sql_backups/local_only/0424_badb_app_v1_full.sql}"

for db in "$TEST_DB" "$FRESH_DB"; do
  case "$db" in badb_app_v1|*lab*|*prod*) echo "ABORT: refusing to manage '$db'"; exit 1;; esac
done
[ -f "$DUMP" ] || { echo "ABORT: dump not found: $DUMP"; exit 1; }

# Baseline = restore dump + apply post-dump migrations THROUGH d040.
THRU_D040=(
  002_raw_submissions 018_department_real_names_and_assignments
  019_cycling_summary_extra_metrics 020_cycling_active_mass
  d028_tape_projects_many_to_many d029_electrode_cut_batch_projects_many_to_many
  d030_battery_projects_many_to_many d031_harden_battery_stack_validate_trigger
  d032_create_schema_migrations_table d033_add_coating_side2_gap_and_drying_speed
  d034_update_wet_mixing_methods d035_add_item_created_at_dates
  d036_add_prism_form_factor d037_add_viscosity_conditions
  d038_add_electrode_capacity_average_flag d039_add_electrode_test_batch_flag
  d040_add_coated_thickness_fields
)
UPGRADE=( d041_project_participants d042_project_leads_as_team_members d043_enable_multi_battery_electrode_sources )

q() { psql -d "$1" -tAqc "$2"; }                 # quiet scalar query
apply() { psql -d "$1" -q -v ON_ERROR_STOP=1 -f "$ROOT/migrations/$2.sql" >/dev/null 2>&1; }
build_baseline() {                               # $1 = db name
  psql -d postgres -q -c "DROP DATABASE IF EXISTS $1;" -c "CREATE DATABASE $1;"
  psql -d "$1" -q -v ON_ERROR_STOP=1 -f "$DUMP" >/dev/null 2>&1
  local m; for m in "${THRU_D040[@]}"; do apply "$1" "$m"; done
}

FAILS=0
check() { # $1 = label, $2 = actual, $3 = expected
  if [ "$2" = "$3" ]; then printf '  [PASS] %s = %s\n' "$1" "$2"
  else printf '  [FAIL] %s = %s (expected %s)\n' "$1" "$2" "$3"; FAILS=$((FAILS+1)); fi
}

echo "### 1. Build d040 baseline (real data) + load edge-case fixtures"
build_baseline "$TEST_DB"
check "baseline dalia" "$(q "$TEST_DB" "SELECT count(*) FROM schema_migrations WHERE migration_stream='dalia'")" 28
check "baseline dima"  "$(q "$TEST_DB" "SELECT count(*) FROM schema_migrations WHERE migration_stream='dima'")"  21
psql -d "$TEST_DB" -q -v ON_ERROR_STOP=1 -f "$ROOT/scripts/migration-test/fixtures.sql" >/dev/null
PROJ_WITH_LEAD=$(q "$TEST_DB" "SELECT count(*) FROM projects WHERE lead_id IS NOT NULL")
BES_BEFORE=$(q "$TEST_DB" "SELECT count(*) FROM battery_electrode_sources")
echo "  baseline+fixtures: projects_with_lead=$PROJ_WITH_LEAD, battery_electrode_sources=$BES_BEFORE"

echo "### 2. Apply the upgrade under test: d041 -> d042 -> d043"
for m in "${UPGRADE[@]}"; do
  if apply "$TEST_DB" "$m"; then echo "  applied $m"; else echo "  [FAIL] $m errored"; FAILS=$((FAILS+1)); fi
done

echo "### 3. Verify ledger + data integrity"
check "ledger dalia (28->31)" "$(q "$TEST_DB" "SELECT count(*) FROM schema_migrations WHERE migration_stream='dalia'")" 31
check "ledger dima (unchanged)" "$(q "$TEST_DB" "SELECT count(*) FROM schema_migrations WHERE migration_stream='dima'")" 21
# d042: one participant per lead-bearing project; NULL-lead project skipped
check "project_participants = projects_with_lead" "$(q "$TEST_DB" "SELECT count(*) FROM project_participants")" "$PROJ_WITH_LEAD"
check "null-lead project has 0 participants" "$(q "$TEST_DB" "SELECT count(*) FROM project_participants pp JOIN projects p USING(project_id) WHERE p.lead_id IS NULL")" 0
check "null-lead project has 0 access rows"  "$(q "$TEST_DB" "SELECT count(*) FROM user_project_access a JOIN projects p USING(project_id) WHERE p.lead_id IS NULL")" 0
# d042 ON CONFLICT DO UPDATE: the pre-seeded 'view' grant for the lead is now 'admin'
check "pre-existing lead grant upgraded to admin" "$(q "$TEST_DB" "SELECT access_level FROM user_project_access WHERE user_id=4 AND project_id=1")" admin
check "all lead access rows are admin" "$(q "$TEST_DB" "SELECT count(*) FILTER (WHERE access_level<>'admin') FROM user_project_access")" 0
# d043: no rows lost, every row got an id + is_primary, new uniqueness present
check "battery_electrode_sources count unchanged" "$(q "$TEST_DB" "SELECT count(*) FROM battery_electrode_sources")" "$BES_BEFORE"
check "all rows have non-null surrogate id" "$(q "$TEST_DB" "SELECT count(*) FROM battery_electrode_sources WHERE battery_electrode_source_id IS NULL")" 0
check "surrogate ids are unique" "$(q "$TEST_DB" "SELECT count(*)-count(DISTINCT battery_electrode_source_id) FROM battery_electrode_sources")" 0
check "all existing rows is_primary=true" "$(q "$TEST_DB" "SELECT count(*) FILTER (WHERE is_primary IS NOT TRUE) FROM battery_electrode_sources")" 0
check "new PK is on surrogate id" "$(q "$TEST_DB" "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='battery_electrode_sources'::regclass AND contype='p'")" "PRIMARY KEY (battery_electrode_source_id)"
check "both partial unique indexes exist" "$(q "$TEST_DB" "SELECT count(*) FROM pg_indexes WHERE tablename='battery_electrode_sources' AND indexname IN ('uq_bes_battery_role_batch','uq_bes_one_primary_per_role')")" 2

echo "### 4. New constraints actually enforce (post-upgrade probes, rolled back)"
# All probes reuse real values / the NULL-cut_batch fixture row so they isolate
# the new indexes without tripping foreign keys. Battery 1 'anode' (the fixture)
# is_primary=true after d043, with cut_batch_id NULL (outside the batch index).
# (a) a 2nd NON-primary source for the same (battery,role) must be ALLOWED.
MULTI_OK=$(psql -d "$TEST_DB" -tAqc "BEGIN; INSERT INTO battery_electrode_sources(battery_id,role,cut_batch_id,is_primary) VALUES (1,'anode',NULL,false); SELECT 'ok'; ROLLBACK;" 2>/dev/null || echo "blocked")
check "extra non-primary source for (battery,role) allowed" "$MULTI_OK" ok
# (b) a duplicate (battery,role,cut_batch_id) must be REJECTED (uq_bes_battery_role_batch).
DUP_BLOCKED=$(psql -d "$TEST_DB" -tAqc "BEGIN; INSERT INTO battery_electrode_sources(battery_id,role,cut_batch_id,is_primary) SELECT battery_id,role,cut_batch_id,false FROM battery_electrode_sources WHERE cut_batch_id IS NOT NULL LIMIT 1; SELECT 'ok'; ROLLBACK;" 2>/dev/null || echo "blocked")
check "duplicate (battery,role,batch) rejected" "$DUP_BLOCKED" blocked
# (c) a 2nd is_primary for the same (battery,role) must be REJECTED (uq_bes_one_primary_per_role).
TWO_PRIMARY_BLOCKED=$(psql -d "$TEST_DB" -tAqc "BEGIN; INSERT INTO battery_electrode_sources(battery_id,role,cut_batch_id,is_primary) VALUES (1,'anode',NULL,true); SELECT 'ok'; ROLLBACK;" 2>/dev/null || echo "blocked")
check "second is_primary per (battery,role) rejected" "$TWO_PRIMARY_BLOCKED" blocked

echo "### 5. Idempotency — re-apply d041..d043, expect clean no-op"
PP1=$(q "$TEST_DB" "SELECT count(*) FROM project_participants")
BES1=$(q "$TEST_DB" "SELECT count(*) FROM battery_electrode_sources")
RERUN_OK=yes; for m in "${UPGRADE[@]}"; do apply "$TEST_DB" "$m" || RERUN_OK=no; done
check "re-run applied without error" "$RERUN_OK" yes
check "project_participants unchanged after re-run" "$(q "$TEST_DB" "SELECT count(*) FROM project_participants")" "$PP1"
check "battery_electrode_sources unchanged after re-run" "$(q "$TEST_DB" "SELECT count(*) FROM battery_electrode_sources")" "$BES1"
check "ledger still 31 dalia after re-run" "$(q "$TEST_DB" "SELECT count(*) FROM schema_migrations WHERE migration_stream='dalia'")" 31

echo "### 6. Schema equivalence — upgraded-from-d040 vs fresh d043"
build_baseline "$FRESH_DB"
for m in "${UPGRADE[@]}"; do apply "$FRESH_DB" "$m"; done
# Strip pg_dump's random \restrict/\unrestrict anti-injection tokens (they
# differ every run and are not part of the schema).
pg_dump --schema-only --no-owner -d "$TEST_DB"  | grep -vE '^\\(un)?restrict ' > /tmp/upgraded_schema.sql
pg_dump --schema-only --no-owner -d "$FRESH_DB" | grep -vE '^\\(un)?restrict ' > /tmp/fresh_schema.sql
if diff -q /tmp/upgraded_schema.sql /tmp/fresh_schema.sql >/dev/null; then
  check "upgraded schema == fresh d043 schema" identical identical
else
  check "upgraded schema == fresh d043 schema" "DIFFERS" identical
  echo "  --- schema diff (first 40 lines) ---"; diff /tmp/upgraded_schema.sql /tmp/fresh_schema.sql | head -40
fi

echo ""
if [ "$FAILS" -eq 0 ]; then echo "RESULT: ALL CHECKS PASSED ✓"; else echo "RESULT: $FAILS CHECK(S) FAILED ✗"; fi
exit "$FAILS"
