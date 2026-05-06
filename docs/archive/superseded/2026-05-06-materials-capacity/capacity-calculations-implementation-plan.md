# Capacity Calculations Implementation Plan

Created: unknown
Edited: 2026-05-06
Status: superseded

Superseded by:

- `docs/current/capacity_calculations.md`
- `docs/future/materials_capacity_next.md`

## Goal

Implement capacity calculations in BADB in a way that is:

- scientifically transparent
- easy to verify
- minimally disruptive to the current schema
- usable first on the electrodes workflow, then on batteries

This plan assumes the context in:

- [`capacity-calculations-context.md`](/Users/Dalia/Developer/RENERA/prompts_and_logic/capacity-calculations-context.md)


## High-level strategy

Use the existing stored workflow data as inputs and compute all capacity values on demand in backend code.

Do **not** persist the derived capacities in the database in v1.

Build in this order:

1. backend capacity helper for one cut batch
2. electrodes page UI
3. electrode batch print report
4. battery-level backend helpers
5. batteries page UI
6. battery print report


## Schema plan

### V1 recommendation

No schema migration is required for the core capacity feature if all of the following are already true:

- `material_properties.specific_capacity_mAh_g` exists
- tape recipe / tape actuals can be read from existing schema
- `foil_mass_measurements.mass_g` exists
- `electrodes.electrode_mass_g` exists
- cut-batch geometry exists
- tape coating sidedness exists

So the implementation should begin as a backend/API feature, not a migration feature.


## Phase 1: Verify and expose required inputs

### 1. Materials

Make sure the material details UI already exposes:

- `specific_capacity_mAh_g`

Implementation note:

- if the field exists in backend but is not obvious enough in the UI, improve its visibility before using it heavily downstream


### 2. Tape recipe active fraction

Add a backend helper that can determine the **theoretical active-material fraction** for a tape.

Recommended source:

- `tape_recipe_lines`

Output:

- `active_fraction_theoretical`
- `active_material_name`
- `active_material_instance_id` if needed
- `specific_capacity_mAh_g`

Verified schema / logic:

- the active row is identified by `tape_recipe_lines.recipe_role`
- active roles are:
  - `cathode_active`
  - `anode_active`
- the theoretical active fraction is read from:
  - `tape_recipe_lines.slurry_percent`
- only rows with `include_in_pct = true` participate in the dry-solids percentage logic


### 3. Tape actual-derived active fraction

Add backend logic that can determine the **actual-derived active-material fraction** for a tape from saved actuals.

Recommended formula:

```text
active_fraction_actual = actual active-material mass / total actual solids mass
```

Important rules:

- solvent should not count in the denominator
- rows without usable actual mass should not silently produce a false number
- if actuals are incomplete, return `null` for actual-derived values

Verified storage:

- actuals live in:
  - `tape_recipe_line_actuals`
- key columns:
  - `tape_id`
  - `recipe_line_id`
  - `material_instance_id`
  - `measure_mode`
  - `actual_mass_g`
  - `actual_volume_ml`

Recommended derivation rule:

- join `tape_recipe_line_actuals.recipe_line_id` to `tape_recipe_lines.recipe_line_id`
- identify the active row by `recipe_role`
- use only rows with:
  - `measure_mode = 'mass'`
- exclude solvent rows from the denominator
- denominator should be total actual solids mass across mass-based solid rows

Important caution:

- actual rows entered as volume should not be silently converted into solids mass here
- if the denominator cannot be assembled cleanly from mass-based solid rows, return `null` for actual-derived fraction

Output:

- `active_fraction_actual`
- maybe a diagnostic flag such as:
  - `actual_fraction_status = complete | incomplete | unavailable`


### 4. Cut-batch geometry

Centralize one helper for geometry conversion.

Required outputs:

- `electrode_area_mm2`
- `electrode_area_cm2`

Recommended conversion:

```text
electrode_area_cm2 = electrode_area_mm2 / 100
```


### 5. Foil mass average

Centralize one helper for foil mass statistics.

Required outputs:

- `average_foil_mass_g`
- maybe `foil_measurement_count`

If there are no foil measurements:

- return `null`
- do not crash


### 6. Sidedness

Read sidedness from the tape linked to the cut batch.

Required outputs:

- `coating_sidedness`
- `side_count`

Recommended mapping:

- `one_sided` -> `1`
- `two_sided` -> `2`


## Phase 2: Build one backend capacity helper for cut batches

Create one backend helper in the electrodes backend that assembles the full capacity context for a single cut batch.

Suggested responsibility:

- given `cut_batch_id`
- fetch upstream tape / recipe / actuals / materials / foil masses / geometry / sidedness
- return everything needed to compute per-electrode and batch-level values

Suggested output shape:

```text
{
  active_material: { ... },
  specific_capacity_mAh_g,
  active_fraction_theoretical,
  active_fraction_actual,
  average_foil_mass_g,
  electrode_area_mm2,
  electrode_area_cm2,
  coating_sidedness,
  side_count
}
```

Recommended file target:

