# Project Member-Add Flow + Access-Level Vocabulary

Created: 2026-06-24
Edited: 2026-06-24
Status: design approved — building (Vue first), branch `dalia/project-member-flow`
Verified against code: 2026-06-24 (`ProjectAccessPanel.vue`, `routes/projects.js`, `public/js/projects.js`, `project_participants`)
Source paths: `client-web/src/components/ProjectAccessPanel.vue`, `client-web/src/pages/reference/ProjectsPage.vue`, `client-web/src/components/EntityCreateDialog.vue`, `client-web/src/utils/projectAccess.js`, `routes/projects.js`

Design agreed with Dalia 2026-06-24. Reworks how project members are added in the
Vue app, and simplifies the access-level vocabulary. Motivation: the access graph
needs real project/member data to be meaningful, and the current add-member UX is
clumsy (a blocking `MultiSelect` overlay; confusing checkmarks). Vue first; vanilla
already has its own version and may be aligned later.

## Confirmed access model (the capability split)

Two member capabilities, plus an implicit baseline (mirrors
[Project-Based Access Control / R1](project_access_control.md)):

- **обычный** = `edit` — a project member: can **CRUD the project's data**
  (tapes, electrodes, batteries…). This is the default for added members.
- **админ** = `admin` — can additionally **edit the project itself** (title,
  dates, members, access).
- **view** = the **auto-filled baseline** for *non-members* on *non-restricted*
  projects. It is **not** a dropdown choice — members are elevated above view by
  default. Legacy `view` grants still display (as "просмотр (устар.)").

Backend `user_project_access.access_level` enum (`view`/`edit`/`admin`) is
**unchanged** — only the UI vocabulary narrows to обычный/админ. No enum migration.
NB: data-CRUD-by-membership is the intended model and is **not yet enforced** on
entity routes — see R1.

## The flow

1. **Create project** (basic info — existing `EntityCreateDialog`).
2. **Step 2 — «Добавить участников»:** a table of **all users**:
   | ☐ | Имя (+ отдел/должность) | Доступ (обычный/админ) | Истекает (optional) |
   - Creator row is **auto-checked and frozen** (cannot uncheck self).
   - Access defaults to **обычный**; flip the select few to **админ**.
   - Expiry defaults **endless** (`NULL`); editable here or later.
   - Adding is fast: check + defaults. No per-person detail required yet.
3. **«Сохранить»** → creates the participants (+ grants).
4. **Participants view** (post-save; also the opened-project edit surface): the
   checked people + creator, where you can *optionally* set:
   - **Роль в команде (функционал)** — the per-project functional role assigned by
     the lead (NOT the user's job title).
   - **Expiry** per person (edit the date).

Principle: **adding people is quick; specifying their details is optional and
available later.**

## What already exists (verified)

- **Expiry** works and is stored: `user_project_access.expires_at`, `NULL` =
  endless (default). Backend honors + updates it; the current panel already has
  7/30/90/Бессрочно presets + a date picker.
- **Роль в команде (функционал)** exists in **vanilla** (`projects.html`
  `<th>Роль в команде (функционал)</th>` + "Функциональная роль" input;
  `projects.js` logic) with full backend support (`project_participants.role_in_team`,
  INSERT + PUT). It is **missing in Vue's `ProjectAccessPanel`** — the parity gap
  L3 closes.
- The current Vue add-member UI is a PrimeVue `MultiSelect` (the blocking overlay).
  The checkbox table replaces it, fixing that annoyance by construction.

## Layers

- **L1 — vocab:** shared обычный/админ options + label helper in
  `utils/projectAccess.js`; `ProjectAccessPanel` dropdown offers only обычный/админ
  (default обычный); access-list display uses the helper (legacy `view` →
  «просмотр (устар.)»). Small, contained.
- **L2 — member-add table:** the step-2 checkbox table in the create flow
  (auto-checked frozen creator, defaults, optional expiry). The bulk of the work;
  removes the blocking MultiSelect.
- **L3 — participants view:** add **Роль в команде (функционал)** to Vue (vanilla
  parity) + per-person expiry editing on the post-save / opened-project surface.

## Deferred

- **Vanilla alignment** — vanilla keeps view/edit/admin + its own participant UI
  for now. Revisit once the Vue flow + permissions are settled.
- **Enforcement** — making «обычный → CRUD data, non-member → no CRUD» real is the
  R1 task, separate.
