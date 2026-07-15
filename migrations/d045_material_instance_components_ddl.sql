-- d045_material_instance_components_ddl.sql
-- Captures the material_instance_components table into the migration history.
--
-- WHY: this table (the material-composition / "recipe" links between material
-- instances) exists in the live databases with a full set of constraints —
-- but its DDL was never written into migrations/. That meant a database rebuilt
-- from migrations alone would be MISSING this table, even though
-- services/materialCompositionService.js and its tests depend on it. This
-- migration closes that gap so migrations/ is a complete, rebuildable record.
--
-- Forward-only and idempotent: CREATE ... IF NOT EXISTS means this is a NO-OP
-- on the existing dev/lab databases (the table already exists, untouched) and
-- only does real work on a fresh rebuild. Auto-generated constraint names on a
-- fresh build may differ cosmetically from the live ones, but the structure —
-- columns, PK, UNIQUE(parent, component), the two CHECKs, the two FKs, the two
-- indexes — is identical. See docs/current/database_schema.md.

CREATE TABLE IF NOT EXISTS material_instance_components (
  material_instance_component_id SERIAL PRIMARY KEY,
  parent_material_instance_id    integer NOT NULL
    REFERENCES material_instances(material_instance_id) ON DELETE CASCADE,
  component_material_instance_id integer NOT NULL
    REFERENCES material_instances(material_instance_id) ON DELETE RESTRICT,
  mass_fraction                  numeric NOT NULL,
  notes                          text,
  -- A material instance cannot be a component of itself.
  CONSTRAINT material_instance_components_no_self_reference
    CHECK (parent_material_instance_id <> component_material_instance_id),
  -- Mass fraction is a proportion in [0, 1] (services enforce sum-to-1 per parent).
  CONSTRAINT material_instance_components_mass_fraction_range
    CHECK (mass_fraction >= 0 AND mass_fraction <= 1),
  -- One row per (parent, component) pair.
  CONSTRAINT material_instance_components_parent_component_unique
    UNIQUE (parent_material_instance_id, component_material_instance_id)
);

CREATE INDEX IF NOT EXISTS idx_mic_parent
  ON material_instance_components (parent_material_instance_id);
CREATE INDEX IF NOT EXISTS idx_mic_component
  ON material_instance_components (component_material_instance_id);
