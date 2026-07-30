# Tapes

Created: 2026-05-09
Edited: 2026-07-16
Status: current
Verified against code: 2026-06-09

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

Since migration `d047_recipe_active_material_slot`, the tape also stores its
chemistry in `active_material_id` (FK → materials, ON DELETE RESTRICT). The
recipe's active line is an open slot (`material_id` NULL); creating a tape
means choosing an active material AND a recipe. The backend validates that the
material's role matches the recipe's electrode role (cathode recipe ↔
`cathode_active` material). Tape-scoped queries resolve the slot with
`COALESCE(line.material_id, tapes.active_material_id)`, so reports and
downstream capacity/battery views see a filled line.

## Workflow Order

The visible workflow is progressive:

1. create or open the tape;
2. save general info with at least one project, an active material, and a
   recipe (the material's role must match the recipe's electrode role);
3. choose concrete material instances for recipe lines;
   material-instance dropdowns refresh on open (`focus`) through
   `GET /api/materials/:material_id/instances`; the current selection is
   preserved when the option list is rebuilt;
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
`gap_um_side2`. Measured thickness after coating/drying and before calendering
is stored separately and does not replace gap/zazor: side 1 uses
`coated_thickness_um`, and two-sided coating can also store side 2 in
`coated_thickness_um_side2`. The retired
`coat_temp_c` column remains in the database for
compatibility, but the vanilla UI no longer shows or saves a coating-temperature
field. The weighing step is complete only when required included-in-percent
recipe lines have actual mass or volume values.

Current coating/drying UI details:

- two-sided coating shows separate side 1 and side 2 coating gaps;
- thickness after coating/drying and before calendering has separate side 1
  and, for two-sided coating only, side 2 fields;
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

For the active slot line the instance list is drawn from the tape's
`active_material_id` (the recipe line itself has no material). Saving an
actual validates the instance belongs to the line's material — or, on the
slot line, to the tape's active material; choosing the active material is a
precondition for slot actuals. The solution concentration (5% vs 7% PVDF in
NMP) is exactly this instance choice and is not part of the recipe.

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
When slurry volume changes, the UI can auto-fill the wet mixing method
while the field is blank or still auto-selected. The user can override the
method manually; manual selection stops further auto-overwrite until the field
is cleared.

Since migration `d048_vilitek_mixer_containers_and_balls`, the auto-selection
windows live in `wet_mixing_methods.auto_min_volume_ml/auto_max_volume_ml`
(no longer hardcoded in the frontend). The Vilitek V-ITT-300s vacuum
planetary centrifugal mixer owns the 15–150 мл window; the magnetic stirrer
stays selectable but is never auto-suggested. Methods flagged
`uses_containers`/`uses_balls` additionally record the cup
(`tape_step_mixing.container_id` → `mixing_containers`) and the agate
milling balls used (`tape_step_mixing_balls`: one row per diameter with a
count, e.g. 10×0,5 см + 3×1,0 см). The UI shows a text-only suggestion for
the ball set — target ball volume = ⅓ of the slurry volume (lab convention,
see `client-web/src/utils/ballSuggestion.js`; the same math is inlined in
vanilla), greedy largest-first combo, with a warning when slurry + balls
exceed the cup's `max_working_volume_ml`. The suggestion never fills the
inputs automatically; recorded ball data is also the future calibration set
for this coefficient.

The same section stores viscosity in `мПа·с` and an optional viscosity
conditions note, such as spindle and speed (`#3, 6 об/мин`). The conditions
field is optional and should be left blank when the measurement setup is
unknown.

Current auto-selection ranges:

- `< 15 ml`: manual mixing;
- `15-150 ml`: magnetic stirrer;
- `>150-450 ml`: GELON GN-VM-7 vacuum mixer, 500 ml;
- `>450-750 ml`: ACEY ACEY-EVM-1L vacuum mixer, 1 L;
- `1500-3500 ml`: GELON GN-PM-5L double planetary mixer, 5 L.

Volumes between `750` and `1500 ml`, above `3500 ml`, or invalid/blank volumes
do not auto-select a wet mixing method.

## Dry Box State

> **P2 (2026-07-30, approved):** the closet workflow below is RETIRED in the
> Vue product. Vue shows a «Хранение ленты» card: free-form storage log
> (`tapes.storage_notes`, d056; preserved when a PUT omits the key) + the
> terminal deplete action + a read-only archive line of historical
> `tape_dry_box_state` rows. Creating an electrode cut batch NO LONGER
> auto-writes dry-box state, and the final-drying gate on the dry-box routes
> is a no-op. The vanilla section below stays accurate for vanilla only.

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
- list-level duplicate loads the source tape restore data and opens an unsaved
  create-mode draft with copied general info, recipe/material selections,
  actuals, operators, timestamps, comments, and workflow technical fields where
  available;
- duplicate is client-side and does not call a backend duplicate endpoint;
- duplicate does not immediately write to the database; the tape row is created
  only after the user clicks Create, and copied recipe/workflow sections remain
  unsaved until their section save buttons are used;
- duplicate does not copy tape identity/audit metadata, downstream electrodes or
  batteries, depletion status, or dry-box status; dry-box availability starts as
  `out_of_dry_box`;
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
