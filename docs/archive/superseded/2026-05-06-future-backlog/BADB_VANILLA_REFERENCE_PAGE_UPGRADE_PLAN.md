# BADB Vanilla Reference Page Upgrade Plan

## Purpose

Bring the remaining vanilla reference pages into the same interaction pattern now used by Tapes, Electrode Batches, and Batteries.

This is not a visual-only pass. Several pages also need new print reports, safer delete placement, row-opening behavior, and consistent scroll/record-header behavior.

Materials are explicitly out of scope for this rollout. The Materials page has a tree/composition editing model where the current pencil/trashcan controls are working reasonably well. Revisit Materials only after the simpler reference pages are consistent and we have better ideas for improving that page without harming its workflow.

## Current Progress

- 2026-05-05: Added the first shared vanilla UI helper, `public/js/badb-ui.js`, for repeated presentation mechanics.
- 2026-05-05: Applied the first helper-backed UI/list/header pass to Electrolytes:
  - row summary opens the electrolyte record
  - duplicate remains list-level only
  - delete moved into the opened record header
  - delete blockers are checked before typed confirmation
  - sticky header uses the shared record-header styling
  - save keeps the record open; Exit returns to the list
  - sticky-header actions report save/error/delete feedback inside the sticky header
  - file-section actions report feedback inside the file fieldset

## Design Reference

Use the current vanilla Tapes, Electrode Batches, and Batteries pages as the source of truth.

Core pattern:

- The list row summary is the primary way to open/view/edit a record.
- The explicit pencil edit button is removed where practical.
- List-level actions are kept only for natural list actions:
  - Print report
  - Duplicate, only where duplication is genuinely useful
- Delete is moved inside the opened form/record view.
- Opened records get a sticky record header/banner.
- The sticky header contains the record label, concise metadata, dirty flag, and primary form actions.
- Save keeps the opened record visible; Exit returns to the list/default view.
- The page autoscrolls to the top when a record opens.
- Print reports follow the style and information-density approach used by tape/electrode/battery reports.

## Shared UI Rules

- Do not add Duplicate to sticky headers unless a page already uses that pattern. Current reference is Tapes: duplicate is list-level only.
- Use Russian labels throughout.
- Keep delete as a deliberate inside-form action.
- Avoid nested-card styling; use the existing restrained BADB form/list style.
- Add cache-busting query strings when changing page JS references.
- Preserve existing behavior first; then improve the layout.
- Avoid broad rewrites unless a shared helper clearly reduces risk and repetition.

## Save/Error Feedback Placement

Feedback should appear near the action that caused it.

- Record-level save/error messages from sticky-header buttons should appear inside the sticky record header, near the Save/Exit/Delete actions.
- Delete blocker instructions should also appear inside the sticky record header and remain visible long enough to read.
- Section-level save messages should stay near the section button inside the corresponding fieldset.
- Page-level messages when no record is open should appear toward the top of the page, visually related to the page/header area.
- Do not use a fixed bottom-right toast pattern for now. It would introduce a second feedback language while the sticky header and section messages already cover the app's needs.

## Shared Vanilla UI Helper

As the remaining vanilla pages are upgraded, introduce a small shared UI helper, likely:

- `public/js/badb-ui.js`

This helper should own repeated presentation mechanics that are now stable across Tapes, Electrode Batches, and Batteries. It should make future page upgrades easier and make later style changes cheaper.

Good helper responsibilities:

- Create/render the sticky record header shell:
  - record title
  - compact metadata
  - global dirty/saved marker slot
  - action button area
  - action feedback/status slot
- Create consistent icon/action buttons:
  - print
  - duplicate where allowed
  - delete where appropriate
  - hover/title text
  - disabled state
- Create clickable list-row summary behavior while keeping separate list-level action buttons.
- Render shared notice/status messages with consistent timing and style.
- Render the visual dirty/saved flag state.

Keep these responsibilities page-local:

- Save behavior
- Delete/disassembly safety rules
- Dirty-state calculation
- Page-specific form state
- Tape/electrode/battery workflow rules
- Backend dependency checks

Boundary rule: shared rendering is good; shared workflow rules are not the goal here.

Migration approach:

- Use the helper first on the next upgraded page or closely related pair, most likely Electrolytes and Separators.
- Do not stop the rollout for a standalone refactor of Tapes, Electrode Batches, and Batteries.
- After the helper proves itself on Electrolytes and Separators, migrate the already-upgraded workflow pages to it one at a time:
  - Batteries
  - Electrode Batches
  - Tapes
