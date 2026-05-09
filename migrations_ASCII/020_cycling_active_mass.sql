-- 020: Active material mass for specific-capacity plots (mAh/g).
--
-- Stores active material mass in milligrams on each cycling session.
-- NULL means unknown mass; UI stays on absolute capacity until filled.

ALTER TABLE cycling_sessions
  ADD COLUMN IF NOT EXISTS active_mass_mg DOUBLE PRECISION;

COMMENT ON COLUMN cycling_sessions.active_mass_mg IS
  'Mass of active material in the working electrode, milligrams. Required for mAh/g (specific capacity) plots.';
