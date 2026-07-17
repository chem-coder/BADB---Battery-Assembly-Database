# BADB — Battery Assembly Database

LIMS/ELN-lite for battery assembly R&D lab. Two developers: Dima (infrastructure, Excel/VBA, frontend, architecture) and Dalia (Node.js CRUD, PostgreSQL, Web UI).

**Main repo: `chem-coder/1_BADB---Battery-Assembly-Database` (Dalia's) — this is where all work lands.**
Dima contributes via feature branches → Pull Requests into Dalia's main.

## Stack

- **Server:** Node.js + Express 5 (modular), PostgreSQL 16 (`badb_app_v1`, 66 public tables)
- **Client (VBA):** dormant legacy Excel VBA material in `client/` (DatabaseUI.xlam context, not the current v1 operating surface)
- **Client (Web):** current vanilla v1 UI in `public/`; Vue 3 + PrimeVue 4 + Vite in `client-web/` for assigned parity/SPA work
- **Contracts:** JSON Schema draft-07 (contracts/)

## Repo structure

```
BADB-Battery-Assembly-Database/
├── app.js              — Express app entry point
├── server.js           — HTTP server start
├── config/index.js     — all tunable parameters (port, DB, JWT, bcrypt, rate limits, roles)
├── db/pool.js          — PostgreSQL Pool
├── middleware/
│   ├── auth.js         — JWT Bearer token verification + role checking
│   ├── validate.js     — ajv JSON Schema validation
│   └── errorHandler.js — centralized error handling
├── routes/
│   ├── index.js        — route registration
│   ├── auth.js         — /api/auth: login, register, me
│   ├── submit.js       — /api/submit: append-only raw_submissions
│   └── (modular route files; current contract check sees 211 Express routes)
├── migrations/         — forward-only SQL migrations
├── public/             — vanilla v1 static web UI (current source for implemented web workflows)
├── contracts/          — JSON Schema contracts (versioned)
│   └── schemas/        — versioned schemas (v1)
├── client/             — Excel VBA client
│   └── src/            — .bas/.cls/.frm modules
└── client-web/         — Vue 3 frontend; tracks vanilla parity where assigned
    └── src/
        ├── components/
        │   ├── AppHeader.vue      — top header bar
        │   ├── AppSidebar.vue     — sidebar nav (from navigation.js)
        │   ├── PageHeader.vue     — sticky page header (glass-card, #actions slot)
        │   ├── StatusBadge.vue    — status badge component
        │   ├── CrudTable.vue      — ★ universal CRUD table (from Design System)
        │   └── SaveIndicator.vue  — ★ save/unsave indicator for PageHeader
        ├── config/
        │   └── navigation.js      — ★ single source of truth (sidebar, router, pages)
        └── pages/                 — one page per route
```

## Key commands

| task    | command                                          |
|---------|--------------------------------------------------|
| dev     | `npm run dev` (server :3003 + Vite :5173)        |
| server  | `node server.js` (port 3003)                     |
| test    | `npm test`                                      |
| contract | `npm run contract:vanilla`                    |
| smoke   | `npm run smoke:vanilla`                        |

### Dev server lifecycle (MANDATORY)

**Before starting `npm run dev`, ALWAYS kill existing processes first:**

```bash
lsof -ti:3003 2>/dev/null | xargs kill -9 2>/dev/null
lsof -ti:5173 2>/dev/null | xargs kill -9 2>/dev/null
```

**Why:** `npm run dev` spawns 4+ child processes (npm, concurrently, nodemon, vite, node server.js). If you restart without killing first, old processes stay alive. Each leaked restart wastes ~200MB RAM. After 3-4 restarts the system becomes unresponsive.

**Rule:** Never run `npm run dev` without killing ports 3003 + 5173 first. No exceptions.

## Dev environment — ports and networking

- **BADB server:** port **3003** (`config/index.js` → `PORT || 3003`)
- **Vite dev server:** port **5173**
- **Port 3000** — was Dalia's old standalone server. After integration, only port 3003 is used.
- **Vue browser URL (production, the front door):** http://localhost:3003 —
  the root serves the built Vue SPA (run `npm run build:web` first); Express
  serves `public-vue/` with an SPA history fallback for extensionless
  non-`/api` paths. **Lab machines use this**, not :5173: the dev server is
  unminified/per-module (feels slow) and funnels all users' API traffic
  through the Vite proxy into ONE shared rate-limit bucket (429 «Слишком
  много запросов» glitches). Rebuild after pulling client-web changes.
- **Vanilla browser URL:** http://localhost:3003/index.html (alias:
  /vanilla). Vanilla's internal links all target /index.html explicitly, so
  it is fully self-contained behind the Vue root.
