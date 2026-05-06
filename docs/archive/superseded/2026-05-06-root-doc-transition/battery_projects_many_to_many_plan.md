# Battery Projects Many-To-Many Implementation Note

Updated: 2026-05-06

Status: implemented for the vanilla battery workflow. The original plan is
kept here because it explains the design, but the current code already includes
`d030_battery_projects_many_to_many.sql`, `batteryProjectService.js`, API
contract updates, and smoke coverage.

Scope: vanilla battery workflow under `public/workflow/3-batteries.html`,
`public/js/3-batteries.js`, related Express routes, services, and migrations.

## Goal

Move battery project assignment from an early manual guess to a project choice
derived from the selected electrode sources.

The battery record should be created only after the required identity fields are
known: form factor/config, electrode source batches, and one or more valid
battery projects.

## Current Behavior

- `batteries.project_id` is `NOT NULL`.
- The vanilla battery page derives allowed battery projects from selected
  electrode source batches.
- Battery creation saves identity/config/source/project data in one flow.
- Tape and electrode batch project relationships are now many-to-many.
- Batteries have compatibility `project_id` plus many-to-many
  `battery_projects`.
- Some battery sections become locked after being saved/completed, which makes
  later editing harder than the physical workflow requires.

## Desired Workflow

### Phase 1: Battery Identity

The user fills the fields needed to create the battery record:

- creator, derived from auth and shown in the disabled `Создал` field;
- form factor;
- form-factor identity/config fields needed before source selection;
- cathode/anode source tape and electrode batch, according to cell type;
- battery project or projects, chosen from the allowed projects derived from
  selected electrode batches;
- optional battery notes.

Only after these fields are complete can the user click `Создать аккумулятор`.

### Phase 2: Assembly And Testing Details

After the battery exists, the user can save and edit:

- electrode stack selection;
- separator;
- electrolyte;
- assembly details;
- QC;
- electrochem/files;
- status.

These sections should remain editable during the battery lifetime unless a
specific future rule says otherwise. For this feature, avoid adding new hard
locks. If editing protection is needed later, prefer explicit `Редактировать`
buttons over permanent automatic locking.

## Project Rules

- A battery may belong to one or more projects.
- At least one battery project is required.
- Valid battery projects come from the selected electrode batches.
- Full cell rule: allowed projects are the intersection of cathode batch
  projects and anode batch projects.
- Half cell rule: allowed projects are the projects of the selected real
  electrode batch.
- The user may select the same or fewer projects from the allowed set.
- The user may not select unrelated projects.
- Backend validation must enforce the same rules as the UI.

## Schema

Implemented migration:

- `migrations/d030_battery_projects_many_to_many.sql`
- `migrations_ASCII/d030_battery_projects_many_to_many.sql`

Add table:

```sql
CREATE TABLE battery_projects (
  battery_id integer NOT NULL REFERENCES batteries(battery_id),
  project_id integer NOT NULL REFERENCES projects(project_id),
  created_by integer REFERENCES users(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (battery_id, project_id)
);
```

Important:

- Do not use `ON DELETE CASCADE`.
- Backfill from existing `batteries.project_id`.
- Keep `batteries.project_id NOT NULL` for compatibility.
- Keep `batteries.project_id` as the first selected/primary display project.
- Do not drop or nullable-convert `batteries.project_id` in this step.

## Backend

Implemented battery project service:

- `services/batteryProjectService.js`

Responsibilities:

- normalize `project_ids`;
- read batch project IDs for selected cut batches;
- derive allowed battery projects;
- validate selected battery project IDs against allowed projects;
- save `battery_projects` rows explicitly;
- enrich battery rows with `project_ids` and `projects` arrays.

Update battery creation so it runs in one transaction:

1. Validate form factor/config inputs.
2. Validate electrode source inputs.
3. Derive allowed projects from selected electrode batches.
4. Validate selected `project_ids`.
5. Insert `batteries` with `project_id = project_ids[0]`.
6. Insert form-factor config.
7. Insert electrode source rows.
8. Insert `battery_projects`.
9. Return the full battery object.

