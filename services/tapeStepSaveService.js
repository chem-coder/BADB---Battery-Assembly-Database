const { trackChanges } = require('../middleware/trackChanges');
const { upsertTapeDryBoxState } = require('./tapeDryBoxService');

const DRYING_STEP_CODES = new Set([
  'drying_am',
  'drying_tape',
  'drying_pressed_tape'
]);

const SAVE_ERROR_MESSAGES = {
  drying_am: 'Ошибка сохранения этапа сушки',
  drying_tape: 'Ошибка сохранения этапа сушки',
  drying_pressed_tape: 'Ошибка сохранения этапа сушки',
  weighing: 'Ошибка сохранения этапа взвешивания',
  mixing: 'Ошибка сохранения этапа перемешивания',
  coating: 'Ошибка сохранения этапа нанесения',
  calendering: 'Ошибка сохранения этапа каландрирования'
};

function numberOrNull(value) {
  return Number(value) || null;
}

function finiteNumberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function valueOrNull(value) {
  return value || null;
}

function getTapeStepSaveErrorMessage(code) {
  return SAVE_ERROR_MESSAGES[code] || `Ошибка сохранения этапа ${code}`;
}

async function auditStepChange(queryable, code, subtypeTable, stepId, oldValues, newValues, userId) {
  if (!oldValues) return;

  try {
    await trackChanges(
      queryable,
      `tape_step_${code}`,
      subtypeTable,
      'step_id',
      stepId,
      oldValues,
      newValues,
      userId,
      null,
      false
    );
  } catch (err) {
    console.error(`trackChanges failed for ${code} step ${stepId}:`, err);
  }
}

async function runInTransaction(pool, fn) {
  const client = await pool.connect();
  let began = false;

  try {
    await client.query('BEGIN');
    began = true;
    const result = await fn(client);
    await client.query('COMMIT');
    began = false;
    return result;
  } catch (err) {
    if (began) {
      await client.query('ROLLBACK');
    }
    throw err;
  } finally {
    client.release();
  }
}

async function getOperationTypeId(client, code) {
  const result = await client.query(
    `SELECT operation_type_id FROM operation_types WHERE code = $1`,
    [code]
  );

  if (result.rows.length === 0) {
    throw new Error(`Unknown operation code: ${code}`);
  }

  return result.rows[0].operation_type_id;
}

async function upsertStepHeader(client, {
  tapeId,
  operationTypeId,
  performedBy,
  startedAt,
  endedAt,
  comments,
  includeEndedAt
}) {
  if (includeEndedAt) {
    const result = await client.query(
      `
      INSERT INTO tape_process_steps (tape_id, operation_type_id, performed_by, started_at, ended_at, comments)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (tape_id, operation_type_id)
      DO UPDATE SET
        performed_by = EXCLUDED.performed_by,
        started_at   = EXCLUDED.started_at,
        ended_at     = EXCLUDED.ended_at,
        comments     = EXCLUDED.comments
      RETURNING step_id
      `,
      [tapeId, operationTypeId, performedBy, startedAt, endedAt, comments]
    );

    return result.rows[0].step_id;
  }

  const result = await client.query(
    `
    INSERT INTO tape_process_steps
      (tape_id, operation_type_id, performed_by, started_at, comments)
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (tape_id, operation_type_id)
    DO UPDATE SET
      performed_by = EXCLUDED.performed_by,
      started_at   = EXCLUDED.started_at,
      comments     = EXCLUDED.comments
    RETURNING step_id
    `,
    [tapeId, operationTypeId, performedBy, startedAt, comments]
  );

  return result.rows[0].step_id;
}

