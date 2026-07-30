# Run BADB Locally

Created: 2026-05-06
Edited: 2026-07-17
Status: instruction
Verified against code: 2026-05-25
Source paths: `package.json`, `server.js`, `app.js`, `config/index.js`, `db/pool.js`, `middleware/auth.js`, `client-web/package.json`, `client-web/vite.config.js`, `migrations/README.md`

This is the canonical local startup note for `BADB_main`.

## Prerequisites

- PostgreSQL must be running.
- The target database must exist and be migrated through the current required
  migrations: Dima's stream through `020_cycling_active_mass.sql` and Dalia's
  stream through `d040_add_coated_thickness_fields.sql`.
- `public.schema_migrations` is the authoritative ledger for applied migration
  state. Current local `badb_app_v1` reports `dima = 21` and `dalia = 28`
  after `d040` is applied.
  The flat `migrations_log.txt` files are checkpoint notes only.
- For pilot use, the Windows/lab database must have the current ledger counts
  and `d031_harden_battery_stack_validate_trigger.sql` applied and verified.
- Node dependencies must be installed in `BADB_main/`.
- Vue dependencies must also be installed in `BADB_main/client-web/` when using the Vue dev server.

Install dependencies when needed:

```bash
cd /Users/Dalia/Developer/RENERA/BADB_main
npm install
cd client-web
npm install
```

## Backend And Vanilla App

From `BADB_main`:

```bash
npm start
```

Equivalent direct command:

```bash
node server.js
```

Default local URL:

```text
http://localhost:3003
```

The Express app serves:

- vanilla static frontend from `public/`;
- API routes under `/api`;
- uploaded files under `/uploads`;
- vanilla workflow pages such as `/workflow/1-tapes.html`;
- vanilla reference pages such as `/reference/materials.html`.

## Backend And Vue Dev Server

From `BADB_main`:

```bash
npm run dev
```

This starts the backend with `nodemon` and the Vue dev server with Vite.

Default local URLs:

```text
http://localhost:3003
http://localhost:5173
```

The Vue dev server proxies `/api`, `/workflow`, `/css`, `/js`, and `/uploads` to the backend on port `3003`.

Do not run `npm start` in one terminal and `npm run dev` in another unless you also change ports. `npm run dev` already starts the backend on `3003`, so running both normally creates a port conflict.

### 2026-07-17 change: backend port pinned in dev scripts (Windows note)

The `dev` script in `package.json` starts the backend as
`PORT=3003 nodemon server.js` instead of plain `nodemon server.js`.

Why: Claude Code's browser preview injects `PORT=5173` (the Vite port) into
the environment of whatever it launches. Without the pin, Express read that
variable, bound Vite's port instead of `3003`, and every `/api` call failed
with 502. Pinning `PORT=3003` is harmless everywhere else because `3003` is
already the default in `config/index.js`.

**Windows/lab install:** the `VAR=value` prefix is POSIX shell syntax and does
not work in cmd.exe or PowerShell — so `npm run dev` will fail on Windows as
written. This does not affect the lab machine's normal path, which is the
production build served by Express:

```powershell
npm run build:web
npm start
```

`npm start` (`node server.js`) has no env prefix and is unchanged. If you ever
do need the Vite dev server on Windows, run the two halves in separate
terminals (`node server.js` and `npm run dev --prefix client-web`) or use
Git Bash/WSL.

## Authentication in Development

There is no auth bypass. The former `AUTH_BYPASS`/`BYPASS_LOGIN` mechanism
(and the `dev:bypass` npm script) was removed on 2026-07-29: it stamped every
request with the configured bypass user regardless of who was actually logged
in, which corrupted `created_by`/`updated_by` attribution. Development uses
the same flow as production — start the app, open the login screen, sign in
with your own account. The smoke harness (`npm run smoke:vanilla`) signs its
own JWT against the throwaway database instead.

## Useful Environment Overrides

The app reads configuration from environment variables in `config/index.js`.

Common overrides:

```bash
PORT=3004 npm start
DB_NAME=badb_app_v1_smoke npm start
DB_USER=postgres npm start
BIND_HOST=127.0.0.1 npm start
ALLOWED_IPS=127.0.0.1,192.168.1.20 npm start
```

Production must set:

```bash
JWT_SECRET=<real-secret>
```

## Windows Notes

Use PostgreSQL 16 and current Node.js LTS compatible with the checked-in dependencies. Do not edit `config/index.js` just to change the database user; use environment variables instead.

PowerShell example:

```powershell
cd C:\path\to\BADB_main
$env:DB_USER = "postgres"
$env:DB_NAME = "badb_app_v1"
npm run dev
```

`cmd.exe` example:

```bat
cd C:\path\to\BADB_main
set DB_USER=postgres
set DB_NAME=badb_app_v1
npm run dev
```

The old instruction to change the default DB user in `config/index.js` is superseded by environment overrides.

Before Windows/lab pilot use, apply the current catch-up set through `d040` and
verify both the migration ledger and the required `d031` trigger hardening on
the lab database. Commands run from `BADB_main`, not the outer `RENERA`
workspace.

```powershell
cd C:\path\to\BADB_main
$env:DB_USER = "postgres"
$env:DB_NAME = "badb_app_v1"
# Then follow docs/instructions/windows_migration_catchup.md.
```

Use `docs/instructions/windows_migration_catchup.md` for the full ordered
catch-up set. Then run the ledger and trigger verification queries documented in
`docs/instructions/apply_migrations.md` against the same Windows/lab database
and record the results.

Current release-check commands from the repo checkout:

```powershell
npm run contract:vanilla
npm run smoke:vanilla
```

The smoke command uses a throwaway `badb_app_v1_smoke...` database. It is not a
substitute for direct `schema_migrations` and `d031` proof on the Windows/lab
database.
