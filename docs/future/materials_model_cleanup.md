# Materials Model Cleanup — Design Spec

Created: 2026-07-28
Edited: 2026-07-28
Status: future idea (PROPOSAL — awaiting Dalia's review; not implemented)

Source paths:

- `services/materialCatalogService.js`
- `services/materialInstanceService.js`
- `services/materialInfoService.js`
- `docs/current/materials.md`
- `client-web/src/pages/reference/MaterialsPage.vue`
- `public/js/materials.js`
- live `badb_app_v1` inspection, 2026-07-28

This spec proposes a cleanup of the materials model before the Windows lab
cutover. It exists because the Materials page reads as confusing to its own
author, and because the catalog is the one part of the app that gets
**expensive to change after real lab data accumulates**. Everything here is
either a data-model change (do it before launch) or a UI change (safe to do
after) — each item is marked.

Nothing in this document is implemented. Review and mark it up first.

---

## 1. What is actually wrong today

Three separate problems are tangled together and read as one confusing page.

### 1.1 "Pure" does not mean what it looks like it means

`is_pure` is **computed, never stored**: an instance is "pure" when nothing
appears under it in `material_instance_components`
(`materialInstanceService.js:27`). It means **"not a mixture of other tracked
instances"** — a leaf in the composition graph. It is *not* a chemical purity
claim.

The word is also **frozen into the instance name at creation**
(`materialCatalogService.js:38` writes `«<name> (чистый)»`) while the real
state is recomputed on every read. Add components to that instance later and
the name still says «(чистый)» — the stored name can contradict the computed
state. Names must not encode computed state (the same lesson as the recipe
slot marker in d047).

### 1.2 The instance layer is load-bearing in one half of the catalog and hollow in the other

Measured on `badb_app_v1`, 2026-07-28:

| | Instances | Real mixtures | Supplier filled | Lot filled |
|---|---|---|---|---|
| Active materials | 16 | **0** | 0 | 0 |
| Binders / additives / solvents | 17 | **8** | 0 | 0 |

For auxiliaries the model works exactly as designed — «5% PVDF в NMP»,
«1.5% CMC в воде», «0,4% ОУНТ в NMP» are genuine composite instances built
from leaf ingredients, and they are what tapes actually consume. There
«PVDF (чистый)» is meaningful: dry PVDF as an ingredient, contrasted with the
solution.

For active materials there is nothing to contrast with: 14 auto-created
placeholders, no mixtures, no suppliers, no lots. The suffix is not wrong
there — it is **meaningless**.

**Root cause:** the instance/composition layer is a *preparation* mechanism.

- **Active materials vary by classification** — NMC 811 vs LFP. They are never
  dissolved; the powder is weighed as received.
- **Auxiliary materials vary by preparation** — PVDF is PVDF; what changes is
  the usable form (dry, 5% in NMP, 7% in NMP).

Actives are never prepared, so their instance layer is empty ceremony. This is
why the same UI feels right for binders and wrong for actives.

### 1.3 Supplier and grade are being written into names

`material_sources` has `supplier`, `brand`, `model_or_catalog_no`,
`lot_number`, `date_received`. **All are empty across the entire catalog.**
Meanwhile supplier/grade appear inside material names — "NMC 811 ETI",
"NMC 811 BTR M2C2" — and once inside an instance name ("MAXTON AML403").

This is the workflow voting, not user error. The fields designed to hold this
live two levels down behind the instance, and nothing routes the user there.
Post-d047 there is also real pressure to do it: **the tape names its active
material at the top level**, so anything you want visible per tape has to be
the material.

---

## 2. Decisions taken (Dalia, 2026-07-27/28)

| # | Decision |
|---|---|
| D1 | **Materials are products**, not chemistries: "NMC 811 BTR M2C2", "LFP S19". `family` carries the chemistry class. |
| D2 | **Manufacturer belongs to the product**; the vendor/lot belongs to the purchase. |
| D3 | **No «Другое» option.** Users may create new entries, but duplicates must be caught at creation. |
| D4 | **Placeholders render in an attention style (red)** so incompleteness stays uncomfortable. |
| D5 | Family taxonomy approved, including families for materials not yet purchased. |
| D6 | Compatibility validation moves **pre-launch** (the data is already derivable). |
| D7 | Li foil is **not** a material yet — deferred, see §9. |
| D8 | `SiC` is a **silicon-carbon composite**, family `Si-based`. |

---

## 3. The model after cleanup

```
material type (role)         active cathode / active anode / binder / additive / solvent
  └── family                 NMC, LFP, SG, HC …        [actives; not used for solvents]
       └── MATERIAL          the product: "AML 403", "NMC 811 BTR M2C2", "PVDF"
            │                 + manufacturer (BTR, Zichen, Solvay …)
            └── INSTANCE     a physical lot  OR  a prepared form
                              lot:  supplier, lot number, dates, quality rating
                              prep: composition → the lots it was made from
```

Two clarifications that resolve most of the confusion:

**The hierarchy is `substance → lot → prepared form`, not `substance → form → lot`.**
You buy a bag of dry PVDF (a lot), then prepare a solution *from that bag* plus
a specific bottle of NMP. Preparations are downstream of lots and consume them.
`material_instance_components` already models this correctly — a prepared
instance points at the component instances it was made from. It is not a strict
tree; it is "leaves are lots, preparations reference leaves."

**«(чистый)» currently means "lot unspecified" — in both halves of the catalog.**
`NMC 811 ETI (чистый)` and `PVDF (чистый)` represent exactly the same thing: the
material with no lot recorded. One fix covers both.

---

## 4. Family taxonomy (D5)

Controlled vocabulary, scoped by role — **not** free text. Free text is why the
anode materials have no family at all today: nothing offered them a choice.

**Cathode active:**
`NMC` · `NCA` · `LFP` · `LMFP` · `LCO` · `LMO` · `LNMO` (high-voltage spinel) ·
`NVP` (Na-ion) · `Na-слоистые` (NaNMC-type)

**Anode active:**
`SG` — синтетический графит *(replaces the informal "AG"; artificial = synthetic)* ·
`NG` — природный графит ·
`HC` — твёрдый углерод *(also the standard Na-ion anode)* ·
`LTO` ·
`Si-based` — SiOx / Si-C ·
`Li металл` *(reserved; see §9)*

**Binders, additives, solvents:** no family. Inventing one would be noise
(confirmed with Dalia). Their variation axis is preparation, not classification.

Disambiguating notes stay attached to the family labels in the UI — answering
these questions once teaches the taxonomy, which is a deliberate side benefit.

---

## 5. Schema changes (PRE-LAUNCH)

All forward-only, in one migration (proposed `d051`).

1. **`materials.manufacturer`** (text, nullable) — who makes the product (D2).
   Distinct from `material_sources.supplier`, which stays on the instance and
   records who sold you *this bag*. This gives both questions an answer: "is
   BTR's graphite good?" (product, aggregates across lots) and "was that one
   batch bad?" (lot).

2. **`material_families`** reference table — `(family_id, code, label, role,
   sort_order, notes)`, seeded from §4. Replaces free-text `materials.family`
   as the source of the picker. `materials.family` stays as-is for now
   (deprecate in place; backfill from the new table).

3. **Backfill** — set families on the anode materials, which currently have
   none, and manufacturers where known (§7).

**Not changed:** `material_instances`, `material_instance_components`,
`material_sources`. They are correct; only their presentation and the moment
they are asked for change.

---

## 6. UI changes

### 6.1 Retire «(чистый)» from stored names — PRE-LAUNCH (data)

New auto-created instances are named for what they are — the material name with
no purity claim — and composition state is shown as a **computed badge**, never
stored in the name:

- «исходный» — a leaf: as-received or as-purchased ingredient
- «приготовленный» — a prepared mixture, composed of other instances

Existing «(чистый)» names are rewritten by the same migration. This is a data
change, hence pre-launch.

### 6.2 Missing vs not applicable — PRE-LAUNCH (cheap, prevents support questions)

Two states that currently look identical must not:

| State | Rendering |
|---|---|
| **Missing** — should be filled, is not | attention/red: «Производитель: неизвестен», «Партия не указана», «Оценка: не проводилась» |
| **Not applicable** — legitimately empty | calm muted text: «Li (полуячейка)» for a half-cell counter electrode, «—» for a solvent's family |

The half-cell case is the live example: batteries #1 and #2 show blank
cathode/anode cells because a half cell has only one electrode from the lab —
correct data, mute display, and it already cost the project owner a support
question.

### 6.3 Duplicate prevention instead of «Другое» (D3) — PRE-LAUNCH

Users may create new materials and families freely; duplicates are caught at
creation:

1. Compute a comparison **fingerprint**: lowercase → trim → collapse whitespace
   → strip hyphens/punctuation → map confusable Cyrillic letters to Latin
   (`А В Е К М Н О Р С Т У Х` → `A B E K M H O P C T Y X`).
   Without this step «НМС 811» and "NMC 811" are visually identical and would
   silently fragment the catalog.
2. On collision, **warn — never block**: «Похоже на существующий "NMC 811" —
   использовать его?» with a one-click «нет, это другой материал».
3. Store only what the user typed. The fingerprint is for comparison only.

The same helper serves the recipe duplicate-detection designed earlier — one
function, two callers.

### 6.4 Three moments, not one form — PRE-LAUNCH (routing), POST-LAUNCH (polish)

Today every question is asked at material-creation time — when the user knows
least and cares least — and the question the lab actually wants answered is
asked never (`is_evaluated=false` is set at creation and nothing returns to it).

| When | Question | Who is motivated |
|---|---|---|
| Creating a material | what is it? (name, role, family, manufacturer) | anyone, ~15 seconds |
| **A bag arrives** | supplier, lot, date received | the person unpacking it |
| **After results exist** | did it perform? reorder? | Dalia / management, with cycling data in hand |

Nothing is removed — the evaluation feature becomes *better*, because the app
can prompt with evidence attached: «На BTR M2C2 сделано 5 лент, есть
циклирование — оценить поставщика?» That is how the lab-management requirement
survives without taxing daily work.

### 6.5 Guided creation flow — POST-LAUNCH

A branch-by-type wizard (PrimeVue `Stepper`, already available — **no React
and no new dependency**), 3–4 questions maximum, each with a sensible default
and an «уточню позже» escape. A required field a technician cannot answer at
2pm produces either abandonment or a lie; both are worse than a blank.

Principles: wizard for the rare high-stakes action (creating a material,
~weekly); never a wizard for the frequent action (picking a material for a
tape, daily). Confirm beats type — typing "NMC 811 BTR M2C2" should pre-fill
family `NMC` for confirmation rather than asking.

**Note:** Dalia will populate the catalog herself from the shared-folder
documents. That decision does most of the adoption work on its own — if the
catalog arrives curated, technicians never meet a creation form at all and only
ever select from a clean list.

---

## 7. Renaming and backfill pass (PRE-LAUNCH)

Active materials, from live data. Names in the "keep" column are unchanged;
the work is filling `family` and `manufacturer`.

| Material | Tapes | family | manufacturer | Action |
|---|---|---|---|---|
| `AML 403` | 1 | `SG` | BTR | keep name; fold the "MAXTON AML403" instance name into the manufacturer field |
| `S360` | 1 | `SG` | BTR | keep name |
| `CS11G` | 1 | `SG` | Zichen (PTL) | keep name |
| `HC` | 1 | `HC` | неизвестен | generic name; rename when the grade is known |
| `SiC` | 1 | `Si-based` | неизвестен | confirmed Si-C composite (D8) |
| `LTO` | 0 | `LTO` | неизвестен | fine as a placeholder |
| `NMC 811` | 0 | `NMC` | неизвестен | **unused** — free to restructure |
| `NMC 811 ETI` | 0 | `NMC` | ETI | **unused** |
| `NMC 811 BTR M2C2` | 0 | `NMC` | BTR | **unused** |
| `LFP S19` | 6 | `LFP` | ? | load-bearing — name stays, add manufacturer |
| `NMC C85E` | 1 | `NMC` | ? | load-bearing — name stays, add manufacturer |
| `NCA`, `NVP` | 1 / 0 | `NCA`, `NVP` | неизвестен | honest placeholders until a real grade is bought |

Unknown manufacturers are written as `неизвестен` and rendered red (D4), so the
gaps stay visible rather than silently absent.

**Caution on capacity figures:** `specific_capacity_mah_g` feeds every
downstream capacity and N/P calculation. Take those numbers from supplier
datasheets, not from summaries — a value 5% off silently biases every computed
result in the app.

---

## 8. Compatibility validation (PRE-LAUNCH, D6)

There is **no chemical compatibility checking today**. The only compatibility
logic in the tape flow is the d047 role check (cathode material ↔ cathode
recipe). Nothing prevents pairing CMC/SBR with NMP, or PVDF with water — the
app will compute masses for a slurry that cannot physically work.

**No new field is needed.** The processing system is derivable from data
already being entered: walk a prepared instance's components down to its
solvent — «1.5% CMC в воде» → Вода, «5% PVDF в NMP» → NMP. Compare the solvents
implied by the chosen instances on one tape and warn on a mismatch.

Warn, do not block: unusual formulations are legitimate research.

---

## 9. Deferred (explicitly not now)

- **Li foil as a material.** Currently free text on the coin config
  (`half_cell_type`, `li_foil_notes`). It has a supplier, a thickness and a lot,
  and it affects results — but promoting it touches the battery config model.
  Revisit after launch (D7).
- **«% в пасте» column header** on the recipe composition table. The 100% basis
  excludes solvent, so the number is percent *of dry solids*, not of the paste.
  Rewording pending approval.
- **Guided creation wizard** (§6.5).
- **Water-based vs NMP-based tagging** as an explicit field — unnecessary; §8
  derives it.

---

## 10. Open questions

1. `LFP S19` and `NMC C85E` — manufacturers?
2. Should the generic placeholders (`LTO`, `NCA`, `NVP`, `HC`) be renamed now,
   or left honest until a specific grade is purchased?
3. Anything to add to the family lists for materials likely to be bought in the
   next year?

---

## Sequencing summary

**Before the Windows cutover** (expensive to change once real data lands):
§5 schema, §6.1 name retirement, §6.2 missing-vs-N/A, §6.3 duplicate
prevention, §7 backfill, §8 compatibility validation.

**After launch** (cheap at any time): §6.5 wizard, §9 deferred items.
