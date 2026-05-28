# Audit: Vue SPA narrower than backend/vanilla — 2026-05-27

Systematic audit run after Dima noticed multi-project select was missing
from BatchCreateDialog. Findings cover all entity areas, comparing
backend payload contracts (`routes/`, `services/`, `migrations/`) with
vanilla v1 UI (`public/js/`) and the Vue SPA (`client-web/`).

**Verdict: 17 discrepancies — 7 CRITICAL, 6 MEDIUM, 4 LOW.**

## Status (live)

| # | Item | Status |
|---|---|---|
| 1 | Multi-project — tapes | ✅ DONE |
| 2 | Multi-project — electrode cut batches | ✅ DONE |
| 3 | Multi-project — batteries | ✅ DONE |
| 4 | `item_created_at` editable on all 3 entities | ✅ DONE (UI shows time but column is DATE — see note) |
| 5 | `is_test_batch` toggle for electrodes | ✅ DONE |
| 6 | Tape dry-box state UI (6 endpoints) | ✅ DONE |
| 7 | `include_in_capacity_average` per electrode | ✅ DONE |
| 8 | Coating gap_um_side2 + drying_speed_text + coated_thickness_um*  | ✅ DONE |
| 9 | viscosity_conditions in mixing | ✅ DONE |
| 10 | Calendering appearance checkboxes | ✅ DONE |
| 11 | Tape list columns: availability_status / coating_sidedness | ✅ DONE |
| 12 | ElectrodeBulkPasteDialog include_in_capacity_average | ⏭️ SKIPPED (intentional — see note) |
| 13 | battery_notes in create dialog | ✅ DONE |
| 14 | Tape list availability_status + audit meta | ✅ DONE |
| 15 | Battery list missing columns | ✅ DONE |