- **Vue browser URL (dev/HMR):** http://localhost:5173 — development only.

### How API requests flow (CRITICAL)

Vanilla v1 pages in `public/` are served by Express on `localhost:3003` and call
same-origin `/api/*`.

Vue dev pages are served by Vite on `localhost:5173` and must use the proxy:

```
Browser (5173) → /api/* (relative) → Vite proxy → localhost:3003 → PostgreSQL
```

Axios `baseURL` MUST be empty string `''` in dev. Direct cross-origin requests
(5173 → 3003) are blocked by CORS. Always route through Vite proxy.

### Frontend networking invariants (NEVER violate)

1. `VITE_API_URL` in `.env.development` MUST be empty — never set to `http://localhost:XXXX`
2. `api.js` baseURL MUST be `import.meta.env.VITE_API_URL || ''` — never hardcode a port
3. All new API endpoints MUST be added to Vite proxy in `vite.config.js`, not as absolute URLs
4. After ANY change to `.env.*` files — restart `npm run dev` (browser refresh is NOT enough)
5. Before writing any URL in frontend code — grep `client-web/` for hardcoded ports:
   `grep -r "localhost:[0-9]" client-web/src/`

## Invariants (NEVER violate)

1. raw_submissions is append-only — never UPDATE or DELETE
2. auth_log is append-only — never UPDATE or DELETE
3. Contracts are versioned — new version = new file, never edit v1
4. Migrations are forward-only — no DROP TABLE, no destructive ALTERs. `schema_migrations` is the authoritative applied-migration ledger; flat migration logs are human checkpoints.
5. `public/` is the current vanilla v1 web UI source. Modify it intentionally for vanilla UI/report workflow tasks and verify changed JS with `node --check`.
6. `docs/current/`, `docs/rules/`, and `docs/instructions/` are maintained future-agent sources. Update relevant docs when behavior, workflows, setup, or source-of-truth assumptions change.
7. Do NOT edit `Документация ЕСПД/` unless the task explicitly asks for ESPD/formal documentation updates.
8. LAN-only system — no external API calls
9. Optimistic locking — WHERE version = $expected, 409 on mismatch

## Tape export (context menu)

Right-click any tape row → export full tape data (all process steps) in Excel/CSV/JSON.
- Multi-select: Shift+Click / Ctrl+Click in table + constructor checkboxes (🔧 column) — union is exported
- 🔧 header click: toggle select all visible (respects column filters) / deselect all
- Composable: `client-web/src/composables/useExportTapes.js` — fetches full data via `GET /api/tapes/:id` + 7 step endpoints
- CrudTable emit: `@export({ format, items })` — parent handles data collection
- CrudTable prop: `export-badge` — external count shown in menu labels

## Frontend source-of-truth rules

Vanilla v1 in `public/` is the reference for implemented web workflows. Use
`docs/instructions/vanilla_ui_patterns.md` for shared vanilla behavior and
`docs/instructions/frontend_parity_handoff.md` when Vue must match vanilla.

### Vue component architecture

`client-web/` contains reusable Vue components such as `CrudTable.vue`,
`PageHeader.vue`, `SaveIndicator.vue`, and feature-specific editors. They are
available building blocks, not blanket behavior rules.

