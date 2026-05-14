# Capacity Calculations

Created: 2026-05-06
Edited: 2026-05-13
Status: current
Verified against code: 2026-05-06

Source paths:

- `services/electrodeCapacityService.js`
- `services/batteryCapacityService.js`
- `services/tapeWorkflowService.js`
- `services/tapeReadService.js`
- `services/materialInfoService.js`
- `public/js/1-tapes.js`
- `public/js/2-electrodes.js`
- `public/js/3-batteries.js`
- `public/js/electrode-batch-print.js`
- `public/js/battery-print.js`
- local `badb_app_v1` schema inspection on 2026-05-06

This document describes the current derived capacity and density behavior.
Derived capacity values are computed on demand; they are not stored as capacity
snapshot rows.

## Material Inputs

Specific capacity is stored on material instances:

```text
material_properties.specific_capacity_mah_g
```

The API accepts and returns `specific_capacity_mAh_g` as a compatibility alias,
but docs and new code should use `specific_capacity_mah_g` for database/API
payloads unless testing the alias deliberately.

Density is also stored on material instances:

```text
material_properties.density_g_ml
```

Density is used for mass/volume conversion when tape actuals are entered by
volume.

## Tape Actuals And Density

Tape actuals are stored in `tape_recipe_line_actuals`.

Important fields:

- `material_instance_id`
- `measure_mode`
- `actual_mass_g`
- `actual_volume_ml`

Current allowed measure modes:

- `mass`
- `volume`

The database constraint allows exactly one entered value:

- mass mode stores `actual_mass_g`;
- volume mode stores `actual_volume_ml`;
- blank mode stores neither.

The current UI labels volume actuals as `V (ml)`, and the current calculation
code treats `actual_volume_ml` as milliliters.

Effective actual mass is:

```text
actual_mass_g
```

when `measure_mode = 'mass'`, or:

```text
actual_volume_ml * density_g_ml
```

when `measure_mode = 'volume'` and a positive density is known.

If density is missing, the entered volume can still be saved, but mass-based
derived values remain unavailable.

## Solids Fraction On Tapes

The Tapes page currently computes a live slurry solids summary in
`public/js/1-tapes.js`.

Formula:

```text
solids_fraction = total_actual_solids_mass / total_actual_wet_mass
```

Solvent-role lines contribute zero solids. For non-solvent lines, selected
material instance components are used when loaded. If an instance has no
component rows, it is treated as 100 percent of the recipe line material.

This solids fraction is different from active-material fraction:

- solids fraction denominator is total wet mixture mass;
- active-material fraction denominator is dry solids mass.

## Electrode Capacity Inputs

Electrode capacity context is assembled from existing upstream records:

- active recipe line: `cathode_active` or `anode_active`;
- theoretical fraction: active line `slurry_percent` divided by total included
  dry recipe percentage;
- actual fraction: active material actual mass divided by total actual solids
  mass;
- specific capacity: selected active material instance properties;
- average foil mass: `AVG(foil_mass_measurements.mass_g)` for the cut batch;
- electrode area: cut batch circle or rectangle geometry;
- sidedness: `tape_step_coating.coating_sidedness`.

Area conversion:

```text
electrode_area_cm2 = electrode_area_mm2 / 100
```

Sidedness mapping:

- `one_sided` -> `side_count = 1`
- `two_sided` -> `side_count = 2`

## Electrode Formulas

For each electrode:

```text
coating_mass_g = electrode_mass_g - average_foil_mass_g
```

```text
active_material_mass_theoretical_g =
  coating_mass_g * active_fraction_theoretical
```

```text
active_material_mass_actual_g =
  coating_mass_g * active_fraction_actual
```

```text
capacity_theoretical_mAh =
  active_material_mass_theoretical_g * specific_capacity_mah_g
```

```text
capacity_actual_mAh =
  active_material_mass_actual_g * specific_capacity_mah_g
```

`capacity_actual_mAh` is an internal compatibility name. It means calculated
capacity from the recorded actual electrode mass/composition inputs. It is not
measured discharge capacity from cycling data. User-facing labels should say
`Расчётная ёмкость`, `расчёт по факт. массе`, or equivalent wording rather than
presenting the value as measured factual capacity.

```text
areal_capacity_mAh_cm2 = capacity_mAh / electrode_area_cm2
```

For two-sided coatings, actual per-side areal capacity is:

```text
capacity_per_side_actual_mAh_cm2 =
  areal_capacity_actual_mAh_cm2 / side_count
```

The service returns `null` for derived values whose inputs are missing or not
positive. The UI displays unavailable values as blank/dash rather than crashing.

## Batch Summary

The electrode batch capacity summary is built from non-scrapped electrodes.

Scrapped electrodes may still display their own derived values if enough inputs
exist, but they are excluded from batch averages.

Current batch summary values include:

- active material name and instance id;
- specific capacity;
- theoretical and actual active fractions;
- average foil mass and count;
- electrode area in `mm2` and `cm2`;
- coating sidedness and side count;
- average coating mass;
- average active-material mass, theoretical and actual;
- average capacity, theoretical and actual;
- areal capacity, theoretical and actual;
- per-side capacity, theoretical and actual;
- included electrode count and valid-capacity counts.

The Electrodes page and electrode batch print report use this summary.

## Battery Summary

Battery capacity is derived from selected battery stack electrodes. The vanilla
Batteries page shows the calculated per-electrode capacity in the stack picker
and the selected-stack summary, alongside electrode id and mass, so the operator
can compare cathode/anode capacity before saving the stack.

The Batteries page also provides N/P assistance. The user enters desired anode
excess percent, and the page calculates:

```text
target_np_ratio = 1 + excess_percent / 100
```

```text
target_anode_total = total_cathode_capacity * target_np_ratio
```

```text
target_anode_per_electrode = target_anode_total / prescribed_anode_count
```

The anode table highlights a recommended anode set, not a greedy single next
row. The page prefers the lightest available anodes at or just above the
per-electrode target. Each anode row shows its delta against that per-electrode
target, and the user may either select manually or apply the suggested set with
the page button. This is a selection aid only; it does not silently auto-select
electrodes or weaken stack validation.

Current battery summary values include:

- cathode count;
- anode count;
- total cathode capacity, theoretical and actual;
- total anode capacity, theoretical and actual;
- limiting capacity, theoretical and actual;
- N/P ratio, theoretical and actual;
- cathode/anode/limiting area;
- cathode/anode/limiting areal capacity.

When both cathode and anode capacity are available, limiting capacity is the
smaller side. If only one side is available, the summary uses the available
side. This covers half-cell-style cases without applying an N/P ratio.

The Batteries page and battery print report use this summary.

## Current Calculation Boundary

Tape planning and tape reports expand selected material instances recursively
through nested component trees. They also calculate dependent rows before top-up
rows, so minor sources of the same dry ingredient are subtracted even when the
page display order changes.

If an instance has no rows in `material_instance_components`, it is treated as
100 percent of the recipe line material. Cycle-like composition paths are not
followed infinitely.

Electrode and battery capacity helpers may still need migration to a shared
recursive composition helper. Future work may also add frozen capacity snapshots
or batch variability statistics.
