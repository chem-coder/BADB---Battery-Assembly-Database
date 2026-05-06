# Electrolytes

Created: 2026-05-06
Edited: 2026-05-06
Status: current
Verified against code: 2026-05-06

Source paths:

- `routes/electrolytes.js`
- `public/reference/electrolytes.html`
- `public/js/electrolytes.js`
- `public/js/badb-ui.js`
- `public/css/styles.css`
- `contracts/vanilla_api_endpoints.json`

This document describes the current Electrolytes reference page and API behavior.
Electrolytes are selected during battery assembly through
`battery_electrolyte.electrolyte_id`.

## Data Model

Primary table:

- `electrolytes`

Current user-facing fields:

- `name`
- `electrolyte_type`
- `solvent_system`
- `salts`
- `concentration`
- `additives`
- `notes`
- `status`

Allowed electrolyte types:

- `liquid`
- `solid`
- `gel`

Allowed statuses:

- `active`
- `inactive`
- `archived`

`created_by` is server-owned from the authenticated user on create.
`updated_by` and `updated_at` are set by the backend on update.

## Files

Electrolyte files are stored in the database table `electrolyte_files`, not in
the disk-backed `uploads/` folder.

Current file routes support:

- list files for an electrolyte;
- upload base64 file entries;
- download individual files through authenticated routes;
- delete individual file rows.

## API Behavior

All current electrolyte routes require `auth`, except the small `/test` route.

Current route families:

- `GET /api/electrolytes`
- `POST /api/electrolytes`
- `PUT /api/electrolytes/:id`
- `GET /api/electrolytes/:id/delete-check`
- `DELETE /api/electrolytes/:id`
- `GET /api/electrolytes/:id/files`
- `POST /api/electrolytes/:id/files`
- `GET /api/electrolytes/files/:fileId/download`
- `DELETE /api/electrolytes/files/:fileId`

Create and update require `name` and `electrolyte_type`. The backend rejects
unknown `electrolyte_type` and `status` values.

Delete is blocked when the electrolyte is used by any row in
`battery_electrolyte`. The delete-check endpoint returns `can_delete`, a
message, and dependency records before the UI asks for typed confirmation.

## Current Page Behavior

The vanilla Electrolytes page uses the shared `BADB_UI` helper for common
reference-page mechanics.

Current behavior:

- entering a name in the top add field opens a new electrolyte record;
- list row summary opens an existing electrolyte record;
- duplicate remains a list-level action;
- an opened record has a sticky header with compact metadata, save, exit,
  delete, dirty flag, and inline status;
- the record name is edited by clicking the title;
- save keeps the record open;
- file save/delete status is shown near the files section;
- delete lives inside the opened record header and uses typed confirmation
  `DELETE ELECTROLYTE <id>`;
- delete blockers are shown before typed confirmation;
- unsaved changes are guarded during in-page exit, logout, record switching,
  and browser unload.

## Current Boundaries

The page does not currently have an electrolyte print report.

Do not expand the electrolyte schema or add electrochemical formulation logic
unless it is explicitly required for pilot release or a later feature pass.