For Vue parity surfaces, do not assume generic `CrudTable` behavior is correct.
If vanilla uses row-open editing, page-specific filters, sticky opened-record
headers, typed delete confirmation, or no list-level delete, Vue must match that
behavior even when an older Vue component pattern differs.

Use `client-web/src/config/navigation.js` for Vue sidebar/router labels and
routes. Keep labels aligned with vanilla where the route mirrors a vanilla
surface.

## Remotes

- **origin: `git@github.com:chem-coder/1_BADB---Battery-Assembly-Database.git` (Dalia) — main repo**
- Dima's personal repo: `git@github.com:i-user-ml/BADB-Battery-Assembly-Database.git` (integration prep only)

## Workflow

- **Both developers work in Dalia's repo** (`chem-coder/1_BADB`)
- Dima creates feature branches → opens PR → Dalia reviews and merges
- Branch naming: `dima/<feature-name>` (e.g. `dima/integrate-auth-frontend`)
- NEVER force push to main
- NEVER commit directly to main — always use a branch + PR

## Security

- **Authentication:** JWT Bearer tokens, 8h expiry, configurable in config/index.js
- **Roles:** admin, lead, employee
- **Brute-force protection:** 10 failed attempts → 1 hour lockout
- **Audit log:** every login (success/fail), registration → auth_log (append-only)
- **Password hashing:** bcrypt, 10 rounds

## Pre-commit gate (MANDATORY)

**Before EVERY `git add` and `git commit`, run this checklist. ANY violation = STOP, do not commit.**

### ALLOWED in repo (whitelist)

| Path | Contents | Rule |
|------|----------|------|
| `*.js` (root) | Server entry points | app.js, server.js only |
| `config/` | Server config | Source only |
| `db/` | Database pool | Source only |
| `middleware/` | Express middleware | Source only |
| `routes/` | Express route handlers | Source only |
| `migrations/` | SQL migrations | Forward-only. Never edit existing files |
| `public/` | Vanilla v1 UI | Current implemented web workflow source. Modify only for assigned vanilla UI/report work; never commit generated output |
| `contracts/` | JSON Schema .json | Versioned. Never edit v1 files |
| `client/src/` | VBA .bas, .cls, .frm | Source only |
| `client-web/src/` | Vue 3 source | Source only. Never `node_modules/`, `dist/` |
| `docs/current/` | Current domain docs | Markdown only. Keep in sync with verified behavior |
| `docs/rules/` | Approved rules | Markdown only. Update only for approved rule changes |
| `docs/instructions/` | Agent instructions | Markdown only. Keep workflow handoffs current |
| `docs/future/` | Future-facing notes | Markdown only. Not a source of truth for current behavior |
| `docs/archive/` | Inbox/archive docs | Markdown only after conversion; not source of truth |
| `docs/*.md` | Docs indexes | Markdown only. Keep navigation/status accurate |
| `.gitignore` | Git ignore rules | OK to update |
| `CLAUDE.md` | AI instructions | OK to update |
| `README.md` | Project readme | OK to update |
| `package.json` | Dependencies | OK to update |

### FORBIDDEN in repo (blacklist) — NEVER commit these

| Path / Pattern | Reason |
|----------------|--------|
| `obsidian_badb/`, `badb-vault-master/` | Personal Obsidian vault — local only |
| `local/` | Local-only drafts/workspace |
| `node_modules/` | Dependencies — install from package.json |
| `.env`, `.env.*` | Secrets — NEVER in git |
| `*.log` | Logs — ephemeral |
| `dist/`, `build/` (output) | Build artifacts |
| `~$*.xl*`, `*.tmp` | Office temp files |
| `.DS_Store`, `Thumbs.db` | OS metadata |
| `.claude/` | Claude Code local state |

### Explicit-assignment paths

| Path / Pattern | Rule |
|----------------|------|
| `Документация ЕСПД/` | Formal ESPD mirror. Do not edit for routine app, parity, or agent-doc work; touch only when the task explicitly asks for ESPD/formal documentation updates |

