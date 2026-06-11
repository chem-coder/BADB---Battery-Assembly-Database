const { trackChanges } = require('../middleware/trackChanges');
const {
  saveCoinConfig,
  saveCylConfig,
  savePouchConfig,
  updateCoinConfig,
  updateCylConfig,
  updatePouchConfig
} = require('./batteryCellConfigService');
const {
  saveBatteryElectrodeSourcesInTransaction
} = require('./batteryElectrodeSourceService');
const {
  attachBatteryProjects,
  getPayloadProjectIds,
  replaceBatteryProjects,
  validateBatteryProjectIdsForSources,
  validateProjectIds
} = require('./batteryProjectService');
const {
  getBatteryAssemblyCompleteness
} = require('./batteryAssemblyService');

const USER_SELECTABLE_BATTERY_STATUSES = new Set([
  'assembled',
  'testing',
  'completed',
  'failed'
]);

function statusError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function hasOwn(payload, key) {
  return Object.prototype.hasOwnProperty.call(payload || {}, key);
}

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeOptionalItemCreatedAtDate(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw statusError('Дата создания аккумулятора должна быть в формате ГГГГ-ММ-ДД', 400);
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw statusError('Некорректная дата создания аккумулятора', 400);
  }

  if (raw > getTodayDateString()) {
    throw statusError('Дата создания аккумулятора не может быть в будущем', 400);
  }

  return raw;
}

function hasSourcePayload(payload = {}) {
  return [
    'cathode_tape_id',
    'cathode_cut_batch_id',
    'anode_tape_id',
    'anode_cut_batch_id',
    'sources',
    'electrode_sources'
  ].some((key) => hasOwn(payload, key));
}

function normalizeCutBatchIds(values) {
  const source = Array.isArray(values) ? values : [values];
  const cutBatchIds = [];

  source.forEach((value) => {
    if (value === null || value === undefined || value === '') return;
    const cutBatchId = Number(value);
    if (Number.isInteger(cutBatchId) && !cutBatchIds.includes(cutBatchId)) {
      cutBatchIds.push(cutBatchId);
    }
  });

  return cutBatchIds;
}

function getArraySourcePayload(payload = {}) {
  if (Array.isArray(payload.sources)) return payload.sources;
  if (Array.isArray(payload.electrode_sources)) return payload.electrode_sources;
  return null;
}

function getPayloadSourceCutBatchIds(payload = {}, role) {
  const arraySources = getArraySourcePayload(payload);

  if (arraySources) {
    return normalizeCutBatchIds(
      arraySources
        .filter((source) => source?.role === role)
        .map((source) => source.cut_batch_id)
    );
  }

  if (hasOwn(payload, `${role}_cut_batch_id`)) {
    return normalizeCutBatchIds(payload[`${role}_cut_batch_id`]);
  }

  return null;
}

function getContextSourceCutBatchIds(payload, currentSources, role) {
  const payloadIds = getPayloadSourceCutBatchIds(payload, role);
  if (payloadIds) return payloadIds;

  return normalizeCutBatchIds(
    currentSources[`${role}_cut_batch_ids`] || currentSources[`${role}_cut_batch_id`]
  );
}

function getCoinCellMode(payload = {}, currentCoinConfig = {}) {
  return hasOwn(payload, 'coin_cell_mode')
    ? payload.coin_cell_mode || null
    : currentCoinConfig?.coin_cell_mode || null;
}

function getHalfCellType(payload = {}, currentCoinConfig = {}) {
  return hasOwn(payload, 'half_cell_type')
    ? payload.half_cell_type || null
    : currentCoinConfig?.half_cell_type || null;
}

function getBatteryProjectContext(payload, formFactor, current = {}) {
  const currentSources = current.sources || {};
  const currentCoinConfig = current.coinConfig || {};
  const cathodeCutBatchIds = getContextSourceCutBatchIds(payload, currentSources, 'cathode');
  const anodeCutBatchIds = getContextSourceCutBatchIds(payload, currentSources, 'anode');

  return {
    formFactor,
    coinCellMode: getCoinCellMode(payload, currentCoinConfig),
    halfCellType: getHalfCellType(payload, currentCoinConfig),
    cathodeCutBatchId: cathodeCutBatchIds[0] || null,
    cathodeCutBatchIds,
    anodeCutBatchId: anodeCutBatchIds[0] || null,
    anodeCutBatchIds
  };
}

