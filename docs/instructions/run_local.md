# Run BADB Locally

Created: 2026-05-06
Edited: 2026-05-06
Status: instruction
Verified against code: 2026-05-06
Source paths: `package.json`, `server.js`, `app.js`, `config/index.js`, `db/pool.js`, `middleware/auth.js`, `client-web/package.json`, `client-web/vite.config.js`

This is the canonical local startup note for `BADB_main`.

## Prerequisites

- PostgreSQL must be running.
- The target database must exist and be migrated.
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

## Development Auth Bypass

For local development only:

```bash
AUTH_BYPASS=true BYPASS_LOGIN=dkmaraulayte npm run dev
```

Backend only:

```bash
AUTH_BYPASS=true BYPASS_LOGIN=dkmaraulayte npm start
```

`AUTH_BYPASS=true` makes `middleware/auth.js` attach a real user from the database by login, then fall back to the first admin, then any user, then a temporary hardcoded development user if the DB is not ready.

Production startup refuses to run if `AUTH_BYPASS=true`.

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

Production must not set:

```bash
AUTH_BYPASS=true
```

## Windows Notes

Use PostgreSQL 16 and current Node.js LTS compatible with the checked-in dependencies. Do not edit `config/index.js` just to change the database user; use environment variables instead.

PowerShell example:

```powershell
cd C:\path\to\BADB_main
$env:DB_USER = "postgres"
$env:DB_NAME = "badb_app_v1"
$env:AUTH_BYPASS = "true"
$env:BYPASS_LOGIN = "dkmaraulayte"
npm run dev
```

`cmd.exe` example:

```bat
cd C:\path\to\BADB_main
set DB_USER=postgres
set DB_NAME=badb_app_v1
set AUTH_BYPASS=true
set BYPASS_LOGIN=dkmaraulayte
npm run dev
```

The old instruction to change the default DB user in `config/index.js` is superseded by environment overrides.
