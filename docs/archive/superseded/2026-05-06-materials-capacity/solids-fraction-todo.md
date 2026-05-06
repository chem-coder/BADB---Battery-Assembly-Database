# Solids Fraction TODO

Created: unknown
Edited: 2026-05-06
Status: superseded

Superseded by:

- `docs/current/capacity_calculations.md`

## Purpose

Add a solids-fraction calculation to the tapes workflow.

This is related to capacity calculations, but it is not the same feature and should be tracked separately.


## Why it matters

During paste preparation, additional solvent may be added beyond the original recipe plan.

So after the actuals are entered, the app should be able to show how concentrated the real mixture actually is.

This matters for:

- process interpretation
- viscosity interpretation
- coating behavior
- comparing nominal recipe vs real prepared paste
- later actual-derived capacity calculations


## Recommended placement

On the tapes page:

- after the actuals section
- as a derived summary block

This is the natural place because the value depends on the saved actual mixture values.


## Core idea

Calculate:

```text
solids_fraction = total_actual_solids_mass / total_actual_mixture_mass
```

Possible display forms:

- mass fraction
- percentage

Recommended user-facing display:

- `Доля твёрдых веществ, %`


## Important rule

The calculation should use:

- actual mass of all solid components in the mixture
- divided by total actual mass of the whole mixture

This is different from the active-material fraction used in capacity calculations.

For capacity:

- active-material fraction should use total solids mass as denominator

For solids fraction:

- denominator should be total wet mixture mass including solvent


## Relationship to capacity calculations

This feature should be considered a dependency/helper for the broader interpretation of actual-derived capacity.

It does **not** directly replace the active-material fraction calculation.

Instead:

- solids fraction explains how concentrated the paste really was
- active-material fraction explains how much of the solids were active material


## Suggested future outputs

On tapes:

- `Доля твёрдых веществ, %`
- maybe later:
  - `Активное вещество в твёрдой фазе, %`
  - `Растворитель в смеси, %`


## Status

Not part of the first capacity implementation.

Keep as a separate follow-up item after the capacity feature is defined.
