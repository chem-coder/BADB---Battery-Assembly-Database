# MemPalace — Strategies by Project Type

Decision matrix: what to mine and how to structure wings/rooms for each project type. Companion to `README.md` in the same folder.

## Project type detection (checklist)

Read the first 3–5 files in the project root. Ask the user a clarifying question if:

- The project looks like a monorepo (multiple `package.json` / `pyproject.toml` in different subfolders)
- The root has `docs/papers/` and `notebooks/` — likely research
- `runbooks/`, `incidents/`, `k8s/` present — likely ops/SRE
- Multiple client-named folders — likely consultancy
- `.obsidian/` present — personal knowledge management

If none of these and the project has `src/`, `lib/`, `app/` — it's a regular software project.

---

## Type 1 — Software project (solo or small team)

**Signals:** single tech stack, clean `src/` structure, `README.md` present, possibly `docs/`, 1–3 developers.

**Examples:** web app, CLI tool, backend service, mobile app.

### Wings

One main wing for the project. Optionally, separate wings for major subsystems if the project is large (>10k LOC).

```
<project-name>/                     (main wing)
```

Or for large projects:

```
<project-name>-backend/
<project-name>-frontend/
<project-name>-infra/
```

### Rooms

Universal set for software:

| Room | Contents | Examples |
|------|----------|----------|
| `Architecture` | design docs, ADRs, system diagrams | framework choices, patterns, DB design |
| `Decisions` | ADRs, trade-off discussions | JWT vs sessions, PostgreSQL vs Mongo |
| `Debugging` | post-mortems, tricky bug investigations | race conditions, regression analysis |
| `Onboarding` | how to get productive on the project | setup, deploy, testing |
| `Migrations` | database/API schema changes | migration files and their rationale |
| `Domain-<X>` | domain-specific discussions | `Domain-auth`, `Domain-billing`, `Domain-ui` |
| `External-integrations` | third-party API discussions | Stripe, Twilio, third-party libs |

### What to mine

**Mandatory:**
```bash
# Claude Code session history
mempalace mine ~/.claude/projects/<project-hash>/ --mode convos

# Markdown docs
mempalace mine <project-root>/docs/ --include "*.md"
mempalace mine <project-root> --include "README.md" --include "CONTRIBUTING.md" --include "CLAUDE.md"

# ADRs (if present)
mempalace mine <project-root>/docs/adr/
```

**Optional (useful):**
```bash
# Migrations — for the comments and intent
mempalace mine <project-root>/migrations/ --include "*.sql"

# API contracts
mempalace mine <project-root>/contracts/ --include "*.json" --include "*.yaml"
```

**NEVER for a software project:**
- `src/`, `lib/`, `app/`, `client/`, `server/`
- `tests/`, `__tests__/`, `spec/`
- Any generated/bundled artifacts

### Knowledge graph entities

- **People:** developers, key stakeholders
- **Subsystems:** auth, API, DB, UI, worker
- **External deps:** libraries, SaaS
- **Decisions:** each ADR as an entity

Example relationships:
```
(Alice) --[owns]--> (Auth-service)
(PostgreSQL) --[replaced]--> (MongoDB)   valid_from: 2026-02-15
(JWT) --[used-by]--> (Auth-service)
```

---

## Type 2 — Monorepo (multiple apps)

**Signals:** `packages/`, `apps/`, `services/`, or `yarn workspaces`, `pnpm workspaces`, `lerna.json`, `nx.json`. Multiple `package.json` / `pyproject.toml` in different locations.

### Wings

One wing per app, plus optionally `shared-infra`:

```
monorepo-web-app/
monorepo-mobile-app/
monorepo-api-service/
monorepo-worker/
monorepo-shared-libs/
monorepo-infra/
```

### Rooms

Inside each wing — the universal rooms (Architecture, Decisions, etc.) from Type 1. Plus:

- `Cross-app-concerns` in the `shared-infra` wing — for decisions that affect multiple apps

### What to mine

**Separately per app:**
```bash
mempalace mine <monorepo>/packages/web/docs/ --wing monorepo-web-app
mempalace mine <monorepo>/packages/api/docs/ --wing monorepo-api-service
# ...
```

