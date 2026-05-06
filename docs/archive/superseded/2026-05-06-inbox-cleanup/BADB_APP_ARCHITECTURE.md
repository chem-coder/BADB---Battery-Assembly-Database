# Architecture

High-level architecture overview for the BADB project in `/Users/Dalia/Developer/RENERA`, focused on the active app in `BADB_main/`.

## Overview

BADB is a laboratory data application built around a PostgreSQL database and a Node/Express backend. It currently has two frontend styles that talk to the same API layer:

- a classic static HTML + vanilla JS frontend in `BADB_main/public/`
- a newer Vue frontend in `BADB_main/client-web/`

Both frontends use the backend as the single write/read gateway to PostgreSQL. The database is the source of truth for workflow records and reference data.

## Main Layers

## 1. Database Layer

- Technology: PostgreSQL
- Connection entry:
  - [`BADB_main/db.js`](/Users/Dalia/Developer/RENERA/BADB_main/db.js)
  - [`BADB_main/db/pool.js`](/Users/Dalia/Developer/RENERA/BADB_main/db/pool.js)
- Configuration source:
  - [`BADB_main/config/index.js`](/Users/Dalia/Developer/RENERA/BADB_main/config/index.js)

Purpose:

- stores all workflow data:
  - tapes
  - electrodes
  - batteries
  - projects
  - users
- stores reference/lookup data:
  - materials
  - recipes
  - electrolytes
  - separators
  - foils
  - operation types
  - statuses/method dictionaries

Important characteristics:

- the schema is relational and heavily foreign-keyed
- many workflow tables form a dependency chain:
  - `projects -> tapes -> electrode_cut_batches/electrodes -> batteries`
  - `materials -> material_instances -> tape_recipe_lines/tape_recipe_line_actuals`
- SQL utility scripts in `BADB_main/sql_scripts/` are used for:
  - resets
  - debugging
  - inspection
- database snapshots live in `BADB_main/sql_backups/`

## 2. Backend Layer

- Technology: Node.js + Express
- App assembly:
  - [`BADB_main/app.js`](/Users/Dalia/Developer/RENERA/BADB_main/app.js)
- HTTP server start:
  - [`BADB_main/server.js`](/Users/Dalia/Developer/RENERA/BADB_main/server.js)
- Route registration:
  - [`BADB_main/routes/index.js`](/Users/Dalia/Developer/RENERA/BADB_main/routes/index.js)

Purpose:

- exposes REST-style API endpoints under `/api/*`
- validates and transforms requests
- runs SQL queries against PostgreSQL
- returns JSON to both frontends
- serves static assets from `public/`
- serves uploaded files from `uploads/`

Core route domains:

- `/api/users`
- `/api/projects`
- `/api/materials`
- `/api/recipes`
- `/api/electrolytes`
- `/api/separators`
- `/api/structures`
- `/api/tapes`
- `/api/electrodes`
- `/api/batteries`
- `/api/reference`
- `/api/auth`
- `/api/submit`

Supporting backend folders:

- `BADB_main/routes/`
  - domain-specific request handlers
- `BADB_main/middleware/`
  - auth middleware
  - centralized error handling
  - AJV-based validation helpers
- `BADB_main/contracts/`
  - contract/schema definitions used by validation and integration logic
- `BADB_main/migrations/`
  - SQL migrations for schema evolution

## 3. Static Frontend Layer

- Location: `BADB_main/public/`

Purpose:

- provides the current working browser UI for most CRUD/workflow pages
- uses static HTML pages with page-specific JavaScript files
- calls the backend directly with `fetch('/api/...')`

Structure:

- `BADB_main/public/index.html`
  - entry menu / landing page
- `BADB_main/public/workflow/`
  - workflow pages such as tapes, electrodes, batteries, modules
- `BADB_main/public/reference/`
  - reference data pages such as users, projects, materials, recipes, separators, electrolytes
- `BADB_main/public/js/`
  - per-page logic written in vanilla JS
- `BADB_main/public/css/`
  - shared styling

Interaction model:

- browser loads HTML from Express static hosting
- page JS calls API endpoints using relative `/api/...` URLs
- backend returns JSON
- page JS rerenders the page state in the DOM

## 4. Vue Frontend Layer

- Location: `BADB_main/client-web/`
- Tooling:
  - Vue 3
  - Vite
  - Pinia
  - Vue Router
  - Axios

Important files:

- entry:
  - [`BADB_main/client-web/src/main.js`](/Users/Dalia/Developer/RENERA/BADB_main/client-web/src/main.js)
- router:
  - [`BADB_main/client-web/src/router/index.js`](/Users/Dalia/Developer/RENERA/BADB_main/client-web/src/router/index.js)
- API client:
  - [`BADB_main/client-web/src/services/api.js`](/Users/Dalia/Developer/RENERA/BADB_main/client-web/src/services/api.js)
- dev proxy:
  - [`BADB_main/client-web/vite.config.js`](/Users/Dalia/Developer/RENERA/BADB_main/client-web/vite.config.js)

Purpose:

- newer application shell / SPA-style interface
- wraps the same backend endpoints used by the static frontend
- adds client-side routing, shared layout, composables, and state management

Interaction model in dev:

- browser opens Vite dev server on `http://localhost:5173`
- frontend calls relative `/api/...`
- Vite proxies those calls to Express on `http://localhost:3003`
- Express talks to PostgreSQL

So the request path is:

`Browser -> Vue app or static page -> /api -> Express -> PostgreSQL`

## 5. Upload / File Layer

- Location: `BADB_main/uploads/`

Purpose:

- stores uploaded runtime files that are not part of the codebase
- currently includes electrochem-related uploaded files in `uploads/electrochem/`

Express exposes this directory through:

- `/uploads/*`

## Data Flow

## Read flow

1. User opens either a static page or the Vue frontend.
2. Frontend code issues `fetch(...)` or `axios` requests to `/api/...`.
3. Express routes the request to the appropriate handler in `routes/`.
4. The handler queries PostgreSQL through the shared `pg` pool.
5. The backend returns JSON.
6. The frontend renders the returned data.

## Write flow

1. User edits or creates data in the UI.
2. Frontend sends POST/PUT/PATCH/DELETE to `/api/...`.
3. Express validates/parses the request.
4. Route handler writes to PostgreSQL.
5. Response returns updated data or status.
6. Frontend refreshes the affected list or page state.

## Dependency Model

The app uses layered data domains. In practice, this matters most when cleaning or reseeding the database.

Examples:

- `users` are referenced by projects, tapes, batteries, electrolytes, separators, recipes, and process steps
- `projects` are referenced by `tapes` and `batteries`
- `tape_recipes` are referenced by `tapes` and `tape_recipe_lines`
- `tapes` are referenced by cut batches, process steps, actuals, and battery provenance
- `electrode_cut_batches` are referenced by electrodes, foil masses, drying records, and battery provenance
- `electrodes` are referenced by battery stack records

This is why the SQL reset scripts are designed as layered resets instead of simple blind deletes.

## Operational Notes

- `BADB_main/` is the active codebase.
- `badb_dima/` is a separate variant/reference app, not the primary working tree.
- `archive/` contains historical recovery material and prior experiments.
- `demo_baseline_data/` holds source data for rebuilding clean baseline content.

## Architectural Summary

The architecture is fundamentally:

- PostgreSQL as the source of truth
- Express as the single API/backend integration layer
- two browser-facing clients:
  - static HTML/JS pages
  - a newer Vue SPA

This means:

- backend routes are the integration backbone
- database structure strongly shapes what can be safely deleted or reseeded
- both frontends depend on consistent API behavior more than on each other