async function saveDryingStep(pool, { tapeId, code, body, userId }) {
  const {
    performed_by,
    started_at,
    ended_at,
    comments,
    temperature_c,
    atmosphere,
    target_duration_min,
    drying_speed_text,
    other_parameters
  } = body;

  const result = await runInTransaction(pool, async (client) => {
    const operationTypeId = await getOperationTypeId(client, code);

    const previous = await client.query(
      `
      SELECT ps.performed_by, ps.started_at, ps.comments,
             sub.temperature_c, sub.atmosphere, sub.target_duration_min,
             sub.drying_speed_text, sub.other_parameters
      FROM tape_process_steps ps
      LEFT JOIN tape_step_drying sub ON sub.step_id = ps.step_id
      WHERE ps.tape_id = $1 AND ps.operation_type_id = $2
      `,
      [tapeId, operationTypeId]
    );

    const stepId = await upsertStepHeader(client, {
      tapeId,
      operationTypeId,
      performedBy: numberOrNull(performed_by),
      startedAt: valueOrNull(started_at),
      endedAt: valueOrNull(ended_at),
      comments: valueOrNull(comments),
      includeEndedAt: true
    });

    await client.query(
      `
      INSERT INTO tape_step_drying
        (step_id, temperature_c, atmosphere, target_duration_min, drying_speed_text, other_parameters)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (step_id)
      DO UPDATE SET
        temperature_c = EXCLUDED.temperature_c,
        atmosphere = EXCLUDED.atmosphere,
        target_duration_min = EXCLUDED.target_duration_min,
        drying_speed_text = EXCLUDED.drying_speed_text,
        other_parameters = EXCLUDED.other_parameters
      `,
      [
        stepId,
        finiteNumberOrNull(temperature_c),
        valueOrNull(atmosphere),
        finiteNumberOrNull(target_duration_min),
        valueOrNull(drying_speed_text),
        valueOrNull(other_parameters)
      ]
    );

    if (code === 'drying_pressed_tape') {
      await client.query(
        `
        UPDATE tapes
        SET availability_status = 'in_dry_box'
        WHERE tape_id = $1
        `,
        [tapeId]
      );

      await upsertTapeDryBoxState(client, {
        tapeId,
        startedAt: valueOrNull(started_at),
        removedAt: null,
        temperatureC: finiteNumberOrNull(temperature_c),
        atmosphere: valueOrNull(atmosphere),
        otherParameters: valueOrNull(other_parameters),
        comments: valueOrNull(comments),
        updatedBy: numberOrNull(performed_by)
      });
    }

    return {
      stepId,
      oldValues: previous.rows[0] || null,
      newValues: {
        performed_by: numberOrNull(performed_by),
        started_at: valueOrNull(started_at),
        comments: valueOrNull(comments),
        temperature_c: finiteNumberOrNull(temperature_c),
        atmosphere: valueOrNull(atmosphere),
        target_duration_min: finiteNumberOrNull(target_duration_min),
        drying_speed_text: valueOrNull(drying_speed_text),
        other_parameters: valueOrNull(other_parameters)
      }
    };
  });

  await auditStepChange(pool, code, 'tape_step_drying', result.stepId, result.oldValues, result.newValues, userId);
  return { statusCode: 201, payload: { step_id: result.stepId } };
}

async function saveWeighingStep(pool, { tapeId, code, body, userId }) {
  const { performed_by, started_at, comments } = body;

  const result = await runInTransaction(pool, async (client) => {
    const operationTypeId = await getOperationTypeId(client, code);

    const previous = await client.query(
      `
      SELECT performed_by, started_at, comments
      FROM tape_process_steps
      WHERE tape_id = $1 AND operation_type_id = $2
      `,
      [tapeId, operationTypeId]
    );

    const stepId = await upsertStepHeader(client, {
      tapeId,
      operationTypeId,
      performedBy: numberOrNull(performed_by),
      startedAt: valueOrNull(started_at),
      comments: valueOrNull(comments),
      includeEndedAt: false
    });

    return {
      stepId,
      oldValues: previous.rows[0] || null,
      newValues: {
        performed_by: numberOrNull(performed_by),
        started_at: valueOrNull(started_at),
        comments: valueOrNull(comments)
      }
    };
  });

  await auditStepChange(pool, code, 'tape_process_steps', result.stepId, result.oldValues, result.newValues, userId);
  return { statusCode: 201, payload: { step_id: result.stepId } };
}

