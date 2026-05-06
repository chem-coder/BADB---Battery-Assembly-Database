# Project Links

Created: 2026-05-06
Edited: 2026-05-06
Status: current
Verified against code: light check 2026-05-06
Source paths: `migrations/d028_tape_projects_many_to_many.sql`, `migrations/d029_electrode_cut_batch_projects_many_to_many.sql`, `migrations/d030_battery_projects_many_to_many.sql`, `services/tapeProjectService.js`, `services/electrodeBatchProjectService.js`, `services/batteryProjectService.js`, `services/batteryCatalogService.js`, `services/electrodeCutBatchService.js`, `public/js/3-batteries.js`, `scripts/smoke_vanilla_api.js`

Project membership is many-to-many for tapes, electrode cut batches, and batteries.

## Current Tables

- `tape_projects` links one tape to one or more projects.
- `electrode_cut_batch_projects` links one electrode cut batch to one or more projects.
- `battery_projects` links one battery to one or more projects.

The old `project_id` columns still exist on tapes and batteries as compatibility fields and fallback values. Electrode cut batches do not have their own legacy `project_id` column; their fallback project comes from the source tape when needed. Do not treat compatibility/fallback values as the full project relationship when a many-to-many table exists.

## API Shape

Current create/update flows accept `project_ids` where many-to-many project membership is supported. Compatibility payloads with a single `project_id` are still normalized by the backend.

Responses should include:

- `project_ids`: the canonical list of linked project ids;
- `projects`: project objects when the caller needs names;
- `project_id`: compatibility/fallback value for older UI code.

## Workflow Rules

Tape project links come from the tape payload and are written through `tapeProjectService`.

Electrode cut batch project links come from explicit payload project ids when supplied; otherwise they are derived from the source tape projects. The backend validates project ids before writing them.

Battery project links are selected during battery identity/source creation. The vanilla Batteries page limits available battery projects to projects allowed by the selected electrode source batches. For full cells, the valid set is the intersection of the selected cathode and anode source projects.

## Migration Coverage

Post-dump smoke setup must apply:

- `d028_tape_projects_many_to_many.sql`
- `d029_electrode_cut_batch_projects_many_to_many.sql`
- `d030_battery_projects_many_to_many.sql`

`npm run smoke:vanilla` exercises the compatibility and many-to-many behavior for vanilla workflow paths.
