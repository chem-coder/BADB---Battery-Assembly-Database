# Project Map

High-level map of the `/Users/Dalia/Developer/RENERA` workspace and the purpose of each major folder.

## Root

- `.obsidian/`
  - Obsidian vault configuration for notes in this workspace.
  - Stores editor settings, plugins, themes, and vault UI state.

- `BADB_main/`
  - Main working BADB application.
  - Node/Express backend + static HTML UI + Vue client + SQL helpers/backups.
  - This is the primary app tree to work in.

- `archive/`
  - Older or parked project material.
  - Holds previous BADB copies, SQL archives, and notes that are not the active working app.

- `badb_dima/`
  - Dima’s BADB variant / parallel app copy.
  - Separate codebase snapshot with its own backend/frontend structure and SQL dump.

- `demo_baseline_data/`
  - Reference/demo content for seeding or rebuilding baseline records.
  - Includes materials, electrolytes, separator data, QC notes, and a recipes PDF.

- `PROJECT_MAP.md`
  - This file.

## `BADB_main/`

- `.git/`
  - Git metadata for the main app repository.

- `.vscode/`
  - Workspace/editor settings for VS Code.

- `app.js`
  - Express app composition / server wiring entry point.

- `server.js`
  - HTTP server launcher for the backend.

- `db.js`
  - PostgreSQL connection setup for the main app database.

- `package.json`
  - Node package manifest for the backend and repo-level scripts.

- `README.md`
  - Main project documentation.

- `CLAUDE.md`
  - Project-specific AI/dev workflow notes.

- `client/`
  - Excel/VBA client side of the BADB system.
  - `client/src/` contains VBA source modules.
  - `client/archive/` appears to hold older VBA/client material.

- `client-web/`
  - Vue-based web frontend.
  - `client-web/src/` contains Vue app source.
  - `client-web/public/` contains public assets for the Vue frontend.
  - `client-web/.vscode/` contains editor settings for the frontend.

- `config/`
  - Backend configuration files.

- `contracts/`
  - JSON contracts / schema definitions used by the system.
  - `contracts/schemas/` contains schema files.

- `db/`
  - Database helpers/adapters beyond the root `db.js`.

- `middleware/`
  - Express middleware such as auth, validation, and shared request handling.

- `migrations/`
  - SQL migrations for schema evolution.

- `public/`
  - Static web app / classic HTML frontend.
  - `public/css/` stylesheets.
  - `public/js/` browser-side page scripts.
  - `public/reference/` reference-data pages.
  - `public/workflow/` workflow/data-entry pages.

- `routes/`
  - Express route handlers grouped by domain.

- `sql_backups/`
  - Stored SQL backup snapshots for the main app database.

- `sql_scripts/`
  - Utility SQL scripts for reset/debug/inspection tasks.
  - Includes the reset scripts created for layered cleanup.
  - `sql_scripts/reset_scripts/` appears intended for additional reset-script organization.

- `uploads/`
  - Uploaded runtime files stored by the app.
  - `uploads/electrochem/` contains electrochem-related uploads.

## `badb_dima/`

- Parallel BADB codebase associated with Dima’s version.
- Similar overall layout to `BADB_main`, but treated as a separate branch/variant.
- Contains its own:
  - `.git/`
  - `.vscode/`
  - `app.js`, `server.js`, `db.js`, `package.json`
  - `client/`
  - `client-web/`
  - `config/`
  - `contracts/`
  - `db/`
  - `middleware/`
  - `migrations/`
  - `public/`
  - `routes/`
  - `sql_scripts/`
- Also contains:
  - `260324-badb_dima_dump.sql`
    - Snapshot SQL dump associated with Dima’s app/database state.
  - `node_modules/`
    - Installed dependencies currently present inside this copy.

## `archive/`

- `archive/badb_SQL/`
  - Older SQL dumps and recovery snapshots.

- `archive/badb_pure/`
  - Archived earlier BADB “pure” app copy.

- `archive/merging/`
  - Archived merge-attempt copy used during earlier reconciliation work.

- `archive/notes and plans/`
  - Archived planning notes and related material.
  - `archive/notes and plans/graveyard/` likely stores discarded/old note content.

## `demo_baseline_data/`

- `materials_data.txt`
  - Baseline materials reference content.

- `materials_data-RU.txt`
  - Russian-language materials reference content.

- `electrolyte_data.txt`
  - Baseline electrolyte data.

- `separator_data.txt`
  - Baseline separator data.

- `qc.txt`
  - QC reference/demo notes.

- `recipes.pdf`
  - Recipe reference document.

## Working Notes

- If you are making app changes, prefer `BADB_main/`.
- Treat `badb_dima/` as a parallel/reference implementation unless intentionally working on Dima’s version.
- Treat `archive/` as historical/recovery material, not the main working area.
- Treat `demo_baseline_data/` as seed/reference content, not application code.
