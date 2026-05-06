# Capacity Calculations Context

Created: unknown
Edited: 2026-05-06
Status: superseded

Superseded by:

- `docs/current/capacity_calculations.md`
- `docs/future/materials_capacity_next.md`

## Purpose of the feature

Add scientifically meaningful capacity calculations to BADB using values that are already being collected in:

- materials
- tapes
- electrode cut batches
- electrodes
- batteries

The goal is not just to display one more derived number.

The goal is to help the user answer these practical questions:

- How much active material does each electrode actually contain?
- What is the estimated capacity of each electrode?
- What is the average usable capacity of this electrode batch?
- What is the areal capacity of the batch?
- For double-sided electrodes, what is the capacity per side?
- For a battery assembly, which side is limiting?


## What the user is trying to do

This feature is meant to support real electrode and cell evaluation, not just bookkeeping.

The user is trying to:

- estimate the capacity of each cut electrode from measured mass
- compare electrodes inside a batch
- get a representative batch-level value for downstream battery assembly
- identify the limiting electrode set at battery level
- connect electrochemical estimates back to the source material and recipe

So the calculations should support:

- traceability
- quick operational decisions
- scientific interpretation


## Existing BADB data that already supports this

### Materials

From the materials inventory feature:

- `material_properties.specific_capacity_mAh_g`

This is the reference specific capacity of the active material.


### Tapes

The tape already contains the upstream chemistry/process context:

- tape recipe / role
- coating sidedness
- mixture composition
- actual weighed amounts

This is where the active-material fraction originates.


### Electrode cut batch

The cut-batch already stores:

- target geometry
- computed electrode area
- source tape
- foil mass measurements
- drying information

This is where the average foil mass and electrode area originate.


### Electrodes

Each individual electrode already stores:

- measured electrode mass
- status
- scrap status / reason

This is where the per-electrode capacity originates.


### Batteries

The battery assembly already knows:

- selected cathode electrodes
- selected anode electrodes
- sidedness consistency

So later it can compute:

- total cathode capacity
- total anode capacity
- limiting capacity
- N/P ratio


## Core calculation model

### 1. Electrode coating mass

For each electrode:

```text
coating_mass_g = electrode_mass_g - average_foil_mass_g
```

where:

- `electrode_mass_g` comes from the individual electrode row
- `average_foil_mass_g` comes from the foil mass measurements of the cut batch

This should be exposed directly in the UI as:

- `Масса покрытия, г`


### 2. Active-material mass

```text
active_material_mass_g = coating_mass_g × active_fraction
```

where:

- `active_fraction` is the fraction of active material in the electrode mixture

This should also be exposed directly in the UI as:

- `Масса активного материала, г`


### 2A. Two parallel capacity modes

This feature should calculate **both**:

- theoretical capacity
- actual-derived capacity

The difference is the source of `active_fraction`.

#### Theoretical mode

```text
active_fraction_theoretical = active fraction from the tape recipe
```

This is the main baseline value.

#### Actual-derived mode

```text
active_fraction_actual = active-material actual mass / total actual solids mass
```

This is the process-sensitive value.

Important:

- this should be based on **solids mass**, not total wet mixture mass
- solvent should not dilute the fraction used for final dry-electrode capacity


### 3. Electrode total capacity

```text
capacity_mAh = active_material_mass_g × specific_capacity_mAh_g
```

Equivalent compact form:

```text
capacity_mAh = (electrode_mass_g - average_foil_mass_g) × active_fraction × specific_capacity_mAh_g
```

So in practice the app should calculate:

```text
capacity_theoretical_mAh
capacity_actual_mAh
```


### 4. Batch average capacity

Average only across non-scrapped electrodes with valid masses:

```text
average_capacity_mAh = mean(capacity_mAh across valid non-scrapped electrodes)
```

In practice:

```text
average_capacity_theoretical_mAh
average_capacity_actual_mAh
```


### 5. Areal capacity

```text
areal_capacity_mAh_cm2 = average_capacity_mAh / electrode_area_cm2
```

In practice:

```text
areal_capacity_theoretical_mAh_cm2
areal_capacity_actual_mAh_cm2
```


### 6. Capacity per side

This should be derived from sidedness, not blindly divided by 2.

Recommended general rule:

```text
capacity_per_side_mAh_cm2 = areal_capacity_mAh_cm2 / side_count
```

where:

- one-sided electrode -> `side_count = 1`
- two-sided electrode -> `side_count = 2`

This is better than always naming the value `C 1/2 areal`, because that name only makes literal sense for two-sided electrodes.

In practice:

```text
capacity_per_side_theoretical_mAh_cm2
capacity_per_side_actual_mAh_cm2
```


## Best source of each input

### specific_capacity_mAh_g

Source:

- `material_properties` of the active material instance

Placement:

- entered on the material details page


### active_fraction

The app should expose two fractions:

#### theoretical active fraction

Source:

- the planned active-material fraction from the tape recipe / tape mixture definition

#### actual active fraction

Source:

- the saved tape actuals

Recommended derivation:

```text
actual active fraction = actual active-material mass / total actual solids mass
```

Important:

- use solids mass, not total wet mixture mass
- solvent should not count toward final dry-electrode active fraction
- if actuals are incomplete or unusable, actual-derived capacities should show `—`


### average_foil_mass_g

Source:

- mean of `foil_mass_measurements.mass_g` for the cut batch


### electrode_area_cm2

Source:

- derive from the saved cut-batch geometry

Important:

- the page currently computes/display area in `mm²`
- capacity calculations should use `cm²`
- so the backend should expose both, or at least convert cleanly:

```text
cm² = mm² / 100
```


### side_count

Source:

- `tape_step_coating.coating_sidedness` propagated through the tape linked to the cut batch


## Recommended storage strategy

### V1 recommendation

Do **not** store the capacity values in the database yet.

Compute them on demand in the backend/API.

Reason:

- all inputs already exist in normalized form
- avoids stale derived values if:
  - electrode masses are edited
  - foil masses are edited
  - the active material property is updated
  - sidedness or recipe context changes
- easier to verify and refine formulas during the first phase

So for v1:

- store the **inputs**
- compute the **capacities**


### Possible V2 storage

If later there is a need for frozen historical snapshots, then store:

- per-electrode calculated capacity snapshot
- batch summary snapshot
- battery limiting capacity snapshot

But that is not the best first implementation.


## Where the values should appear in the app

### 1. Materials page / Material details

This is where the reference input belongs.

Recommended:

- on `material-details.html`
  - `Удельная ёмкость, мАч/г`

Optional later:

- nominal voltage
- supplier-declared capacity
- measured-vs-declared comparison

Do **not** put electrode or battery capacities here.


### 2. Electrodes page

This is the most important place for the feature.

Recommended placements:

#### A. Batch summary block

Add a compact derived summary for the selected cut batch.

Suggested values:

- active material
- active fraction (theor. / fact.)
- specific capacity
- average foil mass
- electrode area
- sidedness
- average coating mass
- average active-material mass, theor. / fact.
- average electrode capacity, theor. + fact., `мАч`
- areal capacity, theor. + fact., `мАч/см²`
- capacity per side, theor. + fact., `мАч/см²`
- number of electrodes included in averaging

This should probably sit near the geometry / foil mass / electrode table section, not buried in drying.

Visual recommendation:

- theoretical values = primary
  - slightly larger
  - darker
  - bolder
- actual-derived values = secondary
  - slightly smaller
  - lighter
  - not bold

Help behavior:

- each label should have a hover note
- theoretical note should explain:
  - this is calculated from the recipe composition
- actual note should explain:
  - this is calculated from saved actual mixture values


#### B. Electrode table

Add computed columns for the full scientific chain:

- `Масса покрытия, г`
- `Масса активного материала (теор.), г`
- `Масса активного материала (по факту), г`
- `Ёмкость (теор.), мАч`
- `Ёмкость (по факту), мАч`

So each electrode row shows:

- measured mass
- computed coating mass
- computed active-material masses
- computed capacities
- status

This is likely the single most useful per-electrode display.

Recommended UI behavior:

- all derived columns should be calculated
- all derived columns should exist in the table
- above the table, add one visibility checkbox for each non-essential column
- if a checkbox is off, its column is hidden from view but not removed from calculation

Recommended rule:

- `Масса, г` stays always visible
- action/status-critical columns stay visible
- all derived/secondary columns can be shown or hidden by the user

This lets the user choose:

- a compact operational table
- a chemistry-heavy table
- a comparison table with theoretical + actual values side by side


#### C. Scrap-aware averaging

Only non-scrapped electrodes should count toward batch average.