- Re-run the normal checks after each workflow-page migration.
- Keep the helper boring and small. If a helper function needs many page-specific exceptions, leave that behavior local.

## Shared Sticky Header Pattern

Each upgraded form should have a sticky record header with:

- Left side:
  - Record label, e.g. `Электролит #12 | EC:DMC 1M LiPF6`
  - Global dirty marker `Не сохранено` if any meaningful form section is dirty
  - Compact metadata line
- Right side:
  - Save
  - Print, when the record exists and a print report exists
  - Exit
  - Delete, visually quiet-danger

Do not put Duplicate in the sticky header for electrolytes, separators, recipes, or projects unless we later explicitly decide to change the Tapes pattern too.

## Print Report Pattern

New print pages should match:

- `public/workflow/tape-print.html`
- `public/workflow/electrode-batch-print.html`
- `public/workflow/battery-print.html`

Expected report qualities:

- High data-to-ink ratio
- Compact sections
- Clear record title and metadata
- No app chrome
- `window.print()` button
- Similar typography, spacing, borders, and section hierarchy
- Auth/token compatibility like the existing print pages

## Delete Pattern

For pages that already have delete:

- Move delete from list row into opened form sticky header or form action area.
- Prefer preflight blocker messages before typed confirmation when dependencies exist.
- Use typed confirmation for destructive deletes:
  - `DELETE ELECTROLYTE <id>`
  - `DELETE SEPARATOR <id>`
  - `DELETE RECIPE <id>`
  - `DELETE PROJECT <id>`
  - `DELETE USER <id>`
  - `DELETE DEPARTMENT <id>`
- Never cascade-delete valuable upstream scientific data.
- If backend routes currently use simple delete, review dependencies before changing UI copy to imply safety guarantees.

## Page Rollout Order

Do not include Materials in this sequence yet.

### Pass 1: Electrolytes

Rationale: This is the page that triggered the request and is a close match to Separators.

Changes:

- Make each electrolyte row summary clickable/openable.
- Remove row pencil edit button.
- Keep Duplicate as a list-level action only.
- Add list-level Print button.
- Move Delete into the opened form/sticky header.
- Add sticky record header with:
  - Save
  - Print
  - Exit
  - Delete
- Add autoscroll-to-top when opening a record.
- Add electrolyte print report page.
- Add print endpoint/data loader if needed.
- Keep duplicate behavior as draft creation, not immediate DB write, if this is how the page currently behaves.

Print report should likely include:

- Electrolyte name
- Composition/formulation fields
- Solvent/salt/additive information
- Concentration and units
- Notes/comments
- Created by / updated by / dates, if available
- Files/attachments if the page supports them

### Pass 2: Separators

Rationale: Similar old pattern to Electrolytes and needs the same print/report/list/header upgrade.

Changes:

- Make separator row summary clickable/openable.
- Remove row pencil edit button.
- Keep Duplicate as a list-level action only.
- Add list-level Print button.
- Move Delete into the opened form/sticky header.
- Add sticky record header with Save / Print / Exit / Delete.
- Add autoscroll-to-top when opening a record.
- Add separator print report page.

Print report should likely include:

- Separator name/type
- Structure/material/composition fields
- Thickness/porosity/size fields if present
- Supplier/manufacturer/source information
- Notes/comments
- Files/attachments if present
- Created by / updated by / dates, if available

### Pass 3: Recipes

Rationale: More complex because recipes have lines/components, but they are important scientific records and need print.

Recipe print reports are required. A recipe is a scientific work product, not just an app configuration record, so it should be printable/exportable in the same spirit as tape, electrode batch, and battery reports.

Changes:

- Make recipe row summary clickable/openable.
- Remove row pencil edit button.
- Keep Duplicate as a list-level action only.
- Add list-level Print button.
- Move Delete into opened form/sticky header.
- Add sticky record header with Save / Print / Exit / Delete.
- Add autoscroll-to-top when opening a record.
- Add recipe print report page.
- Keep line-level delete controls inside recipe editor where they belong.

Print report should include:

- Recipe name
- Electrode role/type
- Author/owner/project metadata if available
- Recipe lines in a compact table
- Component roles
- Target fractions/percentages/masses
- Notes/comments
- Created by / updated by / dates, if available

