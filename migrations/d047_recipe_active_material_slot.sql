-- d047_recipe_active_material_slot.sql
-- Decouples tape recipes from their active material: a recipe becomes a
-- reusable formulation ("96 x : 2.2 Super P : 1.8 PVDF") whose active line is
-- an open slot (material_id IS NULL), and each tape now names its own active
-- material via the new tapes.active_material_id column.
--
-- WHY: recipes were duplicated once per active material even when the
-- formulation was identical (NMC C85E / NMC M2C2 / NMC 811 all carried the
-- same 96 : 2.2 : 1.8 line set). The active material is a property of the
-- tape, not of the formulation, so it moves to the tape. The solution
-- concentration (5% vs 7% PVDF in NMP) is a material_instance chosen at
-- actuals time and is NOT part of recipe identity. Supporting materials
-- (Super P vs KS-6 vs CNT, PVDF vs CMC+SBR, solvent) ARE part of recipe
-- identity and stay on the recipe lines.
--
-- WHAT:
--   1. materials.family (text, nullable) - grouping label for material
--      pickers (NMC / LFP / NCA / ...). Best-effort backfill from obvious
--      name prefixes; anything else stays NULL and is editable in the UI.
--   2. tapes.active_material_id - FK to materials, backfilled from each
--      tape's recipe active line.
--   3. tape_recipe_lines.material_id becomes NULLable; active lines
--      (recipe_role cathode_active/anode_active) get material_id = NULL -
--      the open slot. A CHECK enforces: active line <=> material_id IS NULL.
--   4. One-off dedup: recipes with the same electrode role and identical
--      line sets (recipe_role, material_id, slurry_percent, include_in_pct;
--      line_notes are NOT compared) merge into the lowest-id survivor.
--      Tapes and tape_recipe_line_actuals are remapped line-for-line BEFORE
--      duplicates are deleted; merged and previous names are preserved in
--      the survivor's notes for traceability.
--   5. Every recipe is renamed to the composition-derived form
--      "96 x : 2.2 Super P : 1.8 PVDF" (active slot rendered as "x",
--      solvent / include_in_pct=false lines excluded; order: active,
--      then additives, then binders, larger percent first).
--
-- SAFETY: no IDs or names are hardcoded - the dedup and renames are computed
-- from whatever the target database holds, so this same file is safe on the
-- dev database and on the lab database with real production data. The data
-- steps run exactly once, guarded by this migration's own schema_migrations
-- row, inside a single DO block (one statement = atomic: it either fully
-- applies or fully rolls back). Re-running the migrations folder afterwards
-- is a no-op and never clobbers later manual edits (e.g. renamed recipes).
-- DDL steps are IF NOT EXISTS / idempotent as usual.
-- See docs/current/database_schema.md.

-- ── DDL (idempotent) ─────────────────────────────────────────────────

ALTER TABLE materials ADD COLUMN IF NOT EXISTS family text;

