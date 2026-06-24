# Project-Based Access Control (Entity Authorization)

Created: 2026-06-20
Edited: 2026-06-24
Status: future idea

This is the "R1" security item from the 2026-06 audit. It is the agreed next
security task **after** frontend parity is finished and the app is deployed.
Not a release promise yet; check current code before treating as a work item.

Source paths (current state):

- `routes/projects.js` — `checkViewPermission` / `checkModifyPermission` (the
  only place project access is actually enforced today).
- `routes/access.js`, `routes/users.js`, `routes/auth.js` — also reference
  `user_project_access`.
- `migrations/011_project_confidentiality.sql` — `public` / `department` /
  `confidential` model.
- `tape_projects`, `electrode_cut_batch_projects`, `battery_projects` — the
  entity↔project many-to-many links (an item can belong to several projects).

## The gap

Project confidentiality is enforced **only** on `/api/projects`. The entity
routes (tapes, electrodes, batteries, recipes, separators, electrolytes) gate
writes with `auth` only and do **not** filter reads or gate writes by project
access. So any authenticated user can read/write/delete experimental data
attached to a "confidential" project. This is a real authorization gap.

## Desired model (Dalia, 2026-06-19)

Every physical item (tape / electrode batch / battery) belongs to one or more
projects. A user who has access to a project can **view and modify (including
delete)** the physical items linked to it. A user with no access to the project
cannot see the project or its linked items. **Materials are not linked to
projects, so everyone can see materials.**

### Capability split — reconfirmed 2026-06-24

Two distinct capabilities, not one ladder:

- **THE DATA** (linked physical items): **any project member** (a
  `project_participants` row) can **CRUD**. This is the membership capability and
  is the part **not yet enforced** — entity routes gate writes by `auth`/role
  only, never by membership.
- **THE PROJECT record** (title, dates, members, access settings): **only
  owner / lead / admin** (`checkModifyPermission`). This part *is* enforced today.

This resolves the open question below on "which access level grants modify": it's
**membership** that should grant data-CRUD, not a graded view/edit/admin level.
The access graph (membership constellation, shipped 2026-06-24 — see
[Access Graph Redesign](access_graph_redesign.md)) now *visualises* this intended
model: member edges = "should CRUD the data," red manager edges = "runs the
project." The graph shows intent; this doc is the enforcement work that makes it
true.

### Model finalised 2026-06-24 (see [Project Member Flow](project_member_flow.md))

The per-member model the enforcement must implement:
- **4 levels:** `admin` (edit project) / `edit` = Обычный (CRUD data) / `view`
  (view only) / **`none`** = explicit deny that **overrides even public projects**.
- **Expiry = auto-downgrade**, not delete: expired grant → `view` (open project)
  or `none` (restricted). Membership rows are never erased (soft-disable).
- **Deactivated user (`users.active=false`) → `none` everywhere** (guard in
  `checkView`; login is already blocked at auth).
- **Conditional hard-delete** of a participant only when they created no lab
  entities on the project (`tapes`/`electrode_cut_batches`/`batteries` by
  `created_by`).

The `access_level` enum gains `none` (migration); `checkViewPermission` /
`checkModifyPermission` must honor deny + expiry-downgrade + inactive-user.

## Why it is deferred (not patched piecemeal)

This is cross-cutting and must be designed once and applied consistently across
entity **view + modify**, not bolted onto individual routes (that would create
inconsistency — e.g. electrode delete gated but electrode view open). Decision
2026-06-19: finish frontend parity + deploy first, then do this as its own
dedicated, holistic task. In the meantime electrode-delete shipped auth-only and
tape-delete shipped admin/lead — both matching current vanilla behavior.

## Open design questions (settle before building)

- **Multi-project items:** if an item belongs to several projects, does access
  to **any** one grant access, or must the user have **all**? (Likely "any".)
- **Which access level grants modify/delete** — any grant (view/edit/admin) or
  edit+? Dalia said "access to the project → can modify"; confirm whether a
  view-only grant should permit delete.
- **Admin / Director override** — the existing model lets `admin` role +
  position-contains-«директор» modify anything. Keep it.
- **Items with no project link** (if possible) — define behavior.
- **Reads / list filtering** — "can't see items outside your project" means the
  list endpoints must **filter** by project access and detail GETs must 403.
  This is the bigger, higher-risk part (and affects every entity list/detail).
- **Performance** — access checks on every list/detail call; needs a reusable
  helper + indexed joins.
- **Shared helper** — extract `checkViewPermission` / `checkModifyPermission`
  from `routes/projects.js` into a shared service/middleware and apply across
  entity routes.

## Related (separate) item

The Vue Projects page access **labels** (target `Открытый` / `Ограниченный`,
replacing the stale `для отдела` department-era labels) are a related but
separate parity fix — tracked in `PARITY.md` (repo root), not here.