function validateRequiredIdentityFields(payload, formFactor) {
  if (!formFactor) {
    throw statusError('Выберите форм-фактор аккумулятора', 400);
  }

  if (formFactor === 'coin') {
    if (!payload.coin_cell_mode || !payload.coin_size_code) {
      throw statusError('Для монеточного элемента выберите тип элемента и размер', 400);
    }
    if (payload.coin_cell_mode === 'half_cell' && !payload.half_cell_type) {
      throw statusError('Для монеточной полуячейки выберите тип полуячейки', 400);
    }
  }

  if (formFactor === 'pouch' || formFactor === 'prism') {
    if (!payload.pouch_case_size_code) {
      throw statusError('Для пакетного/призматического элемента выберите размер', 400);
    }
    if (
      payload.pouch_case_size_code === 'other' &&
      !String(payload.pouch_case_size_other || '').trim()
    ) {
      throw statusError('Для другого размера пакетного/призматического элемента заполните размер', 400);
    }
  }

  if (formFactor === 'cylindrical' && !payload.cyl_size_code) {
    throw statusError('Для цилиндрического элемента выберите типоразмер', 400);
  }
}

async function saveIdentityConfig(queryable, batteryId, formFactor, payload, userId, isCreate) {
  const configPayload = { ...payload, battery_id: batteryId };

  if (formFactor === 'coin') {
    if (isCreate) return saveCoinConfig(queryable, configPayload);
    try {
      return await updateCoinConfig(queryable, batteryId, configPayload, userId);
    } catch (err) {
      if (err.statusCode === 404) return saveCoinConfig(queryable, configPayload);
      throw err;
    }
  }

  if (formFactor === 'pouch' || formFactor === 'prism') {
    if (isCreate) return savePouchConfig(queryable, configPayload);
    try {
      return await updatePouchConfig(queryable, batteryId, configPayload, userId);
    } catch (err) {
      if (err.statusCode === 404) return savePouchConfig(queryable, configPayload);
      throw err;
    }
  }

  if (formFactor === 'cylindrical') {
    if (isCreate) return saveCylConfig(queryable, configPayload);
    try {
      return await updateCylConfig(queryable, batteryId, configPayload, userId);
    } catch (err) {
      if (err.statusCode === 404) return saveCylConfig(queryable, configPayload);
      throw err;
    }
  }

  return null;
}

async function fetchCurrentIdentityContext(queryable, batteryId) {
  const [batteryRes, coinRes, sourcesRes, projectsRows] = await Promise.all([
    queryable.query(
      'SELECT project_id, form_factor, created_by, item_created_at, battery_notes, status FROM batteries WHERE battery_id = $1',
      [batteryId]
    ),
    queryable.query(
      'SELECT coin_cell_mode, half_cell_type FROM battery_coin_config WHERE battery_id = $1',
      [batteryId]
    ),
    queryable.query(
      `
      SELECT
        role,
        tape_id,
        cut_batch_id,
        source_notes,
        sort_order,
        is_primary
      FROM battery_electrode_sources
      WHERE battery_id = $1
      ORDER BY role, is_primary DESC, sort_order, battery_electrode_source_id
      `,
      [batteryId]
    ),
    attachBatteryProjects(queryable, [{ battery_id: batteryId }])
  ]);

  if (batteryRes.rows.length === 0) {
    throw statusError('Батарея не найдена', 404);
  }

  const sources = {
    source_rows: sourcesRes.rows,
    cathode_cut_batch_ids: [],
    anode_cut_batch_ids: []
  };
  sourcesRes.rows.forEach((row) => {
    const roleKey = row.role === 'cathode' ? 'cathode' : row.role === 'anode' ? 'anode' : null;
    if (roleKey && row.cut_batch_id) {
      sources[`${roleKey}_cut_batch_ids`].push(row.cut_batch_id);
    }

    if (row.role === 'cathode') {
      if (row.is_primary || !sources.cathode_cut_batch_id) {
        sources.cathode_tape_id = row.tape_id;
        sources.cathode_cut_batch_id = row.cut_batch_id;
        sources.cathode_source_notes = row.source_notes;
      }
    }
    if (row.role === 'anode') {
      if (row.is_primary || !sources.anode_cut_batch_id) {
        sources.anode_tape_id = row.tape_id;
        sources.anode_cut_batch_id = row.cut_batch_id;
        sources.anode_source_notes = row.source_notes;
      }
    }
  });

  return {
    battery: batteryRes.rows[0],
    coinConfig: coinRes.rows[0] || {},
    sources,
    projectIds: projectsRows[0]?.project_ids || []
  };
}

