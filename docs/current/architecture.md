# Architecture

Created: 2026-05-06
Edited: 2026-05-06
Status: current
Verified against code: light check 2026-05-06
Source paths: `app.js`, `server.js`, `config/index.js`, `db/pool.js`, `routes/index.js`, `public/`, `client-web/`, `services/`, `migrations/`

BADB is a laboratory data application built around PostgreSQL, a Node/Express backend, and browser frontends.

## Main Layers

The main layers are:

- PostgreSQL database: source of truth for workflow records, reference data, traceability, and relational constraints.
- Express backend: single API layer under `/api/*`, static file server for the vanilla app, and upload-file server for current runtime file links.
- Vanilla frontend: static HTML and page-specific JavaScript under `public/`.
- Vue frontend: Vite/Vue SPA under `client-web/`.
- Services: backend domain workflow modules under `services/`, used to keep large route files thinner.
- Migrations: schema history under `migrations/` with an ASCII mirror under `migrations_ASCII/`.

## Backend

Startup path:

```text
server.js -> app.js -> routes/index.js
```

Database path:

```text
config/index.js -> db/pool.js -> pg Pool
```

Current API route families registered in `routes/index.js`:

- `/api/auth`
- `/api/submit`
- `/api/users`
- `/api/separators`
- `/api/structures`
- `/api/projects`
- `/api/materials`
- `/api/recipes`
- `/api/electrolytes`
- `/api/tapes`
- `/api/reference`
- `/api/batteries`
- `/api/electrodes`
- `/api/departments`
- `/api/activity`
- `/api/dashboard`
- `/api/feedback`
- `/api/cycling`
- `/api/access`

## Frontends

The vanilla app under `public/` is still the primary working app for many workflow and reference pages.

Important vanilla folders:

- `public/workflow/`
- `public/reference/`
- `public/js/`
- `public/css/`

The Vue app under `client-web/` uses Vue 3, Vite, Pinia, Vue Router, PrimeVue, and Axios. In local development, Vite proxies API and selected static routes to Express on port `3003`.

## File And Upload Layer

Runtime uploads currently live under `uploads/`, including:

- `uploads/cycling/`
- `uploads/electrochem/`

Current Express code serves `/uploads` statically. This is current behavior, but upload storage security work is tracked separately in `../future/upload_storage_transition.md`.

## Data Flow

Read flow:

```text
browser -> vanilla/Vue frontend -> /api route -> service/route SQL -> PostgreSQL -> JSON -> frontend render
```

Write flow:

```text
browser form -> POST/PUT/PATCH/DELETE -> Express route -> service validation/workflow -> PostgreSQL -> response -> frontend refresh
```

## Source Of Truth

When architecture notes disagree, use:

1. current code;
2. migrations;
3. tests, contract checks, and smoke checks;
4. docs in `docs/current/`, `docs/rules/`, and `docs/instructions/`.

Archived architecture notes are historical only.
