-- d050_recipe_slot_marker_am.sql
-- Renames the active-slot marker in composition-derived recipe names
-- from the bare "x" to "AM" (active material).
--
-- WHY: d047 named recipes after their composition with "x" standing in
-- for the open active-material slot ("96 x : 2.2 Super P : 1.8 PVDF").
-- In practice "x" reads as an unknown/typo rather than "the active
-- material goes here"; "AM" is the labU&'s own shorthand and is instantly
-- readable ("96 \0410\041C : 2.2 Super P : 1.8 PVDF"). Cosmetic only \2014 no
-- structural change; the slot itself is still tape_recipe_lines.material_id
-- IS NULL on the active line (d047 CHECK).
--
-- Scope: only names that still match the exact d047-generated shape
-- "<percent> x : ..." are touched, so any recipe a user has renamed by
-- hand is left alone. Idempotent: after the rewrite the name no longer
-- matches the WHERE clause, so re-running the folder is a no-op.
-- d047's old-name history in tape_recipes.notes is untouched.

BEGIN;

UPDATE tape_recipes
SET name = regexp_replace(name, '^([0-9]+([.,][0-9]+)? )x( :)', U&'\005C1\0410\041C\005C3')
WHERE name ~ '^[0-9]+([.,][0-9]+)? x :';

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    INSERT INTO schema_migrations (migration_name, migration_stream, source, notes)
    VALUES ('d050_recipe_slot_marker_am.sql', 'dalia', 'migration_file',
            U&'Recipe active-slot marker renamed from "x" to "\0410\041C" in composition-derived names.')
    ON CONFLICT (migration_name) DO NOTHING;
  END IF;
END $$;

COMMIT;
