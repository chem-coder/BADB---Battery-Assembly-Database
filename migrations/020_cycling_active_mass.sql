-- 020: Active material mass for specific-capacity plots (mAh/g).
--
-- Li-ion publications almost always normalize discharge capacity by the
-- mass of active material in the working electrode: it's the only way
-- to compare cells of different sizes or to compare a lab half-cell
-- against a literature value. We store the mass in milligrams on each
-- cycling session (not on the battery — different test runs of the same
-- cell can use different active masses when electrodes are swapped).
--
-- NULL = unknown mass; UI stays on absolute (Ah) until mass is filled in.

ALTER TABLE cycling_sessions
  ADD COLUMN IF NOT EXISTS active_mass_mg DOUBLE PRECISION;

COMMENT ON COLUMN cycling_sessions.active_mass_mg IS
  'Mass of active material in the working electrode, milligrams. Required for mAh/g (specific capacity) plots.';
