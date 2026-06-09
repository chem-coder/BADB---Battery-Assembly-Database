const { trackChanges } = require('../middleware/trackChanges');
const { collectDependencyConflicts } = require('../utils/dependencyConflicts');
const {
  buildBatchCapacitySummary,
  computeElectrodeDerivedValues,
  fetchCutBatchCapacityContext
} = require('./electrodeCapacityService');
const {
  attachElectrodeBatchProjects,
  getPayloadProjectIds,
  getTapeProjectIds,
  validateProjectIdsForTape,
  replaceElectrodeBatchProjects
} = require('./electrodeBatchProjectService');
const { ELECTRODE_CUT_BATCH_ORDER_BY_SQL } = require('../utils/electrodeCutBatchSort');

const ALLOWED_TARGET_FORM_FACTORS = new Set(['coin', 'pouch', 'cylindrical', 'prism']);
const ALLOWED_TARGET_CONFIG_CODES = new Set([
  '2016',
  '2025',
  '2032',
  '103x83',
  '86x56',
  '18650',
  '21700',
  'other'
]);

const TARGET_CONFIG_CODES_BY_FORM_FACTOR = {
  coin: new Set(['2016', '2025', '2032', 'other']),
  pouch: new Set(['103x83', '86x56', 'other']),
  cylindrical: new Set(['18650', '21700', 'other']),
  prism: new Set(['103x83', '86x56', 'other'])
};

function statusError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
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
    throw statusError('Дата создания должна быть в формате ГГГГ-ММ-ДД', 400);
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
    throw statusError('Некорректная дата создания', 400);
  }

  if (raw > getTodayDateString()) {
    throw statusError('Дата создания не может быть в будущем', 400);
  }

  return raw;
}

