# Materials Inventory Context

Created: unknown
Edited: 2026-05-06
Status: superseded

Superseded by:

- `docs/current/materials.md`
- `docs/rules/material_composition_rules.md`
- `docs/future/materials_capacity_next.md`

## Purpose of the feature

Expand the current `Материалы` page from a simple material + instance tree into a real inventory/traceability tool.

The current page already does these things well:

- create an abstract `material`
- auto-create the corresponding `100% pure` material instance
- create additional material instances
- recursively define mixtures through `material_instance_components`

The next feature should add two major capabilities:

1. store **material properties**
2. store **material source / procurement / batch / quality information**

This should be done without breaking the existing architecture.

The first implementation target is the classic static app in:

- `/Users/Dalia/Developer/RENERA/BADB_main/public/reference/materials.html`
- `/Users/Dalia/Developer/RENERA/BADB_main/public/js/materials.js`
- `/Users/Dalia/Developer/RENERA/BADB_main/routes/materials.js`

The database source of truth is the PostgreSQL app database:

- `badb_app_v1`


## Current architecture that must be preserved

The current schema model is:

- `materials`
  - abstract material definitions
- `material_instances`
  - concrete workflow objects / usable records
- `material_instance_components`
  - recursive composition tree for mixtures and derived instances

Current relevant schema shape:

- `materials(material_id, name, role, ...)`
- `material_instances(material_instance_id, material_id, name, notes, created_at, ...)`
- `material_instance_components(parent_material_instance_id, component_material_instance_id, mass_fraction, notes, ...)`

Important architectural rule:

- `materials` are abstract
- `material_instances` are the concrete usable things
- mixtures stay modeled recursively through `material_instance_components`

This feature should **extend** this model, not replace it.


## What “inventory” means in this lab

Inventory here does **not** just mean stock count.

It means a digital scientific + operational record of a material and its usable forms.

Examples:

- a purchased pure solvent bottle
- a purchased active material batch tied to a passport / certificate
- a binder solution instance
- a conductive additive dispersion
- a recursively defined mixture made from other instances

The most important conceptual distinction is:

- the **100% pure instance** is the instance tied most directly to the purchased batch / supplier documentation
- additional instances can exist underneath it:
  - additional pure instances
  - solutions
  - mixtures
  - derived reusable material preparations

So inventory is really:

- identity
- provenance
- scientific properties
- quality / evaluation
- usability in downstream workflows


## Design principles

1. Keep the existing material/instance recursion model.
2. Do not force a full redesign of the materials page for v1.
3. Add a dedicated **material details** view/page rather than overloading the tree UI.
4. Treat source/procurement information as distinct from generic material identity.
5. Treat material properties and source information as related but separate concerns.
6. Prefer traceability over cleverness.
7. Keep v1 implementation manageable; dynamic “add any parameter” can come later if needed.


## What must be tracked

There are two major data groups.

### 1. Material source / procurement / evaluation data

From `Material Sources Information.md`, the intended new concept is a `material source` record, representing a purchased supplier/lot/batch identity attached to a pure material instance.

Candidate fields:

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

Also potentially useful later:

- `passport_file`
- `certificate_file`
- `storage_location`
- `opened_at`
- `expires_at`

Those file/storage fields are **not required for v1** unless implementation stays easy.


### 2. Material properties

These are scientific or practical values tied to the material record.

Confirmed important ones from the notes:

- for active materials:
  - `specific_capacity_mAh_g`
- likely for solvents and maybe other materials:
  - `density`

Possible future examples:

- `viscosity`
- `purity`
- `water_content`
- `surface_area`
- `particle_size`
- `color`

Important distinction:

- source data describes the purchased batch / procurement record
- properties describe the material itself or the batch-specific measurable property you want to use scientifically

For v1, density and specific capacity are the only clearly justified properties from existing notes.


## Recommended data model direction

### A. Add a new `material_sources` table

Recommended purpose:

- represent purchased source / supplier / lot / evaluation information

Recommended relation:

- one `material` can have many `material_sources`
- one pure `material_instance` can point to one `material_source`

Recommended link:

- add nullable `source_id` to `material_instances`

Rule:

- pure purchased instance -> `source_id` should exist
- derived / composite instance -> `source_id` should usually be `NULL`


### B. Add explicit material property storage

For v1, do **not** start with a fully dynamic parameter system.

Recommended v1 approach:

- a small explicit property table or explicit columns for the first high-value parameters

Best v1 shape:

- `material_properties`
  - `material_id`
  - `specific_capacity_mAh_g`
  - `density_g_ml`
  - maybe `notes`

Why this is recommended:

- very easy to reason about
- easy to validate
- easy to expose in UI
- directly supports upcoming calculations

Why not start with fully dynamic parameters:

- more tables
- more UI complexity
- parameter-definition governance becomes its own subsystem
- type/unit handling becomes a real design problem

Dynamic parameters are a good future feature, but not the best first step.


## UI / UX direction

### Main materials page

The current page should continue to show:

- materials
- instances
- recursive composition

It should remain the main browsing/creation page.

Minimal enhancement:

- add a `Детали` button or link on the **pure instance** row
- that opens a new details page/tab for that specific material instance

Updated decision:

- every material instance gets a `+ Details` button
- only pure material instances get a `+ Source Info` button
- these should open **two separate pages**

So the earlier “one details page with two fieldsets” idea is no longer the preferred design.


### Material properties page

Recommended purpose:

- edit the scientific / technical properties for the selected material instance

Recommended sections:

1. `Свойства материала`
   - specific capacity for active materials
   - density where relevant
   - maybe a few other future fields later

Recommended display context at top:

- material name
- role
- instance name

Availability:

- available for **all** material instances


### Material source info + quality page

Recommended purpose:

- edit the procurement / supplier / lot / quality record for a pure purchased material instance

Recommended sections:

1. `Информация об источнике / партии`
   - supplier / brand / catalog / lot
   - ordered/received dates

2. `Оценка качества`
   - quality rating label
   - quality rating score
   - evaluation notes

Recommended display context at top:

- material name
- role
- pure instance name

Availability:

- available **only on 100% pure instances**


## What actions must be supported

### Already supported and must remain working

- create abstract material
- auto-create pure instance
- create additional instances
- recursively define composition
- edit/delete materials and instances


### New actions for this feature

1. Open material properties page from any material instance.
2. Open source info + quality page from pure instances only.
3. View existing source information for a pure instance.
4. Edit and save source information.
5. View existing material properties for any instance.
6. Edit and save material properties.
7. Display source quality state in a lightweight way on the main materials page for pure instances.


## What should happen automatically vs manually

### Automatic behavior

When a new material is created:

1. create `materials` row
2. auto-create one pure `material_instance`
3. auto-create an empty linked `material_source`

Recommended choice:

- yes, auto-create the linked source record for the initial pure instance

Why:

- simpler backend
- simpler UI
- simpler save logic
- avoids “record missing vs record empty” branching

When a new additional **pure** instance is created:

- optionally auto-create a new empty `material_source`

When a new **derived/composite** instance is created:

- do **not** auto-create a `material_source`


### Manual behavior

The user manually enters:

- source/procurement details
- quality rating / score / notes
- material properties

The user should also manually decide whether a property is known or left blank.


## Pages / layers touched

### Database

- new migration(s)
- app DB: `badb_app_v1`

Likely affected tables:

- `material_instances` -> add `source_id`
- new `material_sources`
- new `material_properties` or equivalent


### Backend

- `/Users/Dalia/Developer/RENERA/BADB_main/routes/materials.js`

Need:

- details fetch route
- details save/update route
- source-aware material instance reads
- maybe quality indicator data in the main list payload


### Static frontend

- `/Users/Dalia/Developer/RENERA/BADB_main/public/reference/materials.html`
- `/Users/Dalia/Developer/RENERA/BADB_main/public/js/materials.js`
- new material properties page, likely something like:
  - `/Users/Dalia/Developer/RENERA/BADB_main/public/reference/material-details.html`
  - `/Users/Dalia/Developer/RENERA/BADB_main/public/js/material-details.js`
- new material source info page, likely something like:
  - `/Users/Dalia/Developer/RENERA/BADB_main/public/reference/material-source-info.html`
  - `/Users/Dalia/Developer/RENERA/BADB_main/public/js/material-source-info.js`


### Vue frontend

Not required for v1.

The static app is the implementation target unless later explicitly expanded.


## Relationship to future calculations

This inventory feature is foundational for later calculations.

From the capacity notes:

- `specific_capacity_mAh_g` belongs at the material level
- later, electrodes can compute:
  - total capacity
  - areal capacity

Density is also relevant later for:

- mass/volume conversions
- solvent calculations

So v1 inventory should deliberately support future:

- capacity calculations
- density-based mass calculations

But it should **not** try to implement all those calculations now.


## What is in scope for v1

1. Extend materials inventory with real source tracking.
2. Add a dedicated material properties page for all instances.
3. Add a dedicated material source info + quality page for pure instances only.
4. Support at least:
   - supplier / lot / dates / quality fields
   - specific capacity for active materials
   - density field if implementation remains straightforward
5. Add `+ Details` to all instances and `+ Source Info` to pure instances.
6. Add a lightweight quality/source indicator to the main materials page for pure instances.
7. Preserve recursive instance/mixture behavior exactly as it already works.


## What is out of scope for v1

1. Full stock accounting / quantity-on-hand system.
2. Automatic consumption of inventory by workflow steps.
3. Full dynamic “+ add any parameter” system.
4. File attachment system for certificates/passports, unless it turns out to be trivial.
5. Vue frontend parity.
6. Capacity calculations themselves.
7. Density-based calculations themselves.


## Recommended v1 implementation order

1. Inspect current live schema in `badb_app_v1`.
2. Add schema migration for:
   - `material_sources`
   - `material_instances.source_id`
   - material properties storage
3. Update backend routes.
4. Add material properties page.
5. Add material source info + quality page.
6. Add `+ Details` for all instances.
7. Add `+ Source Info` for pure instances.
8. Add lightweight source/quality indicator on the main materials page.
9. Smoke test:
   - new material
   - auto-created pure instance
   - properties page opens from any instance
   - source info page opens from pure instance only
   - source data saves
   - properties save
   - recursive mixtures still behave correctly


## Open decisions

These are the only unresolved design questions that still seem real.

### 1. Where should density live?

Recommendation:

- start by putting `density_g_ml` in generic material properties

Reason:

- it may be most common for solvents
- but it is conceptually cleaner to store it in the generic property layer
- avoids redesign later if another role also needs density


### 2. Should quality belong to source or instance?

Recommendation:

- quality belongs to `material_source`

Reason:

- the source/batch is what gets evaluated
- the pure instance only displays / points to that source record


### 3. Should dynamic parameters be part of v1?

Recommendation:

- no

Do explicit first.
If the inventory feature proves useful and stable, dynamic parameters can be added later as a separate phase.


## Summary

The materials inventory feature should be implemented as a careful extension of the existing:

- `materials`
- `material_instances`
- `material_instance_components`

model.

The clean v1 is:

- keep the current recursive materials architecture
- add `material source` tracking for pure instances
- add a dedicated material properties page for all instances
- add a dedicated source info + quality page for pure instances
- add a small, explicit set of material properties
- support future scientific calculations without trying to solve them all now

This keeps the feature practical, scientifically useful, and realistically buildable in the current BADB app.
