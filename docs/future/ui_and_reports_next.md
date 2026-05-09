# UI And Reports Future Work

Created: 2026-05-06
Edited: 2026-05-09
Status: future idea
Verified against current docs/code: cleanup pass 2026-05-09

Current source of truth:

- `docs/current/vanilla_reference_pages.md`
- `docs/current/tapes.md`
- `docs/current/electrodes.md`
- `docs/current/batteries.md`
- `docs/current/projects.md`
- `docs/current/recipes.md`
- `docs/current/electrolytes.md`
- `docs/current/separators.md`
- `docs/instructions/vanilla_ui_patterns.md`
- `docs/instructions/frontend_parity_handoff.md`

This file preserves only future UI consistency and print-layout guidance. It is
not a redesign request, and it should not restate reports or page behavior that
already exist.

## Future Interactive UI Direction

Goal: make future vanilla and Vue work feel like one calm technical application
without broad rewrites.

Preferred direction for future styling passes:

- use shared visual tokens where possible;
- keep scientific/process inputs visually primary;
- make repeating metadata quieter;
- use amber for dirty/unsaved state;
- reserve red for real errors;
- use transient saved feedback instead of persistent visual noise;
- use plain grey disabled/readonly fields unless a stronger locked-state style
  is deliberately needed;
- avoid changing save logic during styling passes.

Preferred text for future save-status consistency:

```text
Не сохранено
Сохранение...
Сохранено
```

## Conservative Styling Rollout

First safe pass should be mostly CSS:

- add or reuse design tokens in `public/css/styles.css`;
- normalize dirty flags, inline status messages, disabled fields, and small
  lock banners only where the current page has not already been handled;
- avoid backend changes;
- avoid save/autosave logic changes;
- avoid selector or ID renames used by JavaScript;
- verify dense workflow pages visually before expanding scope.

Typography note:

- Vue uses the Rosatom font stack;
- vanilla pages should not switch fonts until the font assets are intentionally
  available to the Express-served `public/` tree and dense pages are visually
  checked.

Vue parity is not tracked here. Use
`docs/instructions/frontend_parity_handoff.md` for pending Vue behavior that
must match current vanilla/backend behavior.

## Future Print Report Direction

Implemented record reports are documented in `docs/current/`. Future print
reports should follow the same technical print-sheet spirit:

- high data-to-ink ratio;
- clear title and compact metadata;
- repeated section structure;
- simple tables only where comparison is useful;
- aligned numeric values with units close to values;
- light borders and restrained contrast;
- no app chrome;
- no decorative gradients, heavy backgrounds, 3D effects, or unnecessary icons;
- `window.print()` action available.

Print-page styling does not need to match the interactive form styling exactly.
Print pages are their own technical output format.

## Planned Report Backlog

Future-only record report idea:

- Users.

Future-only list/report ideas:

- Departments list or Department report printing, after Dalia chooses the useful
  paper output;
- reusable list-view print pattern for pages where printing the current list is
  useful.

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
