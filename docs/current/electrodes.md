# Electrodes

Created: 2026-05-06
Edited: 2026-05-06
Status: current
Verified against code: 2026-05-06

Source paths:

- `routes/electrodes.js`
- `services/electrodeCutBatchService.js`
- `services/electrodeCatalogService.js`
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
- pouch and cylindrical batteries use rectangular cut batches.

Current sidedness behavior:

- coin-compatible cut batches must be one-sided;
- pouch and cylindrical compatible cut batches may be one-sided or two-sided.

## Individual Electrodes

Individual electrodes belong to an electrode cut batch and carry operational
state used by the battery stack workflow.

Important fields:

- `electrode_id`;
- `cut_batch_id`;
- `number_in_batch`;
- `electrode_mass_g`;
- `status_code`;
- `used_in_battery_id`;
- `scrapped_reason`.

Current status values:

- `1`: available;
- `2`: used;
- `3`: scrapped.

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
