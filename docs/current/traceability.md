# Traceability

Created: 2026-05-06
Edited: 2026-05-06
Status: current
Verified against code: light check 2026-05-06
Source paths: `middleware/trackChanges.js`, `migrations/006_add_auth_to_dalia_db.sql`, `migrations/012_activity_log.sql`, `migrations/013_traceability.sql`, `migrations/d013_add_updated_at_to_tapes_and_batteries.sql`, `migrations/d014_touch_parent_updated_at_triggers.sql`, `migrations/d015_backfill_updated_at_from_real_history.sql`, `routes/activity.js`, `routes/dashboard.js`, `routes/batteries.js`, `routes/projects.js`, `routes/tapes.js`, `services/batteryLifecycleService.js`

Traceability is implemented through a combination of field-level change logs, activity logs, auth logs, and selected `updated_at` / `updated_by` fields.

## Current Logs

- `field_changelog` stores field-level before/after changes for route families that call `trackChanges`.
- `activity_log` stores higher-level workflow events, including guided battery delete events.
- `auth_log` stores authentication-related events separately.

`routes/activity.js` reads `activity_log` and `field_changelog` for user-facing history. Dashboard activity views combine `auth_log`, `field_changelog`, and `activity_log`.

## Change Tracking

`middleware/trackChanges.js` compares old and new row values and writes changed fields to `field_changelog`.

Not every table is fully traceable. Before promising field-level history for a page, verify that its route or service actually calls `trackChanges` and that the table has the required metadata fields.

## Metadata Fields

Migration `013_traceability.sql` added or normalized traceability metadata for major workflow/reference tables. Later migrations added more table-specific timestamp support, including battery and cycling-related changes.

Common fields are:

- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

Availability differs by table. Check the schema before relying on a field.

## Boundary

Traceability docs must not invent a universal audit system. The current system is broad but uneven: it covers many important routes and logs major actions, but coverage still has to be verified table by table.
