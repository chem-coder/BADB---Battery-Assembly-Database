# Vue Frontend Architecture — single source of truth

Status: **active** (start of Phase A primitives, May 2026)

This document captures the architectural decisions and current roadmap
for the BADB Vue 3 SPA frontend. It is the source of truth for any
future session continuing the work. Read this BEFORE touching any
component or page if you don't have full context.

---

## 1. Cardinal principles (apply to every change)

1. **Constructor is the only edit surface.** No separate form pages
   per entity. Click row in the list → constructor below the table
   handles ALL parameter editing. Form-pages like `/electrodes/:id`
   are being phased out — when you see one being modified, ask
   whether to move its content into a constructor panel instead.

   **Status (2026-05):** `ElectrodeFormPage` was removed; `/electrodes/:id`
   now routes to `ElectrodesPage` (which already reads `route.params.id`
   in onMounted and adds the batch to constructor). The legacy
   form's three sections (electrode mass list, foil masses, capacity
   summary) became `components/ElectrodeBatchPanel.vue`, mounted below
   the constructor and scoped to the active batch via
   `@update:active-tape-id`. `router/index.js` was updated so any
   section with `formPage: null` still gets a `/path/:id` route pointing
   to its listPage, supporting deep-links without legacy form pages.

2. **Schema-driven stage editors.** Field configuration in
   `client-web/src/config/{tape,electrode,battery}Stages.js` defines
   what `StageCompareEditor` renders. New field types extend the
   schema vocabulary; do not hardcode per-stage rendering.

3. **Design System tokens strictly.** Reference is
   `client-web/src/pages/DesignSystemPage.vue`. Rules:
   - Brand blue **#003274** via `--p-primary-color` (set by `TvelAura`
     preset in `main.js`).
   - Rosatom font for titles and table headers.
   - Body text 14px/400/#333333; field label 13px/600/#4B5563;
     eyebrow 11px/700/uppercase/0.05em letter-spacing/rgba(0,50,116,0.50).
   - Badge palette 1–8 (terracotta / охра / хвойный / mint / blue /
     brand / plum / red) — no ad-hoc colors.
   - `.glass-card` for elevated surfaces (white + subtle blue border +
     soft shadow + backdrop blur).
   - Dialogs use the `*-dialog-root` PT override pattern with
     `background: white !important` to defeat Aura's tinted default.

4. **MSK timezone everywhere for displays.** Use
   `formatDateTimeMsk / formatDateMsk / formatDateShortMsk` from
   `client-web/src/utils/dateFormat.js`. Never raw `toLocaleString`.
   Append the "МСК" suffix in EntityMeta-style audit footers.

5. **Audit vs business field separation.**
   - `created_by` / `updated_by` are AUDIT — backend-only, JWT-derived,
     never editable. Shown in EntityMeta footer as "Заполнил" /
     "Изменил" with MSK time.
   - `operator_user_id` is BUSINESS — user-selectable. Forwarded in
     POST payloads even before backend column exists.
   - `performed_at` (planned) — user-set business timestamp; distinct
     from `updated_at`. Drives constructor timeline, NOT updated_at.
   - See `docs/instructions/operator-vs-creator.md` for the schema
     ask to Dalia.

6. **Per-user persistence via localStorage.** Storage key shape:
   `badb:<feature>:<key>:<userId|guest>`. Use the `useUserPref`
   composable from `client-web/src/composables/useUserPref.js` for any
   new preference. Already used for column visibility; planned for
   collapsible sections.

7. **Audit changes go to `field_changelog` via backend.** Frontend
   does not write to changelog directly. setFieldValue → debounced
   auto-save → backend route → backend service calls trackChanges.
   This already works in `useTapeState` and step-save services.

8. **Optimistic UI with auto-save.** Field edits update the local
   state immediately, debounced auto-save fires after 800ms idle, the
   user only sees a toast on error. Pattern lives in `useTapeState /
   useElectrodeState / useBatteryState`.