async function saveMixingStep(pool, { tapeId, code, body, userId }) {
  const {
    performed_by,
    started_at,
    comments,
    slurry_volume_ml,
    dry_mixing_id,
    dry_start_time,
    dry_duration_min,
    dry_end_time,
    dry_rpm,
    wet_mixing_id,
    wet_start_time,
    wet_duration_min,
    wet_end_time,
    wet_rpm,
    viscosity_cP,
    viscosity_conditions
  } = body;

  const result = await runInTransaction(pool, async (client) => {
    const operationTypeId = await getOperationTypeId(client, code);

    const previous = await client.query(
      `
      SELECT ps.performed_by, ps.started_at, ps.comments,
             sub.slurry_volume_ml,
             sub.dry_mixing_id, sub.dry_start_time, sub.dry_duration_min, sub.dry_rpm,
             sub.wet_mixing_id, sub.wet_start_time, sub.wet_duration_min, sub.wet_rpm,
             sub.viscosity_cp,
             sub.viscosity_conditions
      FROM tape_process_steps ps
      LEFT JOIN tape_step_mixing sub ON sub.step_id = ps.step_id
      WHERE ps.tape_id = $1 AND ps.operation_type_id = $2
      `,
      [tapeId, operationTypeId]
    );

    const stepId = await upsertStepHeader(client, {
      tapeId,
      operationTypeId,
      performedBy: numberOrNull(performed_by),
      startedAt: valueOrNull(started_at),
      comments: valueOrNull(comments),
      includeEndedAt: false
    });

    await client.query(
      `
      INSERT INTO tape_step_mixing
        (step_id, slurry_volume_ml,
        dry_mixing_id, dry_start_time, dry_duration_min, dry_end_time, dry_rpm,
        wet_mixing_id, wet_start_time, wet_duration_min, wet_end_time, wet_rpm,
        viscosity_cP, viscosity_conditions)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (step_id)
      DO UPDATE SET
        slurry_volume_ml  = EXCLUDED.slurry_volume_ml,
        dry_mixing_id     = EXCLUDED.dry_mixing_id,
        dry_start_time    = EXCLUDED.dry_start_time,
        dry_duration_min  = EXCLUDED.dry_duration_min,
        dry_end_time      = EXCLUDED.dry_end_time,
        dry_rpm           = EXCLUDED.dry_rpm,
        wet_mixing_id     = EXCLUDED.wet_mixing_id,
        wet_start_time    = EXCLUDED.wet_start_time,
        wet_duration_min  = EXCLUDED.wet_duration_min,
        wet_end_time      = EXCLUDED.wet_end_time,
        wet_rpm           = EXCLUDED.wet_rpm,
        viscosity_cP      = EXCLUDED.viscosity_cP,
        viscosity_conditions = EXCLUDED.viscosity_conditions
      `,
      [
        stepId,
        finiteNumberOrNull(slurry_volume_ml),
        numberOrNull(dry_mixing_id),
        valueOrNull(dry_start_time),
        finiteNumberOrNull(dry_duration_min),
        valueOrNull(dry_end_time),
        valueOrNull(dry_rpm),
        numberOrNull(wet_mixing_id),
        valueOrNull(wet_start_time),
        finiteNumberOrNull(wet_duration_min),
        valueOrNull(wet_end_time),
        valueOrNull(wet_rpm),
        finiteNumberOrNull(viscosity_cP),
        valueOrNull(viscosity_conditions)
      ]
    );

    return {
      stepId,
      oldValues: previous.rows[0] || null,
      newValues: {
        performed_by: numberOrNull(performed_by),
        started_at: valueOrNull(started_at),
        comments: valueOrNull(comments),
        slurry_volume_ml: finiteNumberOrNull(slurry_volume_ml),
        dry_mixing_id: numberOrNull(dry_mixing_id),
        dry_start_time: valueOrNull(dry_start_time),
        dry_duration_min: finiteNumberOrNull(dry_duration_min),
        dry_rpm: valueOrNull(dry_rpm),
        wet_mixing_id: numberOrNull(wet_mixing_id),
        wet_start_time: valueOrNull(wet_start_time),
        wet_duration_min: finiteNumberOrNull(wet_duration_min),
        wet_rpm: valueOrNull(wet_rpm),
        viscosity_cp: finiteNumberOrNull(viscosity_cP),
        viscosity_conditions: valueOrNull(viscosity_conditions)
      }
    };
  });

  await auditStepChange(pool, code, 'tape_step_mixing', result.stepId, result.oldValues, result.newValues, userId);
  return { statusCode: 201, payload: { step_id: result.stepId } };
}

