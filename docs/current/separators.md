# Separators

Created: 2026-05-08
Edited: 2026-05-08
Status: current
Verified against code: 2026-05-08

Source paths:

- `routes/separators.js`
- `public/reference/separators.html`
- `public/js/separators.js`
- `public/workflow/separator-print.html`
- `public/js/separator-print.js`
- `public/js/badb-ui.js`
- `public/css/styles.css`
- `contracts/vanilla_api_endpoints.json`

This document describes the current Separators reference page and API behavior.
Separators are selected during battery assembly through
`battery_sep_config.separator_id`.

## Data Model

Primary tables:

- `separators`
- `separator_structure`
- `separator_files`

Current user-facing separator fields:

- `name`
- `supplier`
- `brand`
- `batch`
- `structure_id`
- `air_perm`
- `air_perm_units`
- `thickness_um`
- `porosity`
- `comments`
- `status`
- `depleted_at`

Allowed statuses:

- `available`
- `used`
- `scrap`

`created_by` is server-owned from the authenticated user on create.
`updated_by` and `updated_at` are set by the backend on update.

Separators do not currently have project links.

## Files

Separator files are stored in the database table `separator_files`, not in the
disk-backed `uploads/` folder.

Current file routes support:

- list files for a separator;
- upload base64 file entries;
- download individual files through authenticated routes;
- delete individual file rows.

## API Behavior

All current separator routes require `auth`, except the small `/test` route.

Current route families:

- `GET /api/separators`
- `POST /api/separators`
- `PUT /api/separators/:id`
- `GET /api/separators/:id/report`
- `GET /api/separators/:id/delete-check`
- `DELETE /api/separators/:id`
- `GET /api/separators/:id/files`
- `POST /api/separators/:id/files`
- `GET /api/separators/files/:fileId/download`
- `DELETE /api/separators/files/:fileId`

Create and update require `name` and `structure_id`. The backend rejects
unknown `status` values. Blank optional numeric/date/text fields are normalized
to `NULL` before save, so users do not need to fill passport fields just to
create a separator.

When save fails, the API should return a user-facing reason for expected
validation failures such as missing structure, invalid numeric/date values, or a
duplicate `name` + `batch` combination.

Delete is blocked when the separator is used by any row in
`battery_sep_config`. The delete-check endpoint returns `can_delete`, a
message, and dependency records before the UI asks for typed confirmation.

The report endpoint returns a compact print payload with the separator row and
attached file metadata. It does not include file contents.

## Current Page Behavior

The vanilla Separators page uses the shared `BADB_UI` helper for common
reference-page mechanics.

Current behavior:

- entering a name in the top add field opens a new separator record;
- list row summary opens an existing separator record;
- list filters apply client-side to the loaded list by text, status, and
  separator structure;
- filter reset clears all list filters without changing the opened record;
- empty filtered results show a compact empty state;
- duplicate remains a list-level action;
- print is available from each saved list row and from the opened record header;
- an opened record has a sticky header with compact metadata, save, exit,
  print, delete, dirty flag, and inline status;
- the record name is edited by clicking the title;
- save keeps the record open;
- file save/delete status is shown near the files section;
- delete lives inside the opened record header and uses typed confirmation
  `DELETE SEPARATOR <id>`;
- delete blockers are shown before typed confirmation;
- unsaved changes are guarded during in-page exit, logout, record switching,
  and browser unload.

## Print Report

The record print report lives at
`/workflow/separator-print.html?sep_id=<id>` and loads
`GET /api/separators/:id/report`.

Report contents:

- separator id and name;
- status and structure;
- supplier, brand, batch, comments;
- air permeability, thickness, porosity, and depleted date;
- created/updated metadata when available;
- attached file id, name, MIME type, size, and upload timestamp.

The print page has no main app chrome and exposes a `window.print()` action.

## Current Boundaries

Do not add project filters or project links to separators unless the schema and
workflow are explicitly expanded. Current separator filters should use only
existing separator fields.
