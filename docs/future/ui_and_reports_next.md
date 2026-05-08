# UI And Reports Future Work

Created: 2026-05-06
Edited: 2026-05-07
Status: future idea
Verified against code: light check 2026-05-07
Source paths: `docs/archive/superseded/2026-05-06-future-backlog/UI Styling Consistency Plan.md`, `docs/archive/superseded/2026-05-06-future-backlog/Printout Design.md`, `docs/archive/superseded/2026-05-06-root-doc-transition/DALIA_MIGRATION_GUIDE.md`, `public/css/styles.css`, `public/workflow/tape-print.html`, `public/workflow/electrode-batch-print.html`, `public/workflow/battery-print.html`, `public/workflow/electrolyte-print.html`, `client-web/src/pages/`

This file preserves future UI consistency and report-layout guidance. It is not a redesign request.

## Interactive UI Direction

Goal: make vanilla pages and Vue pages feel like one calm technical application without broad rewrites.

Preferred direction:

- use shared visual tokens where possible;
- keep scientific/process inputs visually primary;
- make repeating metadata quieter;
- use amber for dirty/unsaved state;
- reserve red for real errors;
- use transient saved feedback instead of persistent visual noise;
- use plain grey disabled/readonly fields unless a stronger locked-state style is deliberately needed;
- avoid changing save logic during styling passes.

Preferred text:

```text
Не сохранено
Сохранение...
Сохранено
```

## Conservative Styling Rollout

First safe pass should be mostly CSS:

- add or reuse design tokens in `public/css/styles.css`;
- normalize dirty flags, inline status messages, disabled fields, and small lock banners;
- avoid backend changes;
- avoid save/autosave logic changes;
- avoid selector or ID renames used by JavaScript;
- verify dense workflow pages visually before expanding scope.

Typography note:

- Vue uses the Rosatom font stack;
- vanilla pages should not switch fonts until the font assets are intentionally available to the Express-served `public/` tree and dense pages are visually checked.

## Vue Form Cleanup Direction

The old PrimeVue migration guide is historical. Current Vue page names must be checked in `client-web/src/pages/` before starting any cleanup.

Useful preserved rules:

- keep existing save behavior and payload shape unless the task explicitly changes it;
- replace native controls with PrimeVue components only when the surrounding page already uses that pattern or the migration is scoped to one page;
- do not rename route paths, component files, CSS hooks, or API fields just to make a form look cleaner;
- after each page pass, run the Vue build/checks used by the project and do a browser smoke check for the edited page.

## Print Report Direction

Current print report references:

- `public/workflow/tape-print.html`
- `public/workflow/electrode-batch-print.html`
- `public/workflow/battery-print.html`
- `public/workflow/electrolyte-print.html`

Future print reports should follow the same technical print-sheet spirit:

- high data-to-ink ratio;
- clear title and compact metadata;
- repeated section structure;
- simple tables only where comparison is useful;
- aligned numeric values with units close to values;
- light borders and restrained contrast;
- no app chrome;
- no decorative gradients, heavy backgrounds, 3D effects, or unnecessary icons;
- `window.print()` action available.

Print-page styling does not need to match the interactive form styling exactly. Print pages are their own technical output format.

## Planned Report Backlog

Completed record reports:

- Electrolytes;
- Projects;
- Separators.

Record reports to add in upcoming bounded passes:

- Users.

List reports to add in upcoming bounded passes:

- Departments list;
- reusable list-view print pattern for pages where printing the current list is
  useful.

Recipes may also need a report because recipes are scientific work products, but
that should be handled as its own scoped decision with the recipe-line editor in
view.

## Numeric And Table Guidance

For numeric data:

- align values consistently;
- use consistent decimal precision;
- keep units visible;
- use tabular-number styling where useful.

For tables:

- left-align text;
- right-align numbers;
- keep headers short;
- use light borders;
- avoid excessive zebra striping unless readability clearly improves.

## Guardrails

- Do not introduce a frontend framework for vanilla report work.
- Do not add large dependencies for print layout.
- Do not rewrite backend/database logic while improving report layout.
- Do one page or one report family at a time.
- Use browser and print-preview checks for visual changes.