9. **Single notification system.** Always `useNotify` from
   `client-web/src/composables/useNotify.js`. Brand-toned Toast via PT
   theming in `main.js`. No raw `toast.add()` calls — they bypass the
   audit-vs-business label distinction.

10. **Validation returns `{ ok, message }`.** Render inline as a
    `badge-8` pill next to the field; never `alert()`, never a
    blocking toast for normal validation. Toasts are for async results.

11. **Excel-style column filters live in the column header.** No
    top-of-page filter bars (already removed from ElectrodesPage).
    `CrudTable` opens an overlay on header click with search + select
    all + per-value checkboxes.

12. **Column visibility is per-user.** `CrudTable` exposes a toolbar
    button (pi-sliders-v); each column can carry `required: true` to
    block hiding. Storage namespaced by `tableKey` prop. Exports
    (CSV/JSON/Excel) follow visibility — what you see is what you get.

---

## 2. Layer architecture

```
Page layer (TapesPage / ElectrodesPage / AssemblyPage / RowOpenPage)
  • Owns CrudTable + Constructor mount + below-constructor panels
  • Knows about loading, error toasts, page-specific dialogs
                  ↑
Stage editor layer (StageCompareEditor + StageNavigator)
  • Reacts to stages config via { key, type, group, ... }
  • Manages active stage, dirty tracking, undo/redo bindings
                  ↑
Primitive components layer (client-web/src/components/parity/)
  • DS-styled reusable building blocks
  • Listed in §3 below — Phase A in progress
                  ↑
Stage config (config/{tape,electrode,battery}Stages.js)
  • Pure JSON-like schema describing fields and groups
  • Adding a feature is usually one entry here + maybe one new primitive
```

---

## 3. Phase A primitives — COMPLETE (May 2026)

Six reusable components were built before applying them to the missing
vanilla features one-by-one. Without them we'd copy-paste logic 5–7
times and the codebase would rot.

| # | Component | Location | Purpose | Tests |
|---|---|---|---|---|
| 1 | `DateTimeWithNow.vue` | `components/parity/` | date + time inputs + «Сейчас» button. MSK-correct via `Intl.DateTimeFormat`. | 16 |
| 2 | `SequentialDateField.vue` | `components/parity/` | wraps DateTimeWithNow; cascades from previous stage's value, blocks earlier-than-prev with inline error | 25 |
| 3 | `LiveDelayBadge.vue` | `components/parity/` | reactive countdown via `useLiveDuration`; warn/error tone thresholds | 19 |
| 4 | `CollapsibleSection.vue` | `components/parity/` | eyebrow + chevron section; state persisted via `useUserPref` | 14 |
| 5 | `RowActionMenu.vue` | `components/parity/` | config-driven row action icons (📑/🖨️/⋮); replaces ad-hoc per-page buttons; outside-click + escape close | 18 |
| 6 | `BulkMassesGrid.vue` | `components/parity/` | inline-editable mass table + add/remove + bulk-paste. Single-column fast path keeps Russian decimal commas intact when no tabs present. | 16 |

Helper composables:

| Composable | Location | Purpose | Tests |
|---|---|---|---|
| `useUserPref` | `composables/useUserPref.js` | Reactive localStorage per user. | — (covered indirectly via CollapsibleSection) |
| `useLiveDuration` | `composables/useLiveDuration.js` | Reactive elapsed time with 60s ticks. Russian "N мин / H ч M мин / D дн H ч" formatter. | 13 |

**Total Phase A test count:** 121 new tests across 7 files. Suite went
from 192 passing to **313 passing**.

**Run from `client-web/`:** `npm test -- --run --reporter=dot`

---

## 4. Phase B — schema vocabulary

Extend the stage field schema in `config/*Stages.js`. `StageCompareEditor`
dispatches on `field.type` — adding a new type means: one template branch
+ helper updates for `copyField` / `fieldHasData` if the field has more
than one backing key.

### Phase B-1 — DONE (May 2026)