async function saveCoatingStep(pool, { tapeId, code, body, userId }) {
  const {
    performed_by,
    started_at,
    comments,
    foil_id,
    coating_id,
    coating_sidedness,
    gap_um,
    gap_um_side2,
    coat_temp_c,
    coat_time_min,
    method_comments
  } = body;

  const result = await runInTransaction(pool, async (client) => {
    const operationTypeId = await getOperationTypeId(client, code);

    const previous = await client.query(
      `
      SELECT ps.performed_by, ps.started_at, ps.comments,
             sub.foil_id, sub.coating_id, sub.coating_sidedness, sub.gap_um,
             sub.gap_um_side2, sub.coat_temp_c, sub.coat_time_min, sub.method_comments
      FROM tape_process_steps ps
      LEFT JOIN tape_step_coating sub ON sub.step_id = ps.step_id
      WHERE ps.tape_id = $1 AND ps.operation_type_id = $2
      `,
      [tapeId, operationTypeId]
    );

    const stepId = await upsertStepHeader(client, {
      tapeId,
      operationTypeId,
      performedBy: numberOrNull(performed_by),
      startedAt: valueOrNull(started_at),
      comments: valueOrNull(comments),
      includeEndedAt: false
    });

    await client.query(
      `
      INSERT INTO tape_step_coating
        (step_id, foil_id, coating_id, coating_sidedness, gap_um, gap_um_side2, coat_temp_c, coat_time_min, method_comments)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (step_id)
      DO UPDATE SET
        foil_id = EXCLUDED.foil_id,
        coating_id = EXCLUDED.coating_id,
        coating_sidedness = EXCLUDED.coating_sidedness,
        gap_um = EXCLUDED.gap_um,
        gap_um_side2 = EXCLUDED.gap_um_side2,
        coat_temp_c = EXCLUDED.coat_temp_c,
        coat_time_min = EXCLUDED.coat_time_min,
        method_comments = EXCLUDED.method_comments
      `,
      [
        stepId,
        numberOrNull(foil_id),
        numberOrNull(coating_id),
        valueOrNull(coating_sidedness),
        finiteNumberOrNull(gap_um),
        finiteNumberOrNull(gap_um_side2),
        finiteNumberOrNull(coat_temp_c),
        finiteNumberOrNull(coat_time_min),
        valueOrNull(method_comments)
      ]
    );

    return {
      stepId,
      oldValues: previous.rows[0] || null,
      newValues: {
        performed_by: numberOrNull(performed_by),
        started_at: valueOrNull(started_at),
        comments: valueOrNull(comments),
        foil_id: numberOrNull(foil_id),
        coating_id: numberOrNull(coating_id),
        coating_sidedness: valueOrNull(coating_sidedness),
        gap_um: finiteNumberOrNull(gap_um),
        gap_um_side2: finiteNumberOrNull(gap_um_side2),
        coat_temp_c: finiteNumberOrNull(coat_temp_c),
        coat_time_min: finiteNumberOrNull(coat_time_min),
        method_comments: valueOrNull(method_comments)
      }
    };
  });

  await auditStepChange(pool, code, 'tape_step_coating', result.stepId, result.oldValues, result.newValues, userId);
  return { statusCode: 201, payload: { step_id: result.stepId } };
}

