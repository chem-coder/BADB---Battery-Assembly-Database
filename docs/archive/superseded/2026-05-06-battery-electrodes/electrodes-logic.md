# Electrode Logic And Sidedness

Created: 2026-05-06
Edited: 2026-05-06
Status: superseded

Superseded by:

- `docs/rules/electrode_stack_rules.md`
- `docs/current/electrodes.md`
- `docs/current/batteries.md`

This document replaces the older human-note version originally stored at `prompts_and_logic/electrodes mess/electrodes-logic.txt`, now archived at `historical_rubbish/prompts_and_logic/electrodes mess/electrodes-logic.txt`. Current source code and current database schema win over historical notes.

## Purpose And Scope

This note is for future Codex agents and humans working on battery electrode source selection, compatible cut-batch filtering, electrode stack selection, sidedness behavior, and UI/backend validation.

It covers the Batteries workflow only. It does not redefine how tapes, tape process steps, cut batches, or electrodes are created outside the battery workflow.

## Current Code References

- UI: `BADB_main/public/js/3-batteries.js`
- Battery routes: `BADB_main/routes/batteries.js`
- Compatible cut batches: `BADB_main/services/batteryCompatibleCutBatchService.js`
- Electrode sources: `BADB_main/services/batteryElectrodeSourceService.js`
- Electrode stack: `BADB_main/services/batteryElectrodeStackService.js`
- Shared short design note: `BADB_main/docs/battery_electrode_stack_design.md`

Relevant routes:

- `GET /api/batteries/:id/electrode-cut-batches`
- `POST /api/batteries/battery_electrode_sources`
- `GET /api/batteries/battery_electrode_sources/:battery_id`
- `PATCH /api/batteries/battery_electrode_sources/:battery_id`
- `PUT /api/batteries/battery_electrodes/:battery_id`
- `GET /api/batteries/battery_electrodes/:battery_id`

## Current Data Model References

### Sidedness

The sidedness source of truth is `tape_step_coating.coating_sidedness`.

Valid values:

- `one_sided`
- `two_sided`

Migration references:

- `BADB_main/migrations/d024_add_coating_sidedness_to_tape_step_coating.sql`
- `BADB_main/migrations/d025_backfill_coating_sidedness_from_coating_method.sql`

Current code reads sidedness by joining from the tape or cut batch to the coating process step:

- `electrode_cut_batches.tape_id`
- `tape_process_steps.tape_id`
- `operation_types.code = 'coating'`
- `tape_step_coating.step_id`
- `tape_step_coating.coating_sidedness`

Do not use or reintroduce outdated names such as:

- `tapes.sidedness`
- `electrode.tape.sidedness`
- `electrodes.sidedness`
- `batteries.sidedness`

Those names are historical shorthand only. They are not the implemented schema.

### Electrode Sources

Battery source selections are stored in `battery_electrode_sources`.

Important columns:

- `battery_id`
- `role`
- `tape_id`
- `cut_batch_id`
- `source_notes`

The primary key is `(battery_id, role)`. Roles use the `electrode_role` enum:

- `cathode`
- `anode`

The current UI/service payload uses these field names:

- `cathode_tape_id`
- `cathode_cut_batch_id`
- `cathode_source_notes`
- `anode_tape_id`
- `anode_cut_batch_id`
- `anode_source_notes`

### Cut Batches

Cut batches are stored in `electrode_cut_batches`.

Important compatibility columns:

- `cut_batch_id`
- `tape_id`
- `shape`
- `target_form_factor`
- `target_config_code`

Current schema allows:

- `shape`: `circle`, `rectangle`
- `target_form_factor`: `coin`, `pouch`, `cylindrical`
- `target_config_code`: known size/config codes plus `other`

The schema constrains shape against form factor:

- `coin` cut batches must be `circle`
- `pouch` and `cylindrical` cut batches must be `rectangle`

### Electrodes And Stack Rows

Individual electrodes are stored in `electrodes`.

Important columns:

- `electrode_id`
- `cut_batch_id`
- `electrode_mass_g`
- `status_code`
- `used_in_battery_id`
- `number_in_batch`

Current electrode status values:

- `1`: available
- `2`: used
- `3`: scrapped

Battery stack rows are stored in `battery_electrodes`.

Important columns:

