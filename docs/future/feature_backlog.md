# Feature Backlog

Created: 2026-05-06
Edited: 2026-07-17
Status: future idea
Verified against current docs/code: cleanup pass 2026-05-09

Source paths:

- `docs/archive/superseded/2026-05-06-future-backlog/BADB_Feature_Ideas.md`
- `docs/archive/superseded/2026-05-06-future-backlog/IDEAS.md`
- `docs/current/capacity_calculations.md`
- `docs/current/vanilla_reference_pages.md`

This file preserves small future ideas that do not yet deserve their own
current-system document. It is not release evidence and is not a work order by
itself.

Implemented behavior from the old backlog has been moved out of this file. For
current slurry, capacity, print-report, reference-page, and filter behavior,
use `docs/current/` as source of truth.

## Intake Rule

Turn ideas into work through this path:

```text
idea -> issue/ticket -> branch -> implementation -> test -> pull request/review -> merge
```

Do not implement from this backlog without first checking current code and
deciding scope.

## Tape Measurement Ideas

Future decisions:

- decide whether scientists need separate explicit fields for one-sided and
  two-sided tape thickness instead of the current sidedness plus initial/final
  thickness fields;
- consider dropping the retired `tape_step_coating.coat_temp_c` column after a
  later version proves no historical/imported data needs it. In v1.1 it stays in
  the schema but is hidden from the vanilla coating UI and saved as `NULL`;
- confirm whether the Excel note `Зазор по щупам 220 мкм` maps to the current
  coating gap field or represents a separate measurement;
- make `мАч/см2` visibility in the UI explicit wherever scientists need it and
  current pages do not already expose it clearly.

## Visual Attention Ideas

Future UI cleanup:

- make repeating metadata such as current user and date/time visually quieter;
- keep metadata present for audit and traceability;
- let scientific/process inputs carry the strongest visual weight on dense
  workflow pages.

## Materials And Inventory Ideas

Detailed material and inventory future work lives in
`docs/future/materials_capacity_next.md`.

Important themes from the backlog:

- order and arrival lifecycle;
- supplier, brand, lot, quantity, price, analysis date, and expiration tracking;
- source quality and good/bad reorder indicators;
- scientist review before adding new required properties.

## Assembly And Optimization Ideas

- Define dedicated prism-cell physical configuration fields when the lab
  confirms which dimensions and shell parameters matter. Current v1.1 stores
  `form_factor = 'prism'` and reuses the pouch-like size/config path on
  purpose.

Battery assembly log structure and external reference-source ideas live in
`docs/future/battery_assembly_logs_next.md`.

Battery rework, explicit old-data cleanup, and only unimplemented advanced list
filters live in `docs/future/battery_status_workflow_next.md`.

## Reference Page Filters

Current reference-page filters are documented in
`docs/current/vanilla_reference_pages.md` and page-specific current docs.

Future filter work should add only filters that are not already implemented and
only where list growth makes scanning slow. Keep filters page-local first; do
not introduce schema changes or a shared cross-page filter framework unless a
later bounded pass proves the need.

UI consistency and remaining reference-page report/list-print ideas live in:

- `docs/future/ui_and_reports_next.md`
- `docs/future/vanilla_reference_page_upgrade.md`

## Leftovers From The 2026 Inbox Notes (added 2026-07-17)

Everything else in `docs/archive/inbox/BADB_notes.txt` and
`frontend_notes.txt` was verified implemented (or already stale) on
2026-07-17; the source txt files can be deleted. What survives them:

### Vilitek planar centrifugal mixer (V-ITT-300s) automation

The mixer itself is being added on `dalia/vilitek-mixer`. Still open, and
blocked on a discussion with Dalia before any implementation:

- auto-select the Vilitek instead of the magnetic stirrer as the default
  for small mixes — Dalia must define "small" (she has used it for 10–15 g
  of active material) and any other conditions;
- suggest the number/size of agate balls from the amount of active
  material and/or total mixture volume or mass. Available ball diameters:
  0.25 / 0.5 / 0.75 / 1.0 cm (confirmed by Dalia 2026-07-17). Known lab
  data points: 10× 0.5 cm + 3× 1.0 cm in one run; 5× 0.75 cm in another.
  Needs more lab data or a literature pass before it can be a real model;
- available cup sizes: 30 mL, 100 mL, and 375 mL (confirmed by Dalia
  2026-07-17). Only the small sizes have been used so far; the 375 mL cup
  is unused — keep in mind for volume limits and for the auto-select rule.

### Vue list-selection presentation

CrudTable got a «Выбрано: N — показать» lens (narrow the table to selected
rows) as the answer to the "selected tapes jump to top?" note. Dalia has
not yet confirmed this is the behavior she wants — if not, the alternative
is pinning selected rows to the top of the list.

### Org-structure parity in Vue (F2/F3)

- F2: Users page — «Проекты» fieldset parity with vanilla;
- F3: Departments page — members list parity with vanilla.

### Direction statement (context for all of the above)

Vanilla is the source of truth: it encodes the lab's real processes.
The Vue frontend must first reach parity with vanilla; only after that
does the app itself evolve to match the team's needs (Dalia's stated
sequencing, 2026-07-17 — preserved here because the original note file
is being deleted).
