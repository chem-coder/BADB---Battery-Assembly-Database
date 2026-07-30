function statusError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

// d054: batch testing datetime (OCV/ESR measurement moment). Accepts a
// full ISO datetime or null; anything unparseable is a 400 so a client
// bug can't silently store garbage.
function normalizeOptionalTestedAt(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const raw = String(value).trim();
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) {
    throw statusError('Дата тестирования партии должна быть ISO-датой со временем', 400);
  }
  return raw;
}

async function saveBatteryQc(pool, payload) {
  const batteryId = Number(payload.battery_id);
  // Key ABSENT → preserve the stored value (vanilla's QC form predates
  // tested_at and must not wipe it). Key present (even null/'') →
  // explicit set/clear.
  const hasTestedAt = Object.prototype.hasOwnProperty.call(payload, 'tested_at');
  const testedAt = hasTestedAt ? normalizeOptionalTestedAt(payload.tested_at) : null;

  const result = await pool.query(
    `
    INSERT INTO battery_qc (
      battery_id,
      ocv_v,
      esr_mohm,
      qc_notes,
      tested_at
    )
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (battery_id)
    DO UPDATE SET
      ocv_v = EXCLUDED.ocv_v,
      esr_mohm = EXCLUDED.esr_mohm,
      qc_notes = EXCLUDED.qc_notes,
      tested_at = CASE WHEN $6 THEN EXCLUDED.tested_at ELSE battery_qc.tested_at END
    RETURNING *
    `,
    [
      batteryId,
      payload.ocv_v ?? null,
      payload.esr_mohm ?? null,
      payload.qc_notes || null,
      testedAt,
      hasTestedAt
    ]
  );

  return result.rows[0];
}

async function getBatteryQc(pool, batteryId) {
  const result = await pool.query(
    `
    SELECT
      battery_id,
      ocv_v,
      esr_mohm,
      qc_notes,
      tested_at
    FROM battery_qc
    WHERE battery_id = $1
    `,
    [batteryId]
  );

  return result.rows[0] || null;
}

async function updateBatteryQc(pool, batteryId, payload) {
  // Same absent-key semantics as saveBatteryQc — see comment there.
  const hasTestedAt = Object.prototype.hasOwnProperty.call(payload, 'tested_at');
  const testedAt = hasTestedAt ? normalizeOptionalTestedAt(payload.tested_at) : null;

  const result = await pool.query(
    `
    UPDATE battery_qc
    SET
      ocv_v = $1,
      esr_mohm = $2,
      qc_notes = $3,
      tested_at = CASE WHEN $5 THEN $4 ELSE tested_at END
    WHERE battery_id = $6
    RETURNING
      battery_id,
      ocv_v,
      esr_mohm,
      qc_notes,
      tested_at
    `,
    [
      payload.ocv_v ?? null,
      payload.esr_mohm ?? null,
      payload.qc_notes || null,
      testedAt,
      hasTestedAt,
      batteryId
    ]
  );

  if (result.rows.length === 0) {
    throw statusError('Данные выходного контроля не найдены', 404);
  }

  return result.rows[0];
}

module.exports = {
  getBatteryQc,
  saveBatteryQc,
  updateBatteryQc
};