- [`routes/electrodes.js`](/Users/Dalia/Developer/RENERA/BADB_main/routes/electrodes.js)

If the logic starts getting large, move the helper into a small shared module under the backend instead of leaving it inline in the route file.

Implementation note:

- reuse the existing dry-solids interpretation already present in [`routes/tapes.js`](/Users/Dalia/Developer/RENERA/BADB_main/routes/tapes.js) rather than inventing a second incompatible interpretation of tape composition


## Phase 3: Compute per-electrode and batch-level values in the backend

Once the capacity context helper exists, add calculation helpers for:

### Per-electrode

- `coating_mass_g`
- `active_material_mass_theoretical_g`
- `active_material_mass_actual_g`
- `capacity_theoretical_mAh`
- `capacity_actual_mAh`

Rules:

- if `electrode_mass_g` is missing, all derived per-electrode values are `null`
- if `average_foil_mass_g` is missing, all derived per-electrode values are `null`
- if `specific_capacity_mAh_g` is missing, capacity values are `null`
- if `active_fraction_actual` is unavailable, only actual-derived values are `null`


### Batch-level

Across valid non-scrapped electrodes only:

- `average_coating_mass_g`
- `average_active_material_mass_theoretical_g`
- `average_active_material_mass_actual_g`
- `average_capacity_theoretical_mAh`
- `average_capacity_actual_mAh`
- `areal_capacity_theoretical_mAh_cm2`
- `areal_capacity_actual_mAh_cm2`
- `capacity_per_side_theoretical_mAh_cm2`
- `capacity_per_side_actual_mAh_cm2`
- `included_electrode_count`

Rules:

- exclude scrapped electrodes from averages
- keep individual scrapped-electrode derived values visible if calculable
- if area is missing, the `areal` and `per_side` values are `null`


## Phase 4: Extend the electrodes API

Return the new calculated values through the existing electrodes endpoints instead of forcing the frontend to recompute them.

### Recommended API extension points

#### A. Cut-batch load / current batch payload

Add a `capacity_summary` object to the cut-batch data returned to the electrodes page.

Suggested shape:

```text
{
  active_material_name,
  specific_capacity_mAh_g,
  active_fraction_theoretical,
  active_fraction_actual,
  average_foil_mass_g,
  electrode_area_cm2,
  coating_sidedness,
  average_coating_mass_g,
  average_active_material_mass_theoretical_g,
  average_active_material_mass_actual_g,
  average_capacity_theoretical_mAh,
  average_capacity_actual_mAh,
  areal_capacity_theoretical_mAh_cm2,
  areal_capacity_actual_mAh_cm2,
  capacity_per_side_theoretical_mAh_cm2,
  capacity_per_side_actual_mAh_cm2,
  included_electrode_count
}
```

#### B. Electrode rows

Each electrode row returned to the frontend should include:

```text
coating_mass_g
active_material_mass_theoretical_g
active_material_mass_actual_g
capacity_theoretical_mAh
capacity_actual_mAh
```


## Phase 5: Update the electrodes page UI

### A. Add a compact batch summary block

Place it on the electrodes page near:

- geometry
- foil masses
- electrode table

Not inside the drying fieldset.

Recommended displayed values:

- active material
- specific capacity
- active fraction, theor. / fact.
- average foil mass
- area, `cm²`
- sidedness
- average coating mass
- average active-material mass, theor. / fact.
- average capacity, theor. / fact.
- areal capacity, theor. / fact.
- capacity per side, theor. / fact.
- count included in averaging

UI hierarchy:

- theoretical values = primary
- actual-derived values = secondary

Tooltip / hover help:

- theoretical = “based on recipe composition”
- actual-derived = “based on saved actual mixture values”


### B. Add derived columns to the electrodes table

Keep `Масса, г` always visible.

Add derived columns:

- `Масса покрытия, г`
- `Масса активного материала (теор.), г`
- `Масса активного материала (по факту), г`
- `Ёмкость (теор.), мАч`
- `Ёмкость (по факту), мАч`


### C. Add column-visibility controls

Above the electrode table, add one checkbox per non-essential column.

Recommended rule:

- essential columns remain visible:
  - `Масса, г`
  - status / actions
- secondary columns can be toggled

Optional but recommended:

- persist those visibility preferences in `localStorage`

This persistence is nice-to-have, not required for the first pass.


## Phase 6: Update the electrode batch print report

File targets:

- [`routes/electrodes.js`](/Users/Dalia/Developer/RENERA/BADB_main/routes/electrodes.js)
- [`public/js/electrode-batch-print.js`](/Users/Dalia/Developer/RENERA/BADB_main/public/js/electrode-batch-print.js)

Add to the report:

### Summary

- active material
- specific capacity
- active fraction, theor. / fact.
- average foil mass
- average coating mass
- average active-material mass, theor. / fact.
- average capacity, theor. / fact.
- areal capacity, theor. / fact.
- per-side capacity, theor. / fact.

### Table

Add columns:

