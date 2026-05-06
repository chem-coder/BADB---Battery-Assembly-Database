# Cycling

Created: 2026-05-06
Edited: 2026-05-06
Status: current
Verified against code: light check 2026-05-06
Source paths: `routes/cycling.js`, `scripts/parse_cycling.py`, `client-web/src/pages/CyclingPage.vue`, `client-web/src/components/CyclingCharts.vue`, `migrations/015_cycling.sql`, `migrations/019_cycling_summary_extra_metrics.sql`, `migrations/020_cycling_active_mass.sql`

The cycling module imports raw instrument files, stores parsed cycling data in PostgreSQL, and exposes session analytics through `/api/cycling`.

## Current Data Model

Current cycling tables include:

- `cycling_sessions`: uploaded file/session metadata, parser status, active mass, and file path/hash fields;
- `cycling_datapoints`: parsed time-series rows;
- `cycling_cycle_summary`: per-cycle summary metrics.

The active-material mass field is `active_mass_mg`.

## Current API

`routes/cycling.js` provides routes for:

- uploading and parsing cycling files;
- listing sessions;
- reading, patching, and deleting one session;
- reading session summaries, cycle rows, and datapoints;
- exporting parsed data as CSV or XLSX.

The backend uses `scripts/parse_cycling.py` for file parsing and stores raw/processing files under `uploads/cycling/`.

## Current Frontend

The Vue cycling page is `client-web/src/pages/CyclingPage.vue`. It supports uploads, session selection, active-mass editing, charts, deletion, and exports.

Charts are rendered through `client-web/src/components/CyclingCharts.vue`.

## Storage Boundary

Cycling raw files are disk-backed. Current `app.js` still serves `/uploads` statically, so upload privacy is not complete yet. The intended private-download transition lives in `../future/upload_storage_transition.md`.

Do not claim cycling raw files are private until the static `/uploads` exposure is removed or scoped.