This rule should be visible in the UI.

For example:

- `Среднее по 12 нескрапнутым электродам`


### 3. Electrode batch print report

This should definitely include capacity.

Recommended:

- batch summary section:
  - average foil mass
  - active fraction, theor. / fact.
  - specific capacity
  - average coating mass
  - average active-material mass, theor. / fact.
  - average capacity, theor. / fact.
  - areal capacity, theor. / fact.
  - per-side capacity, theor. / fact.
- electrode table:
  - add `Масса покрытия, г`
  - add `Масса активного материала (теор.), г`
  - add `Масса активного материала (по факту), г`
  - add `Ёмкость (теор.), мАч`
  - add `Ёмкость (по факту), мАч`

This will make the report much more useful scientifically.


### 4. Batteries page

Capacity should be shown here too, but differently.

The batteries page should not repeat the full per-electrode chemistry explanation.

It should show assembly-relevant summaries:

- total cathode capacity, theor. / fact.
- total anode capacity, theor. / fact.
- limiting capacity, theor. / fact.
- N/P, theor. / fact.

This should be derived from the selected electrodes in the current battery.

Recommended placement:

- in the sources / selected-electrodes part of the batteries page
- as a compact derived summary block below the selected electrodes

Recommended values:

- `Σ катодов (теор.), мАч`
- `Σ катодов (по факту), мАч`
- `Σ анодов (теор.), мАч`
- `Σ анодов (по факту), мАч`
- `Лимитирующая ёмкость (теор.), мАч`
- `Лимитирующая ёмкость (по факту), мАч`
- `N/P (теор.)`
- `N/P (по факту)`

Recommended formulas:

```text
total_cathode_capacity = sum(capacity of selected cathode electrodes)
total_anode_capacity   = sum(capacity of selected anode electrodes)

limiting_capacity = min(total_cathode_capacity, total_anode_capacity)

N/P = total_anode_capacity / total_cathode_capacity
```

Recommended rule:

- use the sum across all selected electrodes in the assembled battery
- exclude any scrapped or otherwise invalid electrodes from the selectable pool entirely

This gives the most useful assembly-level electrochemical summary without overcomplicating the page.


### 5. Battery print report

Recommended:

- include total cathode capacities, theor. / fact.
- include total anode capacities, theor. / fact.
- include limiting capacity, theor. / fact.
- include N/P, theor. / fact.

This makes the report much more meaningful than geometry-only assembly data.


## What else the feature probably wants

The user is not only trying to calculate a single number.

They are also trying to judge:

- batch uniformity
- whether a batch is acceptable for use
- whether a battery assembly is balanced

So these additional values are worth considering.

### Good candidates for near-future additions

#### 1. Min / max / spread in electrode capacity

Useful for batch consistency.

Recommended later:

- `min capacity`
- `max capacity`
- maybe `std dev`


#### 2. Coating mass per electrode

This is scientifically useful and should be part of the first implementation.

```text
coating_mass_g = electrode_mass_g - average_foil_mass_g
```

#### 3. Active-material mass per electrode

This should also be part of the first implementation.

```text
active_material_mass_g = coating_mass_g × active_fraction
```

Show both:

- theoretical active-material mass
- actual-derived active-material mass


#### 4. Limiting battery capacity

Definitely useful and likely essential.


#### 5. N/P ratio

Also very useful once battery-level capacity is in place.


#### 6. Battery-level total cathode / anode capacities

These should be part of the first battery-capacity implementation.

They are the direct basis for:

- limiting capacity
- N/P


### Values that should probably wait

- estimated energy in Wh
- voltage-based energy calculations
- supplier-vs-measured capacity comparisons
- degradation / cycling-based capacity retention

These are valuable, but they are a second phase.


## Recommended naming / wording

Try to use wording that reflects what the value really means.

Recommended labels:

- `Удельная ёмкость материала, мАч/г`
- `Масса покрытия, г`
- `Масса активного материала (теор.), г`
- `Масса активного материала (по факту), г`
- `Ёмкость электрода (теор.), мАч`
- `Ёмкость электрода (по факту), мАч`
- `Средняя масса покрытия, г`
- `Средняя масса активного материала (теор.), г`
- `Средняя масса активного материала (по факту), г`
- `Средняя ёмкость партии (теор.), мАч`
- `Средняя ёмкость партии (по факту), мАч`
- `Удельная ёмкость по площади (теор.), мАч/см²`
- `Удельная ёмкость по площади (по факту), мАч/см²`
- `Удельная ёмкость на сторону (теор.), мАч/см²`
- `Удельная ёмкость на сторону (по факту), мАч/см²`
- `Σ катодов (теор.), мАч`
- `Σ катодов (по факту), мАч`
- `Σ анодов (теор.), мАч`
- `Σ анодов (по факту), мАч`
- `Лимитирующая ёмкость (теор.), мАч`
- `Лимитирующая ёмкость (по факту), мАч`
- `N/P (теор.)`
- `N/P (по факту)`
- `Лимитирующая ёмкость, мАч`
- `N/P`

Avoid hard-coding `C 1/2 areal` as the primary label if one-sided electrodes exist in the system.


## Relationship to sidedness

This feature now has a clean place to use the new sidedness logic.

Sidedness should affect:

- the per-side areal capacity calculation
- labels shown in the UI
- interpretation of rectangular/pouch electrodes

It should **not** affect:

- the total measured electrode mass
- the basic per-electrode total capacity formula


## Relationship to scrapping

Scrapped electrodes should:

- still show their own per-electrode calculated capacity if mass exists
- be excluded from the batch average
- be clearly excluded from any battery-level totals

This gives traceability without contaminating the representative batch value.


## Relationship to missing data

The feature should degrade gracefully.

If any required input is missing:

- no crash
- show `—`
- optionally show a quiet explanation in the batch summary

Examples:

- no specific capacity on the active material -> cannot compute capacities
- no foil mass measurements -> cannot compute coating mass
- no electrode mass -> cannot compute that electrode’s capacity
- no geometry -> cannot compute areal capacity


## Recommended implementation order

1. Add `specific_capacity_mAh_g` to the material properties UI if not already visible.
2. Define one backend helper that assembles the capacity input context for a cut batch:
   - active material
   - theoretical active fraction
   - actual active fraction
   - specific capacity
   - average foil mass
   - area in `cm²`
   - sidedness
3. Add backend computed payload for:
   - each electrode coating mass
   - each electrode active-material mass, theor. / fact.
   - each electrode capacity, theor. / fact.
   - batch averages for those values
4. Show the values on the electrodes page.
5. Add column-visibility controls for the electrodes table.
6. Add the same values to the electrode batch print report.
7. After that, extend batteries with:
   - total cathode capacity, theor. / fact.
   - total anode capacity, theor. / fact.
   - limiting capacity, theor. / fact.
   - N/P, theor. / fact.


## Best current design decision

For v1:

- store `specific_capacity_mAh_g` in materials
- compute electrode coating mass from:
  - electrode mass
  - foil average mass
- compute electrode active-material mass from:
  - coating mass
  - theoretical active fraction
  - actual active fraction
- compute electrode capacity from:
  - electrode mass
  - foil average mass
  - theoretical active fraction
  - actual active fraction
  - specific capacity
- compute batch averages from valid non-scrapped electrodes
- compute per-side areal capacity from sidedness
- do not persist derived capacity values yet


## Open questions to resolve before coding

### 1. Should v1 calculate one capacity or two?

Recommended answer:

- calculate both

Use:

- theoretical capacity from recipe fraction
- actual-derived capacity from saved actuals

Display rule:

- theoretical = primary display
- actual-derived = secondary display


### 2. Should per-electrode capacity be shown directly in the editable table?

Recommended answer:

- yes

Use two columns:

- `Масса покрытия, г`
- `Масса активного материала (теор.), г`
- `Масса активного материала (по факту), г`
- `Ёмкость (теор.), мАч`
- `Ёмкость (по факту), мАч`

This is the most useful immediate scientist-facing output.

Recommended UI addition:

- add simple show/hide checkboxes above the table for all non-essential columns


### 3. Should one-sided electrodes show `C 1/2 areal`?

Recommended answer:

- no

Instead show the more general and correct label:

- `Удельная ёмкость на сторону, мАч/см²`


### 4. Should scrapped electrodes still display their own capacity?

Recommended answer:

- yes, but exclude them from averages


### 5. Should batch variability statistics be part of v1?

Recommended answer:

- no

Add them in the next pass after the core capacity flow is working.


### 6. What exactly should actual-derived active fraction use as denominator?

Recommended answer:

- total actual solids mass

not:

- total wet mixture mass including solvent
