# Architecture refactor backlog (client-web)

Tracked tech-debt items surfaced during the 2026-06 self-review. Each
entry says **what**, **why it's worth doing**, and **why it isn't done
yet** — so a future session (or Dalia's review) can pick it up with full
context instead of rediscovering the trade-offs.

## Done

### DS form wrappers — `DSMultiSelect` ✅ (2026-06-02)
`components/ds/DSMultiSelect.vue` encapsulates the project's MultiSelect
behaviour (no chip, «Выбрано: N» counter, show-clear, auto-filter) that
had been copy-pasted across StageCompareEditor / BatchCreateDialog /
EntityCreateDialog and caused repeated chip/clear-icon re-fixes. Three
call sites migrated; 7 unit tests; visual parity verified.

**Deliberately NOT wrapped:** `DSSelect` / `DSDatePicker` were considered
and dropped — Select has no single dominant pattern (16 call sites,
form/filter/access/reference all differ) and never had recurring style
bugs; DateTimeWithNow / DateInputISO already serve as the date wrappers.
Wrapping them would be abstraction for its own sake.

## Deferred — needs Dalia's sign-off before starting

These change **working components in Dalia's repo**, so per the project
governance rule (no unilateral product-direction changes; large
refactors of working surfaces get an issue + OK first) they are
documented here rather than done ad-hoc.

### 1. Merge `BatchCreateDialog` into the schema-driven `EntityCreateDialog`
- **Why:** two parallel create-dialog systems for one job. `BatchCreateDialog`
  (~600 lines, hand-rolled) vs `EntityCreateDialog` (schema-driven). The
  `initialValues` duplicate-seed had to be implemented twice.
- **Why deferred:** `BatchCreateDialog` carries behaviour `EntityCreateDialog`
  can't express yet — cascading fields (form-factor → shape → config),
  conditional fields (circle→diameter, rectangle→length/width), inline
  «create project», tape-filtered-by-project. Folding it in means
  **extending the schema language** (cascade/conditional/inline-create)
  and re-verifying the electrode create flow. High blast radius on a
  working surface — not a drive-by change.
- **Suggested approach:** extend `EntityCreateDialog` field schema with
  `dependsOn` / `showIf` / `inlineCreate` first (additive, tested in
  isolation), migrate BatchCreateDialog last, behind a visual diff check.

### 2. Extract a base `useEntityState` from the three state composables
- **Why:** `useTapeState` (877), `useElectrodeState` (325), `useBatteryState`
  (553) share restore/save/meta/undo-redo skeletons that have drifted
  (e.g. `item_created_at` parsing lived in all three — now centralised via
  `isoDateToMskInput`, but the rest still duplicates).
- **Why deferred:** the three diverge in real ways (tape has recipe
  actuals + dry-box; electrode has cutting cascade; battery has electrode
  stack). A premature base class risks a leaky abstraction worse than the
  duplication. Needs a careful "extract only the genuinely shared 60%"
  pass with the full test suite as a guard.

### 3. Retire the ~156 `!important` PrimeVue overrides in `global.css`
- **Why:** the overrides are brittle (a PrimeVue bump can break them) and
  were the root of the repeated dropdown/clear-icon/width fixing.
- **Why deferred / incremental:** removing them wholesale risks visual
  regressions on a hard-won look. The path is to migrate per-component to
  PrimeVue 4 PassThrough (`:pt`) or preset tokens **one control at a
  time**, verifying each visually, and delete the matching `!important`
  block only after the wrapper owns the style. `DSMultiSelect` is the
  first step (behaviour); a follow-up can move its visual rules off
  global.css into the wrapper.

### 4. Split god-components
- `CrudTable` (~1250 lines): table + filters + context-menu + export +
  duplicate + print + column-visibility. Candidate extractions:
  `useTableSelection`, `useTableContextMenu`, `useTableExport`.
- `StageCompareEditor` (~1330 lines): schema dispatch + copy logic +
  AutoComplete adapter + per-type cells.
- **Why deferred:** pure structural refactor of heavily-used components;
  high regression risk, low user-visible value. Do opportunistically when
  touching them for a feature, not as a big-bang.

## Process notes
- The 2026-05 work landed as one 45-commit branch; it was split into
  #24 (foundation) / #32 (reference pages) / #25 (bulk-paste) / #23
  (audit) per Dalia's prior «split big branches» request.
- Keep future feature work on small per-topic branches from the start to
  avoid repeating that.
