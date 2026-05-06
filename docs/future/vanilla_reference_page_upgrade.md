# Vanilla Reference Page Upgrade

Created: 2026-05-06
Edited: 2026-05-06
Status: future idea
Verified against code: light check 2026-05-06
Source paths: `docs/archive/superseded/2026-05-06-future-backlog/BADB_VANILLA_REFERENCE_PAGE_UPGRADE_PLAN.md`, `public/js/badb-ui.js`, `public/reference/electrolytes.html`, `public/js/electrolytes.js`, `public/workflow/1-tapes.html`, `public/workflow/2-electrodes.html`, `public/workflow/3-batteries.html`

This is a future rollout plan for making remaining vanilla reference pages feel closer to the current Tapes, Electrode Batches, Batteries, and in-progress Electrolytes interaction pattern.

Materials are out of scope for this rollout. The current Materials tree/composition workflow is good enough for the current release direction and should not be redesigned casually.

## Current Baseline

Current workflow pages already provide the design reference:

- Tapes;
- Electrode Batches;
- Batteries.

Light code check on 2026-05-06 also found:

- `public/js/badb-ui.js` exists as a shared vanilla UI helper;
- Electrolytes already uses a sticky record header and helper-backed scroll/status behavior;
- Electrolytes delete confirmation uses `DELETE ELECTROLYTE <id>`;
- Electrolytes print report was not found in the current file search.

Treat this doc as future guidance for the remaining rollout, not as proof that every item below is implemented.

## Core Pattern

Use this interaction pattern where practical:

- row summary opens the record;
- remove pencil edit buttons when row-open behavior is clear;
- keep Duplicate list-level only where duplication is genuinely useful;
- keep Print list-level or sticky-header level when a report exists;
- move Delete inside the opened form or sticky record header;
- use typed confirmation for destructive deletes;
- show dependency/blocker messages before typed confirmation when dependencies exist;
- sticky header contains record label, compact metadata, dirty flag, action buttons, and action feedback;
- Save keeps the record open;
- Exit returns to the list/default view;
- opening a record scrolls to the top.

Use Russian labels throughout.

## Helper Boundary

Shared helper code may own presentation mechanics:

- sticky record header shell;
- compact record title/metadata slots;
- dirty/saved marker rendering;
- status message timing and class names;
- row-open affordance;
- common icon/action-button presentation.

Keep workflow rules page-local:

- save behavior;
- delete/disassembly safety rules;
- dirty-state calculation;
- form-specific state;
- backend dependency checks;
- domain validation.

If helper code needs many page-specific exceptions, keep that behavior local.

## Suggested Rollout

Finish pages in small passes:

1. Electrolytes remaining work, especially print report if useful.
2. Separators row-open, sticky header, inside-form delete, and print report.
3. Recipes row-open, sticky header, inside-form delete, and print report.
4. Projects row-open and inside-form delete; decide whether a project print report is valuable.
5. Users row-open and inside-form delete; avoid a heavy sticky header unless it clearly helps.
6. Departments row-open and delete only if the dependency rules are clear.

Good pairings:

- Electrolytes and Separators for similar reference-table behavior;
- shared CSS/helper cleanup after one page proves the pattern.

Avoid one huge implementation pass across all reference pages.

## Print Report Candidates

Likely useful:

- Electrolytes;
- Separators;
- Recipes.

Possibly useful:

- Projects.

Probably not useful:

- Users;
- Departments.

Print report design guidance lives in `docs/future/ui_and_reports_next.md`.

## Delete Confirmation Phrases

Use page-specific typed phrases:

- `DELETE ELECTROLYTE <id>`
- `DELETE SEPARATOR <id>`
- `DELETE RECIPE <id>`
- `DELETE PROJECT <id>`
- `DELETE USER <id>`
- `DELETE DEPARTMENT <id>`

Never imply safe deletion unless backend dependency checks actually support it.

## Verification For Each Page

Run at least:

```bash
node --check public/js/<changed-page>.js
git diff --check
npm run contract:vanilla
```

Run `npm run smoke:vanilla` after meaningful API, route, delete, dependency, or print-report changes.

Visually check desktop and mobile width for sticky-header overlap, long Russian labels, and button wrapping.
