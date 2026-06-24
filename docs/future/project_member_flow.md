# Project Member-Add Flow + Access Model

Created: 2026-06-24
Edited: 2026-06-24
Status: design approved — building (Vue + minimal backend), branch `dalia/project-member-flow`
Verified against code: 2026-06-24 (`ProjectAccessPanel.vue`, `routes/projects.js`, `public/js/projects.js`, `project_participants`, `user_project_access`, live schema)
Source paths: `client-web/src/components/ProjectAccessPanel.vue`, `client-web/src/pages/reference/ProjectsPage.vue`, `client-web/src/utils/projectAccess.js`, `routes/projects.js`, `migrations/011_project_confidentiality.sql`

Design agreed with Dalia 2026-06-24 over several iterations. Reworks how project
members are added/managed in the Vue app, and finalises the per-member access
model. Motivation: the access graph needs real project/member data, the current
add-member UX is clumsy, and the lab will be hosted on a public server — so access
must be revocable and records must never be erased.

Related: [Project-Based Access Control / R1](project_access_control.md) — this spec
finalises the *model*; R1 is the route-level *enforcement*.

## Access model (4 levels + expiry as auto-downgrade)

A member's grant is **one of four levels** plus an **expiry date**:

| Dropdown (order) | Stored `access_level` | Capability |
|---|---|---|
| Администратор | `admin` | edit the project (fields, members, access) + all data |
| **Обычный** (default) | `edit` | CRUD the project's data (tapes, electrodes, batteries…) |
| Просмотр | `view` | view only |
| Нет доступа | `none` *(new)* | no access — project hidden from them |

- **Default for a newly-added member is Обычный** (`edit`).
- **`none` is an explicit deny** that **overrides even an open/public project** —
  so a departing employee can be cut off from everything, not just login.

### Expiry = auto-downgrade, never delete

When a grant's `expires_at` passes, the person is **not removed** — their
*effective* level drops to the project's baseline:

- **open** project → **Просмотр** (`view`)
- **restricted** project → **Нет доступа** (`none`)

So **revoke = expiry in the past**, **reinstate = expiry in the future / NULL**.
Setting **Нет доступа** explicitly is the immediate-disable path (no date math).
Either way the participant record persists.

### Deactivated users (`users.active = false`)

Already blocked at login (auth 403) and filtered out of matrix/graph. **Rule:** a
deactivated user's effective access everywhere drops to **hidden** (`none`).
Cheapest correct enforcement = a guard in the resolver / `checkView`
(`if (!user.active) → none`). Optionally, *on deactivation* downgrade their stored
grants too (defense-in-depth) — deferred; the login block + active-only filters
already cover the practical case.

## Membership is permanent (soft-disable, not delete)

A `project_participants` row is the **permanent record** that this person was on
the project — lab entities (`tapes`/`electrode_cut_batches`/`batteries`, via
`created_by` + project link) trace back to people, so the link must not be erased.

- Normal "remove" → **soft-disable** (set **Нет доступа** or expiry in the past).
  The row stays; the person shows as a greyed «отключён».
- **Today's backend hard-deletes** both the participant row *and* the grant
  ([projects.js:1031](routes/projects.js:1031)) — that behaviour is replaced by
  soft-disable in the normal flow.

### Conditional hard-delete (admin-only escape hatch)

For genuine mistakes only. Allowed **only if the user has created no lab entities
on this project** — i.e. no `tapes` / `electrode_cut_batches` / `batteries` with
`created_by = user` linked to the project (mirrors the existing delete-check
pattern; `modules` track no creator, so they don't count). If any exist → blocked,
soft-disable only. Needs a small `participant delete-check` endpoint. The lead is
never removable (already a 409).

## The flow (Option B — a permanent «Участники» surface)

1. **Create project** (basic fields — existing `EntityCreateDialog`).
2. **«Участники» surface** (reachable **any time** via a button, not only at
   creation): a table of **all users** —
   | ☐ | Имя (+ отдел/должность) | Доступ (4-level) | Истекает (optional) |
   - Creator row **auto-checked + frozen** (can't uncheck self).
   - Access defaults **Обычный**; flip the few to **Администратор** (or any level).
   - Expiry defaults endless (`NULL`); editable here or later.
   - **Three row states:** *active* (checked), *disabled* (was a member, expired /
     Нет доступа — greyed), *never-added* (check to add).
3. **Сохранить** → creates/updates participants + grants.
4. Per-person details (optional, editable later): **Роль в команде (функционал)**
   and **expiry**.

Principle: **adding is fast (check + defaults); details are optional.**

## What already exists (verified)

- **Expiry** works/stores: `user_project_access.expires_at`, `NULL` = endless;
  `POST /access` upserts it. So soft-disable/reinstate need **no new endpoint** —
  just expiry (or the `none` level).
- **Роль в команде (функционал)** exists in **vanilla** + backend
  (`project_participants.role_in_team`, INSERT + PUT) but is **missing in Vue** —
  the L3 parity gap. It's the per-project functional role, not the job title.
- `access_level` CHECK is currently `('view','edit','admin')` — adding `none`
  needs a migration.

## Layers / sequencing

- **L1 — vocab** ✅ DONE — обычный/админ in the panel (now superseded by the
  4-level set below; the helper just gains `view`/`none` labels).
- **L1.5 — model (backend + resolver):**
  - migration: add `none` to the `access_level` CHECK.
  - `resolveProjectAccess` (display) + future `checkView`: 4 levels, `none` =
    deny (overrides public), expiry auto-downgrade (open→view, restricted→none),
    inactive-user → none. Update the unit tests.
  - `participant delete-check` endpoint (conditional hard-delete).
- **L2 — «Участники» table:** all-users table, 4-level dropdown, soft-disable,
  conditional hard-delete, reachable anytime. Removes the blocking MultiSelect.
- **L3 — details:** Роль в команде (функционал) in Vue (vanilla parity) +
  per-person expiry editing.

### Scope flag — this touches the access core

L1.5 pulls part of **R1** forward (the *model*: `none`, deny, expiry-downgrade).
The **route-level enforcement** (`checkViewPermission` / `checkModifyPermission`
on every entity route) remains the larger, security-sensitive R1 pass and is **not**
done here — only the model + the display resolver + the member UI. Enforcement is
sequenced separately so a big security change isn't tangled with UI work.

## Deferred

- **Vanilla alignment** — vanilla keeps its own participant UI for now.
- **Route enforcement** — R1.
- **On-deactivation grant downgrade** — defense-in-depth; login block already covers it.
