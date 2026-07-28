-- d052_materials_manufacturer_families.sql
-- Materials model cleanup, data part. Spec: docs/future/materials_model_cleanup.md
-- (Dalia's decisions D1-D8, 2026-07-27/28).
--
-- WHAT:
--   1. materials.manufacturer — who MAKES the product (BTR, Zichen, Bamo...).
--      Distinct from material_sources.supplier (who sold this bag).
--   2. material_families — controlled family vocabulary, scoped by role,
--      seeded per spec §4 incl. families for likely future purchases.
--      materials.family (free text) stays and is deprecated in place; the
--      pickers now read from this table.
--   3. Guarded backfill of family + manufacturer for the KNOWN products
--      (spec §7). Only fills blanks — never overwrites a non-empty value,
--      so it is safe on ANY database incl. the lab one, where unknown
--      names are simply left as-is (Dalia cleans those by hand).
--   4. Renames auto-generated instance names '<material> (чистый)' to just
--      '<material>' — the suffix froze a COMPUTED state (leaf vs mixture)
--      into a stored name, and it reads as a chemical-purity claim, which
--      it never was. Only the exact auto-generated pattern is touched;
--      hand-named instances are left alone. The leaf/mixture state is shown
--      by the UI as a computed badge from d052 onward.
--
-- Forward-only, additive, idempotent. Nothing is deleted or re-pointed;
-- data that does not match the known patterns is kept exactly as-is.

BEGIN;

-- ── 1) Manufacturer of the product ───────────────────────────────────

ALTER TABLE materials ADD COLUMN IF NOT EXISTS manufacturer text;

-- ── 2) Family vocabulary ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS material_families (
  family_id  SERIAL PRIMARY KEY,
  code       text NOT NULL UNIQUE,   -- the value stored in materials.family
  label      text NOT NULL,          -- display label with disambiguation
  role       text NOT NULL CHECK (role IN ('cathode_active', 'anode_active')),
  sort_order integer NOT NULL DEFAULT 0,
  notes      text
);

INSERT INTO material_families (code, label, role, sort_order, notes)
SELECT v.code, v.label, v.role, v.sort_order, v.notes
FROM (VALUES
  -- cathode
  ('NMC',         'NMC',                                  'cathode_active', 10, NULL),
  ('NCA',         'NCA',                                  'cathode_active', 20, NULL),
  ('LFP',         'LFP',                                  'cathode_active', 30, NULL),
  ('LMFP',        'LMFP',                                 'cathode_active', 40, NULL),
  ('LCO',         'LCO',                                  'cathode_active', 50, NULL),
  ('LMO',         'LMO',                                  'cathode_active', 60, NULL),
  ('LNMO',        'LNMO (высоковольтная шпинель)',        'cathode_active', 70, NULL),
  ('NVP',         'NVP (Na-ion)',                         'cathode_active', 80, NULL),
  ('Na-слоистые', 'Na-слоистые (типа NaNMC)',             'cathode_active', 90, NULL),
  -- anode
  ('SG',          'SG — синтетический графит',            'anode_active',   10, 'он же artificial graphite'),
  ('NG',          'NG — природный графит',                'anode_active',   20, NULL),
  ('HC',          'HC — твёрдый углерод',                 'anode_active',   30, 'также стандартный анод Na-ion'),
  ('LTO',         'LTO',                                  'anode_active',   40, NULL),
  ('Si-based',    'Si-based (SiOx / Si-C)',               'anode_active',   50, NULL),
  ('Li металл',   'Li металл',                            'anode_active',   60, 'зарезервировано; Li-фольга пока не материал (спец. §9)')
) AS v(code, label, role, sort_order, notes)
WHERE NOT EXISTS (SELECT 1 FROM material_families f WHERE f.code = v.code);

-- ── 3) Backfill for known products (spec §7) — fills blanks only ─────

UPDATE materials SET family = 'SG'
 WHERE name IN ('AML 403', 'S360', 'CS11G')
   AND role = 'anode_active' AND COALESCE(family, '') = '';

UPDATE materials SET family = 'HC'
 WHERE name = 'HC' AND role = 'anode_active' AND COALESCE(family, '') = '';

UPDATE materials SET family = 'Si-based'
 WHERE name = 'SiC' AND role = 'anode_active' AND COALESCE(family, '') = '';

UPDATE materials SET manufacturer = 'BTR New Material Group'
 WHERE name IN ('AML 403', 'S360', 'NMC 811 BTR M2C2')
   AND COALESCE(manufacturer, '') = '';

UPDATE materials SET manufacturer = 'Zichen (PTL)'
 WHERE name = 'CS11G' AND COALESCE(manufacturer, '') = '';

UPDATE materials SET manufacturer = 'BTR (Tianjin) Nano Material Manufacturing'
 WHERE name = 'LFP S19' AND COALESCE(manufacturer, '') = '';

UPDATE materials SET manufacturer = 'Chengdu Bamo Technology'
 WHERE name = 'NMC C85E' AND COALESCE(manufacturer, '') = '';

UPDATE materials SET manufacturer = 'ETI'
 WHERE name = 'NMC 811 ETI' AND COALESCE(manufacturer, '') = '';

-- ── 4) Retire the '(чистый)' suffix from auto-generated instance names ─

UPDATE material_instances mi
   SET name = m.name
  FROM materials m
 WHERE m.material_id = mi.material_id
   AND mi.name = m.name || ' (чистый)';

-- ── 5) Ledger ────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    INSERT INTO schema_migrations (migration_name, migration_stream, source, notes)
    VALUES ('d052_materials_manufacturer_families.sql', 'dalia', 'migration_file',
            'materials.manufacturer; material_families vocabulary; guarded family/manufacturer backfill; (чистый) suffix retired from auto-generated instance names.')
    ON CONFLICT (migration_name) DO NOTHING;
  END IF;
END $$;

COMMIT;
