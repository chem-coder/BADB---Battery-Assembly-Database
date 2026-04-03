# BADB — Battery Assembly Database

LIMS/ELN-lite for battery assembly R&D lab. Two developers: Dima (infrastructure, Excel/VBA, frontend, architecture) and Dalia (Node.js CRUD, PostgreSQL, Web UI).

**Main repo: `chem-coder/1_BADB---Battery-Assembly-Database` (Dalia's) — this is where all work lands.**
Dima contributes via feature branches → Pull Requests into Dalia's main.

## Stack

- **Server:** Node.js + Express 5 (modular), PostgreSQL 16 (badb_app_v1, 42 tables — Dalia's production DB)
- **Client (VBA):** Excel VBA (DatabaseUI.xlam)
- **Client (Web):** Vue 3 + PrimeVue 4 + Vite (planned)
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
│   └── (14+ CRUD route files, 72 endpoints)
├── migrations/         — forward-only SQL migrations
├── public/             — Dalia's static HTML (DO NOT MODIFY)
├── contracts/          — JSON Schema contracts (versioned)
│   └── schemas/        — versioned schemas (v1)
├── client/             — Excel VBA client
│   └── src/            — .bas/.cls/.frm modules
└── client-web/         — Vue 3 frontend
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
| test    | VBA: cmdSelfTest.RunAll()                        |

## Dev environment — ports and networking

- **BADB server:** port **3003** (`config/index.js` → `PORT || 3003`)
- **Vite dev server:** port **5173**
- **Port 3000** — was Dalia's old standalone server. After integration, only port 3003 is used.
- **Browser URL:** http://localhost:5173

### How API requests flow (CRITICAL)

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
4. Migrations are forward-only — no DROP TABLE, no destructive ALTERs
5. Do NOT modify public/ — Dalia's HTML files
6. LAN-only system — no external API calls
7. Optimistic locking — WHERE version = $expected, 409 on mismatch

## Frontend component architecture

All CRUD pages follow the **constructor pattern** — reusable components from Design System, pages only define data + custom cells.

### CrudTable.vue (universal table component)
Extracted 1-to-1 from DesignSystemPage Section 9. Includes ALL features:
- Sticky toolbar (name editing, CSV export, rows-per-page, column count)
- Excel-like column filters (overlay with search, checkboxes, apply/reset)
- Row selection (click, Shift+range, Ctrl+toggle) with visual highlight
- Custom context menu (glass-card, "Удалить" with multi-select count)
- Auto-fit column width on resizer double-click
- Pagination with filter reset

**Usage in a page:**
```vue
<CrudTable :columns="columns" :data="items" id-field="item_id"
  table-name="Название" show-add @add="..." @delete="..." @row-click="...">
  <template #col-fieldName="{ data }">custom render</template>
</CrudTable>
```

### SaveIndicator.vue (save/unsave indicator)
Goes into PageHeader `#actions` slot. Two states: unsaved (ochre) / saved (green with checkmark animation, fades after 2s).

```vue
<PageHeader title="..." icon="...">
  <template #actions>
    <SaveIndicator :visible="..." :saved="..." @save="..." @cancel="..." />
  </template>
</PageHeader>
```

### Adding a new CRUD page
1. Define `columns` array (field, header, width, sortable, filterable)
2. Load data from API
3. Use `<CrudTable>` + `<SaveIndicator>` — zero table CSS needed
4. Add custom `#col-{field}` slots only for non-standard cells (badges, dates, etc.)

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
| `public/` | Dalia's HTML | READ-ONLY. Never modify, never delete |
| `contracts/` | JSON Schema .json | Versioned. Never edit v1 files |
| `client/src/` | VBA .bas, .cls, .frm | Source only |
| `client-web/src/` | Vue 3 source | Source only. Never `node_modules/`, `dist/` |
| `.gitignore` | Git ignore rules | OK to update |
| `CLAUDE.md` | AI instructions | OK to update |
| `README.md` | Project readme | OK to update |
| `package.json` | Dependencies | OK to update |

### FORBIDDEN in repo (blacklist) — NEVER commit these

| Path / Pattern | Reason |
|----------------|--------|
| `obsidian_badb/`, `badb-vault-master/` | Personal Obsidian vault — local only |
| `docs/`, `local/` | Course documents, drafts — local only |
| `node_modules/` | Dependencies — install from package.json |
| `.env`, `.env.*` | Secrets — NEVER in git |
| `*.log` | Logs — ephemeral |
| `dist/`, `build/` (output) | Build artifacts |
| `~$*.xl*`, `*.tmp` | Office temp files |
| `.DS_Store`, `Thumbs.db` | OS metadata |
| `.claude/` | Claude Code local state |

### Pre-commit check script

```bash
FORBIDDEN=$(git diff --cached --name-only 2>/dev/null | grep -E \
  "obsidian_badb/|badb-vault-master/|docs/|local/|node_modules/|\.env|\.log$|dist/|build/|~\\$|\.tmp$|\.DS_Store|Thumbs\.db|\.claude/")

if [ -n "$FORBIDDEN" ]; then
  echo "BLOCKED: forbidden files in commit:"
  echo "$FORBIDDEN"
  exit 1
fi

if git diff --cached --name-only | grep -q "^public/"; then
  echo "BLOCKED: public/ must not be modified (Dalia's code)"
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
4. Confirm public/ untouched
5. Confirm no secrets (.env, passwords, tokens) in diff
6. `node -e "require('./app')"` — syntax check passes

## Code audit procedure

When running a code audit (bug search), follow this two-phase process.

### Phase 1 — Discovery (agents)

Launch parallel agents to scan for bug candidates by category (security, data integrity, frontend state, error handling, etc.). Agents are good at broad coverage — they can quickly flag suspicious patterns across many files.

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
