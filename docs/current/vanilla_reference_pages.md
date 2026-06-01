# Vanilla Reference Pages

Created: 2026-05-09
Edited: 2026-05-09
Status: current
Verified against code: 2026-05-09

Source paths:

- `public/js/badb-ui.js`
- `public/css/styles.css`
- `public/workflow/1-tapes.html`
- `public/js/1-tapes.js`
- `public/reference/projects.html`
- `public/js/projects.js`
- `public/reference/recipes.html`
- `public/js/recipes.js`
- `public/reference/users.html`
- `public/js/users.js`
- `public/reference/departments.html`
- `public/js/departments.js`
- `public/reference/electrolytes.html`
- `public/js/electrolytes.js`
- `public/reference/separators.html`
- `public/js/separators.js`
- `docs/instructions/vanilla_ui_patterns.md`

This document summarizes shared current behavior for polished vanilla v1 pages.
Domain-specific behavior still belongs in the individual current docs.

## Shared List Behavior

The primary content area of each list row opens the record. List actions such
as print or duplicate are separate buttons so they do not accidentally open the
record.

Opened-record pages scroll to the top through `BADB_UI.scrollToTop`, usually
with smooth behavior for ordinary record opening.

Filter behavior is page-local and client-side over the list payload already
loaded into the browser. Reset buttons clear filters without changing the
opened record. Empty filtered results show a compact empty state and count text
such as `Показано 2 из 10` or `Всего: 10`.

## Sticky Opened-Record Header

The polished opened-record pages use a sticky header above the form. It shows:

- record title or id/name;
- compact metadata;
- dirty flag when there are unsaved changes;
- save/create action;
- exit action;
- print action only when a report exists and a saved record is open;
- delete action only where deletion exists and a saved record is open;
- inline status near the action buttons.

Save keeps the record open. Exit closes the opened record and returns to the
list view; it does not log out of the account.

## Button Language

The vanilla UI uses Russian visible labels and tooltips. Current shared labels:

- `Сохранить` for saving an opened record;
- `Печать` for opening a print report;
- `Выйти` for closing the opened record;
- `Удалить` for deleting the opened record;
- `Сбросить` for clearing filters.

List-level icon buttons use tooltips and `aria-label`. The current common
print icon is `🖨️`; the current common duplicate icon is `📑`.

## Current Feature Matrix

| Page | Row Opens | Sticky Header | Filters | Print | Duplicate | Delete | Delete Check | Files |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Tapes | yes | yes | text, status, project, role, sidedness | yes | list client starter | opened record, admin/lead, typed phrase | yes | no |
| Projects | yes | yes | text, status, access, lead | yes | list client starter | opened record, backend dependency errors | no standalone route | no |
| Recipes | yes | yes | text, role | yes | list client copy; backend route also exists | opened record, typed phrase | yes | no |
| Users | yes | yes | text, role, department, active | no | no | opened record when allowed | no standalone route | no |
| Departments | yes | yes | text, head | no | no | no | no | no |
| Electrolytes | yes | yes | text, status, type | yes | list action | opened record, typed phrase | yes | DB-backed |
| Separators | yes | yes | text, status, structure | yes | list action | opened record, typed phrase | yes | DB-backed |

Materials and older/smaller reference pages may still use older page-specific
UI patterns. Do not infer this matrix for pages not listed here without checking
the code.

## Reports

Current print-report pages:

- `/workflow/tape-print.html?tape_id=<id>`
- `/workflow/project-print.html?project_id=<id>`
- `/workflow/recipe-print.html?recipe_id=<id>`
- `/workflow/electrolyte-print.html?electrolyte_id=<id>`
- `/workflow/separator-print.html?sep_id=<id>`
- battery and electrode print pages documented in their own current docs

Print buttons are exposed on list rows and opened-record headers only for pages
with a report.

## Duplicate

Duplicate is implemented only where the page exposes it.

Current behavior:

- Tapes duplicate is a client-side unsaved starter copy; it copies name, notes,
  and project links only.
- Projects duplicate is a client-side unsaved copy without access grants.
- Recipes duplicate is a client-side unsaved copy of the recipe form and lines;
  `POST /api/recipes/:id/duplicate` also exists but is not used by the current
  vanilla list button.
- Electrolytes and Separators have list-level duplicate actions.
- Users and Departments have no duplicate action.

Do not add duplicate buttons to pages where they are not implemented.

## Delete

Delete belongs inside the opened record, not on list rows.

Current delete preflight behavior:

- Tapes, Recipes, Electrolytes, and Separators call delete-check before typed
  confirmation.
- Projects and Users have no standalone delete-check route; the DELETE request
  returns dependency conflicts when blocked.
- Departments currently have no delete route or button.

Typed confirmation exists only where implemented:

- `DELETE TAPE <id>`
- `DELETE RECIPE <id>`
- `DELETE ELECTROLYTE <id>`
- `DELETE SEPARATOR <id>`

## Files

Files are page-specific. Electrolytes and Separators store files in database
tables and expose list/upload/download/delete routes. Materials have separate
source/property file behavior documented in `docs/current/materials.md`.
Batteries have electrochemistry files documented in `docs/current/batteries.md`.

Tapes, Projects, Recipes, Users, and Departments currently do not have file
attachments.
