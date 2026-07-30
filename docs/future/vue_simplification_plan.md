# Vue simplification & calculation plan (from Dalia's parity review)

Created: 2026-07-30
Status: future-facing plan (Dalia's directives from the parity discovery review;
see `../../../PARITY_DISCOVERY_2026-07-30.md` and `PARITY_DISCOVERY_DIGEST.md`)

## Directives

1. **Vanilla is being retired.** Vue is the product; vanilla remains only as a
   spec of required capabilities until switch-off.
2. **Fewer structured inputs.** Over-systematization («too many input boxes»)
   is hurting adoption. Prefer paper-protocol style: one free «Параметры»
   field per step with suggested parameters (temperature, atmosphere,
   duration, speed…) instead of a dedicated column per parameter.
3. **Start times only.** Steps record a start moment (+«Сейчас» button);
   duration is written explicitly by the operator where relevant. End-time
   fields and live «time since previous step» timers are dropped.

## Planned work items

### P1 — Weighing targets recalculated from ACTUAL AM mass — DONE 2026-07-30

Vue weighing view must show the target mass per line («К добавлению»).
Calculation model:

- target mass of the ACTIVE material: from recipe % + tape target quantity
  (as computed today);
- target masses of ALL OTHER ingredients: recalculated **from the actual
  weighed AM mass** as soon as it is entered (live, real time);
- while the actual AM mass is blank, all targets derive from the AM target
  mass (current behavior).

### P2 — Drop dry-box tracking

Remove the place-now/remove-now/return-now closet workflow AND its coupling
to electrode cut-batch creation (vanilla gate). Replace with a simple notes
field on the tape («вынута на 30 мин — 30.07, вернула И.И.»). Includes
removing the backend `has_final_dry_box_storage` gate (ended_at dependency
dies with it). Depletion («лента израсходована») stays.

### P3 — Collapse narrow step fields into «Параметры» free text

Candidates (per review): `drying_speed_text`, `coat_time_min`, possibly
other single-purpose columns. Keep the big four as structured where they
already work (temperature, atmosphere, duration), free-text the rest with
placeholder suggestions. Schema stays (forward-only); UI stops surfacing
retired fields.

### P4 — Vue stage order stays unlocked (decision, documented)

Vue intentionally does NOT gate stages by workflow order (vanilla does).
Easier data entry wins. Soft hints (sequential datetime) remain.

### Resolved-by-design (no action)

- Vue duplicate does not copy step data — the copy-arrows model replaces it.
- Vue-only features (files d053, undo/redo, changelog, quick-create recipe,
  deplete dialog, lead gate) — keep.
- Resolved by the start-times-only directive (were rated data-loss in the
  discovery, now intentionally NOT ported to Vue): drying `ended_at` fields,
  `coat_time_min` as a dedicated field, mixing dry/wet END times
  (`dry_end_time`/`wet_end_time` stay unmaintained from Vue; columns remain
  for historical vanilla data).

## Work queue (2026-07-30, ordered small→large)

Batch 1 — small wins — **DONE 2026-07-30** (6 agents, verified, 105+623
tests green, SPA rebuilt):
access_level 'none' backend; structures comments key; separators depleted_at
TZ + structure filter; prism support (batteries + electrode batches);
materials family preservation + multiline notes; electrode batch project_ids
wipe guard; tapes: method_comments + solvent volume default + future-date
guard.

Batch 2 — flagship — **DONE 2026-07-30** (incl. P1 actual-AM pivot;
`utils/slurryCalc.js` + 15 tests; rectangle interchangeability relaxation
shipped the same evening): «Расчёт состава» in Vue — per-line percent,
target dry mass, planned mass-to-weigh, expanded component breakdown,
«К добавлению» column in weighing, slurry solids %, solvent compatibility
warning, ≈g/ml conversion (port vanilla calc; then P1 actual-AM-driven
recalc on top). Also recipes include_in_pct semantics reconciliation.

Batch 3 — small workflow-gap fixes — **DONE 2026-07-30** (4 agents green)
(4 agents: separators polish ×3, electrode restore-scrapped + geometry
nulling, head-filter type bug, recipes duplicate pre-check) + recipes
`include_in_pct` derived from role (checkbox removed — simplification;
DB confirmed the flexible state was never used).

Batch 4 — candidates (awaiting go, from remaining discovery findings):
- tapes: side-2 coating payload nulled for one-sided tapes (data hygiene);
  soft gap>0 validation on coating save; tape_type change cascade (clear
  incompatible recipe/material like vanilla); calc_mode-dependent target
  mass label; active-material options filtered by tapeType (not recipe).
- electrodes: per-electrode derived columns + 11-metric capacity summary
  grid (real lab value; medium effort — own item).
- electrolytes/separators: file attach during create (currently only
  after save) — medium UX change.

P2 dry-box removal — **DONE 2026-07-30** (approved + implemented same
evening: d056 `tapes.storage_notes`; «Хранение ленты» card; cut-batch
coupling deleted; gate no-op; availability displayed as активна/израсходована;
5 new component tests + backend pin test).

Left as-is by directive (vanilla retired / accepted V2 patterns):
column-overlay filters vs vanilla filter rows; free-text search;
immediate file upload (no review step); Vue member default access level
`edit` (documented deliberate); materials expand/collapse-all buttons;
coating method defaults autofill + drying_tape↔coating coupling (dropped
per simplification — operator enters values explicitly); mixing param
visibility (collapsible groups instead of hiding); vanilla-only
4-modules stub (dead page, no Vue counterpart needed).
