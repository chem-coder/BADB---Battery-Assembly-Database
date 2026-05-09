-- 019: Extra per-cycle metrics for publication-grade cycling plots.
--
-- Adds energy efficiency and average charge/discharge voltage columns to
-- cycling_cycle_summary. Hysteresis remains computed at read time as
-- avg_charge_voltage_v - avg_discharge_voltage_v.

ALTER TABLE cycling_cycle_summary
  ADD COLUMN IF NOT EXISTS energy_efficiency         DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS avg_charge_voltage_v      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS avg_discharge_voltage_v   DOUBLE PRECISION;
