# Tapes

Created: 2026-05-09
Edited: 2026-05-15
Status: current
Verified against code: 2026-05-15

Source paths:

- `routes/tapes.js`
- `services/tapeCatalogService.js`
- `services/tapeReadService.js`
- `services/tapeWorkflowService.js`
- `services/tapeStepSaveService.js`
- `services/tapeActualService.js`
- `services/tapeDryBoxService.js`
- `services/tapeProjectService.js`
- `public/workflow/1-tapes.html`
- `public/js/1-tapes.js`
- `public/workflow/tape-print.html`
- `public/js/tape-print.js`
- `public/js/badb-ui.js`

This document describes the current vanilla Tapes page. Capacity and slurry
solids calculations are also summarized in
`docs/current/capacity_calculations.md`. Many-to-many project behavior is also
summarized in `docs/current/project_links.md`.

## Scope

The vanilla Tapes page is the preparation workflow for an electrode tape. It is
rooted by `tapes.tape_id`; saved process sections attach to that tape.

Primary current tables:

- `tapes`;
- `tape_projects`;
- `tape_recipe_line_actuals`;
- `tape_process_steps`;
- subtype tables for drying, mixing, coating, and calendering;
- `tape_dry_box_state`.

The tape row stores identity and planning fields such as `name`, `notes`,
`tape_recipe_id`, `calc_mode`, and `target_mass_g`. Project membership is stored
canonically in `tape_projects`; the legacy `tapes.project_id` remains a
compatibility/fallback value.

## Workflow Order

The visible workflow is progressive:

1. create or open the tape;
2. save general info with at least one project and one recipe;
3. choose concrete material instances for recipe lines;
4. save active material drying;
5. save weighing and actual material amounts;
6. save mixing;
7. save coating, which also saves prefilled `drying_tape` parameters;
8. save calendering;
9. save pressed-tape drying;
10. manage dry-box storage/removal/depletion.

Sections unlock from saved state, not from merely filled controls. The current
workflow status is computed by `tapeWorkflowService`, not manually selected by
the user.

Computed status order:

- `recipe_materials` / `Выбор экземпляров`;
- `drying_am` / `Сушка активного материала`;
- `weighing` / `Замес пасты`;
- `mixing` / `Перемешивание`;
- `coating` / `Нанесение`;
- `drying_tape` / `Сушка ленты до каландрирования`;
- `calendering` / `Каландрирование`;
- `drying_pressed_tape` / `Сушка ленты после каландрирования`;
- `finished` / `Завершено`.

The coating step is considered complete only when its header is saved and
`foil_id`, `coating_id`, and the required gap fields are present. One-sided
coating requires `gap_um`; two-sided coating requires both `gap_um` and
`gap_um_side2`. The retired `coat_temp_c` column remains in the database for
compatibility, but the vanilla UI no longer shows or saves a coating-temperature
field. The weighing step is complete only when required included-in-percent
recipe lines have actual mass or volume values.

Current coating/drying UI details:

- two-sided coating shows separate side 1 and side 2 coating gaps;
- inline drying saves drying temperature, atmosphere, duration, and
  `drying_speed_text`;
- the visible coating comment is a shared coating/drying operator note stored in
  `tape_step_coating.method_comments`;
- default inline drying values are `125 °C`, air, and `15 min` for two-sided
  coating; `80 °C`, vacuum, and `5 min` for one-sided anode tapes; and
  `80 °C`, vacuum, and `30 min` for one-sided cathode tapes.

## Recipe Instances And Actuals

Recipe composition comes from `tape_recipes` and `tape_recipe_lines`. The tape
execution selects concrete `material_instances` per recipe line and stores those
selections in `tape_recipe_line_actuals`.

The same actuals table stores weighing values:

- `measure_mode = 'mass'` uses `actual_mass_g`;
- `measure_mode = 'volume'` uses `actual_volume_ml`;
- volume-to-mass display requires `material_properties.density_g_ml` for the
  selected material instance.

Saving selected instances may write actual rows with no actual mass or volume
yet. Later weighing save updates the same rows with actual values.

Planning supports two modes:

- `from_active_mass`: `target_mass_g` is target active material mass;
- `from_slurry_mass`: `target_mass_g` is the input mass for the UI-labelled
  slurry-mass planning mode.

The UI calculates planned masses-to-weigh for included recipe lines before
actual weighing:

- recipe percentages come from included `tape_recipe_lines.slurry_percent`
  rows;
- `from_active_mass` uses `target_mass_g` as the desired active-material mass;
- `from_slurry_mass` uses `target_mass_g` as the input mass for the included
  percent basis, then derives the active-material target from the active-line
  percent;
- total dry-component mass is derived from the active-material target and the
  active-line percent;
- each included recipe line receives a target dry mass from its recipe percent;
- if the selected material instance is itself a mixture, the page expands its
  component fractions and calculates how much of that instance must be weighed
  to supply the remaining target mass of the requested material;
- component overlap is accounted for so a premixed instance can satisfy more
  than one recipe-line target.

