const { trackChanges } = require('../middleware/trackChanges');

function statusError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function addFoilMassMeasurement(pool, cutBatchId, mass) {
  const result = await pool.query(
    `
    INSERT INTO foil_mass_measurements (cut_batch_id, mass_g)
    VALUES ($1, $2)
    RETURNING *
    `,
    [cutBatchId, mass]
  );

  return result.rows[0];
}

async function listFoilMassMeasurements(pool, cutBatchId) {
  const result = await pool.query(
    `
    SELECT *
    FROM foil_mass_measurements
    WHERE cut_batch_id = $1
    ORDER BY foil_measurement_id
    `,
    [cutBatchId]
  );

  return result.rows;
}

async function deleteFoilMassMeasurementsForBatch(pool, cutBatchId) {
  await pool.query(
    `
    DELETE FROM foil_mass_measurements
    WHERE cut_batch_id = $1
    `,
    [cutBatchId]
  );

  return { success: true };
}

async function updateFoilMassMeasurement(pool, measurementId, massG, userId) {
  const current = await pool.query(
    'SELECT mass_g FROM foil_mass_measurements WHERE foil_measurement_id = $1',
    [measurementId]
  );

  if (current.rowCount === 0) {
    throw statusError('Измерение не найдено', 404);
  }

  const result = await pool.query(
    `
    UPDATE foil_mass_measurements
    SET mass_g = $1
    WHERE foil_measurement_id = $2
    RETURNING *
    `,
    [massG, measurementId]
  );

  if (result.rowCount === 0) {
    throw statusError('Измерение не найдено', 404);
  }

  await trackChanges(
    pool,
    'foil_measurement',
    'foil_mass_measurements',
    'foil_measurement_id',
    measurementId,
    current.rows[0],
    { mass_g: massG },
    userId,
    null,
    false
  );

  return result.rows[0];
}

async function deleteFoilMassMeasurement(pool, measurementId) {
  // rowCount check: previously the service silently returned success even if
  // the row was already gone (or the id was bogus). The UI then "thought"
  // the deletion worked; refresh would show the row still there if the id
  // was simply wrong. 404 makes the bug visible.
  const result = await pool.query(
    `DELETE FROM foil_mass_measurements WHERE foil_measurement_id = $1`,
    [measurementId]
  );

  if (result.rowCount === 0) {
    throw statusError('Замер не найден', 404);
  }

  return { success: true };
}

module.exports = {
  addFoilMassMeasurement,
  deleteFoilMassMeasurement,
  deleteFoilMassMeasurementsForBatch,
  listFoilMassMeasurements,
  updateFoilMassMeasurement
};
