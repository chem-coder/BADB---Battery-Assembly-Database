# Feature Backlog

Created: 2026-05-06
Edited: 2026-05-07
Status: future idea
Verified against code: light check 2026-05-07
Source paths: `docs/archive/superseded/2026-05-06-future-backlog/BADB_Feature_Ideas.md`, `docs/archive/superseded/2026-05-06-future-backlog/IDEAS.md`, `public/workflow/1-tapes.html`, `public/js/1-tapes.js`, `docs/current/capacity_calculations.md`

This file preserves small future ideas that do not yet deserve their own current-system document. It is not release evidence and is not a work order by itself.

## Intake Rule

Turn ideas into work through this path:

```text
idea -> issue/ticket -> branch -> implementation -> test -> pull request/review -> merge
```

Do not implement from this backlog without first checking current code and deciding scope.

## Already Current, Do Not Rebuild

These old ideas have already become current behavior:

- Tapes page slurry solids summary. Current behavior is documented in `docs/current/capacity_calculations.md`.
- Material specific capacity, electrode capacity summaries, and battery limiting-capacity summaries. Current behavior is documented in `docs/current/capacity_calculations.md`.
- Battery, electrode batch, tape, and electrolyte record print reports already exist.

## Tape Measurement Ideas

Current code already stores and displays:

- coating gap in microns;
- coating sidedness;
- calendering initial thickness in microns;
- calendering final thickness in microns;
- derived areal capacity values through electrode and battery capacity helpers.

Future decision:

- decide whether scientists need separate explicit fields for one-sided and two-sided tape thickness instead of the current sidedness plus initial/final thickness fields;
- confirm whether the Excel note `Зазор по щупам 220 мкм` maps to the current coating gap field or represents a separate measurement;
- make `мАч/см2` visibility in the UI explicit wherever scientists need it, not only in print/report summaries.

## Visual Attention Ideas

Future UI cleanup:

- make repeating metadata such as current user and date/time visually quieter;
- keep metadata present for audit and traceability;
- let scientific/process inputs carry the strongest visual weight on dense workflow pages.

## Materials And Inventory Ideas

Detailed material and inventory future work lives in `docs/future/materials_capacity_next.md`.

Important themes from the backlog:

- order and arrival lifecycle;
- supplier, brand, lot, quantity, price, analysis date, and expiration tracking;
- source quality and good/bad reorder indicators;
- scientist review before adding new required properties.

## Assembly And Optimization Ideas

Battery assembly log structure and external reference-source ideas live in `docs/future/battery_assembly_logs_next.md`.

Battery status/dropdown cleanup and top-of-list filters live in
`docs/future/battery_status_workflow_next.md`.

## Reference Page Filters

The Electrolytes reference page is current for row-open editing, page-local
text/status/type filters, list-level duplicate, sticky opened-record actions,
delete placement, unsaved-change guards, and the record print report.

Future decision:

- add top-of-list filters to other reference pages only when list growth makes
  scanning slow;
- keep filters page-local first;
- do not introduce schema changes or a shared cross-page filter framework unless
  a later bounded pass proves the need.

UI consistency and reference-page rollout ideas live in:

- `docs/future/ui_and_reports_next.md`
- `docs/future/vanilla_reference_page_upgrade.md`
