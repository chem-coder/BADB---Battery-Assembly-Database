# Feature Backlog

Created: 2026-05-06
Edited: 2026-05-09
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
