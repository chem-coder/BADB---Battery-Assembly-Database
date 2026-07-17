# Electrodes

Created: 2026-05-06
Edited: 2026-07-17
Status: current
Verified against code: 2026-06-09

Source paths:

- `routes/electrodes.js`
- `services/electrodeCutBatchService.js`
- `services/electrodeCatalogService.js`
- `services/electrodeCapacityService.js`
- `services/batteryCompatibleCutBatchService.js`
- `services/batteryElectrodeSourceService.js`
- `services/batteryElectrodeStackService.js`
- `public/js/2-electrodes.js`
- `public/js/3-batteries.js`

This document summarizes the current electrode behavior that affects the
Batteries workflow. Stack-specific hard rules live in
`docs/rules/electrode_stack_rules.md`. Derived capacity behavior lives in
`docs/current/capacity_calculations.md`.

## Electrode Cut Batches

Electrode cut batches are created from tapes and define the pool of individual
electrodes available for later battery assembly.

List and dropdown ordering is deterministic and shared across the Electrodes
page, Batteries source-batch selectors, and list APIs:

1. available/active batches first when drying status exists:
   `drying_end` set, then `drying_start` without `drying_end`, then in-work;
2. newest physical `item_created_at` first, then record `created_at`;
3. highest `cut_batch_id` as the final tie-breaker.

Battery-compatible batch dropdowns may still pin the currently selected saved
batch at the top during refresh; the selected value is preserved when option
lists are rebuilt.

Battery compatibility uses cut batch attributes including:

- `tape_id`;
- `shape`;
- `target_form_factor`;
- coating-step sidedness from `tape_step_coating.coating_sidedness`.

Current shape behavior:

- coin batteries use circular cut batches;
- pouch, prism, and cylindrical batteries use rectangular cut batches.

Current sidedness behavior:

- coin-compatible cut batches must be one-sided;
- pouch, prism, and cylindrical compatible cut batches may be one-sided or
  two-sided.

## Vanilla Electrode Batches Page

The top controls on the vanilla Electrode Batches page are real list filters
for the main all-batches list:

- text search;
- project;
- source tape;
- electrode type (`cathode` / `anode`);
- coating sidedness from the source tape;
- target form factor (`coin`, `pouch`, `prism`, `cylindrical`).

With no filters selected, the page shows all electrode cut batches. Selecting a
tape filters the main list to that tape's batches and reveals the add-batch
button for creating a new electrode batch from the selected tape.

When a batch form is open, the filter panel and main list are hidden. Exiting
the form restores the previous filter context.

Electrode cut batch record `created_at` is automatic audit metadata. The opened
batch form exposes date-only `item_created_at` as `Дата создания` for the
physical cut batch; it defaults to today and accepts today or past dates only.
`updated_at` remains automatic.

The batch form also exposes `is_test_batch` as a test/no-drying flag. Use this
for trial cut batches that are created to judge a tape and are not expected to
go through electrode drying. Production batches still use drying records as the
normal completion signal; test batches are shown as test batches instead of
remaining indefinitely `в работе`.

The old separate "batches for selected tape" display is not used as a second
visible list. When a tape is selected, the main filtered list is the selected
tape's batch list.

## Individual Electrodes

Individual electrodes belong to an electrode cut batch and carry operational
state used by the battery stack workflow.

Important fields:

- `electrode_id`;
- `cut_batch_id`;
- `number_in_batch` — the stable per-batch entry number (assigned
  server-side as MAX+1 on insert, never renumbered on delete, so it stays
  in step with the tech's Excel sheet; deletions leave honest gaps).
  Since 2026-07-17 electrode lists are served in `number_in_batch` order
  and both frontends show it as the default `№` sort, with click-sortable
  mass/status headers; the Vue bulk paste commits rows sequentially in
  paste order so assigned numbers always match the pasted sheet;
- `electrode_mass_g`;
- `include_in_capacity_average`;
- `status_code`;
- `used_in_battery_id`;
- `scrapped_reason`;
- `cup_number` — DEPRECATED. Removed from all UI (vanilla and Vue,
  including the batch print report and bulk paste) on 2026-07-17: nobody
  records cup numbers in practice, the comments field replaces it. The
  DB column is retained per the forward-only migration policy and the
  backend still accepts the field; frontends simply no longer show it or
  send it in payloads. Bulk-paste sheets that still contain a cup column
  have that column recognised by header and ignored.

The Vue electrode panel additionally supports checkbox multi-select on
saved electrode rows (header checkbox = select all visible) with a bulk
delete action: one confirm dialog listing the selected №s, then
sequential per-row `DELETE /api/electrodes/:id` calls (no bulk endpoint
exists). Rows rejected by the backend (e.g. the used-in-battery guard)
are skipped and reported in a single toast with the server error text;
the list reloads once at the end.

Current status values:

- `1`: available;
- `2`: used;
- `3`: scrapped.

Capacity-average inclusion is independent from lifecycle status. The boolean
field `include_in_capacity_average` controls whether an individual electrode is
included in electrode cut batch average-capacity calculations. Available, used,
and scrapped remain lifecycle states only.

The current migration backfills existing rows to preserve the old behavior:
existing `status_code = 3` rows start with `include_in_capacity_average = false`,
and all other existing electrodes start with `true`. New electrodes default to
`true`. After that, operators may manually include a scrapped or damaged
electrode in the average, or exclude a thin/nonrepresentative electrode without
scrapping it.

On the vanilla Electrode Batches page, the compact `В расчёт` checkbox is saved
immediately per row. Scrapping and restoring an electrode do not automatically
change this checkbox.

## Battery Source Links

Battery source links are stored in `battery_electrode_sources` before
individual stack rows are selected.

Important fields:

- `battery_electrode_source_id`;
- `battery_id`;
- `role`;
- `tape_id`;
- `cut_batch_id`;
- `sort_order`;
- `is_primary`;
- `source_notes`.

The source role must be `cathode` or `anode`.

Source rows define which cut batches are valid for stack electrodes in that
role. Pouch, prism, and cylindrical batteries may have multiple selected source
batches per role; coin cells stay single-source per role. Exactly one row per
role is primary for legacy labels and list/detail joins. A selected cathode
stack electrode must come from one of the saved cathode cut batches; a selected
anode stack electrode must come from one of the saved anode cut batches.

## Battery Stack Links

Battery stack rows are stored in `battery_electrodes`.

Important fields:

- `battery_id`;
- `electrode_id`;
- `role`;
- `position_index`.

The backend validates roles, duplicate electrode ids, counts, source matching,
and availability. It then marks selected electrodes used by the battery.

When stack rows are fetched for display, they are ordered by `position_index`.

## Availability And Deletion Interaction

Saving a stack marks selected electrodes:

- `status_code = 2`;
- `used_in_battery_id = <battery_id>`.

Electrodes removed from a resaved stack are reset to available.

Guided battery delete does not delete electrode records. If a deleted battery
has linked electrodes, the user chooses whether those electrodes return to
available status or become scrapped. The delete service clears
`used_in_battery_id` in both cases.

## Anti-Patterns

Do not treat sidedness as a tape-level or electrode-level column. Current
compatibility logic uses coating-step sidedness.

Do not allow generic battery form handlers to own stack checkbox state. The
stack builder owns its own controlled state.

Do not use physical battery delete as a shortcut to delete or rewrite upstream
electrode history.
