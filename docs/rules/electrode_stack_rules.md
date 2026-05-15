# Electrode Stack Rules

Created: 2026-05-06
Edited: 2026-05-13
Status: rule
Verified against code: 2026-05-06

Source paths:

- `services/batteryElectrodeSourceService.js`
- `services/batteryCompatibleCutBatchService.js`
- `services/batteryElectrodeStackService.js`
- `public/js/3-batteries.js`
- `migrations/d031_harden_battery_stack_validate_trigger.sql`
- `scripts/smoke_vanilla_api.js`

These rules define current battery electrode source and stack behavior.

## Sidedness

Sidedness belongs to the coating step:

```text
tape_step_coating.coating_sidedness
```

Valid current values are:

- `one_sided`
- `two_sided`

Do not use old or invented columns such as `tapes.sidedness`,
`electrodes.sidedness`, or `battery.sidedness`.

Current behavior:

- coin compatible cut batches require `one_sided`;
- pouch and cylindrical compatible cut batches may use `one_sided` or
  `two_sided`;
- a full cathode/anode source pair cannot mix non-null sidedness values;
- null sidedness is a legacy/data-quality gap, not a third valid state.

The UI may infer a default sidedness from coating method for convenience, but
compatibility logic must use the saved coating-step sidedness value.

## Source Selection

Battery electrode sources are saved before individual stack electrodes are
selected. The source rows determine which individual electrodes may later be
used in the stack.

Current source-role rules:

- coin half-cell with `half_cell_type = 'cathode_vs_li'`: one cathode source;
- coin half-cell with `half_cell_type = 'anode_vs_li'`: one anode source;
- coin full-cell: one cathode source and one anode source;
- pouch: one cathode source and one anode source;
- cylindrical: one cathode source and one anode source.

Backend source validation currently enforces exactly one source row for coin
half-cells and both source rows for the other supported battery types. The UI
performs the stricter half-cell role-specific source check, and stack validation
enforces the final role. Do not change that behavior during documentation
cleanup.

## Cut Batch Compatibility

Compatible electrode cut batches are filtered by the selected battery context.

Current rules:

- the cut batch must belong to the selected tape;
- coin batteries use circular cut batches;
- pouch and cylindrical batteries use rectangular cut batches;
- `electrode_cut_batches.target_form_factor` must match the battery
  `form_factor`;
- coin batteries require coating sidedness `one_sided`;
- pouch and cylindrical batteries do not require one-sided coating;
- a saved selected batch may remain visible even if it no longer matches the
  compatibility filter, so historical selections do not disappear.

Current non-rule:

- `target_config_code` is selected into compatibility context but is not used
  to filter compatible cut batches.

Do not add size-code filtering casually. If physical-size compatibility becomes
a real workflow problem, design that rule deliberately.

## Stack Counts

Only these stack roles are valid:

- `cathode`
- `anode`

The same `electrode_id` cannot appear twice in one stack payload.

Current count rules:

- coin half-cell `cathode_vs_li`: exactly 1 cathode and 0 anodes;
- coin half-cell `anode_vs_li`: exactly 1 anode and 0 cathodes;
- coin full-cell: exactly 1 cathode and 1 anode;
- pouch: at least 1 cathode and 1 anode, with anodes equal to cathodes or one
  extra anode;
- cylindrical: at least 1 cathode and 1 anode, with anodes equal to cathodes or
  one extra anode.

For pouch and cylindrical stacks, one extra cathode is invalid.

In the vanilla UI for pouch/cylindrical stacks, the operator edits the cathode
count and chooses an anode-count mode: equal to cathodes or `+1` anode. The UI
then computes the anode count; the backend/DB trigger still enforce the count
rules.

The N/P helper is advisory. It uses the computed anode count to divide the
target total anode capacity into a per-anode target, then highlights a
recommended anode set. It should not silently auto-select electrodes, change
stack validation, or change saved `position_index` semantics. If the operator
uses the "select suggested anodes" button, it is still only a UI selection
shortcut before the normal stack save.

## Source Matching

Every selected stack electrode must belong to the saved source cut batch for
its role:

- a cathode stack row must come from the saved cathode cut batch;
- an anode stack row must come from the saved anode cut batch.

The backend is authoritative if the UI is bypassed.

## Electrode Availability

Current electrode status values:

- `1`: available;
- `2`: used;
- `3`: scrapped.

When a stack is saved, selected electrodes are marked `status_code = 2` and
`used_in_battery_id = <battery_id>`.

An electrode can be used in a stack save only if it is available or already
assigned to the same battery. Electrodes removed from a resaved stack are reset
to available.

## Insert Order Under d031

Migration `d031_harden_battery_stack_validate_trigger.sql` hardens the
row-level database trigger `validate_battery_stack()`.

For pouch and cylindrical stacks, the trigger permits only intermediate states
where:

- anodes equal cathodes; or
- anodes are one greater than cathodes.

Because the trigger fires row by row, a valid final payload can fail if rows are
inserted in caller-supplied cathode-first order. The service must therefore
insert stack rows in trigger-safe deterministic role order:

1. sort anode rows by `position_index`, then original input order;
2. sort cathode rows by `position_index`, then original input order;
3. insert rows as anode/cathode pairs, with each available anode before the
   corresponding cathode;
4. preserve original `position_index` values in the saved rows.

In plain terms, insert order should be `A1, C1, A2, C2, A3, C3`, not
`A1, A2, A3, C1, C2, C3`, and not caller-supplied cathode-first order. If a
valid stack has one extra anode, the order should be `A1, C1, A2, C2, A3`.

Current `saveBatteryElectrodeStack()` follows this rule through
`orderStackRowsForInsert()`. A valid cathode-first pouch/cylindrical API payload
is safe under `d031`, and the saved display order still follows
`position_index`.

Smoke setup applies the current post-dump migration set through `d035` after
restoring the vanilla dump, so vanilla smoke checks exercise the hardened
trigger and the restored-copy migration ledger baseline.

## UI State

Stack checkboxes are controlled stack state. They must not be treated as
ordinary page-level form fields.

Rules:

- coin target counts are fixed and read-only;
- pouch and cylindrical cathode target counts are editable, while anode target
  counts are computed from the equal/`+1` anode mode;
- invalid target counts disable stack selection;
- once a role reaches its target count, remaining unselected checkboxes for
  that role are disabled;
- half-cell mode hides the irrelevant role block;
- unavailable electrodes are displayed but disabled;
- saved stack rows load from the backend and become read-only after reload.

The page-level form `input` and `change` handlers must ignore events inside
`#battery_stack_builder`; otherwise stack checkbox clicks can be rendered away
before the stack handler records them.