`type: 'datetime-with-now'` — collapses the historic two-row
`{key:'date'} + {key:'time'}` pattern into a single composite row.

> **Update (later May 2026):** `DateTimeWithNow.vue` switched its date
> side from raw `<input type="date">` to PrimeVue `<DatePicker
> dateFormat="dd.mm.yy">`. The outward API stays string-based
> (`YYYY-MM-DD` ↔ Date object converted internally), so consumers and
> the schema vocabulary are unaffected. This guarantees dd.mm.yyyy
> display regardless of browser locale.

Schema shape:
```js
{ key: 'datetime', label: 'Дата + время', type: 'datetime-with-now',
  dateKey: 'date', timeKey: 'time' }
```

- Backend data model unchanged: still writes `date` and `time` properties
- All 7 tape stages migrated in `tapeStages.js`
- `copyField` + `fieldHasData` in StageCompareEditor introspect via
  `findField()` to know about composite backing keys
- Old `type: 'time'` branch preserved as fallback for any future
  standalone time input — not dead code

### Phase B-2 — DONE (May 2026)

`type: 'sequential-datetime'` — adds "not earlier than previous stage"
validation + optional cascade. Wraps `SequentialDateField` which in
turn wraps `DateTimeWithNow`.

Schema shape:
```js
{ key: 'datetime', label: 'Дата + время', type: 'sequential-datetime',
  dateKey: 'date', timeKey: 'time',
  prevStageCode: 'drying_am',   // which stage to compare against
  cascadeFromPrev: false }       // auto-fill empty fields on mount
```

- StageCompareEditor accepts new `allStages` prop (TAPE_STAGES) so it
  can look up `prevStageCode`'s human-readable label for the
  validation message ("Не может быть раньше «Сушка АМ»").
- `getPrevDateTime(tapeId, prevStageCode)` reads from
  `tapeStates[tid].steps[prevStageCode]` for the previous step's
  date + time.