async function createBattery(pool, payload, createdByUserId) {
  const projectIds = getPayloadProjectIds(payload);
  const finalProjectIds = projectIds || [];
  const includesSources = hasSourcePayload(payload);
  const projectId = Number(finalProjectIds[0]);
  const formFactor = payload.form_factor || null;
  const itemCreatedAtDate = normalizeOptionalItemCreatedAtDate(payload.item_created_at);

  if (!Number.isInteger(projectId)) {
    throw statusError('Выберите хотя бы один проект аккумулятора', 400);
  }

  if (includesSources) {
    validateRequiredIdentityFields(payload, formFactor);
  } else {
    await validateProjectIds(pool, finalProjectIds);
  }

  if (includesSources) {
    await validateBatteryProjectIdsForSources(
      pool,
      finalProjectIds,
      getBatteryProjectContext(payload, formFactor)
    );
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
      INSERT INTO batteries (
        project_id,
        form_factor,
        created_by,
        created_at,
        updated_at,
        item_created_at,
        battery_notes
      )
      VALUES ($1, $2, $3, now(), now(), COALESCE($4::date, CURRENT_DATE), $5)
      RETURNING *
      `,
      [
        projectId,
        formFactor,
        createdByUserId,
        itemCreatedAtDate,
        payload.battery_notes || null
      ]
    );

    const batteryId = result.rows[0].battery_id;
    await replaceBatteryProjects(client, batteryId, finalProjectIds, createdByUserId);

    if (includesSources) {
      await saveIdentityConfig(client, batteryId, formFactor, payload, createdByUserId, true);
      await saveBatteryElectrodeSourcesInTransaction(client, batteryId, payload);
    }

    const [battery] = await attachBatteryProjects(client, [result.rows[0]]);
    await client.query('COMMIT');
    return battery;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function listBatteries(pool) {
  const result = await pool.query(
    `
    SELECT
      b.battery_id,
      b.project_id,
      p.name AS project_name,
      b.form_factor,
      b.status,
      cc.coin_size_code,
      cathode_materials.active_material_names AS cathode_active_materials,
      cathode_batch.shape AS cathode_batch_shape,
      cathode_batch.diameter_mm AS cathode_batch_diameter_mm,
      cathode_batch.length_mm AS cathode_batch_length_mm,
      cathode_batch.width_mm AS cathode_batch_width_mm,
      anode_materials.active_material_names AS anode_active_materials,
      anode_batch.shape AS anode_batch_shape,
      anode_batch.diameter_mm AS anode_batch_diameter_mm,
      anode_batch.length_mm AS anode_batch_length_mm,
      anode_batch.width_mm AS anode_batch_width_mm,
      b.created_by,
      u_created.name AS created_by_name,
      b.battery_notes AS notes,
      b.item_created_at,
      b.created_at,
      b.updated_by,
      b.updated_at,
      u_updated.name AS updated_by_name
    FROM batteries b
    LEFT JOIN projects p
      ON p.project_id = b.project_id
    LEFT JOIN users u_created
      ON u_created.user_id = b.created_by
    LEFT JOIN users u_updated
      ON u_updated.user_id = b.updated_by
    LEFT JOIN battery_coin_config cc
      ON cc.battery_id = b.battery_id
    LEFT JOIN battery_electrode_sources cathode_src
      ON cathode_src.battery_id = b.battery_id
     AND cathode_src.role = 'cathode'
     AND cathode_src.is_primary
    LEFT JOIN tapes cathode_tape
      ON cathode_tape.tape_id = cathode_src.tape_id
    LEFT JOIN LATERAL (
      SELECT STRING_AGG(DISTINCT m.name, ', ' ORDER BY m.name) AS active_material_names
      FROM tape_recipe_lines trl
      JOIN materials m
        ON m.material_id = trl.material_id
      WHERE trl.tape_recipe_id = cathode_tape.tape_recipe_id
        AND trl.recipe_role = 'cathode_active'
    ) cathode_materials
      ON TRUE
    LEFT JOIN electrode_cut_batches cathode_batch
      ON cathode_batch.cut_batch_id = cathode_src.cut_batch_id
    LEFT JOIN battery_electrode_sources anode_src
      ON anode_src.battery_id = b.battery_id
     AND anode_src.role = 'anode'
     AND anode_src.is_primary
    LEFT JOIN tapes anode_tape
      ON anode_tape.tape_id = anode_src.tape_id
    LEFT JOIN LATERAL (
      SELECT STRING_AGG(DISTINCT m.name, ', ' ORDER BY m.name) AS active_material_names
      FROM tape_recipe_lines trl
      JOIN materials m
        ON m.material_id = trl.material_id
      WHERE trl.tape_recipe_id = anode_tape.tape_recipe_id
        AND trl.recipe_role = 'anode_active'
    ) anode_materials
      ON TRUE
    LEFT JOIN electrode_cut_batches anode_batch
      ON anode_batch.cut_batch_id = anode_src.cut_batch_id
    ORDER BY b.item_created_at DESC, b.created_at DESC, b.battery_id DESC
    `
  );

  return attachBatteryProjects(pool, result.rows);
}

async function getBattery(pool, batteryId) {
  const result = await pool.query(
    `
    SELECT
      b.battery_id,
      b.project_id,
      p.name AS project_name,
      b.form_factor,
      b.status,
      cc.coin_size_code,
      cathode_materials.active_material_names AS cathode_active_materials,
      cathode_batch.shape AS cathode_batch_shape,
      cathode_batch.diameter_mm AS cathode_batch_diameter_mm,
      cathode_batch.length_mm AS cathode_batch_length_mm,
      cathode_batch.width_mm AS cathode_batch_width_mm,
      anode_materials.active_material_names AS anode_active_materials,
      anode_batch.shape AS anode_batch_shape,
      anode_batch.diameter_mm AS anode_batch_diameter_mm,
      anode_batch.length_mm AS anode_batch_length_mm,
      anode_batch.width_mm AS anode_batch_width_mm,
      b.created_by,
      u.name AS created_by_name,
      b.battery_notes AS notes,
      b.item_created_at,
      b.created_at,
      b.updated_at
    FROM batteries b
    LEFT JOIN projects p
      ON p.project_id = b.project_id
    LEFT JOIN users u
      ON u.user_id = b.created_by
    LEFT JOIN battery_coin_config cc
      ON cc.battery_id = b.battery_id
    LEFT JOIN battery_electrode_sources cathode_src
      ON cathode_src.battery_id = b.battery_id
     AND cathode_src.role = 'cathode'
     AND cathode_src.is_primary
    LEFT JOIN tapes cathode_tape
      ON cathode_tape.tape_id = cathode_src.tape_id
    LEFT JOIN LATERAL (
      SELECT STRING_AGG(DISTINCT m.name, ', ' ORDER BY m.name) AS active_material_names
      FROM tape_recipe_lines trl
      JOIN materials m
        ON m.material_id = trl.material_id
      WHERE trl.tape_recipe_id = cathode_tape.tape_recipe_id
        AND trl.recipe_role = 'cathode_active'
    ) cathode_materials
      ON TRUE
    LEFT JOIN electrode_cut_batches cathode_batch
      ON cathode_batch.cut_batch_id = cathode_src.cut_batch_id
    LEFT JOIN battery_electrode_sources anode_src
      ON anode_src.battery_id = b.battery_id
     AND anode_src.role = 'anode'
     AND anode_src.is_primary
    LEFT JOIN tapes anode_tape
      ON anode_tape.tape_id = anode_src.tape_id
    LEFT JOIN LATERAL (
      SELECT STRING_AGG(DISTINCT m.name, ', ' ORDER BY m.name) AS active_material_names
      FROM tape_recipe_lines trl
      JOIN materials m
        ON m.material_id = trl.material_id
      WHERE trl.tape_recipe_id = anode_tape.tape_recipe_id
        AND trl.recipe_role = 'anode_active'
    ) anode_materials
      ON TRUE
    LEFT JOIN electrode_cut_batches anode_batch
      ON anode_batch.cut_batch_id = anode_src.cut_batch_id
    WHERE b.battery_id = $1
    `,
    [batteryId]
  );

  if (result.rows.length === 0) {
    throw statusError('Батарея не найдена', 404);
  }

  const [battery] = await attachBatteryProjects(pool, [result.rows[0]]);
  return battery;
}

async function assertBatteryStatusUpdateAllowed(pool, batteryId, status) {
  if (status === undefined) return;

  if (!USER_SELECTABLE_BATTERY_STATUSES.has(status)) {
    throw statusError('Статус "Открыт" задаётся системой и не выбирается вручную', 400);
  }

  const completeness = await getBatteryAssemblyCompleteness(pool, batteryId);

  if (!completeness) {
    throw statusError('Батарея не найдена', 404);
  }

  if (!completeness.is_complete) {
    throw statusError('Статус можно менять только после завершения обязательных записей сборки', 400);
  }
}

async function updateBattery(pool, batteryId, payload, userId) {
  await assertBatteryStatusUpdateAllowed(pool, batteryId, payload.status);

  const currentContext = await fetchCurrentIdentityContext(pool, batteryId);
  const current = currentContext.battery;
  const itemCreatedAtDate = normalizeOptionalItemCreatedAtDate(payload.item_created_at);
  const payloadProjectIds = getPayloadProjectIds(payload);
  const finalProjectIds = payloadProjectIds || currentContext.projectIds || [current.project_id];

  const newVals = {
    project_id: finalProjectIds[0] || current.project_id,
    form_factor: payload.form_factor !== undefined ? payload.form_factor : current.form_factor,
    created_by: current.created_by,
    item_created_at: itemCreatedAtDate ?? current.item_created_at,
    battery_notes: payload.battery_notes !== undefined ? payload.battery_notes : current.battery_notes,
    status: payload.status !== undefined ? payload.status : current.status,
  };

  const hasExistingSources = Boolean(
    currentContext.sources.cathode_cut_batch_id ||
    currentContext.sources.anode_cut_batch_id
  );

  if (hasSourcePayload(payload) || (payloadProjectIds && hasExistingSources)) {
    await validateBatteryProjectIdsForSources(
      pool,
      finalProjectIds,
      getBatteryProjectContext(payload, newVals.form_factor, currentContext)
    );
  } else {
    await validateProjectIds(pool, finalProjectIds);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
      UPDATE batteries
      SET
        project_id = $1,
        form_factor = $2,
        created_by = $3,
        item_created_at = $4,
        battery_notes = $5,
        status = $6,
        updated_by = $7,
        updated_at = now()
      WHERE battery_id = $8
      RETURNING
        battery_id,
        project_id,
        form_factor,
        created_by,
        item_created_at,
        battery_notes AS notes,
        status,
        created_at,
        updated_by,
        updated_at
      `,
      [
        newVals.project_id,
        newVals.form_factor,
        newVals.created_by,
        newVals.item_created_at,
        newVals.battery_notes,
        newVals.status,
        userId,
        batteryId
      ]
    );

    if (result.rows.length === 0) {
      throw statusError('Батарея не найдена', 404);
    }

    if (hasSourcePayload(payload)) {
      await saveIdentityConfig(client, batteryId, newVals.form_factor, payload, userId, false);
      await saveBatteryElectrodeSourcesInTransaction(client, batteryId, payload);
    }

    await replaceBatteryProjects(client, batteryId, finalProjectIds, userId);
    await trackChanges(client, 'battery', 'batteries', 'battery_id', batteryId, current, newVals, userId);
    const [battery] = await attachBatteryProjects(client, [result.rows[0]]);
    await client.query('COMMIT');
    return battery;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  createBattery,
  getBattery,
  listBatteries,
  updateBattery
};
