# BADB Database — Plain-Language Schema Guide

Created: 2026-07-15
Status: current (verified against live `badb_app_v1`, PostgreSQL 16, 66 tables)

This is the human map of the database: what the main tables are for, how the
lab's physical items connect to projects, how access control works, and an
honest list of the leftover/unused tables. It is written to be read, not to be
exhaustive — the authoritative structure is always the live DB (`psql \d`) plus
`migrations/`.

For the migration ledger and how to apply migrations, see
`migrations/README.md` and `docs/instructions/apply_migrations.md`.

---

## 1. The big picture

The lab builds batteries in stages, and the database mirrors that flow:

```
   materials  →  tapes  →  electrode cut batches  →  electrodes  →  batteries  →  cycling tests
   (recipes)     (лента)   (партия электродов)      (электрод)    (аккумулятор)  (циклирование)
```

Everything a chemist actually *makes* (tapes, electrode batches, batteries)
belongs to one or more **projects**. Everything that is *reference data*
(materials, recipes, separators, electrolytes, departments, users) is shared and
NOT tied to a project.

---

## 2. Table groups (what each family is for)

### Reference / catalog (shared, not project-scoped)
- **materials**, **material_instances**, **material_instance_components** — the
  material catalog and the composition ("recipe") links between instances.
  `material_instance_components` is the parent→component table with mass
  fractions that must sum to 1 per parent (enforced in code).
  `materials.family` (since d047) is an optional free-text grouping label
  for pickers (NMC / LFP / NCA / Graphite / …).
- **tape_recipes** — reusable slurry formulations for tapes (since d047).
  A recipe's lines (`tape_recipe_lines`) carry percentages and the supporting
  materials (additives, binders, solvent), while the active line
  (`recipe_role` = `cathode_active`/`anode_active`) is an **open slot**:
  its `material_id` is NULL — enforced by the CHECK
  `tape_recipe_lines_active_slot_material_check`
  (`active line <=> material_id IS NULL`). The concrete chemistry is chosen
  per tape via `tapes.active_material_id` (FK → materials, ON DELETE
  RESTRICT). Recipe names are composition-derived
  ("96 x : 2.2 Super P : 1.8 PVDF", "x" = the active slot) but editable.
  The solution concentration (e.g. 5% vs 7% PVDF in NMP) is NOT part of the
  recipe — it's a `material_instance` picked when recording actuals
  (`tape_recipe_line_actuals`); for the active-slot line the instance must
  belong to the tape's `active_material_id` (enforced in code).
- **electrolytes**, **separators**, **separator_structure** — component catalogs.
- **reference lookups** — `coating_methods`, `wet_mixing_methods`,
  `dry_mixing_methods`, `drying_atmospheres`, foils, etc.
- **users**, **departments** — people and org units.

### Project-scoped lab items (the data R1 access control protects)
- **tapes** — coated electrode tape ("лента"). Carries the tape's chemistry
  in `active_material_id` (since d047); the recipe only provides the
  formulation.
- **electrode_cut_batches** — a batch of electrodes cut from a tape ("партия"),
  plus **electrodes** (individual pieces) and **electrode_drying**,
  **foil_mass_measurements** underneath them.
- **batteries** — assembled cells ("аккумулятор"), plus a large family of
  per-battery config tables (`battery_coin_config`, `battery_pouch_config`,
  `battery_cyl_config`, `battery_electrode_sources`, `battery_sep_config`,
  `battery_electrolyte`, `battery_qc`, `battery_electrochem`, …).
- **cycling_sessions** — uploaded cycling test runs for a battery, with
  **cycling_datapoints** and **cycling_cycle_summary** underneath.

### Projects & access
- **projects** — the project record (name, dates, status, lead, creator,
  `confidentiality_level`).
- **user_project_access** — per-user access grants (see §4).
- **project_participants** — team membership (who is "on" a project).

### Audit / system (append-only, bare `id` PKs by convention)
- **activity_log**, **auth_log**, **field_changelog**, **raw_submissions** —
  never updated or deleted.
- **schema_migrations** — the applied-migration ledger.

---

## 3. How lab items connect to projects (the junction model)

An item can belong to **several** projects, so the links are many-to-many
through dedicated junction tables:

| Item | Junction table | Columns |
|------|----------------|---------|
| Tape | `tape_projects` | `tape_id`, `project_id` |
| Electrode cut batch | `electrode_cut_batch_projects` | `cut_batch_id`, `project_id` |
| Battery | `battery_projects` | `battery_id`, `project_id` |

Items further down inherit their project through their parent:
- an **electrode** → its cut batch → `electrode_cut_batch_projects`
- a **cycling session** → its battery → `battery_projects`

**The junction tables are the single source of truth.** Always resolve
"which projects does this item belong to?" through them (see
`services/projectAccessService.js` and `services/batteryProjectService.js`).

