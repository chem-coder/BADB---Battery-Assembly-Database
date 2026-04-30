const { trackChanges } = require('../middleware/trackChanges');

function statusError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function normalizeDryingPayload(payload) {
  return {
    start_time: payload.start_time || null,
    end_time: payload.end_time || null,
    temperature_c: payload.temperature_c ?? null,
    other_parameters: payload.other_parameters || null,
    comments: payload.comments || null
  };
}

async function saveElectrodeDrying(pool, cutBatchId, payload) {
  const values = normalizeDryingPayload(payload);

  const result = await pool.query(
    `
    INSERT INTO electrode_drying (
      cut_batch_id,
      start_time,
      end_time,
      temperature_c,
      other_parameters,
      comments
    )
    VALUES ($1,$2,$3,$4,$5,$6)

    ON CONFLICT (cut_batch_id)
    DO UPDATE SET
      start_time       = EXCLUDED.start_time,
      end_time         = EXCLUDED.end_time,
      temperature_c    = EXCLUDED.temperature_c,
      other_parameters = EXCLUDED.other_parameters,
      comments         = EXCLUDED.comments

    RETURNING *
    `,
    [
      cutBatchId,
      values.start_time,
      values.end_time,
      values.temperature_c,
      values.other_parameters,
      values.comments
    ]
  );

  return result.rows[0];
}

async function getElectrodeDrying(pool, cutBatchId) {
  const result = await pool.query(
    `
    SELECT *
    FROM electrode_drying
    WHERE cut_batch_id = $1
    LIMIT 1
    `,
    [cutBatchId]
  );

  return result.rows[0] || null;
}

async function updateElectrodeDrying(pool, dryingId, payload, userId) {
  const current = await pool.query(
    'SELECT start_time, end_time, temperature_c, other_parameters, comments FROM electrode_drying WHERE drying_id = $1',
    [dryingId]
  );

  if (current.rowCount === 0) {
    throw statusError('Запись не найдена', 404);
  }

  const newVals = normalizeDryingPayload(payload);

  const result = await pool.query(
    `
    UPDATE electrode_drying
    SET start_time = $1,
        end_time = $2,
        temperature_c = $3,
        other_parameters = $4,
        comments = $5
    WHERE drying_id = $6
    RETURNING *
    `,
    [
      newVals.start_time,
      newVals.end_time,
      newVals.temperature_c,
      newVals.other_parameters,
      newVals.comments,
      dryingId
    ]
  );

  if (result.rowCount === 0) {
    throw statusError('Запись не найдена', 404);
  }

  await trackChanges(
    pool,
    'electrode_drying',
    'electrode_drying',
    'drying_id',
    dryingId,
    current.rows[0],
    newVals,
    userId,
    null,
    false
  );

  return result.rows[0];
}

async function deleteElectrodeDrying(pool, dryingId) {
  // rowCount check: previously this returned success even when the drying
  // record was already gone or the id was wrong. The UI displayed
  // "deleted" with no DB effect; refresh exposed the inconsistency.
  // 404 surfaces the mistake.
  const result = await pool.query(
    `DELETE FROM electrode_drying WHERE drying_id = $1`,
    [dryingId]
  );

  if (result.rowCount === 0) {
    throw statusError('Запись сушки не найдена', 404);
  }

  return { success: true };
}

module.exports = {
  deleteElectrodeDrying,
  getElectrodeDrying,
  saveElectrodeDrying,
  updateElectrodeDrying
};