- `Масса покрытия, г`
- `Масса активного материала (теор.), г`
- `Масса активного материала (по факту), г`
- `Ёмкость (теор.), мАч`
- `Ёмкость (по факту), мАч`

Comments should keep their current rule:

- shown only when they exist


## Phase 7: Add battery-level capacity helpers

Create a battery-level helper that works from the selected battery electrodes.

Required derived values:

- `total_cathode_capacity_theoretical_mAh`
- `total_cathode_capacity_actual_mAh`
- `total_anode_capacity_theoretical_mAh`
- `total_anode_capacity_actual_mAh`
- `limiting_capacity_theoretical_mAh`
- `limiting_capacity_actual_mAh`
- `np_ratio_theoretical`
- `np_ratio_actual`

Formulas:

```text
total_cathode_capacity = sum(capacity of selected cathode electrodes)
total_anode_capacity   = sum(capacity of selected anode electrodes)

limiting_capacity = min(total_cathode_capacity, total_anode_capacity)
N/P = total_anode_capacity / total_cathode_capacity
```

Rules:

- use the sum across all selected electrodes
- do not include invalid or scrapped electrodes
- if one side is missing, battery summary values are `null`

Recommended backend file targets:

- [`routes/batteries.js`](/Users/Dalia/Developer/RENERA/BADB_main/routes/batteries.js)


## Phase 8: Update the batteries page

Add a compact derived summary block below the selected electrodes / source section.

Recommended displayed values:

- `Σ катодов (теор.), мАч`
- `Σ катодов (по факту), мАч`
- `Σ анодов (теор.), мАч`
- `Σ анодов (по факту), мАч`
- `Лимитирующая ёмкость (теор.), мАч`
- `Лимитирующая ёмкость (по факту), мАч`
- `N/P (теор.)`
- `N/P (по факту)`

UI hierarchy:

- theoretical values primary
- actual-derived values secondary


## Phase 9: Update the battery print report

Add a short electrochemical summary section to the battery print report.

Recommended values:

- total cathode capacities, theor. / fact.
- total anode capacities, theor. / fact.
- limiting capacity, theor. / fact.
- `N/P`, theor. / fact.


## Error-handling and null-handling rules

The feature must fail gracefully.

If data is missing:

- no crashes
- return `null`
- show `—` in the UI

Examples:

- missing `specific_capacity_mAh_g`
- missing foil masses
- missing electrode mass
- incomplete actuals
- missing geometry
- missing selected cathode/anode side in a battery


## Recommended file touch order

### Backend first

1. [`routes/electrodes.js`](/Users/Dalia/Developer/RENERA/BADB_main/routes/electrodes.js)
2. [`routes/batteries.js`](/Users/Dalia/Developer/RENERA/BADB_main/routes/batteries.js)

### Frontend second

3. [`public/js/2-electrodes.js`](/Users/Dalia/Developer/RENERA/BADB_main/public/js/2-electrodes.js)
4. [`public/workflow/2-electrodes.html`](/Users/Dalia/Developer/RENERA/BADB_main/public/workflow/2-electrodes.html)
5. [`public/js/electrode-batch-print.js`](/Users/Dalia/Developer/RENERA/BADB_main/public/js/electrode-batch-print.js)
6. [`public/js/3-batteries.js`](/Users/Dalia/Developer/RENERA/BADB_main/public/js/3-batteries.js)
7. [`public/workflow/3-batteries.html`](/Users/Dalia/Developer/RENERA/BADB_main/public/workflow/3-batteries.html)
8. [`public/js/battery-print.js`](/Users/Dalia/Developer/RENERA/BADB_main/public/js/battery-print.js)


## Recommended milestone breakdown

### Milestone 1

- backend helper for cut-batch capacity context
- per-electrode derived values
- batch summary values

Deliverable:

- API returns correct numbers


### Milestone 2

- electrodes page summary block
- electrodes table derived columns
- column-visibility controls

Deliverable:

- scientists can see and compare the new numbers on the electrodes page


### Milestone 3

- electrode batch print report updated

Deliverable:

- printable scientific summary for the batch


### Milestone 4

- battery-level totals
- limiting capacity
- `N/P`
- batteries page summary block

Deliverable:

- assembly-level electrochemical summary visible in app


### Milestone 5

- battery print report updated

Deliverable:

- printable battery electrochemical summary


## Things intentionally deferred

Not part of this implementation plan:

- energy in `Wh`
- voltage-based energy calculations
- persistence of derived capacities in DB
- variability statistics (`min`, `max`, `std dev`)
- supplier-vs-measured capacity comparison
- cycling-based capacity retention


## Best next step before coding

Before implementation starts, do one quick verification pass on the live backend logic for:

- how tape recipe active fraction is currently read from `tape_recipe_lines.slurry_percent`
- how tape actuals are stored in `tape_recipe_line_actuals`
- how best to reuse the existing dry-mass interpretation already implemented in `routes/tapes.js`
- whether any currently-used actual rows are volume-based in a way that would make actual-derived capacity unavailable for some tapes

If that check looks clean, start with **Milestone 1**.
