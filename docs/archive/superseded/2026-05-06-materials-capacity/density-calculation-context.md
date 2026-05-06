# Density Calculation Context

Created: unknown
Edited: 2026-05-06
Status: superseded

Superseded by:

- `docs/current/capacity_calculations.md`

## Purpose of the feature

Add density-based mass/volume conversion to the **tapes actuals** workflow.

The goal is not to introduce another random calculation.

The goal is to let the user enter the quantity in the form that matches how the material was actually handled in the lab, while still making the mass-dependent downstream calculations usable.


## What the user is trying to do

On the tapes page, in the actuals table, some materials are naturally handled by:

- mass
- volume

This is especially relevant for:

- solvents
- solutions
- liquid additives
- possibly some pre-made binder solutions or dispersions

The user does **not** want to mentally convert everything before entering it.

The user wants to:

- enter what was actually measured
- see the equivalent value automatically when density is known
- keep the actuals table easy to use
- support later calculations such as:
  - solids fraction
  - actual-derived capacity


## Existing BADB data that already supports this

### Materials

From the materials inventory feature, each material instance can already store:

- `material_properties.density_g_ml`

This is the correct source of density for this feature.


### Tapes actuals

The real table name is:

- `tape_recipe_line_actuals`

Relevant columns already exist:

- `measure_mode`
- `actual_mass_g`
- `actual_volume_ml`
- `material_instance_id`

Current constraint already enforces exactly one input mode:

- mass only
- or volume only
- or blank

So the current model already supports user choice of mode.


### Tapes UI

The tapes page already has a selector in the actuals table:

- `m (г)`
- `V (мкл)`

and stores the result as either:

- `actual_mass_g`
- or `actual_volume_ml`


## Important schema / UX reality

There is currently a unit mismatch that must be treated carefully:

- the database column is named `actual_volume_ml`
- the UI label currently says `V (мкл)`
- the current code does **not** apply any explicit unit conversion between UI and DB

That means we must **not** casually assume the current saved values are in one unit or the other.

This is a real design issue, not a cosmetic naming issue.


## What this feature should do

### Core idea

Keep the existing mode selector, but make it scientifically useful:

- if the user enters **mass**, and density is known:
  - show derived volume
- if the user enters **volume**, and density is known:
  - show derived mass

So the app supports both:

- the quantity actually measured by the user
- the quantity needed for interpretation/calculation


### Recommended user-facing behavior

The user should enter the quantity in the form that matches how the material was handled.

That means:

- if the material was weighed: enter mass
- if the material was pipetted / dosed by volume: enter volume

The automatically calculated counterpart should be:

- visible
- read-only
- secondary in visual hierarchy

Example:

- entered: `V = 1.50 мл`
- derived: `≈ 1.29 г`

or:

- entered: `m = 1.29 г`
- derived: `≈ 1.50 мл`


## Recommendation: which direction is more useful?

### Short answer

The more useful direction is:

- **let the user enter either one**
- **always derive the other when density exists**

Do **not** force only one direction.

When the density is not recorded in the Material Details, leave blank - don't do the calculation. 

### Why this is the best design

If we force only:

- `volume -> mass`

then users who really weighed the material are forced into an awkward workflow.

If we force only:

- `mass -> volume`

then users who dosed liquid by pipette still have to convert before entry.

The current schema already supports choosing one mode.

So the cleanest v1 is:

- preserve that user choice
- make the counterpart visible automatically


## Recommended scientific rule

For all downstream calculations that need mass, define:

```text
effective_actual_mass_g =
  actual_mass_g                               if measure_mode = mass
  actual_volume × density_g_ml                if measure_mode = volume and density is known
  null                                        otherwise
```

This should later feed:

- solids fraction
- actual-derived active-material fraction
- other mass-based interpretations


## Recommended UI design on the tapes page

### Location

On the tapes page:

- in the actuals table
- inside the current actual-value cell
- directly under the entered value


### Display pattern

Keep the current selector and input.

Then add a small derived line underneath, for example:

- `≈ 1.29 г`
- or `≈ 1.50 мл`

Visual hierarchy:

- user-entered value = main
- density-derived value = smaller / lighter / secondary


### If density is missing

If the user selects volume mode but density is not known:

- allow saving the entered volume
- show a muted warning:
  - `Плотность не указана: масса не может быть рассчитана автоматически.`

This is better than blocking the user, because:

- the actual experimental action still happened
- the record should still be savable
- downstream mass-based calculations can simply remain unavailable


## Default mode recommendation

Do not hard-enforce one mode by material type.

But a helpful default may be:

- `volume` for solvent-role lines
- `mass` for everything else

This should remain only a default, not a lock.


## Relationship to solids fraction

This feature is closely related to the planned solids-fraction block on tapes.

Once density-based conversion exists, solids fraction can use:

- direct actual masses
- plus density-derived masses for volume-entered liquids, where appropriate

That makes the actual mixture description much more useful.


## Relationship to capacity calculations

This feature also improves the actual-derived capacity model.

Without density conversion:

- any line entered by volume is difficult to use in later mass-based calculations

With density conversion:

- those lines can contribute an effective mass when scientifically appropriate


## Recommended implementation shape

### 1. Do not change the basic schema first

The existing `tape_recipe_line_actuals` model is already close to what we need.

For v1, it is enough to:

- keep storing the user-entered mode
- keep storing the user-entered value in the existing column
- calculate the counterpart dynamically from:
  - selected `material_instance_id`
  - `material_properties.density_g_ml`

This avoids unnecessary migration work at the start.


### 2. Add a shared backend helper later if needed

If multiple pages/features need the same conversion, define a shared helper concept:

```text
actual_with_density_context
```

that can return:

- entered mode
- entered value
- density
- derived mass
- derived volume

But this does not have to be its own table in v1.


### 3. Preserve the user-entered quantity as the source of truth

Important:

- the app should not silently overwrite the stored mode/value
- the auto-calculated counterpart is a derived value
- not the canonical user input

That keeps the audit trail honest.


## One important open decision

### What is the real working unit for volume in tapes actuals?

This must be resolved before implementation.

Right now we have:

- DB name implies `ml`
- UI label implies `мкл`
- no explicit conversion in code

Possible realities:

1. the DB column name is legacy/wrong, but the values are really treated as `мкл`
2. the UI label is wrong, but the values are really intended as `мл`
3. historical data may already contain a mixture of assumptions

This should be verified before coding the final feature.


## Recommended resolution of that unit issue

Best practical approach:

1. inspect a few real saved tape actuals that were entered by volume
2. determine whether the magnitudes only make sense as:
   - `мкл`
   - or `мл`
3. then standardize the app explicitly

If the real intended unit is `мкл`, then:

- the app should either:
  - convert `мкл -> мл` explicitly before any density calculation
  - or rename/rework the semantics more clearly in a later cleanup

If the real intended unit is `мл`, then:

- the UI label should be corrected


## Recommended v1 summary

The clean v1 is:

- keep the existing actuals mode selector
- let the user enter either mass or volume
- if density exists, automatically show the equivalent value
- use derived mass for later mass-based calculations
- do not block saving volume-only entries when density is missing
- do not change schema first unless the unit audit shows a deeper problem


## Status

This is the final small follow-up feature after the core capacity work.

It should be designed carefully because it connects:

- materials properties
- tape actuals
- solids fraction
- actual-derived capacity

So even though the UI surface is small, it has real scientific consequences.