### The legacy `project_id` columns (why they still exist)
`tapes.project_id` and `batteries.project_id` are older **single**-project
columns from before the many-to-many model. They are kept because:
- the vanilla UI and some list queries still read them, and
- `createTape`/`createBattery` still write them (as `project_ids[0]`) inside the
  same transaction that fills the junction, so the two stay in sync.

They are **denormalized duplicates** of the junction, with no database-level
guarantee they match. New code must read the junction, never these columns.
(There is no migration to drop them — migrations are forward-only, and the
vanilla UI still depends on them. A future cleanup can retire them once vanilla
is gone.)

---

## 4. Access control (who can see / change a project's data)

Two separate capabilities:

- **The project record** (title, dates, members, access settings) — only the
  owner / lead / admin can change it. Enforced in `routes/projects.js`.
- **The lab data** (the project's tapes, batteries, cycling, …) — governed by a
  **4-level model** and enforced on every data route (R1, 2026-07):

  | Level | Meaning | Can view? | Can change? |
  |-------|---------|-----------|-------------|
  | `admin` | full control of the project + data | yes | yes |
  | `edit` (Обычный) | CRUD the data (default for a new member) | yes | yes |
  | `view` (Просмотр) | read-only | yes | no |
  | `none` (Нет доступа) | explicit deny — beats even a public project | no | no |

  Plus: **expired** grant → auto-downgrades to the project's baseline (open
  project → view, restricted → nothing); **deactivated user** → nothing;
  **admin role** and **director** (position contains «директор») and the
  project **lead/creator** always override to full access.

  An item in several projects is accessible if you can access **any one** of
  them. An item linked to **no** project is viewable by everyone but changeable
  only by admin/director (fail-safe).

The tables involved:
- `user_project_access` — `(user_id, project_id)` → `access_level` + optional
  `expires_at`.
- `project_participants` — team membership. Membership is tracked separately;
  a member's actual capability comes from their grant (default `edit`).
- `projects.confidentiality_level` — `public` (открытый) or `confidential`
  (ограниченный). Legacy `department` counts as confidential.

The one resolver, mirrored on client and server, is `resolveProjectAccess`
(`client-web/src/utils/projectAccess.js` and `services/projectAccessService.js`
— kept 1:1 so the UI and the API always agree).

### Departments no longer grant access
`projects.department_id` and `project_department_access` are **legacy**. The
access model moved off department-based visibility; these are never consulted by
the access checks (`routes/access.js` even says so in a comment). They remain in
the schema for backward compatibility and should be treated as deprecated.

---

## 5. Uploaded files

Small reference attachments (material/separator/electrolyte/feedback files) live
**in** the database as `BYTEA` and download through authenticated API routes.

Large raw instrument files (battery electrochemistry, cycling raw files) live on
**disk** under `uploads/`, with the DB storing metadata + a path. As of R1
(2026-07) these are **private**: the old public `/uploads` static mount is gone,
and files download only through authenticated routes (e.g.
`GET /api/batteries/battery_electrochem/:id/download`, guarded by project view
access). See `docs/future/upload_storage_transition.md`.

---

## 6. Honest list of leftover / unused tables

These exist in the schema but are effectively dead or stubs. They are **kept**
(migrations are forward-only — we never DROP), just documented so nobody mistakes
them for live features:

| Table(s) | Status |
|----------|--------|
| `modules`, `module_qc`, `module_batteries` | A 4th "modules" workflow stage that was never built. `module_batteries` is only read as a delete-guard; nothing can populate these. `app.js` still redirects `/workflow/4-modules.html` → `/modules` (a route that doesn't exist). |
| `active_materials` | Real structure (UNIQUE + FK), zero rows, zero code references. |
| `electrode_status` | 3 rows, FK'd from `electrodes.status_code`, but never queried — status labels are hardcoded as `1/2/3` in code instead. |

If these are ever cleaned up, it must be a deliberate, forward-only migration
with sign-off — not part of routine work.

---

## 7. Known schema notes & conventions

- **Primary keys**: `<entity>_id` everywhere, except the four append-only audit
  tables (`activity_log`, `auth_log`, `field_changelog`, `raw_submissions`)
  which use a bare `id`.
- **Timestamps**: most tables have `created_at` / `updated_at` (+ `_by` actor
  columns); `tapes`/`batteries`/`electrode_cut_batches` also auto-touch
  `updated_at` via a trigger. `d046` (2026-07) added the missing
  `cycling_sessions.updated_at/by` and `materials.created_at/by` for parity.
- **Indexes**: `d046` also added indexes on the FK/join columns that lacked them
  (`electrode_cut_batches.tape_id`, `user_project_access.project_id`,
  `tapes.project_id`, `batteries.project_id`).
- **Optimistic locking** (CLAUDE.md invariant #9) is **not currently
  implemented** — migration `003` added `version` columns but they are not
  present in the live schema and no route checks them. Treat the invariant as
  aspirational until it is actually built. (Low risk today: few concurrent
  writers.)