**Note on #12 (skipped):** Bulk-paste's mental model is "operator pastes
mass measurements from Excel". The `include_in_capacity_average` flag
is a per-electrode decision made AFTER weighing, when outliers are
discovered — not something that lives in a paste source. Surfacing it
in the bulk paste would force users to author CSVs they'd never need.
The per-row checkbox (audit #7) is the right place to set it.
| 16-17 | No gaps (Projects / Recipes / Materials / Departments / Users) | ✅ N/A |

---

## CRITICAL — user-visible feature regressions

### 1. Multi-project assignment for tapes
- **Backend**: `services/tapeProjectService.js:9–31` normalizes
  `payload.project_ids` (array preferred). `services/tapeCatalogService.js:70-108,188-243`
  calls `replaceTapeProjects` on create + update. M:N table from `d028`.
- **Vue create**: `pages/TapesPage.vue:128–133` — single `project_id`.
- **Vue update**: `composables/useTapeState.js:345–353` (`saveGeneral`)
  sends `project_id` only; schema in `config/tapeStages.js:21` is single.
- **Vanilla**: `public/js/1-tapes.js:47-48,465-466` carries
  `project_id` + `project_ids[]` (multi-select).
- **Fix**: switch Vue to `project_ids[]` (MultiSelect); echo
  `project_id` for downward compat.

### 2. Multi-project for electrode cut batches
- **Backend**: `services/electrodeBatchProjectService.js:27–35`, used
  by `services/electrodeCutBatchService.js:286-294,463-469`.
- **Vue create**: `components/BatchCreateDialog.vue:71,242-259` —
  single `projectId` ref, no `project_ids` in emit.
- **Vue update**: `composables/useElectrodeState.js:186-198`
  (`saveStep('cutting')`) PUTs without project field → user can't change.
- **Vanilla**: `public/js/2-electrodes.js:283-284,445,2009` posts arrays.
- **Fix**: add `project_ids[]` to BatchCreateDialog + useElectrodeState.

### 3. Multi-project for batteries
- **Backend**: `services/batteryCatalogService.js:228-298,473-568` —
  uses `getPayloadProjectIds`, calls `replaceBatteryProjects` (d030).
- **Vue create**: `pages/AssemblyPage.vue:133-153` — single `project_id`.
- **Vue update**: `composables/useBatteryState.js:269-274` PATCHes only
  `project_id`. No `project_ids[]`.
- **Vanilla**: `public/js/3-batteries.js:6302,1041` sends arrays.
- **Fix**: same pattern as #1, #2.

### 4. `item_created_at` (business date) not surfaced anywhere in Vue
- **Backend**: `tapeCatalogService.js:73,93,191,216`
  (`COALESCE($5::date, CURRENT_DATE)`); same for electrodes + batteries.
  Migration `d035_add_item_created_at_dates.sql`.
- **Vue**: zero references to `item_created_at` anywhere.
  Vue always lets backend pick today.
- **Vanilla**: `public/js/1-tapes.js:441`, `2-electrodes.js:439`,
  `3-batteries.js:1045,6303` — user-editable date field on each entity.
- **Fix**: add `item_created_at` date input on create + general-info
  edit for all three entities.

### 5. `is_test_batch` flag for electrode cut batches
- **Backend**: `electrodeCutBatchService.js:312,326,480-482` +
  `migrations/d039_add_electrode_test_batch_flag.sql`.
- **Vue**: zero references.
- **Vanilla**: `public/js/2-electrodes.js:22,440,616,1708,1978` —
  checkbox + "Тестовая" list marker.
- **Fix**: add "Тестовая партия" toggle in BatchCreateDialog + general-info.

### 6. Tape dry-box state UI entirely missing
- **Backend**: `routes/tapes.js:353-461` — 6 endpoints
  (`GET/PUT /dry-box-state`, `place-now`, `return-now`, `remove-now`, `deplete`).
- **Vue**: nothing.
- **Vanilla**: `public/js/1-tapes.js:1793-1855` calls all six; buttons for
  "помещение в шкаф", "возврат", "извлечение", "израсходовано".
- **Fix**: at minimum expose `availability_status` read + deplete/return
  actions on TapesPage/TapeConstructor.

### 7. `include_in_capacity_average` toggle on individual electrodes
- **Backend**: `routes/electrodes.js:383-409` accepts the field;
  `electrodeCutBatchService.js:698` returns it. Migration `d038`.
- **Vue**: no references.
- **Vanilla**: `public/js/2-electrodes.js:2102,2110` — per-row checkbox.
- **Fix**: per-row checkbox in ElectrodeFormPage's electrode list.

---

## MEDIUM — backend capability not surfaced

### 8. Coating gap fields + side-2 measurements
- **Backend**: `d033` (`gap_um_side2`, `drying_speed_text`), `d040`
  (`coated_thickness_um`, `coated_thickness_um_side2`). Step services
  read/write them.
- **Vue**: `useTapeState.js`/`tapeStages.js` have nothing on these.
- **Vanilla**: `1-tapes.js:1133,1583,3708` edits both sides.
- **Fix**: extend `tapeStages.js` `coating`/`drying_*` schemas +
  step state.

### 9. Mixing `viscosity_conditions` text field
- **Backend**: `tapeStepSaveService.js:297,310,333,366,387` (d037).
- **Vue**: `useTapeState.js:481` only sends `viscosity_cP`.
- **Vanilla**: `1-tapes.js:1121,1568,4444` binds `wet-viscosity-conditions`.
- **Fix**: add "Условия измерения вязкости" text field to mixing stage.

### 10. Calendering appearance editor half-wired
- **Backend**: accepts `appearance` text, persisted by `saveCalendering`.
- **Vue**: `useTapeState.js:97-107,319-340` parses/builds appearance
  from `shine/curl/dots/otherCheck/otherText` — BUT `tapeStages.js:127-147`
  doesn't list these keys, so the UI never renders them. Data round-trips
  but stays locked at defaults.
- **Fix**: render checkboxes for `shine/curl/dots/otherText` in
  calendering stage editor (extend StageCompareEditor with a new field
  type or add ad-hoc rendering).

### 11. Tape availability + sidedness columns hidden on Vue list
- **Backend list (`listTapes`)**: returns `availability_status` +
  `coating_sidedness` (`tapeCatalogService.js:133,156-164`).
- **Vue**: `TapesPage.vue:97-106` `columns` array shows neither.
- **Vanilla**: filters by sidedness AND status; columns visible.
- **Fix**: add columns + Excel-style header filters.

### 12. ElectrodeBulkPasteDialog ignores `include_in_capacity_average`
- **Backend**: electrode update accepts it.
- **Vue**: `ElectrodeBulkPasteDialog.vue:24,63-67` — no marker column.
- AMBIGUOUS — may be deliberate scope.

### 13. AssemblyPage create dialog doesn't expose `battery_notes`
- **Backend create**: accepts `battery_notes`
  (`batteryCatalogService.js:278`).
- **Vue create**: `AssemblyPage.vue:133-153` — only `project_id` +
  `form_factor`. `useBatteryState.saveStep('general')` does send
  `battery_notes` later (`:273`), so it's recoverable. Still — vanilla
  collects it up front.

---

## LOW — schema fields not rendered

### 14. `availability_status`, `updated_by/updated_at` for tapes
- Backend GET returns them. Vue tape list ignores them.

### 15. Battery list columns from backend not shown
- `listBatteries` returns `cathode_active_materials`,
  `anode_active_materials`, `cathode_batch_shape`, etc.
  Vue AssemblyPage shows a subset.

### 16. Project `confidentiality_level` — no gap (covered in Vue).

### 17. Recipes / Materials / Departments / Users — no narrowings detected.

---

## Backend ask: optimistic locking on per-row electrode/foil-mass writes

The Vue SPA's `ElectrodeBatchPanel` now sends per-row PUTs on blur
(no big save button). Two operators editing the same batch can clobber
each other silently — last-write-wins. Per CLAUDE.md Invariant #9
optimistic locking is mandatory but the contract for these tables is
unclear.

**Proposed**:
- `electrodes` table: add `version INTEGER NOT NULL DEFAULT 0`,
  increment on UPDATE, require WHERE `version = $expected`, return 409
  on mismatch.
- `electrode_cut_batch_foil_masses`: same pattern.
- Frontend will then include `version` in PUT payloads + handle 409 by
  refetching the row and surfacing a toast «Кто-то изменил эту строку
  пока вы редактировали, обновите и попробуйте снова».

Until backend support lands, the panel is silently lossy under
concurrent edit. Single-operator workflows are unaffected.

## Backend ask: migrate `item_created_at` to TIMESTAMPTZ

The Vue SPA renders ALL date fields as a unified two-row composite
(`DateTimeWithNow`) — date row + time row — for visual consistency
across the constructor. `item_created_at` is currently a `DATE` column
(migration d035) so the time portion entered by the user is **discarded**
on save. UX trade-off accepted by Dima 2026-05-27 to keep visual style
unified.

**Proposed migration** for Dalia to consider:
```sql
ALTER TABLE tapes               ALTER COLUMN item_created_at TYPE TIMESTAMPTZ USING item_created_at::timestamptz;
ALTER TABLE electrode_cut_batches ALTER COLUMN item_created_at TYPE TIMESTAMPTZ USING item_created_at::timestamptz;
ALTER TABLE batteries           ALTER COLUMN item_created_at TYPE TIMESTAMPTZ USING item_created_at::timestamptz;
```

Frontend already sends a YYYY-MM-DD string today; if the column becomes
TIMESTAMPTZ the frontend will be updated to send `YYYY-MM-DDTHH:MM:00`
and the user-entered time will round-trip properly.

## Notes / AMBIGUOUS

- **`operator_user_id`** is already wired forward in
  `BatchCreateDialog.vue:250`, conditional on backend column. Not a
  regression — backend-pending.
- **Vanilla top-of-page filter bars vs Vue CrudTable header overlays**:
  functionally equivalent. Only the sidedness/status filter gap on tapes
  (#11) matters.
- **Tape dry-box state (#6)** is the largest area of completely missing
  UI — 6 endpoints, no Vue handlers.

---

## Files touched (summary)

The Vue narrowings cluster in 9 files:
- `components/BatchCreateDialog.vue` — #2, #4, #5
- `components/EntityCreateDialog.vue` — generic; narrow callers in
  TapesPage/AssemblyPage are the issue
- `pages/TapesPage.vue` — #1, #4, #11, #14
- `pages/AssemblyPage.vue` — #3, #4, #13, #15
- `pages/ElectrodeFormPage.vue` — #7
- `composables/useTapeState.js` — #1, #4, #6, #8, #9, #10
- `composables/useElectrodeState.js` — #2, #4, #5
- `composables/useBatteryState.js` — #3, #4
- `config/tapeStages.js` — #8, #9, #10
