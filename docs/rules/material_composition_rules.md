# Material Composition Rules

Created: 2026-05-06
Edited: 2026-05-06
Status: rule
Verified against code: 2026-05-06

Source paths:

- `routes/materials.js`
- `services/materialCatalogService.js`
- `services/materialInstanceService.js`
- `services/materialCompositionService.js`
- `services/materialInfoService.js`
- `services/tapeWorkflowService.js`
- `services/electrodeCapacityService.js`
- `public/js/materials.js`
- local `badb_app_v1` schema inspection on 2026-05-06

These are the current hard rules for the Materials model.

## Identity vs Instance

Materials are abstract identities.

Material instances are concrete usable lab things.

Recipes reference materials. Tape execution and mixture actuals select material
instances.

Do not store real composition in free-text comments when it needs to affect
planning, density, solids, or capacity behavior.

## Composition Lives On Instances

Composition rows are stored in:

```text
material_instance_components
```

Both parent and component references are material instance ids:

- `parent_material_instance_id`
- `component_material_instance_id`

Do not model composition as material-to-material rows. Composition is about
physical instances, not only abstract chemistry names.

## Component Choices

Components must be selected from existing material instances.

No free-text component names. If water, NMP, PVDF powder, or another component
appears in a real composition, it needs a material identity and at least one
material instance before it can be used as a component.

## Pure Instances

An instance with no component rows is treated as pure for current system
behavior.

Purity is computed from absence of child rows in
`material_instance_components`; it is not stored as a boolean column.

Source info is available only for instances that are pure at request time.

## Full Composition Editor

The canonical composition save path is:

```text
PUT /api/materials/instances/:id/components
```

This path replaces the full composition for the parent instance and validates:

- components array is nonempty;
- every component id is a valid integer;
- no component is the same instance as the parent;
- no duplicate component appears in one payload;
- every mass fraction is greater than 0 and at most 1;
- total mass fraction is exactly 100 percent within service tolerance.

Use this route for complete composition edits.

The single-row add/update/delete component routes still exist for compatibility
and smoke coverage, but they are not the preferred way to assert a complete
100 percent composition.

## Calculation Boundary

Tape planning and tape reports recursively expand selected material instances
through nested `material_instance_components` rows until leaf materials are
reached. Overlapping dry-material contributions from one recipe line must be
subtracted before calculating later top-up lines, independent of display order.

Other downstream helpers should document their own calculation boundary until
they are explicitly migrated to the same shared recursive behavior.

## Naming

Use database-native names in new docs and code:

- `specific_capacity_mah_g`
- `density_g_ml`
- `mass_fraction`
- `actual_volume_ml`

The API compatibility alias `specific_capacity_mAh_g` exists only for existing
callers and smoke coverage.