async function saveCalenderingStep(pool, { tapeId, code, body, userId }) {
  const {
    performed_by,
    started_at,
    comments,
    temp_c,
    pressure_value,
    pressure_units,
    draw_speed_m_min,
    other_params,
    init_thickness_microns,
    final_thickness_microns,
    no_passes,
    appearance
  } = body;

  const result = await runInTransaction(pool, async (client) => {
    const operationTypeId = await getOperationTypeId(client, code);

    const previous = await client.query(
      `
      SELECT ps.performed_by, ps.started_at, ps.comments,
             sub.temp_c, sub.pressure_value, sub.pressure_units,
             sub.draw_speed_m_min, sub.other_params,
             sub.init_thickness_microns, sub.final_thickness_microns,
             sub.no_passes, sub.appearance
      FROM tape_process_steps ps
      LEFT JOIN tape_step_calendering sub ON sub.step_id = ps.step_id
      WHERE ps.tape_id = $1 AND ps.operation_type_id = $2
      `,
      [tapeId, operationTypeId]
    );

    const stepId = await upsertStepHeader(client, {
      tapeId,
      operationTypeId,
      performedBy: numberOrNull(performed_by),
      startedAt: valueOrNull(started_at),
      comments: valueOrNull(comments),
      includeEndedAt: false
    });

    await client.query(
      `
      INSERT INTO tape_step_calendering (
        step_id,
        temp_c,
        pressure_value,
        pressure_units,
        draw_speed_m_min,
        other_params,
        init_thickness_microns,
        final_thickness_microns,
        no_passes,
        appearance
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (step_id)
      DO UPDATE SET
        temp_c = EXCLUDED.temp_c,
        pressure_value = EXCLUDED.pressure_value,
        pressure_units = EXCLUDED.pressure_units,
        draw_speed_m_min = EXCLUDED.draw_speed_m_min,
        other_params = EXCLUDED.other_params,
        init_thickness_microns = EXCLUDED.init_thickness_microns,
        final_thickness_microns = EXCLUDED.final_thickness_microns,
        no_passes = EXCLUDED.no_passes,
        appearance = EXCLUDED.appearance
      `,
      [
        stepId,
        finiteNumberOrNull(temp_c),
        finiteNumberOrNull(pressure_value),
        valueOrNull(pressure_units),
        finiteNumberOrNull(draw_speed_m_min),
        valueOrNull(other_params),
        finiteNumberOrNull(init_thickness_microns),
        finiteNumberOrNull(final_thickness_microns),
        finiteNumberOrNull(no_passes),
        valueOrNull(appearance)
      ]
    );

    return {
      stepId,
      oldValues: previous.rows[0] || null,
      newValues: {
        performed_by: numberOrNull(performed_by),
        started_at: valueOrNull(started_at),
        comments: valueOrNull(comments),
        temp_c: finiteNumberOrNull(temp_c),
        pressure_value: finiteNumberOrNull(pressure_value),
        pressure_units: valueOrNull(pressure_units),
        draw_speed_m_min: finiteNumberOrNull(draw_speed_m_min),
        other_params: valueOrNull(other_params),
        init_thickness_microns: finiteNumberOrNull(init_thickness_microns),
        final_thickness_microns: finiteNumberOrNull(final_thickness_microns),
        no_passes: finiteNumberOrNull(no_passes),
        appearance: valueOrNull(appearance)
      }
    };
  });

  await auditStepChange(pool, code, 'tape_step_calendering', result.stepId, result.oldValues, result.newValues, userId);
  return { statusCode: 201, payload: { step_id: result.stepId } };
}

async function saveTapeStepByCode(pool, { tapeId, code, body, userId }) {
  const payload = body || {};

  if (DRYING_STEP_CODES.has(code)) {
    return saveDryingStep(pool, { tapeId, code, body: payload, userId });
  }

  if (code === 'weighing') {
    return saveWeighingStep(pool, { tapeId, code, body: payload, userId });
  }

  if (code === 'mixing') {
    return saveMixingStep(pool, { tapeId, code, body: payload, userId });
  }

  if (code === 'coating') {
    return saveCoatingStep(pool, { tapeId, code, body: payload, userId });
  }

  if (code === 'calendering') {
    return saveCalenderingStep(pool, { tapeId, code, body: payload, userId });
  }

  return {
    statusCode: 501,
    payload: { error: `No saver implemented for code: ${code}` }
  };
}

module.exports = {
  getTapeStepSaveErrorMessage,
  saveTapeStepByCode
};