- All 6 tape stages after drying_am migrated. `drying_am` stays
  `datetime-with-now` (it's the first datetime stage, has no prev).
- `cascadeFromPrev` defaults to false to avoid touching empty stages
  on tape load. Schema entries can opt-in per-stage when desired.

### Phase B-3b — DONE (May 2026): `multiselect` for M:N reference fields

`type: 'multiselect'` — backs an array of foreign-key values. Used for
the M:N project assignment that mirrors `tape_projects` /
`electrode_cut_batch_projects` / `battery_projects` (migrations d028-d030).

Schema shape:
```js
{ key: 'project_ids', label: 'Проекты',
  type: 'multiselect', ref: 'projects' }
```

- `StageCompareEditor` renders PrimeVue `<MultiSelect>` with chip
  display, using the same `getRefOptions()` helper as `select`.
- `fieldHasData` treats `[]` as "no data" (returns false for empty
  arrays — important so the cell highlight matches user intent).
- `copyField` deep-copies arrays — `setValue(dest, key, [...val])`
  so the dest tape gets its own array, not an aliased reference.
- `EntityCreateDialog` also supports `multiselect` for create flows;
  `BatchCreateDialog` has a bespoke MultiSelect with cascade logic
  (tape filter by ANY selected project).

Backend payload contract (echo pattern):
```js
{
  project_ids: [1, 2, 3],   // M:N source of truth
  project_id: 1,            // legacy echo of first item (downward compat)
}
```

### Phase B-3a — DONE (May 2026): `datetime-iso` for single-key timestamps

`type: 'datetime-iso'` — for stage fields that back onto a SINGLE
column holding an ISO string like `"2026-05-27T14:30:00"` (electrode
drying `start_time` and `end_time`). Same UX as `datetime-with-now`
(DatePicker + time + «Сейчас»), but `StageCompareEditor` splits the
ISO on read and combines on write via `isoToDateStr` / `isoToTimeStr`
/ `combineToIso` helpers.

Migrated:
- `electrodeStages.js` drying stage: `start_time` and `end_time` were
  raw `type: 'text'` (bare textboxes) — now `datetime-iso`.

For ad-hoc date inputs OUTSIDE the stage editor (HomePage filter
range, ProjectsPage start/due dates, MaterialsPage order/received
dates), use `components/parity/DateInputISO.vue` — string v-model in
`YYYY-MM-DD`, internally DatePicker. Replaces the last surviving
`<input type="date">` callsites across the SPA.

### Phase B-3 — DONE (May 2026)

**Collapsible field groups** inside a stage's table. Schema introduces
two marker entries in the field list:
```js
fields: [
  ...,
  // Group SEPARATOR row — renders as a clickable eyebrow + chevron
  // <tr> spanning all columns. The persistKey is the per-user storage
  // key for the collapsed state.
  { isGroupSeparator: true, group: 'dry_mixing',
    label: 'Сухое смешивание', persistKey: 'mixing-dry' },
  // Subsequent fields with the same `group` belong to the group and
  // hide when collapsed. The grouping is positional (next separator
  // closes the previous group implicitly).
  { key: 'dryMixingId', label: 'Метод', type: 'select',
    ref: 'dryMixingMethods', group: 'dry_mixing' },
  ...
]
```

- `StageCompareEditor` reads the auth store's user id and stores the
  collapsed state of all groups in ONE localStorage entry
  `badb:pref:stage-groups:<userId>` (flat map). One entry rather than
  N composable refs keeps setup() small and avoids dynamic
  `useUserPref` invocation.
- Mixing stage migrated to two groups: «Сухое смешивание»
  (dryMixingId/dryDurationMin/dryRpm) and «Мокрое смешивание (паста)»
  (wetMixingId/wetDurationMin/wetRpm/viscosityCp). All other mixing
  fields stay ungrouped.
- Group rows are styled with eyebrow tokens (11px / 700 / uppercase /
  brand-blue family) + brand-blue tinted background to distinguish
  from data rows.

### Phase B-4+ — planned

```js
// Auto-toggles (defaults from entity context)
{ key: 'coating_sidedness', type: 'auto-toggle',
  label: 'Двусторонность',
  defaultFn: '(tape) => tape.role === "cathode" ? "two_sided" : "one_sided"' }
```

`StageCompareEditor` is extended once per new type; every future stage
that opts in gets the behaviour free.

---

## 5. Phase C — apply primitives to the 62-feature gap

Phase A primitives are ready. The 62-feature gap (vanilla-vs-Vue audit,
May 2026) is now an application exercise — wire the primitives into the
stages config + page-level views, no new architectural decisions needed.

**Quick wins (pick first):**
1. `RowActionMenu` on TapesPage → 📑 «Дублировать» + 🖨️ «Печать»
2. `DateTimeWithNow` replaces ad-hoc `<input type="date">` + `<input
   type="time">` in `StageCompareEditor` (drying_am.end + drying_pressed_tape.end)
3. Calc mode toggle (from_active_mass vs target) exposed in
   TapeConstructor general section — already in `useTapeState` but
   unrendered.

**Medium effort:**
4. `SequentialDateField` on every datetime pair across stages — extends
   `StageCompareEditor` to dispatch `type: 'sequential-datetime'`
5. `BulkMassesGrid` for foil masses (foil step in tape constructor)
6. `CollapsibleSection` for dry/wet mixing parameter blocks (use
   `persistKey: 'mixing-dry'` etc.)
7. `LiveDelayBadge` per stage in `StageNavigator` left sidebar — pass
   `warnAfterMinutes` from stage config

**Large effort:**
8. `BatteryStackBuilder.vue` — visual electrode arrangement matrix
9. `NPRatioAssistant.vue` — capacity-based anode count recommendation
10. Dry-box workflow for tapes — new stage + return-now / remove-now
    endpoints (requires backend)

---

## 6. Decisions already made (do not re-litigate)

| Decision | Rationale | Where |
|---|---|---|
| `definePreset(Aura, …)` with `--p-primary-*` = TVEL blue | Aura defaults to emerald; was leaking into Panel headers and Stepper | `main.js` |
| `.p-step-number { display: none }` global | PrimeVue Step v4 renders `value` as visible text | `assets/styles/global.css` |
| Hide pencil-rename in CrudTable | Table titles are identity, not user data | `components/CrudTable.vue` |
| One download icon, always right of row/col-count | Was duplicated left/right via `exportEnd` prop | `components/CrudTable.vue` |
| Default `Строк в окне` = 5 | Was 10, user expected smaller | `components/CrudTable.vue` |
| `EntityCreateDialog` for tape/battery + `BatchCreateDialog` for electrodes | Electrode batch needs sections + cascading dimensions, doesn't fit schema-driven dialog | `components/` |
| `UnsavedConfirmDialog` replaces native confirm | Native confirm is ugly + can't theme | `components/parity/` |
| Time displayed in MSK with «МСК» label | Lab is in Moscow; audit consistency | `utils/dateFormat.js` |
| Project field as PRIMARY input in create dialogs + "+ Создать проект" inline | Project drives tape filtering; new project creation should not break flow | `BatchCreateDialog` |
| Operator vs Заполнил split, operator_user_id forwarded in payload pre-backend | Two distinct people in lab workflows | `docs/instructions/operator-vs-creator.md` |
| Filters live in column headers only | Excel/Sheets pattern; no top filter-bar duplication | `CrudTable`, removed from `ElectrodesPage` |
| `_resetHistoryDebounce()` on undo/redo + `try/finally` for `_skipHistory` | Stale debounce timer was eating snapshots after undo | `useTapeState`, `useElectrodeState`, `useBatteryState` |
| `<<` copy shows toast with stage label + dest tape name | User couldn't see scope of bulk copy | `StageCompareEditor` |
| StageNavigator timeline excludes `general_info` (meta) | created_at outlier was crushing real workflow dates | `StageNavigator` |
| StageNavigator handles both tape (date+time) and electrode (ISO start_time) shapes | Was rendering nothing for electrodes | `StageNavigator.getStageDateTime` |
| Inline `+ Создать проект` mini-form in BatchCreateDialog | User wants to add new projects without leaving the flow | `BatchCreateDialog` + `ElectrodesPage` handler |

---

## 7. Working contract with Dalia (backend)

Open backend asks (already documented):
1. `operator_user_id` column on `tapes / electrode_cut_batches /
   batteries` — see `docs/instructions/operator-vs-creator.md`.
2. `*_performed_at` user-set timestamps — proposed extension to that
   doc; covers cutting/drying/etc. start dates so they're independent
   of `updated_at`. To be written.

Don't add backend routes or migrations unilaterally — propose in a
doc, get sign-off, then Dalia implements.

---

## 8. Branch hygiene

- Branch naming: `dima/<feature-name>`.
- One coherent feature per branch. Don't pile unrelated work into
  `dima/vue-parity-smoke-combined` — it's a working integration tip.
- Before pushing: pre-commit gate from `CLAUDE.md` (no `.claude/`,
  no `local/`, no secrets, etc.).
- PRs are reviewed by Dalia in her main repo. Force-push to main is
  forbidden.

---

## 9. Working approach for new sessions

1. Read this doc + `CLAUDE.md` + `docs/instructions/operator-vs-creator.md`.
2. Check task list (`TaskList` tool) for pending work.
3. Before adding a new component: ask if it fits an existing
   primitive or stage type. Don't create one-off renderers per page.
4. Before touching styles: open `pages/DesignSystemPage.vue` and
   match the existing pattern. Brand-blue, Rosatom, badge palette.
5. After a change: run `npm test -- --run --reporter=dot` from
   `client-web/`. Suite is currently 192 passing.
6. Verify visually in browser via Chrome MCP when the change is
   user-facing — JS-driven testing can mask transition glitches.
