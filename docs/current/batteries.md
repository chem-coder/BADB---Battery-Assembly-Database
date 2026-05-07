# Batteries

Created: 2026-05-06
Edited: 2026-05-07
Status: current
Verified against code: 2026-05-07

Source paths:

- `routes/batteries.js`
- `services/batteryLifecycleService.js`
- `services/batteryElectrodeSourceService.js`
- `services/batteryElectrodeStackService.js`
- `services/batteryCompatibleCutBatchService.js`
- `public/js/3-batteries.js`
- `contracts/vanilla_api_endpoints.json`
- `scripts/smoke_vanilla_api.js`

This document summarizes the current battery workflow. Hard lifecycle rules
live in `docs/rules/battery_lifecycle_rules.md`. Electrode source and stack
rules live in `docs/rules/electrode_stack_rules.md`. Derived capacity behavior
lives in `docs/current/capacity_calculations.md`.

## Scope

The vanilla Batteries page is a battery workspace rooted by `battery_id`.
Identity and configuration are saved before lower battery-owned sections because
most child records attach to the battery row.

Supported form factors:

- `coin`
- `pouch`
- `cylindrical`

Coin batteries also use `battery_coin_config.coin_cell_mode`:

- `half_cell`
- `full_cell`

Half-cell role behavior is controlled by `half_cell_type`.

## Battery-Owned Sections

Current battery-owned sections include:

- form-factor config:
  `battery_coin_config`, `battery_pouch_config`, `battery_cyl_config`;
- electrode sources: `battery_electrode_sources`;
- electrode stack: `battery_electrodes`;
- separator config: `battery_sep_config`;
- electrolyte config: `battery_electrolyte`;
- project links: `battery_projects`;
- QC data: `battery_qc`;
- electrochemistry rows/files: `battery_electrochem`.

These rows are owned by the battery record. They may be included in the guided
delete summary and explicitly deleted by the battery delete service.

## Creation And Editing Order

The workflow is intentionally built from the battery row outward:

1. create or select the battery record;
2. save form-factor-specific configuration;
3. save electrode source batch links;
4. select and save stack electrodes;
5. save separator and electrolyte configuration;
6. save QC and electrochemistry data;
7. use print/report views for the assembled record.

Lower sections should not pretend to be independent records without a valid
`battery_id`.

## Status Workflow

Battery status uses the existing `batteries.status` column:

- blank/`NULL` is displayed as `Открыт`;
- legacy `disassembled` values are also displayed as `Открыт`;
- `assembled` is displayed as `Собран`;
- `testing` is displayed as `На тестировании`;
- `completed` is displayed as `Завершён`;
- `failed` is displayed as `Брак`.

`Открыт` is a system-derived incomplete/editable state. It is not a selectable
dropdown outcome. Before required assembly records are complete, the status
control displays `Открыт` and stays disabled.

Required assembly records for the `Собран` transition are:

- valid form-factor config;
- required electrode source roles;
- valid saved electrode stack;
- separator config with a separator;
- electrolyte config with electrolyte and total volume.

When the required records become complete through the Batteries page save flow,
the page explicitly saves `assembled`. Ordinary read/report endpoints do not
promote status on fetch. After assembly is complete, the status dropdown allows
only `Собран`, `На тестировании`, `Завершён`, and `Брак`.

## Electrode Sources And Stack

Source selection happens before stack selection. The saved source cut batches
determine which individual electrodes may appear in the stack picker.

Current high-level behavior:

- coin half-cell uses one relevant source role;
- coin full-cell, pouch, and cylindrical batteries use both cathode and anode
  sources;
- compatible source batches are filtered by tape, shape, form factor, and
  sidedness rules;
- saved stack electrodes are marked used by the backend;
- saved stacks are read by `position_index`;
- a `disassembled` battery with no rows in `battery_electrodes` may be
  reassembled directly by selecting and saving a new stack;
- pouch/cylindrical stacks may have equal cathode/anode counts or one extra
  anode.

Detailed rules are in `docs/rules/electrode_stack_rules.md`.

## Guided Delete

The current vanilla delete workflow is guided physical deletion for mistaken
database records.

Current route access is intentionally auth-only:

- `GET /api/batteries/:id/delete-check`
- `DELETE /api/batteries/:id`

Delete behavior:

- preflight reports hard blockers, confirmable owned data, and linked
  electrodes;
- hard blockers are `cycling_sessions` and `module_batteries`;
- typed confirmation must be `DELETE BATTERY <battery_id>`;
- linked electrodes must be returned as available or scrapped;
- every successful delete writes an `activity_log` audit event;
- upstream lab records are not deleted.

Detailed lifecycle rules are in `docs/rules/battery_lifecycle_rules.md`.

## Disassembly

The backend still has a disassembly route/service for compatibility and future
product work. The visible vanilla delete workflow is not a real disassembly
record. Use guided physical delete only for mistaken database records.

The old persistent `disassembled` value is legacy compatibility data, not a
normal current status choice. New disassembly behavior removes owned assembly
rows and leaves the battery displayed as `Открыт`. If a legacy `disassembled`
battery has no rows in `battery_electrodes`, the vanilla Batteries page must
allow a new stack to be selected and saved through
`PUT /api/batteries/battery_electrodes/:id` so assembly can continue from that
battery record.

## d031 Stack Trigger

Migration `d031_harden_battery_stack_validate_trigger.sql` is part of the
current battery stack safety model. It rejects pouch/cylindrical states where
cathodes exceed anodes.

The stack service inserts valid pouch/cylindrical payloads in trigger-safe
anode-before-cathode paired order while preserving original `position_index`
values. This makes valid cathode-first API payloads safe under the hardened
trigger. The insert sequence is `A1, C1, A2, C2`, not `A1, A2, C1, C2`.

The vanilla smoke harness applies `d031` automatically after restoring the old
dump, so smoke evidence covers the hardened trigger path.

## Release Checks

After battery lifecycle or stack behavior changes, run:

```text
node --check services/batteryElectrodeStackService.js
node --check scripts/smoke_vanilla_api.js
git diff --check
npm test
npm run contract:vanilla
npm run smoke:vanilla
```