(`--wing` flag is hypothetical, verify with `mempalace mine --help`)

**Plus shared:**
```bash
mempalace mine <monorepo>/README.md
mempalace mine <monorepo>/docs/ --include "*.md"
```

### Notes

- **Cross-reference via KG:** if Alice works on both web-app and api-service, the KG shows this via relationships — no need to duplicate drawers.
- **Session history is one per monorepo** (Claude Code tracks by root folder). Mine into a `<monorepo>-shared` wing, then filter search by room or entity.

---

## Type 3 — Research / academic writing

**Signals:** `papers/`, `drafts/`, `chapters/`, `references/`, BibTeX files, Jupyter notebooks for data analysis.

### Wings

Per major research theme or per document:

```
PhD-thesis/
paper-<short-name>/          (one per paper)
lit-review-<topic>/          (for reviews)
```

### Rooms

| Room | Contents |
|------|----------|
| `Literature-notes` | paper annotations, quotes |
| `Drafts` | section drafts |
| `Arguments` | logical chains, counterarguments |
| `Data-analysis` | experimental result discussions |
| `Reviewer-responses` | responses to reviewers |
| `Meetings` | with advisor, co-authors |

### What to mine

```bash
# All markdown drafts and notes
mempalace mine <project>/drafts/ --include "*.md"
mempalace mine <project>/notes/ --include "*.md"

# LLM conversations (argument discussions, editing)
mempalace mine ~/.claude/projects/<research-hash>/ --mode convos

# Meeting notes (if in markdown)
mempalace mine <project>/meetings/ --include "*.md"
```

**Do NOT mine:**
- PDF source papers (binary, need separate OCR)
- `.tex` files — rarely useful, meaning lives in prose not markup
- BibTeX — metadata for KG, not for semantic search
- Notebook outputs (graphs/tables as images)

### Knowledge graph

Research is an ideal KG use-case:

```
(paper-X) --[cites]--> (paper-Y)
(concept-A) --[contradicts]--> (concept-B)
(experiment-1) --[supports]--> (hypothesis-H)
(reviewer-R) --[raised-issue]--> (section-3)
```

---

## Type 4 — Operations / SRE / DevOps

**Signals:** `runbooks/`, `incidents/`, `k8s/`, `terraform/`, `ansible/`, `ci/`, on-call rotation.

### Wings

```
infra-production/
infra-staging/
service-<name>/              (one per service)
incidents/                   (post-mortem archive)
```

### Rooms

| Room | Contents |
|------|----------|
| `Runbooks` | step-by-step procedures |
| `Post-mortems` | incident reports |
| `Capacity-planning` | scaling discussions |
| `On-call-handoffs` | shift handovers |
| `Known-issues` | workarounds, temporary fixes |
| `Architecture` | system design |

### What to mine

```bash
# Runbooks
mempalace mine <project>/runbooks/ --include "*.md"

# Post-mortems
mempalace mine <project>/incidents/ --include "*.md"

# Design docs
mempalace mine <project>/docs/ --include "*.md"

# Conversations (often on-call discussions via Claude)
mempalace mine ~/.claude/projects/<ops-hash>/ --mode convos
```

**NEVER:**
- `logs/`, `metrics/` — time-series data, not for semantic search
- `.tf`, `.yaml` configs — generated / mutated frequently, useless
- `secrets/` — critical to exclude
- Prometheus/Grafana dumps

### Knowledge graph

For ops, this is critical:

```
(service-A) --[depends-on]--> (database-B)
(incident-2026-03-15) --[affected]--> (service-A)
(runbook-R1) --[resolves]--> (incident-type-timeout)
(Alice) --[on-call-week]--> (2026-W14)
```

Temporal validity matters more here than anywhere: "who was on-call when Service-X went down last Tuesday".

---

## Type 5 — Client consultancy

**Signals:** client-named folders, engagement-based structure, NDA considerations.

### Wings

One wing per client:

```
client-acme/
client-contoso/
internal-templates/
```

### Rooms

| Room | Contents |
|------|----------|
| `Meetings` | meeting notes |
| `Deliverables` | drafts and final documents |
| `Scope-and-contract` | scope discussions |
| `Invoices` | (metadata, not PDFs) |
| `Decisions` | what, how, and why |
| `Risks` | identified risks |