Update battery edit/save behavior:

- Existing battery project changes update `battery_projects`.
- `batteries.project_id` stays synced to the first selected project.
- Backend rejects invalid or empty `project_ids`.
- Backend rejects project IDs not tied to the selected battery source batches.

## UI

### Layout

Move project selection out of the very top of the page.

Recommended layout:

1. General battery fields: creator, form factor, notes.
2. Form-factor config needed for electrode source rules.
3. Electrode source selection: cathode/anode tape and cut batch.
4. Battery project multi-select, auto-derived from selected electrode batches.
5. Create/save battery button.
6. Workspace for Phase 2 details.

### Filtering

Project filtering should be separate from saved battery project assignment.

Possible labels:

- `Фильтр по проекту партии`
- `Проекты аккумулятора`

Filtering behavior:

- Optional filter helps find tapes/batches.
- Filter is not itself saved as the battery project.
- Once a batch is selected, the opposite batch selector should prefer or limit
  options with overlapping projects.

### Project Multi-Select

- Hidden/disabled until the required electrode batch selection is sufficient.
- Auto-select all allowed shared projects when sources are chosen.
- User may deselect down to one project.
- User may not deselect all projects.
- If there is no shared project for a full cell, show a clear blocking message
  and prevent save.

Suggested Russian messages:

- `Выбранные партии электродов не имеют общего проекта.`
- `Выберите хотя бы один проект аккумулятора.`
- `Проекты аккумулятора ограничены проектами выбранных партий электродов.`

## Locking And Editing

For this feature:

- Do not add new hard locks.
- Remove or relax locks only where they directly block the new two-phase
  workflow.
- Keep dirty flags and save buttons.
- Do not implement full `Редактировать раздел` buttons yet unless needed to
  unblock normal editing.

Future improvement:

- Add explicit edit buttons for sensitive sections if users need protection
  against accidental edits.

## API Contract Impact

Expected payload changes:

- battery create accepts `project_ids`;
- battery update accepts `project_ids`;
- battery list/detail returns `project_ids` and `projects`;
- compatibility `project_id` and `project_name` remain present.

Update:

- `contracts/vanilla_api_endpoints.json`
- `scripts/smoke_vanilla_api.js`

## Implementation State

Implemented:

- migration `d030` and ASCII mirror;
- `batteryProjectService`;
- battery catalog reads with project arrays;
- create/update backend paths with project validation;
- vanilla project multi-select derived from electrode source batches;
- contract and smoke coverage.

## Testing Checklist

- Existing batteries still load.
- Existing battery list still shows a project name.
- Existing battery detail still opens.
- Creating a full-cell battery requires overlapping cathode/anode batch
  projects.
- Creating a full-cell battery is blocked when selected batches have no shared
  project.
- Creating a half-cell battery uses the selected real electrode batch projects.
- Battery project multi-select allows one or more allowed projects.
- Battery project multi-select does not allow zero projects.
- Backend rejects unrelated `project_ids` even if the UI is bypassed.
- `batteries.project_id` is set to the first selected project.
- `battery_projects` contains every selected project.
- Phase 2 sections remain editable after battery creation.
- `npm run contract:vanilla` passes.
- `npm run smoke:vanilla` passes.

## Non-Goals For This Step

- Do not redesign Dima's frontend battery flow.
- Do not remove `batteries.project_id`.
- Do not make `batteries.project_id` nullable.
- Do not add project visibility/permission complexity.
- Do not add undo/activity-log behavior for this feature.
- Do not redesign delete/scrap battery behavior in this feature branch.

## Open Decisions Before Coding

- Exact visual placement of `Проекты аккумулятора`.
- Whether the optional filter should limit both tape selectors or only batch
  selectors.
- Whether full-cell opposite batch selector should hide non-overlapping batches
  or show them disabled.
- Whether Phase 2 locking should be relaxed in this branch or handled in a
  separate cleanup branch after project behavior works.