Solvent or other rows excluded from percent calculation are recorded as actual
values, but they are not assigned an automatic planned mass by the dry-component
planning calculation.

The UI shows planned quantities, expanded calculation rows, difference from
actual values in reports, and live slurry solids summary from the selected
instances and actual values.

The mixing section stores `slurry_volume_ml` and the selected wet mixing method.
When slurry volume changes, the vanilla UI can auto-fill the wet mixing method
while the field is blank or still auto-selected. The user can override the
method manually; manual selection stops further auto-overwrite until the field
is cleared.

Current auto-selection ranges:

- `< 15 ml`: manual mixing;
- `15-150 ml`: magnetic stirrer;
- `>150-450 ml`: GELON GN-VM-7 vacuum mixer, 500 ml;
- `>450-750 ml`: ACEY ACEY-EVM-1L vacuum mixer, 1 L;
- `1500-3500 ml`: GELON GN-PM-5L double planetary mixer, 5 L.

Volumes between `750` and `1500 ml`, above `3500 ml`, or invalid/blank volumes
do not auto-select a wet mixing method.

## Dry Box State

After pressed-tape drying, the page exposes the dry-box section.

Current dry-box actions:

- save dry-box parameters through `PUT /api/tapes/:id/dry-box-state`;
- place in dry box now;
- remove from dry box now;
- return to dry box now;
- mark the tape depleted.

Dry-box state writes `tape_dry_box_state` and updates
`tapes.availability_status` to values such as `in_dry_box`,
`out_of_dry_box`, or `depleted`. Removing or returning after final drying is
validated against the latest `drying_pressed_tape` end time.

## List And Opened Record

Current page behavior:

- entering a tape name in the top add field opens an unsaved new tape;
- the loaded list is ordered by `item_created_at DESC`, then record
  `created_at DESC`;
- list row date metadata shows `item_created_at | updated_at` without visible
  labels, with full created/updated wording in the tooltip;
- list row summary opens an existing tape and restores saved steps;
- list-level print opens the tape report;
- list-level duplicate creates an unsaved starter copy with copied name, notes,
  and project links only;
- duplicate is client-side and does not call a backend duplicate endpoint;
- the opened tape has a sticky header with tape id/name, metadata, dirty flag,
  save/create, print, exit, delete, and inline save status;
- the record name is edited by clicking the title;
- record `created_at` is automatic audit metadata;
- user-facing `item_created_at` is exposed as date-only `Дата создания` for the
  physical tape; it defaults to today and accepts today or past dates only,
  while `updated_at` remains automatic;
- save keeps the record open;
- delete lives only inside the opened record header;
- unsaved changes are guarded during exit, logout, record switching, and browser
  unload.

Current list filters are client-side over the loaded list:

- text search across id, visible list label, name, notes, recipe/material/coating
  labels, status label, creator, and project ids/names;
- workflow status;
- project;
- role (`cathode` or `anode`);
- coating sidedness (`one_sided` or `two_sided`);
- reset button.

## API Behavior

All current tape routes require `auth`, except the small `/test` route.

Current route families:

- `GET /api/tapes`
- `POST /api/tapes`
- `GET /api/tapes/:id`
- `PUT /api/tapes/:id`
- `GET /api/tapes/:id/report`
- `GET /api/tapes/:id/delete-check`
- `DELETE /api/tapes/:id`
- `GET /api/tapes/:id/actuals`
- `POST /api/tapes/:id/actuals`
- `GET /api/tapes/:id/steps/by-code/:code`
- `POST /api/tapes/:id/steps/by-code/:code`
- `GET /api/tapes/:id/steps/drying`
- `GET /api/tapes/:id/dry-box-state`
- `PUT /api/tapes/:id/dry-box-state`
- `POST /api/tapes/:id/dry-box-state/place-now`
- `POST /api/tapes/:id/dry-box-state/remove-now`
- `POST /api/tapes/:id/dry-box-state/return-now`
- `POST /api/tapes/:id/dry-box-state/deplete`
- `GET /api/tapes/:id/electrode-cut-batches`
- `GET /api/tapes/for-electrodes`

Delete-check and delete require `admin` or `lead`.

## Delete

Tape delete is a physical record delete for mistaken records. It is not a
workflow depletion action.

Delete blockers:

- batteries where the tape is selected as an electrode source;
- electrode cut batches cut from the tape;
- batteries containing electrodes from the tape.

The UI first calls `GET /api/tapes/:id/delete-check`. If deletion is allowed,
the user must type:

```text
DELETE TAPE <tape_id>
```

The delete button is only visible in the opened record. List rows do not expose
delete.

## Print Report

The print report lives at `/workflow/tape-print.html?tape_id=<id>` and loads
`GET /api/tapes/:id/report`.

Report payload includes:

- tape identity, recipe, projects, creator, notes, and workflow status;
- recipe lines and selected material instances;
- planned/actual mixture rows;
- saved process steps;
- dry-box state.

Tapes currently do not have file attachments.

## Current Boundaries

Do not treat `availability_status = depleted` as a deletion substitute. Depleted
means the physical tape is no longer available for downstream cutting; the tape
record and history stay in the database.