### Pass 4: Projects

Rationale: Projects are operational rather than scientific-material records, but they still should match the row-opening and sticky-header architecture.

Changes:

- Make project row summary clickable/openable.
- Remove row pencil edit button.
- Decide whether Duplicate remains list-level; likely yes if currently useful.
- Add list-level Print button only if a project report is valuable.
- Move Delete inside opened form/sticky header.
- Add sticky record header with Save / Print if report exists / Exit / Delete.
- Add autoscroll-to-top when opening a project.
- Review project access table interactions before changing delete behavior.

Print report, if added, should include:

- Project name
- Status/description
- Lead
- Department/user access summary
- Notes and dates

### Pass 5: Users

Rationale: User page is intentionally minimalist and should mostly stay that way, but the row opening/delete placement should be consistent.

Changes:

- Make user row summary clickable/openable.
- Remove pencil edit button.
- Move Delete inside opened user form.
- Add sticky header only if it feels useful after the row-opening change. Avoid making Users visually heavy.
- Add autoscroll-to-top when opening a user.
- Use typed confirmation for deleting users if delete remains available.

Probably no print report for Users.

### Pass 6: Departments

Rationale: Departments currently have inline edit rows and no delete. They are small records, but still should use row-click behavior and a safe delete.

Changes:

- Make department row open the editor instead of relying on pencil.
- Remove pencil button if row-click feels clear.
- Add Delete Department.
- Use typed confirmation: `DELETE DEPARTMENT <id>`.
- Add dependency checks before delete if users/projects reference the department.
- Autoscroll-to-top may be less important because the page is short, but keep the habit consistent if a form/header is introduced.

Probably no print report for Departments.

## Combining Work

Good combined passes:

- Electrolytes + Separators planning and shared print style.
- Shared CSS for sticky headers/list buttons.
- Shared print report CSS copied/adapted from existing print pages.
- Shared row-open button classes.
- Small shared vanilla UI helper for repeated presentation mechanics.

Avoid combining too much implementation:

- Do not implement Electrolytes, Separators, Recipes, Projects, Users, and Departments in one code pass.
- Do one page or one closely related pair at a time.
- Run contract/smoke checks after each pass.

## Suggested Implementation Sequence

1. Add the small shared vanilla UI helper for repeated presentation mechanics.
2. Electrolytes UI/list/header only, using the helper where it fits cleanly.
3. Electrolytes print report.
4. Separators UI/list/header only, using the helper where it fits cleanly.
5. Separators print report.
6. Migrate Batteries to the helper if the helper stayed simple.
7. Migrate Electrode Batches to the helper if Batteries migration is clean.
8. Migrate Tapes to the helper if the prior workflow-page migrations are clean.
9. Recipes UI/list/header.
10. Recipes print report.
11. Projects UI/list/header and decide whether project print is useful.
12. Users row-click/delete-inside cleanup.
13. Departments row-click/delete support.
14. Final consistency sweep.

## Verification Checklist For Each Page

- [ ] Opening a row opens the correct record.
- [ ] Opening a row scrolls to the top.
- [ ] Pencil edit button is gone where intended.
- [ ] List-level Print opens the correct print report.
- [ ] List-level Duplicate exists only where intended.
- [ ] Sticky header appears only when a record/form is open.
- [ ] Sticky header label is clear and Russian.
- [ ] Sticky header buttons do not overlap the auth badge.
- [ ] Shared helper owns only presentation behavior, not page workflow rules.
- [ ] Dirty flag appears when form data changes.
- [ ] Save clears relevant dirty state.
- [ ] Exit warns on unsaved changes.
- [ ] Delete is inside the form, not exposed as a row trashcan.
- [ ] Delete blocker messages appear before typed confirmation where applicable.
- [ ] Print page has no app chrome.
- [ ] Print page visually matches tape/electrode/battery report style.
- [ ] Mobile width does not overlap text/buttons.
- [ ] `node --check` passes for changed JS files.
- [ ] `git diff --check` passes.
- [ ] `npm run contract:vanilla` passes.
- [ ] `npm run smoke:vanilla` passes after meaningful route/API changes.

## Open Decisions

- Whether Projects need a print report or only UI consistency.
- Whether Users need a sticky header or just row-click plus inside-form delete.
- How much backend delete preflight is needed for each reference table.
- Whether Department delete should be blocked when users/projects still reference the department.
