const { trackChanges } = require('../middleware/trackChanges');
const { collectDependencyConflicts } = require('../utils/dependencyConflicts');
const {
  computeElectrodeDerivedValues,
  fetchCutBatchCapacityContext
} = require('./electrodeCapacityService');

function statusError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function normalizeOptionalBoolean(value, fieldName) {
  if (value === undefined) return undefined;
  if (value === true || value === false) return value;

  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 1) return true;
  if (value === 0) return false;

  throw statusError(`Invalid boolean value for ${fieldName}`, 400);
}

async function listElectrodesForCutBatch(pool, cutBatchId) {
  const [result, capacityContext] = await Promise.all([
    pool.query(
      `
      SELECT *
      FROM electrodes
      WHERE cut_batch_id = $1
      ORDER BY
        status_code ASC,
        electrode_mass_g DESC,
        electrode_id ASC
      `,
      [cutBatchId]
    ),
    fetchCutBatchCapacityContext(pool, cutBatchId)
  ]);

  return result.rows.map((row) => ({
    ...row,
    ...computeElectrodeDerivedValues(row, capacityContext)
  }));
}

async function createElectrode(pool, payload) {
  const mass = Number(payload.electrode_mass_g);

  const result = await pool.query(
    `
    INSERT INTO electrodes (
      cut_batch_id,
      number_in_batch,
      electrode_mass_g,
      cup_number,
      comments
    )
    VALUES (
      $1,
      (
        SELECT COALESCE(MAX(number_in_batch),0) + 1
        FROM electrodes
        WHERE cut_batch_id = $1
      ),
      $2,
      $3,
      $4
    )
    RETURNING *
    `,
    [
      payload.cut_batch_id,
      mass,
      payload.cup_number ?? null,
      payload.comments || null
    ]
  );

  return result.rows[0];
}

async function updateElectrodeStatus(pool, electrodeId, payload, userId) {
  const current = await pool.query(
    'SELECT status_code, used_in_battery_id, scrapped_reason FROM electrodes WHERE electrode_id = $1',
    [electrodeId]
  );

  if (current.rowCount === 0) {
    throw statusError('Электрод не найден', 404);
  }

  const newVals = {
    status_code: payload.status_code,
    used_in_battery_id: payload.used_in_battery_id || null,
    scrapped_reason: payload.scrapped_reason || null
  };

  if (newVals.status_code === 1 || newVals.status_code === 3) {
    const conflict = await getElectrodeDeleteConflict(pool, electrodeId);

    if (conflict) {
      throw statusError(
        newVals.status_code === 1
          ? 'Нельзя вернуть электрод в доступные: он связан с аккумулятором'
          : 'Нельзя списать электрод: он связан с аккумулятором',
        409
      );
    }
  }

  const result = await pool.query(
    `
    UPDATE electrodes
    SET status_code = $1,
        used_in_battery_id = $2,
        scrapped_reason = $3
    WHERE electrode_id = $4
    RETURNING *
    `,
    [
      newVals.status_code,
      newVals.used_in_battery_id,
      newVals.scrapped_reason,
      electrodeId
    ]
  );

  if (result.rowCount === 0) {
    throw statusError('Электрод не найден', 404);
  }

  await trackChanges(
    pool,
    'electrode',
    'electrodes',
    'electrode_id',
    electrodeId,
    current.rows[0],
    newVals,
    userId,
    null,
    false
  );

  return result.rows[0];
}

