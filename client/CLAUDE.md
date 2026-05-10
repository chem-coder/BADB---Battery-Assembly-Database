# BADB Excel Client Notes

Status: dormant legacy / preserved historical client material.

The active BADB v1 operating surface is the vanilla web UI in `public/`.
Vue work in `client-web/` tracks vanilla parity where assigned. This `client/`
folder contains old Excel/VBA client material and should not be used as the
source of truth for current app behavior.

## Safety Rules

- Do not delete or move Excel client files as part of routine cleanup.
- Do not assume the Excel client compiles or works without verification.
- Do not treat stale routes, roles, table counts, or workbook assumptions in
  this folder as current truth.
- Current server default is `http://localhost:3003`; ignore old Excel-client
  notes that pointed at a `server` host on port `3000`.
- Current API, auth, schema, and workflow behavior must be verified against the
  main repo code and docs before reviving Excel work.

## Historical Architecture

The old intended structure was:

```text
Ribbon callbacks
  -> router module
  -> cmd* modules for user-facing commands
  -> svc* modules for HTTP/data/file logic
  -> util* modules for errors/logging
  -> AppContext.cls for session state
  -> cfgApp.bas for constants
```

Useful historical conventions:

- `cmd*` modules own user interaction.
- `svc*` modules should avoid UI.
- shared constants belonged in `cfgApp.bas`.
- JSON payloads were intended to follow `contracts/schemas/`.

## If This Client Is Revived

Before editing or using the Excel client:

1. Confirm the workbook/template files exist on the target workstation.
2. Confirm current API routes and auth requirements from `routes/` and
   `contracts/`.
3. Confirm current database/migration state from `schema_migrations` and
   `docs/instructions/apply_migrations.md`.
4. Confirm current release checks from `docs/instructions/testing_release.md`.
5. Treat all old module inventories in git history or archive notes as
   historical until checked against the actual files.