ALTER TABLE tapes ADD COLUMN IF NOT EXISTS active_material_id integer
  REFERENCES materials(material_id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_tapes_active_material_id
  ON tapes (active_material_id);

ALTER TABLE tape_recipe_lines ALTER COLUMN material_id DROP NOT NULL;

-- ── One-off data migration (atomic, runs exactly once) ───────────────

DO $$
DECLARE
  grp RECORD;
  dup_id integer;
BEGIN
  IF EXISTS (SELECT 1 FROM schema_migrations
              WHERE migration_name = 'd047_recipe_active_material_slot.sql') THEN
    RAISE NOTICE 'd047 data migration already applied; skipping.';
    RETURN;
  END IF;

  -- (a) Best-effort family backfill from unambiguous name prefixes.
  UPDATE materials SET family = 'NMC'      WHERE family IS NULL AND name ILIKE 'NMC%';
  UPDATE materials SET family = 'LFP'      WHERE family IS NULL AND name ILIKE 'LFP%';
  UPDATE materials SET family = 'NCA'      WHERE family IS NULL AND name ILIKE 'NCA%';
  UPDATE materials SET family = 'NVP'      WHERE family IS NULL AND name ILIKE 'NVP%';
  UPDATE materials SET family = 'LTO'      WHERE family IS NULL AND name ILIKE 'LTO%';
  UPDATE materials SET family = 'Graphite' WHERE family IS NULL AND name ILIKE 'graphite%';

  -- (b) Each tape learns its active material from its recipe's active line.
  UPDATE tapes t
     SET active_material_id = al.material_id
    FROM (
      SELECT DISTINCT ON (tape_recipe_id) tape_recipe_id, material_id
        FROM tape_recipe_lines
       WHERE recipe_role IN ('cathode_active', 'anode_active')
         AND material_id IS NOT NULL
       ORDER BY tape_recipe_id, recipe_line_id
    ) al
   WHERE t.tape_recipe_id = al.tape_recipe_id
     AND t.active_material_id IS NULL;

  -- (c) Open the active slot on every recipe.
  UPDATE tape_recipe_lines
     SET material_id = NULL
   WHERE recipe_role IN ('cathode_active', 'anode_active')
     AND material_id IS NOT NULL;

  -- (d) Merge recipes that are now identical.
  --     Canonical signature = electrode role + every line's
  --     (recipe_role, material_id, trimmed percent, include_in_pct),
  --     deterministically ordered. Actuals are remapped line-for-line by
  --     pairing the identically-sorted line lists (a bijection, since the
  --     signatures match), so the UNIQUE (tape_id, recipe_line_id) guard
  --     holds; if pathological drifted data ever violated it, this whole
  --     block aborts cleanly rather than half-applying.
  FOR grp IN
    WITH canon AS (
      SELECT r.tape_recipe_id,
             r.role,
             string_agg(
               l.recipe_role::text || '|'
                 || COALESCE(l.material_id::text, 'x') || '|'
                 || COALESCE(trim_scale(l.slurry_percent)::text, '-') || '|'
                 || l.include_in_pct::text,
               ';'
               ORDER BY l.recipe_role::text,
                        COALESCE(l.material_id, -1),
                        COALESCE(l.slurry_percent, -1),
                        l.include_in_pct
             ) AS sig
        FROM tape_recipes r
        JOIN tape_recipe_lines l ON l.tape_recipe_id = r.tape_recipe_id
       GROUP BY r.tape_recipe_id, r.role
    )
    SELECT role, sig,
           min(tape_recipe_id)                          AS survivor_id,
           array_agg(tape_recipe_id ORDER BY tape_recipe_id) AS ids
      FROM canon
     GROUP BY role, sig
    HAVING count(*) > 1
  LOOP
    FOREACH dup_id IN ARRAY grp.ids LOOP
      CONTINUE WHEN dup_id = grp.survivor_id;

      WITH dup_lines AS (
        SELECT recipe_line_id,
               row_number() OVER (
                 ORDER BY recipe_role::text,
                          COALESCE(material_id, -1),
                          COALESCE(slurry_percent, -1),
                          include_in_pct,
                          recipe_line_id
               ) AS rn
          FROM tape_recipe_lines
         WHERE tape_recipe_id = dup_id
      ),
      surv_lines AS (
        SELECT recipe_line_id,
               row_number() OVER (
                 ORDER BY recipe_role::text,
                          COALESCE(material_id, -1),
                          COALESCE(slurry_percent, -1),
                          include_in_pct,
                          recipe_line_id
               ) AS rn
          FROM tape_recipe_lines
         WHERE tape_recipe_id = grp.survivor_id
      ),
      line_map AS (
        SELECT d.recipe_line_id AS from_id, s.recipe_line_id AS to_id
          FROM dup_lines d
          JOIN surv_lines s USING (rn)
      )
      UPDATE tape_recipe_line_actuals a
         SET recipe_line_id = m.to_id
        FROM line_map m
       WHERE a.recipe_line_id = m.from_id;

      UPDATE tapes
         SET tape_recipe_id = grp.survivor_id
       WHERE tape_recipe_id = dup_id;

      UPDATE tape_recipes s
         SET notes = COALESCE(s.notes || E'\n', '')
                     || 'd047: merged duplicate recipe "' || d.name
                     || '" (id ' || d.tape_recipe_id || ') into this one.'
        FROM tape_recipes d
       WHERE s.tape_recipe_id = grp.survivor_id
         AND d.tape_recipe_id = dup_id;

      DELETE FROM tape_recipes WHERE tape_recipe_id = dup_id;  -- lines cascade
    END LOOP;
  END LOOP;

  -- (e) Rename every recipe from its composition, keeping the old name in
  --     notes. Solvent (include_in_pct = false) lines are not in the name.
  UPDATE tape_recipes r
     SET notes = COALESCE(r.notes || E'\n', '')
                 || 'd047: renamed from "' || r.name || '".',
         name  = gen.gen_name
    FROM (
      SELECT l.tape_recipe_id,
             string_agg(
               trim_scale(l.slurry_percent)::text || ' ' || COALESCE(m.name, 'x'),
               ' : '
               ORDER BY CASE l.recipe_role
                          WHEN 'cathode_active' THEN 0
                          WHEN 'anode_active'  THEN 0
                          WHEN 'additive'      THEN 1
                          WHEN 'binder'        THEN 2
                          ELSE 3
                        END,
                        l.slurry_percent DESC,
                        m.name
             ) AS gen_name
        FROM tape_recipe_lines l
        LEFT JOIN materials m ON m.material_id = l.material_id
       WHERE l.include_in_pct = true
       GROUP BY l.tape_recipe_id
    ) gen
   WHERE gen.tape_recipe_id = r.tape_recipe_id
     AND gen.gen_name IS NOT NULL
     AND gen.gen_name <> r.name;

  -- (f) Record this migration (also the run-once sentinel for this block).
  INSERT INTO schema_migrations (migration_name, migration_stream, source, notes)
  VALUES ('d047_recipe_active_material_slot.sql', 'dalia', 'migration_file',
          'Recipe active-material slot: tapes.active_material_id, materials.family, recipes deduped and renamed from composition.')
  ON CONFLICT (migration_name) DO NOTHING;
END $$;

-- ── Constraint (after the data step has opened the slots) ────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'tape_recipe_lines_active_slot_material_check') THEN
    ALTER TABLE tape_recipe_lines
      ADD CONSTRAINT tape_recipe_lines_active_slot_material_check
      CHECK ((recipe_role IN ('cathode_active', 'anode_active')) = (material_id IS NULL));
  END IF;
END $$;