async function updateElectrode(pool, electrodeId, payload, userId) {
  const hasElectrodeMass = payload.electrode_mass_g !== undefined;
  const hasCupNumber = payload.cup_number !== undefined;
  const hasComments = payload.comments !== undefined;
  const comments = hasComments && String(payload.comments ?? '').trim() === ''
    ? null
    : payload.comments;
  const includeInCapacityAverage = normalizeOptionalBoolean(
    payload.include_in_capacity_average,
    'include_in_capacity_average'
  );
  const hasIncludeInCapacityAverage = payload.include_in_capacity_average !== undefined;

  const current = await pool.query(
    'SELECT electrode_mass_g, cup_number, comments, include_in_capacity_average FROM electrodes WHERE electrode_id = $1',
    [electrodeId]
  );

  if (current.rowCount === 0) {
    throw statusError('Electrode not found', 404);
  }

  const result = await pool.query(
    `
    UPDATE electrodes
    SET
      electrode_mass_g = CASE
        WHEN $1::boolean AND $2::numeric IS NOT NULL THEN $2::numeric
        ELSE electrode_mass_g
      END,
      cup_number = CASE
        WHEN $3::boolean THEN $4::integer
        ELSE cup_number
      END,
      comments = CASE
        WHEN $5::boolean THEN $6::text
        ELSE comments
      END,
      include_in_capacity_average = CASE
        WHEN $7::boolean THEN $8::boolean
        ELSE include_in_capacity_average
      END
    WHERE electrode_id = $9
    RETURNING *
    `,
    [
      hasElectrodeMass,
      payload.electrode_mass_g ?? null,
      hasCupNumber,
      payload.cup_number ?? null,
      hasComments,
      comments,
      hasIncludeInCapacityAverage,
      includeInCapacityAverage ?? null,
      electrodeId
    ]
  );

  if (result.rowCount === 0) {
    throw statusError('Electrode not found', 404);
  }

  const newVals = {};
  if (payload.electrode_mass_g !== undefined) {
    newVals.electrode_mass_g = payload.electrode_mass_g;
  }
  if (payload.cup_number !== undefined) {
    newVals.cup_number = payload.cup_number;
  }
  if (payload.comments !== undefined) {
    newVals.comments = comments;
  }
  if (payload.include_in_capacity_average !== undefined) {
    newVals.include_in_capacity_average = includeInCapacityAverage;
  }

  await trackChanges(
    pool,
    'electrode',
    'electrodes',
    'electrode_id',
    electrodeId,
    current.rows[0],
    newVals,
    userId,
    null,
    false
  );

  return result.rows[0];
}

async function getElectrodeDeleteConflict(pool, electrodeId) {
  const check = await pool.query(
    `
    SELECT used_in_battery_id
    FROM electrodes
    WHERE electrode_id = $1
    `,
    [electrodeId]
  );

  if (check.rows.length === 0) {
    throw statusError('Electrode not found', 404);
  }

  if (check.rows[0].used_in_battery_id) {
    return {
      message: 'Нельзя удалить электрод: он уже используется в аккумуляторе',
      dependencies: [{
        key: 'used_in_battery_id',
        label: 'аккумулятор, в котором используется электрод',
        count: 1,
        records: [{ id: check.rows[0].used_in_battery_id }]
      }]
    };
  }

  const dependencies = await collectDependencyConflicts(pool, [
    {
      key: 'battery_electrodes',
      label: 'аккумуляторы с этим электродом',
      query: `
        SELECT b.battery_id AS id, b.battery_notes AS name
        FROM battery_electrodes be
        JOIN batteries b ON b.battery_id = be.battery_id
        WHERE be.electrode_id = $1
        ORDER BY b.battery_id
        LIMIT 25
      `,
      params: [electrodeId]
    }
  ]);

  if (dependencies.length > 0) {
    return {
      message: 'Нельзя удалить электрод: он используется в аккумуляторах',
      dependencies
    };
  }

  return null;
}

async function deleteElectrode(pool, electrodeId) {
  await pool.query(
    `
    DELETE FROM electrodes
    WHERE electrode_id = $1
    `,
    [electrodeId]
  );

  return { success: true };
}

module.exports = {
  createElectrode,
  deleteElectrode,
  getElectrodeDeleteConflict,
  listElectrodesForCutBatch,
  updateElectrode,
  updateElectrodeStatus
};