- `battery_id`
- `electrode_id`
- `role`
- `position_index`

The stack row primary key is `(battery_id, electrode_id)`. `position_index` is unique per battery.

## Sidedness Source Of Truth

Sidedness belongs to the coating step, not to the tape row itself. A tape's sidedness in UI lists is a derived display value from `tape_step_coating.coating_sidedness`.

Current UI display helpers in `BADB_main/public/js/3-batteries.js` include:

- `formatTapeSidednessLabel`
- `formatElectrodeSidednessLabel`
- `formatElectrodesSidednessLabel`
- `deriveSelectedBatterySidedness`

Current backend services read sidedness in SQL subqueries from the coating step:

- `fetchCompatibleElectrodeCutBatches`
- `assertCompatibleSidedness`
- `fetchBatteryElectrodeSources`

Rules implemented today:

- Coin-cell compatible cut batches must come from `one_sided` coating.
- Pouch and cylindrical compatible cut batches may come from `one_sided` or `two_sided` coating.
- A full source pair cannot mix non-null `one_sided` and `two_sided` values. The backend throws: `Нельзя смешивать 1- и 2-сторонние электроды в одной ячейке`.
- The UI keeps `coating_sidedness` editable on the coating step. This is important because a user may only discover a wrong one/two-sided setting later, when the expected tape or cut batch does not appear in the battery dropdown.
- Current UI code auto-fills sidedness from the selected coating method when it can infer a default: `dr_blade`/rakel methods default to `one_sided`, and `coater_machine` methods default to `two_sided`. Manual user changes are preserved.
- Current schema still allows null `coating_sidedness`, and the mixed-sidedness backend check filters null out before comparing. Product intent is that null should not be normal steady-state data; treat null sidedness as a data-quality or legacy gap, not as a third valid sidedness.

## Electrode Source Selection Rules

Source selection happens before stack selection. The selected source cut batch or batches determine which individual electrodes can be selected later.

Current UI role logic is in:

- `getRequiredBatterySourceRolesForContext`
- `isBatterySourcesSectionComplete`

Current backend source validation is in:

- `assertSourceCompleteness`
- `assertCompatibleSidedness`
- `saveBatteryElectrodeSourcesInTransaction`
- `updateBatteryElectrodeSources`

Implemented role rules:

- Coin half-cell, `half_cell_type = 'cathode_vs_li'`: UI requires one cathode source and no anode source.
- Coin half-cell, `half_cell_type = 'anode_vs_li'`: UI requires one anode source and no cathode source.
- Coin full-cell: requires one cathode source and one anode source.
- Pouch: requires one cathode source and one anode source.
- Cylindrical: requires one cathode source and one anode source.

Backend note:

- `assertSourceCompleteness` currently enforces exactly one source row for coin half-cells, but it does not itself verify that the one role matches `half_cell_type`.
- The UI performs the stricter role-specific half-cell check.
- Stack validation later enforces the half-cell role through `assertStackCountMatchesBattery`.
- Current behavior is accepted for now. Do not change this during documentation cleanup; consider earlier backend source-role validation only as a future hardening task.

Source update behavior:

- `POST /api/batteries/battery_electrode_sources` may insert/update source rows and delete roles absent from the payload.
- `PATCH /api/batteries/battery_electrode_sources/:battery_id` updates existing source rows only. If a role is missing in the database, the service returns a validation error with `missing_roles`.

## Cut Batch Compatibility Rules

Current compatible batch filtering is implemented in:

- backend: `fetchCompatibleElectrodeCutBatches`
- UI fallback before a battery exists: `getLocalCompatibleBatteryCutBatches`

Current rules:

- The cut batch must belong to the selected tape.
- The expected shape must match the battery form factor:
  - `coin` -> `circle`
  - `pouch` -> `rectangle`
  - `cylindrical` -> `rectangle`
- `electrode_cut_batches.target_form_factor` must match `batteries.form_factor`.
- Coin cells require `tape_step_coating.coating_sidedness = 'one_sided'`.
- Pouch and cylindrical cells do not require one-sided coating.
- A previously selected batch may still be included in the option list through `selected_batch_id`, even if it no longer matches the compatibility filter. This preserves visibility of saved historical selections.

Current non-rule:

