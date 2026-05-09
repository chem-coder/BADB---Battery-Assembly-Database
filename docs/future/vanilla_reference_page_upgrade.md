# Vanilla Reference Page Upgrade

Created: 2026-05-06
Edited: 2026-05-09
Status: future idea
Verified against current docs/code: cleanup pass 2026-05-09

Current source of truth:

- `docs/current/vanilla_reference_pages.md`
- `docs/current/users.md`
- `docs/current/departments.md`
- `docs/current/projects.md`
- `docs/current/recipes.md`
- `docs/current/electrolytes.md`
- `docs/current/separators.md`
- `docs/instructions/vanilla_ui_patterns.md`
- `docs/instructions/frontend_parity_handoff.md`

This document tracks only remaining future vanilla reference-page work. Current
row-open behavior, sticky opened-record headers, filters, duplicate/delete
boundaries, and implemented print reports belong in `docs/current/` and should
not be re-specified here.

Materials remain out of scope for this rollout. The current Materials
tree/composition workflow is good enough for the current release direction and
should not be redesigned casually.

## Remaining Future Work

### Users Print Report

Users currently have no print report. If the team still wants one later, define
a small record report before implementation:

- record identity and role;
- department and position;
- active status;
- last successful login if useful for operations.

Do not add list-level print or duplicate actions to Users as part of this item
unless Dalia explicitly expands the scope.

### Departments List Or Report Printing

Departments currently have no print report or list-print action. If printing is
still desired later, decide whether the useful output is:

- a compact Departments list report;
- a single Department record report;
- both, as separate print pages.

Keep the first pass compact: department name, head, and only the member details
that users actually need on paper.

### Broader List-View Printing

A reusable list-view print pattern is still future work. Start with one page
where users really need the current filtered list on paper, then decide whether
the pattern should stay page-local or become shared helper behavior.

Initial guardrails:

- print the currently visible/filterable list, not an unrelated backend export;
- keep list columns page-specific;
- avoid a shared cross-page framework until multiple pages prove the same shape;
- keep app chrome out of the print page.

### Future Filters

Only add filters that are not already implemented in the current page. Before
planning filter work, check `docs/current/vanilla_reference_pages.md` and the
page-specific current doc.

Future filter candidates should be justified by real list growth or workflow
friction. Keep them page-local first, and do not introduce schema changes or a
shared filter framework unless a later bounded pass proves the need.

## Vue Parity Boundary

Vue parity is tracked in `docs/instructions/frontend_parity_handoff.md`, not in
this future note. Add a future-doc Vue item only for genuinely future behavior
that is not already covered by that handoff.

## Guardrails

- Do not rebuild implemented reference-page behavior from this document.
- Do not change Materials as part of this rollout.
- Do not add Department delete unless a separate backend route and dependency
  design are deliberately introduced.
- Do one report or one list-print pass at a time.
- Use Russian labels throughout.
