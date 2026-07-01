// ═══════════════════════════════════════════════════════════════════
// cyclingPersistenceService
// ═══════════════════════════════════════════════════════════════════
// Persists the output of the Python cycling parser to PostgreSQL with
// all-or-nothing atomicity across three tables:
//
//   - cycling_datapoints      (bulk-INSERT in batches of 1000)
//   - cycling_cycle_summary   (per-cycle UPSERT)
//   - cycling_sessions        (single UPDATE flipping status to 'ready')
//
// Without this wrapping transaction, a mid-loop failure could leave a
// `cycling_sessions` row with partial datapoints or partial summary —
// the user would see a session that "exists" but renders empty charts
// with no clear error.
//
// The session row itself is created upstream (in routes/cycling.js
// upload handler) outside the transaction here. On rollback we record
// status='error' in a fresh transaction, which is safe because the
// rolled-back transaction never touched that row.
//
// Parser execution is deliberately outside the transaction (parsing
// can take many seconds; we should not hold a DB connection idle).

const DATAPOINTS_BATCH_SIZE = 1000;

/**
 * Persist a successful parser result atomically.
 *
 * On success: returns `{ ok: true }`. All three tables are populated and
 * cycling_sessions.status is 'ready'.
 *
 * On failure: throws. The caller should call `recordParserError` to set
 * the session's status='error'. Nothing was committed.
 *
 * @param {import('pg').Pool} pool       PostgreSQL pool
 * @param {number}            sessionId  cycling_sessions.session_id
 * @param {object}            parserResult  { datapoints, summary, meta }
 */
async function persistParserOutput(pool, sessionId, parserResult) {
  const { datapoints, summary, meta } = parserResult;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Bulk-INSERT datapoints in batches.
    for (let i = 0; i < datapoints.length; i += DATAPOINTS_BATCH_SIZE) {
      const batch = datapoints.slice(i, i + DATAPOINTS_BATCH_SIZE);
      const valueRows = [];
      const params = [];
      let paramIdx = 1;

      for (const dp of batch) {
        valueRows.push(
          `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, ` +
          `$${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, ` +
          `$${paramIdx++}, $${paramIdx++})`
        );
        params.push(
          sessionId,
          dp.cycle_number ?? 0,
          dp.step_number ?? null,
          dp.step_type ?? null,
          dp.time_s ?? null,
          dp.voltage_v ?? null,
          dp.current_a ?? null,
          dp.capacity_ah ?? null,
          dp.energy_wh ?? null,
          dp.temperature_c ?? null,
        );
      }

      await client.query(
        `INSERT INTO cycling_datapoints (
           session_id, cycle_number, step_number, step_type,
           time_s, voltage_v, current_a, capacity_ah, energy_wh, temperature_c
         ) VALUES ${valueRows.join(', ')}`,
        params,
      );
    }

    // 2. UPSERT per-cycle summary rows. ON CONFLICT updates all computed
    //    metrics so re-processing a session refreshes everything.
    for (const s of summary) {
      await client.query(
        `INSERT INTO cycling_cycle_summary (
           session_id, cycle_number,
           charge_capacity_ah, discharge_capacity_ah, coulombic_efficiency,
           energy_efficiency, charge_energy_wh, discharge_energy_wh,
           avg_charge_voltage_v, avg_discharge_voltage_v,
           max_voltage_v, min_voltage_v, avg_temperature_c, duration_s
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (session_id, cycle_number) DO UPDATE SET
           charge_capacity_ah      = EXCLUDED.charge_capacity_ah,
           discharge_capacity_ah   = EXCLUDED.discharge_capacity_ah,
           coulombic_efficiency    = EXCLUDED.coulombic_efficiency,
           energy_efficiency       = EXCLUDED.energy_efficiency,
           charge_energy_wh        = EXCLUDED.charge_energy_wh,
           discharge_energy_wh     = EXCLUDED.discharge_energy_wh,
           avg_charge_voltage_v    = EXCLUDED.avg_charge_voltage_v,
           avg_discharge_voltage_v = EXCLUDED.avg_discharge_voltage_v,
           max_voltage_v           = EXCLUDED.max_voltage_v,
           min_voltage_v           = EXCLUDED.min_voltage_v,
           avg_temperature_c       = EXCLUDED.avg_temperature_c,
           duration_s              = EXCLUDED.duration_s`,
        [
          sessionId, s.cycle_number,
          s.charge_capacity_ah, s.discharge_capacity_ah, s.coulombic_efficiency,
          s.energy_efficiency, s.charge_energy_wh, s.discharge_energy_wh,
          s.avg_charge_voltage_v, s.avg_discharge_voltage_v,
          s.max_voltage_v, s.min_voltage_v,
          s.avg_temperature_c, s.duration_s,
        ],
      );
    }

    // 3. Finalize the session. If upload submitted equipment_type='auto',
    //    persist the format the parser detected (e.g. 'elitech').
    await client.query(
      `UPDATE cycling_sessions SET
         status = 'ready',
         total_cycles = $1,
         started_at = $2,
         ended_at = $3,
         equipment_type = CASE
           WHEN equipment_type = 'auto' AND $5::text IS NOT NULL THEN $5
           ELSE equipment_type
         END
       WHERE session_id = $4`,
      [
        meta?.total_cycles || summary.length,
        meta?.started_at || null,
        meta?.ended_at || null,
        sessionId,
        meta?.detected_format || null,
      ],
    );

    await client.query('COMMIT');
    return { ok: true };
  } catch (err) {
    // ROLLBACK best-effort; the connection may already be broken.
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Mark a session as failed in a single-statement transaction. Safe to
 * call after a rolled-back persistence transaction — only touches the
 * cycling_sessions row which was created upstream.
 *
 * @param {import('pg').Pool} pool
 * @param {number}            sessionId
 * @param {string}            errorMessage
 */
async function recordParserError(pool, sessionId, errorMessage) {
  await pool.query(
    `UPDATE cycling_sessions SET status = 'error', error_message = $1
     WHERE session_id = $2`,
    [String(errorMessage || 'unknown error'), sessionId],
  );
}

module.exports = {
  persistParserOutput,
  recordParserError,
  // Exposed for tests and operational tuning.
  DATAPOINTS_BATCH_SIZE,
};
