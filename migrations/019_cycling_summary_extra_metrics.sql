-- 019: Extra per-cycle metrics for publication-grade cycling plots.
--
-- New columns:
--   energy_efficiency        — E_discharge / E_charge × 100% (complements CE
--                              by capturing voltage hysteresis / round-trip
--                              energy loss)
--   avg_charge_voltage_v     — mean V over charge points (polarisation signal)
--   avg_discharge_voltage_v  — mean V over discharge points (same)
--
-- Hysteresis is computed on-the-fly as (avg_chg - avg_dch); we don't store
-- a separate column because it's a trivial subtraction and this keeps
-- the summary table minimal.

ALTER TABLE cycling_cycle_summary
  ADD COLUMN IF NOT EXISTS energy_efficiency         DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS avg_charge_voltage_v      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS avg_discharge_voltage_v   DOUBLE PRECISION;