- `target_config_code` is selected into compatibility context but is not currently used to filter compatible cut batches. Existing design notes say cut batches are not filtered by electrode size code.
- Do not add `target_config_code` filtering casually. If future users are seeing physically wrong cut batches in the dropdown, design that compatibility rule deliberately, preferably around the actual dimensions and intended battery format rather than only the size-code label.

Project compatibility:

- The UI computes allowed battery projects from the selected source batches.
- For two-source batteries, selected battery projects must belong to the intersection of the cathode batch projects and anode batch projects.
- Batch options can be disabled when they have no project overlap with the opposite selected source batch, unless the option is the already saved selected batch.

## Stack Selection Rules

Stack selection happens after the battery record exists and electrode sources have been saved.

Current UI stack logic is in:

- `getStackTargetCounts`
- `renderStackTargetCountControls`
- `renderStackUiState`
- `toggleStackElectrodeSelection`
- `renderStackSummary`
- `buildStackPayload`
- `validateStackSelection`
- `validateStackBalance`
- `saveElectrodeStack`
- `applySavedElectrodeState`

Current backend stack validation is in:

- `assertValidStackRoles`
- `fetchBatteryStackContext`
- `assertStackCountMatchesBattery`
- `assertStackElectrodesMatchSources`
- `saveBatteryElectrodeStack`
- `fetchBatteryElectrodeStack`

Implemented count rules:

- Coin half-cell, `half_cell_type = 'cathode_vs_li'`: exactly 1 cathode and 0 anodes.
- Coin half-cell, `half_cell_type = 'anode_vs_li'`: exactly 1 anode and 0 cathodes.
- Coin full-cell: exactly 1 cathode and 1 anode.
- Pouch: at least 1 cathode and at least 1 anode; anodes must equal cathodes or cathodes + 1.
- Cylindrical: at least 1 cathode and at least 1 anode; anodes must equal cathodes or cathodes + 1.
- Pouch/cylindrical stacks must not allow cathodes to exceed anodes. The product rule is specifically `anodes = cathodes` or `anodes = cathodes + 1`.

Implemented source-matching rule:

- Every selected stack electrode must belong to the saved `battery_electrode_sources.cut_batch_id` for its role.
- A cathode stack row must come from the saved cathode cut batch.
- An anode stack row must come from the saved anode cut batch.

Implemented availability rule:

- The UI treats `electrodes.status_code = 1` as selectable.
- The backend marks saved stack electrodes as `status_code = 2` and sets `used_in_battery_id = battery_id`.
- The backend rejects an electrode if it is neither available nor already used by the same battery.
- Electrodes previously used by the same battery but removed from the next saved stack are reset to available.

Implemented stack ordering:

- The UI sorts selected cathodes and anodes by `electrode_mass_g` descending.
- `buildStackPayload` interleaves rows starting with anode, then cathode.
- `position_index` comes from that generated order.

## UI State And Rendering Rules

The stack checkboxes are controlled UI state, not ordinary form fields.

Current behavior:

- For coin cells, target counts are fixed and read-only.
- For pouch and cylindrical cells, target counts are editable.
- If target counts are invalid, stack checkboxes are disabled.
- If a role reaches its target count, remaining unselected available checkboxes for that role are disabled.
- Deselecting an electrode re-enables remaining available checkboxes for that role.
- Half-cell mode hides the irrelevant role block.
- Unavailable electrodes are displayed but disabled.
- Existing saved stack rows are loaded from `GET /api/batteries/battery_electrodes/:battery_id`.
- If saved stack rows exist, `applySavedElectrodeState` sets stack read-only mode and hides selection blocks.
- The save confirmation tells the user that the stack can be corrected while the card is still open, but after leaving/reloading the saved stack is locked.
- This locking behavior is intentional and approved: the operator can adjust the stack during the first stack-editing session, but once the battery form is closed/reloaded after saving the stack, the battery is treated as sealed/non-destructively unchangeable.

Important anti-pattern:

- Do not let the page-level form `input` or `change` handlers mutate/re-render the stack checkboxes.
- Current `BADB_main/public/js/3-batteries.js` guards both form-level handlers with `event.target?.closest?.('#battery_stack_builder')`.
- This guard came from a real debug failure captured in `historical_rubbish/prompts_and_logic/electrodes mess/test.txt`: stack checkbox clicks were being immediately undone because generic form handlers treated them like identity form inputs.

