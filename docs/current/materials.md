# Materials

Created: 2026-05-06
Edited: 2026-07-28
Status: current
Verified against code: 2026-05-06

Source paths:

- `routes/materials.js`
- `services/materialCatalogService.js`
- `services/materialInstanceService.js`
- `services/materialCompositionService.js`
- `services/materialInfoService.js`
- `services/materialFileService.js`
- `public/js/materials.js`
- `public/js/material-details.js`
- `public/js/material-source-info.js`
- `migrations/d026_add_material_sources_and_properties.sql`
- `migrations/d027_add_material_source_and_property_files.sql`
- local `badb_app_v1` schema inspection on 2026-05-06

This document describes the current Materials reference workflow. Composition
rules live in `docs/rules/material_composition_rules.md`. Capacity behavior
lives in `docs/current/capacity_calculations.md`.

## Model

The current materials model has three main levels:

- `materials`: the PRODUCTS used in recipes ("LFP S19", "AML 403"). Since
  d052 each active material carries `family` (picked from the role-scoped
  `material_families` vocabulary — free text deprecated in place) and an
  optional `manufacturer` (who makes the product; distinct from
  `material_sources.supplier` = who sold a particular bag). Missing
  family/manufacturer on active materials render red in the UI; families
  do not apply to binders/additives/solvents and are hidden there;
- `material_instances`: concrete usable lab things, such as a purchased batch,
  powder, solution, dispersion, or prepared mixture;
- `material_instance_components`: instance-level composition rows that define
  what one material instance contains.

The practical distinction is:

- a recipe states formulation intent through `materials.material_id` for its
  supporting lines; the active line is an open slot (d047), and the active
  material is chosen per tape (`tapes.active_material_id`);
- tape execution selects concrete `material_instances.material_instance_id`;
- composition is attached only to material instances.

## Material Roles

Current database role enum values include:

- `active`
- `cathode_active`
- `anode_active`
- `binder`
- `conductive_additive`
- `solvent`
- `other`

The current Materials UI displays the active battery roles as separate cathode
and anode active roles. Recipe and capacity logic identify active lines by
`cathode_active` and `anode_active`.

## Creation Flow

Creating a material through `POST /api/materials` does more than insert the
abstract material row.

Current service behavior:

1. insert `materials(name, role)`;
2. auto-create one material instance named plainly after the material —
   since d052 WITHOUT the old «(чистый)» suffix: leaf-vs-mixture is a
   computed state shown as an «исходный»/«приготовленный» badge, never
   stored in names (d052 also renamed existing auto-generated instances);
   duplicate material names are caught at creation by a homoglyph-folding
   fingerprint (warn, never block);
3. auto-create a blank `material_sources` row with `quality_rating_label =
   'tbd'` and `is_evaluated = false`;
4. link the auto-created instance to that source through
   `material_instances.source_id`.

Additional instances are created under a material with
`POST /api/materials/:id/instances`. Since the «bag arrival» flow
(2026-07-28) the add-instance form in both frontends asks, for raw
(«исходный») instances, the supplier, lot number and receipt date at the
moment the bag enters the lab — written to the ensured `material_sources`
row in the same transaction; all optional. The instance name is
auto-suggested as «<материал> — партия <lot>» until edited. Unchecking
«исходный» creates a prepared-mixture instance with no source questions.

If an additional instance is created with `is_pure: true`, the service creates
or ensures a linked material source for it. Composite or derived instances
normally have no source information page.

## Main Materials Page

The current Materials page is a nested tree:

```text
Material
  Material instance
    Direct component rows
```

Current page behavior:

- create, edit, delete, sort materials;
- create, edit, delete material instances;
- expand an instance to view its direct components;
- edit composition through the full composition editor;
- open material properties for any instance;
- open source info only for instances currently computed as pure.

Purity is not a stored boolean. The service treats an instance as pure when it
has no rows in `material_instance_components` where it is the parent.

## Source Info

Source info is stored in `material_sources` and linked from pure material
instances through `material_instances.source_id`.

Current fields:

- `supplier`
- `brand`
- `model_or_catalog_no`
- `lot_number`
- `date_ordered`
- `date_received`
- `quality_rating_label`
- `quality_rating_score`
- `evaluation_notes`
- `is_evaluated`

Allowed quality labels:

- `good`
- `ok`
- `bad`
- `tbd`

Quality score is optional and must be 1 through 5 when present.

The source-info service enforces that source info is available only for
instances that are pure at the time of the request. Source rating belongs to
the source row, not directly to the abstract material.

## Properties

Material properties are stored per material instance in `material_properties`.

Current fields:

- `specific_capacity_mah_g`
- `density_g_ml`
- `notes`

There is one properties row per material instance. The service creates or
updates it through `PUT /api/materials/instances/:id/properties`.

`specific_capacity_mah_g` and `density_g_ml` are optional, non-negative numbers.
The API still accepts and returns `specific_capacity_mAh_g` as a compatibility
alias, but the database-native spelling is `specific_capacity_mah_g`.

## Files

Material source and property files are stored in the database as bytea rows.

Current file tables:

- `material_source_files`
- `material_property_files`

Current file routes support:

- list files for a material instance;
- upload base64 file entries;
- download individual files;
- delete individual files.

## Deletion

Material deletion is blocked when the material is still used by:

- `material_instances`;
- `tape_recipe_lines`;
- `tapes.active_material_id` (tapes that chose it as their active material).

Material instance deletion is blocked when the instance is still used by:

- another instance composition as a component;
- `tape_recipe_line_actuals`.

Deleting a material instance removes its property row and property files. If the
instance had a linked source and no remaining instances use that source, the
service also deletes the source files and source row.

## Current Boundaries

The Materials page is good enough for the current release direction. Do not
redesign it casually.

Current non-goals:

- stock accounting or quantity-on-hand tracking;
- automatic inventory consumption;
- dynamic arbitrary property definitions;
- shared recursive composition behavior across every capacity helper;
- Vue parity unless explicitly requested.