### Pre-commit check script

```bash
FORBIDDEN=$(git diff --cached --name-only 2>/dev/null | grep -E \
  "obsidian_badb/|badb-vault-master/|local/|node_modules/|\.env|\.log$|dist/|build/|~\\$|\.tmp$|\.DS_Store|Thumbs\.db|\.claude/")

if [ -n "$FORBIDDEN" ]; then
  echo "BLOCKED: forbidden files in commit:"
  echo "$FORBIDDEN"
  exit 1
fi

if git diff --cached --name-only | grep -qE "contracts/.*\.v1\.json$"; then
  if git diff --cached -- 'contracts/*.v1.json' | grep -q "^[+-]"; then
    echo "BLOCKED: v1 contracts must not be edited — create v2 instead"
    exit 1
  fi
fi

MODIFIED_MIGRATIONS=$(git diff --cached --name-only --diff-filter=M -- migrations/)
if [ -n "$MODIFIED_MIGRATIONS" ]; then
  echo "BLOCKED: existing migrations must not be edited:"
  echo "$MODIFIED_MIGRATIONS"
  exit 1
fi

echo "Pre-commit check: PASSED"
```

### Mandatory actions BEFORE pushing

1. Run pre-commit check script (above)
2. `git diff --cached --stat` — review what goes in
3. Confirm NO forbidden paths in output
4. Confirm any `public/` changes are intentional vanilla workflow changes and have been checked
5. Confirm no secrets (.env, passwords, tokens) in diff
6. `node -e "require('./app')"` — syntax check passes

## Code audit procedure

When running a code audit (bug search), follow this two-phase process.

### Phase 1 — Discovery (optional agents)

Use parallel agents only when the active environment and user request explicitly allow delegated/subagent work. When delegation is not explicitly allowed, do the discovery locally by reading/searching the codebase. Broad agent scans can be useful for bug candidates by category (security, data integrity, frontend state, error handling, etc.), but they are optional, not mandatory.

**Agent output = hypotheses, not facts.** Agents match patterns (e.g. "CRUD route without rowCount check") but frequently do not read surrounding code carefully enough to confirm the issue is real.

### Phase 2 — Verification (manual, MANDATORY)

Every candidate from Phase 1 MUST be verified before it goes into a report, a fix, or a commit:

| Check | How |
|-------|-----|
| "File X has no Y" | Open file, read the relevant function — does it actually lack Y? |
| "SQL injection in Z" | Grep for string interpolation in the actual query — are values parameterized? |
| "Missing validation" | Read the handler — is validation present but in a different form? |
| "Hardcoded value" | Grep for the literal — does it actually exist in the file? |

**Rules:**
1. **No unverified bugs in reports or commits.** If you can't confirm it by reading the code, drop it.
2. **Read the actual code, not a summary.** Agent descriptions of what a file "probably does" are unreliable.
3. **Check for false patterns.** A file named `users.js` does not necessarily handle passwords. A CRUD route may already have the check the agent claims is missing.
4. **Verify fixes too.** After applying a fix, re-read the changed code to confirm it's correct and doesn't break existing logic.

### Common false positive patterns

These were observed in practice (April 2026 audit) and should be watched for:

- **"No password hashing"** — agent assumed a users endpoint handles passwords when it only handles names
- **"SQL injection"** — agent flagged template literals but all values were parameterized (`$1, $2`)
- **"Missing 404 check"** — agent didn't read far enough to see the existing `rowCount === 0` check
- **"Hardcoded URL/port"** — agent assumed a common anti-pattern without grepping the actual files
- **"No input validation"** — agent missed validation done in a different style (e.g. `Number.isInteger()` instead of `if (!field)`)

### Audit output format

After verification, split findings into:
- **Confirmed bugs in our code** → fix directly in the current branch
- **Confirmed bugs in Dalia's code** → document in a report file, but only after verification
- **Unconfirmed / stylistic** → drop silently