## Backend Validation Rules

The backend is authoritative if the UI is bypassed.

Current source validation:

- A battery ID must exist.
- Coin batteries must have a row in `battery_coin_config`.
- Coin half-cells must have exactly one source row.
- All other supported battery types must have both cathode and anode source rows.
- Non-null cathode/anode source sidedness values must not conflict.

Current stack validation:

- Roles must be only `cathode` or `anode`.
- The same `electrode_id` cannot appear twice in one stack payload.
- Counts must match the battery form factor and coin half/full-cell configuration.
- Every stack electrode must belong to the saved source cut batch for its role.
- Electrodes must be available or already used by the same battery.

Database trigger note:

- The live database still has a `battery_stack_validate` trigger using `validate_battery_stack()`.
- Migration `d031_harden_battery_stack_validate_trigger.sql` aligns the trigger with the service/product rule for pouch/cylindrical stacks.
- Current trigger and service behavior allow only `anodes = cathodes` or `anodes = cathodes + 1`.
- `cathodes = anodes + 1` is rejected.

## Known Anti-Patterns

- Do not use `tapes.sidedness`; use `tape_step_coating.coating_sidedness`.
- Do not use coating method labels as the saved source of truth for sidedness or battery compatibility. UI defaults may suggest sidedness from coating method as a convenience, but saved/compatibility logic must use `tape_step_coating.coating_sidedness`.
- Do not filter compatible cut batches by a nonexistent tape-level sidedness column.
- Do not let generic form dirty-state/render handlers own stack checkbox state.
- Do not save stack electrodes that are not from the saved source cut batch for that role.
- Do not allow a pouch/cylindrical stack with cathodes one greater than anodes.
- Do not treat `MemPalace` or debug transcripts as current source of truth.

## Resolved Decisions And Watch Items

These decisions came from Dalia's review on 2026-05-06.

- Resolved: cathodes greater than anodes is not valid for pouch/cylindrical stacks. Migration `d031_harden_battery_stack_validate_trigger.sql` aligned the database trigger with this rule.
- Resolved: sidedness must remain editable on the coating step, because users may need to correct one-sided/two-sided classification after battery compatibility filtering reveals a mistake.
- Resolved: current saved-stack lock behavior is good. The stack can be adjusted during the first stack-editing session; after close/reload it should be locked.
- Current stance: leave `target_config_code` out of compatibility filtering unless wrong-size cut batches become a real workflow problem. If this changes, design the rule intentionally.
- Current stance: leave backend half-cell source-role validation as-is unless a backend hardening pass is requested. UI and stack validation already protect the normal workflow.

## Folded-In Source Notes

Content folded into this document:

- `historical_rubbish/prompts_and_logic/electrodes mess/electrodes-logic.txt`: promoted source/stack rules, form-factor behavior, target counts, mass-based stack summary, and save/read-only intent.
- `historical_rubbish/prompts_and_logic/Sidedness.md`: retained sidedness concept and user-facing behavior, rewritten to current `tape_step_coating.coating_sidedness` schema.
- `historical_rubbish/prompts_and_logic/2-sided_tapes_steps.md`: retained the coating-step source-of-truth idea and one/two-sided behavior, rewritten away from outdated shorthand.
- `BADB_main/docs/battery_electrode_stack_design.md`: retained stable phase/order, compatibility, target-count, and controlled-checkbox design.
- `historical_rubbish/prompts_and_logic/electrodes mess/test.txt`: retained the debug lesson about stack checkbox events being isolated from generic form handlers.

## Archived Cleanup Items

These files were moved to `RENERA/historical_rubbish/` on 2026-05-06 after Dalia approved the cleanup. They were not deleted.

- `historical_rubbish/prompts_and_logic/electrodes mess/electrodes-logic.txt`
- `historical_rubbish/prompts_and_logic/electrodes mess/test.txt`
- `historical_rubbish/prompts_and_logic/Sidedness.md`
- `historical_rubbish/prompts_and_logic/2-sided_tapes_steps.md`

Keep `BADB_main/docs/battery_electrode_stack_design.md` as the shared shorter repo note unless the team decides to replace it with a BADB-main-local version of this fuller technical reference.
