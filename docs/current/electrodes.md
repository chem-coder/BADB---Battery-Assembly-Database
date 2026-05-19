# Electrodes

Created: 2026-05-06
Edited: 2026-05-19
Status: current
Verified against code: 2026-05-19

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

The old separate "batches for selected tape" display is not used as a second
visible list. When a tape is selected, the main filtered list is the selected
tape's batch list.

## Individual Electrodes

Individual electrodes belong to an electrode cut batch and carry operational
state used by the battery stack workflow.

Important fields:

- `electrode_id`;
- `cut_batch_id`;
- `number_in_batch`;
- `electrode_mass_g`;
- `include_in_capacity_average`;
- `status_code`;
- `used_in_battery_id`;
- `scrapped_reason`.

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

- `battery_id`;
- `role`;
- `tape_id`;
- `cut_batch_id`;
- `source_notes`.

The source role must be `cathode` or `anode`.

The source row defines which cut batch is valid for stack electrodes in that
role. A selected cathode stack electrode must come from the saved cathode cut
batch; a selected anode stack electrode must come from the saved anode cut
batch.

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