function normalizeBooleanFlag(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function normalizeCutBatchGeometry({
  target_form_factor,
  target_config_code,
  target_config_other,
  shape,
  diameter_mm,
  length_mm,
  width_mm
}) {
  const normalizedTargetFormFactor = target_form_factor || null;
  const normalizedTargetConfigCode = target_config_code || null;
  const normalizedTargetConfigOther = target_config_other?.trim() || null;
  const normalizedShape =
    normalizedTargetFormFactor === 'coin' ? 'circle'
    : ['pouch', 'cylindrical', 'prism'].includes(normalizedTargetFormFactor) ? 'rectangle'
    : (shape || null);
  const normalizedDiameter = diameter_mm != null && diameter_mm !== '' ? Number(diameter_mm) : null;
  const normalizedLength = length_mm != null && length_mm !== '' ? Number(length_mm) : null;
  const normalizedWidth = width_mm != null && width_mm !== '' ? Number(width_mm) : null;

  if (normalizedShape && !['circle', 'rectangle'].includes(normalizedShape)) {
    return { error: 'Некорректная форма электрода' };
  }

  if (!normalizedTargetFormFactor || !ALLOWED_TARGET_FORM_FACTORS.has(normalizedTargetFormFactor)) {
    return { error: 'Необходимо выбрать форм-фактор элемента' };
  }

  if (!normalizedTargetConfigCode || !ALLOWED_TARGET_CONFIG_CODES.has(normalizedTargetConfigCode)) {
    return { error: 'Необходимо выбрать конфигурацию элемента' };
  }

  if (!TARGET_CONFIG_CODES_BY_FORM_FACTOR[normalizedTargetFormFactor].has(normalizedTargetConfigCode)) {
    return { error: 'Конфигурация не соответствует выбранному форм-фактору элемента' };
  }

  if (
    normalizedTargetConfigCode === 'other' &&
    !normalizedTargetConfigOther
  ) {
    return { error: 'Для конфигурации other необходимо заполнить пояснение' };
  }

  if (normalizedDiameter != null && (!Number.isFinite(normalizedDiameter) || normalizedDiameter <= 0)) {
    return { error: 'Диаметр должен быть положительным числом' };
  }

  if (normalizedLength != null && (!Number.isFinite(normalizedLength) || normalizedLength <= 0)) {
    return { error: 'Длина должна быть положительным числом' };
  }

  if (normalizedWidth != null && (!Number.isFinite(normalizedWidth) || normalizedWidth <= 0)) {
    return { error: 'Ширина должна быть положительным числом' };
  }

  if (normalizedShape === 'circle') {
    if (normalizedDiameter == null) {
      return { error: 'Для круглого электрода необходимо указать диаметр' };
    }

    if (normalizedLength != null || normalizedWidth != null) {
      return { error: 'Для круглого электрода нельзя указывать длину и ширину' };
    }

    if (normalizedTargetFormFactor !== 'coin') {
      return { error: 'Круглый электрод может относиться только к монеточному элементу' };
    }
  }

  if (normalizedShape === 'rectangle') {
    if (normalizedLength == null || normalizedWidth == null) {
      return { error: 'Для прямоугольного электрода необходимо указать длину и ширину' };
    }

    if (normalizedDiameter != null) {
      return { error: 'Для прямоугольного электрода нельзя указывать диаметр' };
    }

    if (!['pouch', 'cylindrical', 'prism'].includes(normalizedTargetFormFactor)) {
      return { error: 'Прямоугольный электрод может относиться только к pouch, prism или cylindrical' };
    }
  }

  return {
    target_form_factor: normalizedTargetFormFactor,
    target_config_code: normalizedTargetConfigCode,
    target_config_other: normalizedTargetConfigOther,
    shape: normalizedShape,
    diameter_mm: normalizedDiameter,
    length_mm: normalizedLength,
    width_mm: normalizedWidth
  };
}

async function assertTapeReadyForElectrodeCutting(queryable, tapeId) {
  const result = await queryable.query(
    `
    SELECT 1
    FROM tape_process_steps ps
    JOIN operation_types ot
      ON ot.operation_type_id = ps.operation_type_id
    JOIN tape_step_coating c
      ON c.step_id = ps.step_id
    WHERE ps.tape_id = $1
      AND ot.code = 'coating'
    LIMIT 1
    `,
    [tapeId]
  );

  if (!result.rowCount) {
    throw statusError('Сначала сохраните этап нанесения ленты', 400);
  }
}

async function listElectrodeCutBatches(pool) {
  const result = await pool.query(
    `
    SELECT
      b.*,
      t.name AS tape_name,
      t.project_id,
      p.name AS project_name,
      r.role AS tape_role,
      (
        SELECT c.coating_sidedness
        FROM tape_process_steps ts_coating
        JOIN operation_types ot_coating
          ON ot_coating.operation_type_id = ts_coating.operation_type_id
        JOIN tape_step_coating c
          ON c.step_id = ts_coating.step_id
        WHERE ts_coating.tape_id = b.tape_id
          AND ot_coating.code = 'coating'
        LIMIT 1
      ) AS tape_coating_sidedness,
      u_created.name AS created_by_name,
      u_updated.name AS updated_by_name,
      d.start_time AS drying_start,
      d.end_time AS drying_end,
      COALESCE(ec.electrode_count, 0) AS electrode_count
    FROM electrode_cut_batches b
    JOIN tapes t
      ON t.tape_id = b.tape_id
    LEFT JOIN projects p
      ON p.project_id = t.project_id
    LEFT JOIN tape_recipes r
      ON r.tape_recipe_id = t.tape_recipe_id
    LEFT JOIN users u_created
      ON u_created.user_id = b.created_by
    LEFT JOIN users u_updated
      ON u_updated.user_id = b.updated_by
    LEFT JOIN electrode_drying d
      ON d.cut_batch_id = b.cut_batch_id
    LEFT JOIN (
      SELECT
        cut_batch_id,
        COUNT(*) AS electrode_count
      FROM electrodes
      GROUP BY cut_batch_id
    ) ec
      ON ec.cut_batch_id = b.cut_batch_id
    ORDER BY ${ELECTRODE_CUT_BATCH_ORDER_BY_SQL}
    `
  );

  return attachElectrodeBatchProjects(pool, result.rows);
}

async function createElectrodeCutBatch(pool, payload, createdBy) {
  const tapeId = Number(payload.tape_id);
  const geometry = normalizeCutBatchGeometry(payload);
  const itemCreatedAtDate = normalizeOptionalItemCreatedAtDate(payload.item_created_at);

  if (geometry.error) {
    throw statusError(geometry.error, 400);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const tapeResult = await client.query(
      `
      SELECT tape_id, availability_status
      FROM tapes
      WHERE tape_id = $1
      `,
      [tapeId]
    );

    if (!tapeResult.rowCount) {
      throw statusError('Лента не найдена', 404);
    }

    if (tapeResult.rows[0].availability_status === 'depleted') {
      throw statusError('Лента отмечена как израсходованная', 400);
    }

    await assertTapeReadyForElectrodeCutting(client, tapeId);

    const payloadProjectIds = getPayloadProjectIds(payload);
    const projectIds = payloadProjectIds !== null
      ? payloadProjectIds
      : await getTapeProjectIds(client, tapeId);

    if (!projectIds.length) {
      throw statusError('Выберите хотя бы один проект партии электродов', 400);
    }
    await validateProjectIdsForTape(client, tapeId, projectIds);

    const result = await client.query(
      `
      INSERT INTO electrode_cut_batches (
        tape_id,
        created_by,
        target_form_factor,
        target_config_code,
        target_config_other,
        shape,
        diameter_mm,
        length_mm,
        width_mm,
        item_created_at,
        is_test_batch,
        comments
      )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10::date, CURRENT_DATE),$11,$12)
      RETURNING *
      `,
      [
        tapeId,
        createdBy,
        geometry.target_form_factor,
        geometry.target_config_code,
        geometry.target_config_other,
        geometry.shape,
        geometry.diameter_mm,
        geometry.length_mm,
        geometry.width_mm,
        itemCreatedAtDate,
        normalizeBooleanFlag(payload.is_test_batch),
        payload.comments || null
      ]
    );

    await client.query(
      `
      INSERT INTO tape_dry_box_state (
        tape_id,
        started_at,
        removed_at,
        temperature_c,
        atmosphere,
        other_parameters,
        comments,
        updated_by,
        updated_at
      )
      SELECT
        $1,
        COALESCE(ds.started_at, final_dry.started_at, now()),
        now(),
        COALESCE(ds.temperature_c, final_dry.temperature_c),
        COALESCE(ds.atmosphere, final_dry.atmosphere),
        COALESCE(ds.other_parameters, final_dry.other_parameters),
        ds.comments,
        $2,
        now()
      FROM (SELECT 1) seed
      LEFT JOIN tape_dry_box_state ds
        ON ds.tape_id = $1
      LEFT JOIN LATERAL (
        SELECT
          s.started_at,
          s.ended_at,
          d.temperature_c,
          d.atmosphere,
          d.other_parameters
        FROM tape_process_steps s
        JOIN operation_types ot
          ON ot.operation_type_id = s.operation_type_id
        LEFT JOIN tape_step_drying d
          ON d.step_id = s.step_id
        WHERE s.tape_id = $1
          AND ot.code = 'drying_pressed_tape'
        ORDER BY s.started_at DESC NULLS LAST, s.step_id DESC
        LIMIT 1
      ) final_dry ON TRUE
      WHERE ds.tape_id IS NOT NULL
         OR final_dry.ended_at IS NOT NULL
      ON CONFLICT (tape_id)
      DO UPDATE SET
        started_at = COALESCE(tape_dry_box_state.started_at, EXCLUDED.started_at),
        removed_at = EXCLUDED.removed_at,
        temperature_c = COALESCE(tape_dry_box_state.temperature_c, EXCLUDED.temperature_c),
        atmosphere = COALESCE(tape_dry_box_state.atmosphere, EXCLUDED.atmosphere),
        other_parameters = COALESCE(tape_dry_box_state.other_parameters, EXCLUDED.other_parameters),
        updated_by = EXCLUDED.updated_by,
        updated_at = now()
      `,
      [tapeId, createdBy]
    );

    await replaceElectrodeBatchProjects(client, result.rows[0].cut_batch_id, projectIds, createdBy);

    await client.query(
      `
      UPDATE tapes
      SET availability_status = 'out_of_dry_box'
      WHERE tape_id = $1
      `,
      [tapeId]
    );

    await client.query('COMMIT');
    const [createdBatch] = await attachElectrodeBatchProjects(client, result.rows);
    return createdBatch;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Rollback failed while creating electrode cut batch:', rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}

async function updateElectrodeCutBatch(pool, cutBatchId, payload, userId) {
  const itemCreatedAtDate = normalizeOptionalItemCreatedAtDate(payload.item_created_at);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const currentRes = await client.query(
      `
      SELECT
        cut_batch_id,
        tape_id,
        target_form_factor,
        target_config_code,
        target_config_other,
        shape,
        diameter_mm,
        length_mm,
        width_mm,
        item_created_at,
        is_test_batch,
        created_at,
        comments
      FROM electrode_cut_batches
      WHERE cut_batch_id = $1
      `,
      [cutBatchId]
    );

    if (currentRes.rowCount === 0) {
      throw statusError('Партия не найдена', 404);
    }

    const [current] = await attachElectrodeBatchProjects(client, currentRes.rows);
    const geometry = normalizeCutBatchGeometry({
      target_form_factor: payload.target_form_factor !== undefined ? payload.target_form_factor : current.target_form_factor,
      target_config_code: payload.target_config_code !== undefined ? payload.target_config_code : current.target_config_code,
      target_config_other: payload.target_config_other !== undefined ? payload.target_config_other : current.target_config_other,
      shape: payload.shape !== undefined ? payload.shape : current.shape,
      diameter_mm: payload.diameter_mm !== undefined ? payload.diameter_mm : current.diameter_mm,
      length_mm: payload.length_mm !== undefined ? payload.length_mm : current.length_mm,
      width_mm: payload.width_mm !== undefined ? payload.width_mm : current.width_mm
    });

    if (geometry.error) {
      throw statusError(geometry.error, 400);
    }

    const payloadProjectIds = getPayloadProjectIds(payload);
    const projectIds = payloadProjectIds !== null ? payloadProjectIds : current.project_ids;

    if (!projectIds.length) {
      throw statusError('Выберите хотя бы один проект партии электродов', 400);
    }
    await validateProjectIdsForTape(client, current.tape_id, projectIds);

    const newVals = {
      target_form_factor: geometry.target_form_factor,
      target_config_code: geometry.target_config_code,
      target_config_other: geometry.target_config_other,
      shape: geometry.shape,
      diameter_mm: geometry.diameter_mm,
      length_mm: geometry.length_mm,
      width_mm: geometry.width_mm,
      item_created_at: itemCreatedAtDate ?? current.item_created_at,
      is_test_batch: payload.is_test_batch !== undefined
        ? normalizeBooleanFlag(payload.is_test_batch)
        : Boolean(current.is_test_batch),
      comments: payload.comments !== undefined ? (payload.comments || null) : current.comments,
      project_ids: projectIds
    };

    const result = await client.query(
      `
      UPDATE electrode_cut_batches
      SET
        target_form_factor = $1,
        target_config_code = $2,
        target_config_other = $3,
        shape = $4,
        diameter_mm = $5,
        length_mm = $6,
        width_mm = $7,
        item_created_at = $8,
        is_test_batch = $9,
        comments = $10,
        updated_by = $11,
        updated_at = now()
      WHERE cut_batch_id = $12
      RETURNING *
      `,
      [
        newVals.target_form_factor,
        newVals.target_config_code,
        newVals.target_config_other,
        newVals.shape,
        newVals.diameter_mm,
        newVals.length_mm,
        newVals.width_mm,
        newVals.item_created_at,
        newVals.is_test_batch,
        newVals.comments,
        userId,
        cutBatchId
      ]
    );

    if (result.rowCount === 0) {
      throw statusError('Партия не найдена', 404);
    }

    if (payloadProjectIds !== null) {
      await replaceElectrodeBatchProjects(client, cutBatchId, projectIds, userId);
    }

    await trackChanges(
      client,
      'electrode_cut_batch',
      'electrode_cut_batches',
      'cut_batch_id',
      cutBatchId,
      current,
      newVals,
      userId
    );

    const [updatedBatch] = await attachElectrodeBatchProjects(client, result.rows);

    await client.query('COMMIT');
    return updatedBatch;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getElectrodeCutBatch(pool, cutBatchId) {
  const [result, capacityContext, electrodesResult] = await Promise.all([
    pool.query(
      `
      SELECT b.*,
        b.tape_id,
        (
          SELECT c.coating_sidedness
          FROM tape_process_steps ts_coating
          JOIN operation_types ot_coating
            ON ot_coating.operation_type_id = ts_coating.operation_type_id
          JOIN tape_step_coating c
            ON c.step_id = ts_coating.step_id
          WHERE ts_coating.tape_id = b.tape_id
            AND ot_coating.code = 'coating'
          LIMIT 1
        ) AS tape_coating_sidedness,
        u_created.name AS created_by_name,
        u_updated.name AS updated_by_name
      FROM electrode_cut_batches b
      LEFT JOIN users u_created ON u_created.user_id = b.created_by
      LEFT JOIN users u_updated ON u_updated.user_id = b.updated_by
      WHERE b.cut_batch_id = $1
      `,
      [cutBatchId]
    ),
    fetchCutBatchCapacityContext(pool, cutBatchId),
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
    )
  ]);

  if (result.rowCount === 0) {
    throw statusError('Партия не найдена', 404);
  }

  const electrodesWithDerived = electrodesResult.rows.map((row) => ({
    ...row,
    ...computeElectrodeDerivedValues(row, capacityContext)
  }));

  const [batch] = await attachElectrodeBatchProjects(pool, result.rows);

  return {
    ...batch,
    capacity_summary: buildBatchCapacitySummary(electrodesWithDerived, capacityContext)
  };
}

async function getElectrodeCutBatchReport(pool, cutBatchId) {
  const batchResult = await pool.query(
    `
    SELECT
      b.cut_batch_id,
      b.tape_id,
      b.comments,
      b.target_form_factor,
      b.target_config_code,
      b.target_config_other,
      b.shape,
      b.diameter_mm,
      b.length_mm,
      b.width_mm,
      b.item_created_at,
      b.is_test_batch,
      b.created_at,
      b.updated_at,
      b.created_by,
      b.updated_by,
      u_created.name AS created_by_name,
      u_updated.name AS updated_by_name,
      t.name AS tape_name,
      t.availability_status AS tape_availability_status,
      r.role AS tape_role,
      r.name AS tape_recipe_name,
      p.name AS project_name,
      (
        SELECT c.coating_sidedness
        FROM tape_process_steps ts_coating
        JOIN operation_types ot_coating
          ON ot_coating.operation_type_id = ts_coating.operation_type_id
        JOIN tape_step_coating c
          ON c.step_id = ts_coating.step_id
        WHERE ts_coating.tape_id = b.tape_id
          AND ot_coating.code = 'coating'
        LIMIT 1
      ) AS tape_coating_sidedness,
      d.drying_id,
      d.start_time AS drying_start_time,
      d.end_time AS drying_end_time,
      d.temperature_c AS drying_temperature_c,
      d.other_parameters AS drying_other_parameters,
      d.comments AS drying_comments
    FROM electrode_cut_batches b
    JOIN tapes t
      ON t.tape_id = b.tape_id
    LEFT JOIN tape_recipes r
      ON r.tape_recipe_id = t.tape_recipe_id
    LEFT JOIN projects p
      ON p.project_id = t.project_id
    LEFT JOIN users u_created
      ON u_created.user_id = b.created_by
    LEFT JOIN users u_updated
      ON u_updated.user_id = b.updated_by
    LEFT JOIN electrode_drying d
      ON d.cut_batch_id = b.cut_batch_id
    WHERE b.cut_batch_id = $1
    `,
    [cutBatchId]
  );

  if (batchResult.rowCount === 0) {
    throw statusError('Партия не найдена', 404);
  }

  const foilMassesResult = await pool.query(
    `
    SELECT foil_measurement_id, mass_g
    FROM foil_mass_measurements
    WHERE cut_batch_id = $1
    ORDER BY foil_measurement_id ASC
    `,
    [cutBatchId]
  );

  const electrodesResult = await pool.query(
    `
    SELECT
      electrode_id,
      number_in_batch,
      electrode_mass_g,
      cup_number,
      comments,
      status_code,
      used_in_battery_id,
      scrapped_reason,
      include_in_capacity_average
    FROM electrodes
    WHERE cut_batch_id = $1
    ORDER BY number_in_batch ASC, electrode_id ASC
    `,
    [cutBatchId]
  );

  const capacityContext = await fetchCutBatchCapacityContext(pool, cutBatchId);
  const electrodesWithDerived = electrodesResult.rows.map((row) => ({
    ...row,
    ...computeElectrodeDerivedValues(row, capacityContext)
  }));

  const [batch] = await attachElectrodeBatchProjects(pool, batchResult.rows);

  return {
    batch,
    foil_masses: foilMassesResult.rows,
    electrodes: electrodesWithDerived,
    capacity_summary: buildBatchCapacitySummary(electrodesWithDerived, capacityContext)
  };
}

async function collectCutBatchDeleteDependencies(pool, cutBatchId) {
  return collectDependencyConflicts(pool, [
    {
      key: 'electrodes',
      label: 'электроды, которые ещё находятся в этой партии',
      query: `
        SELECT electrode_id AS id, number_in_batch AS name
        FROM electrodes
        WHERE cut_batch_id = $1
        ORDER BY number_in_batch ASC, electrode_id ASC
        LIMIT 25
      `,
      params: [cutBatchId]
    },
    {
      key: 'battery_electrode_sources',
      label: 'аккумуляторы, где эта партия выбрана как источник электродов',
      query: `
        SELECT DISTINCT b.battery_id AS id, b.battery_notes AS name
        FROM battery_electrode_sources bes
        JOIN batteries b ON b.battery_id = bes.battery_id
        WHERE bes.cut_batch_id = $1
        ORDER BY b.battery_id
        LIMIT 25
      `,
      params: [cutBatchId]
    },
    {
      key: 'battery_electrodes',
      label: 'аккумуляторы с электродами из этой партии',
      query: `
        SELECT DISTINCT b.battery_id AS id, b.battery_notes AS name
        FROM battery_electrodes be
        JOIN batteries b ON b.battery_id = be.battery_id
        JOIN electrodes e ON e.electrode_id = be.electrode_id
        WHERE e.cut_batch_id = $1
        ORDER BY b.battery_id
        LIMIT 25
      `,
      params: [cutBatchId]
    }
  ]);
}

async function assertCutBatchCanBeDeleted(queryable, cutBatchId) {
  const batchResult = await queryable.query(
    'SELECT cut_batch_id FROM electrode_cut_batches WHERE cut_batch_id = $1',
    [cutBatchId]
  );

  if (batchResult.rowCount === 0) {
    throw statusError('Партия электродов не найдена', 404);
  }

  const dependencies = await collectCutBatchDeleteDependencies(queryable, cutBatchId);

  if (dependencies.length > 0) {
    const err = statusError('Нельзя удалить партию электродов: сначала удалите связанные электроды и аккумуляторные связи', 409);
    err.dependencies = dependencies;
    throw err;
  }
}

async function getElectrodeCutBatchDeleteCheck(pool, cutBatchId) {
  const batchResult = await pool.query(
    'SELECT cut_batch_id FROM electrode_cut_batches WHERE cut_batch_id = $1',
    [cutBatchId]
  );

  if (batchResult.rowCount === 0) {
    throw statusError('Партия электродов не найдена', 404);
  }

  const dependencies = await collectCutBatchDeleteDependencies(pool, cutBatchId);

  return {
    can_delete: dependencies.length === 0,
    error: dependencies.length > 0
      ? 'Нельзя удалить партию электродов: сначала удалите связанные электроды и аккумуляторные связи'
      : null,
    dependencies
  };
}

async function deleteElectrodeCutBatch(pool, cutBatchId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await assertCutBatchCanBeDeleted(client, cutBatchId);

    await client.query(
      'DELETE FROM foil_mass_measurements WHERE cut_batch_id = $1',
      [cutBatchId]
    );

    await client.query(
      'DELETE FROM electrode_drying WHERE cut_batch_id = $1',
      [cutBatchId]
    );

    await client.query(
      'DELETE FROM electrode_cut_batch_projects WHERE cut_batch_id = $1',
      [cutBatchId]
    );

    const result = await client.query(
      `DELETE FROM electrode_cut_batches WHERE cut_batch_id = $1`,
      [cutBatchId]
    );

    if (result.rowCount === 0) {
      throw statusError('Партия электродов не найдена', 404);
    }

    await client.query('COMMIT');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  collectCutBatchDeleteDependencies,
  createElectrodeCutBatch,
  deleteElectrodeCutBatch,
  getElectrodeCutBatchDeleteCheck,
  getElectrodeCutBatch,
  getElectrodeCutBatchReport,
  listElectrodeCutBatches,
  updateElectrodeCutBatch
};
