# Repo Map

Created: 2026-05-06
Edited: 2026-05-06
Status: current
Verified against code: light check 2026-05-06
Source paths: current `BADB_main` directory listing

This is a concise map of the active `BADB_main` repository. It replaces older workspace maps that mentioned stale outer folders and old parallel app copies.

## Active App Folders

- `app.js`: Express app composition.
- `server.js`: HTTP server startup and production safety checks.
- `config/`: app configuration from environment variables.
- `db/` and `db.js`: PostgreSQL pool entry points.
- `routes/`: Express route families.
- `services/`: domain services used by routes.
- `middleware/`: auth, validation, error handling, traceability, IP allowlist.
- `utils/`: shared backend utilities.
- `contracts/`: vanilla API contract and workflow schemas.
- `migrations/`: main SQL migrations.
- `migrations_ASCII/`: ASCII-safe migration mirror for Windows/encoding-sensitive use.
- `public/`: vanilla static frontend.
- `client-web/`: Vue frontend.
- `client/`: Excel/VBA client material, if still supported.
- `__tests__/`: backend/service/unit tests.
- `scripts/`: backup, smoke, contract, parser, and launchd helpers.
- `sql_scripts/`: SQL reset/debug/inspection helpers.
- `windows_scripts/`: Windows operational scripts.
- `uploads/`: runtime uploaded files.
- `sql_backups/`: local database backups and local-only dump material.
- `docs/`: working documentation system.
- `Документация ЕСПД/`: formal Russian documentation mirror.

## Frontend Entry Points

Vanilla:

- `public/index.html`
- `public/workflow/*.html`
- `public/reference/*.html`
- `public/js/*.js`

Vue:

- `client-web/src/main.js`
- `client-web/src/router/index.js`
- `client-web/src/pages/`
- `client-web/src/components/`
- `client-web/src/services/api.js`

## Operational Notes

Use `BADB_main/` for app work.

Treat `docs/archive/`, `sql_backups/`, and archived source notes as historical or operational support, not current source of truth.

Do not use old workspace maps as current evidence unless they have been rechecked against the current tree.