### What to mine

```bash
# Meeting notes
mempalace mine <project>/clients/acme/meetings/ --include "*.md"

# Deliverables (markdown only)
mempalace mine <project>/clients/acme/deliverables/ --include "*.md"

# Conversations
mempalace mine ~/.claude/projects/<client-hash>/ --mode convos
```

**NEVER for consultancy:**
- Client codebase (NDA, scope)
- PDFs with client data (PII, compliance)
- Email exports without explicit consent (legal)
- Files with personal data (GDPR)

### Compliance warnings

For consultancy, critical:
1. **Before mining** discuss with the client that local AI memory will store discussions.
2. **Per-client encryption** if possible (separate palace per client, separately encrypted).
3. **Retention policies** — delete old engagements after N years.
4. **NDA redaction** — replace confidential names/figures before mining.

---

## Type 6 — Personal Knowledge Management (Obsidian-like)

**Signals:** `.obsidian/` config, lots of markdown, personal daily notes, attachments in `assets/`.

### Wings

By life area or by major interest theme:

```
personal-journal/
reading-notes/
work-projects/
health-fitness/
finance/
learning-<topic>/
```

### Rooms

Each wing has its own logic. For reading-notes:

```
Books/
Papers/
Articles/
Quotes/
```

For journal:

```
Daily/
Weekly-review/
Decisions/
Lessons-learned/
```

### What to mine

```bash
# Obsidian vault — markdown only
mempalace mine ~/obsidian-vault/ --include "*.md" --exclude ".obsidian/**"

# Exclude attachments
# (MemPalace should not pick up .png/.jpg by default)
```

**Do NOT mine:**
- `.obsidian/` — Obsidian config, useless
- `assets/`, `attachments/` — images, PDFs
- Template files (`templates/`) — patterns without content

### Notes

- **Obsidian sync + MemPalace local** — the vault syncs between devices via Obsidian Sync, but MemPalace is per-device local. This is fine: each device keeps its own local palace with different interaction history.
- **Tag bridging** — Obsidian tags can be lifted into the KG as entity labels for cross-reference.

---

## Mining matrix — summary

| Project type | Primary mining | Secondary | NEVER |
|--------------|----------------|-----------|-------|
| Software (solo) | conversations, docs/*.md | ADRs, migrations | src/, deps, artifacts |
| Monorepo | conversations (shared), per-app docs | root README | all src/ folders |
| Research | drafts, notes, conversations | literature summaries | PDFs, .tex, notebook outputs |
| Ops/SRE | runbooks, post-mortems | design docs | logs, configs, secrets |
| Consultancy | meeting notes, deliverables | conversations | client code, PII, NDAs |
| Personal KM | Obsidian vault (.md) | journal | attachments, config |

---

## Interactive type selection dialog

When the type is ambiguous, Claude Code should ask the user via AskUserQuestion. Example questions:

**Q1 — primary type:**

```
What type of project is this?
- Software (development)
- Research / writing (academic work, papers)
- Operations / SRE (infrastructure, on-call)
- Client work (consultancy, agency)
- Personal knowledge (notes, journal)
```

**Q2 (for software) — team size:**

```
Team size?
- Solo / small team (1–3)
- Medium (3–10)
- Large (10+)
```

**Q3 (for software) — monorepo or single app?**

```
Monorepo?
- Yes (multiple apps in one repo)
- No (single app)
```

After answers — pick the matching section from this file and follow the recipe.

---

## Final strategy verification

Regardless of project type, after setup verify:

1. **Wings match major project boundaries** (not too granular, not too broad)
2. **Rooms cover main topics**, no "misc" / "other" rooms
3. **Knowledge graph has at least 5–10 key entities** with relationships
4. **Disk usage is sensible:**
   - Software solo: < 500 MB
   - Monorepo: < 2 GB
   - Research: < 1 GB
   - Ops: < 500 MB
   - Consultancy: < 500 MB per client
   - Personal KM: < 1 GB
5. **Search works:** `mempalace search "<knownPhrase>"` returns relevant content from the correct wing

If any of these are off — rethink the strategy before considering the setup complete.
