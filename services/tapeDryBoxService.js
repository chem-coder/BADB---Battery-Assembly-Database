const DRYING_STEP_CODES = new Set([
  'drying_am',
  'drying_tape',
  'drying_pressed_tape'
]);

const DRYING_STEP_ALIASES = {
  drying: 'drying_tape',
  drying_materials: 'drying_am',
  drying_pressed: 'drying_pressed_tape'
};

async function fetchTapeDryBoxState(queryable, tapeId) {
  const result = await queryable.query(
    `
    SELECT
      t.tape_id,
      ds.started_at,
      ds.removed_at,
      ds.temperature_c,
      ds.atmosphere,
      ds.other_parameters,
      ds.comments,
      ds.updated_by,
      ds.updated_at,
      t.availability_status,
      final_dry.ended_at AS final_drying_ended_at,
      (final_dry.ended_at IS NOT NULL) AS has_final_dry_box_storage,
      u.name AS updated_by_name
    FROM tapes t
    LEFT JOIN tape_dry_box_state ds
      ON ds.tape_id = t.tape_id
    LEFT JOIN LATERAL (
      SELECT s.ended_at
      FROM tape_process_steps s
      JOIN operation_types ot
        ON ot.operation_type_id = s.operation_type_id
      WHERE s.tape_id = t.tape_id
        AND ot.code = 'drying_pressed_tape'
      ORDER BY s.started_at DESC NULLS LAST, s.step_id DESC
      LIMIT 1
    ) final_dry ON TRUE
    LEFT JOIN users u
      ON u.user_id = ds.updated_by
    WHERE t.tape_id = $1
    `,
    [tapeId]
  );

  return result.rows[0] || null;
}

async function upsertTapeDryBoxState(queryable, {
  tapeId,
  startedAt,
  removedAt,
  temperatureC,
  atmosphere,
  otherParameters,
  comments,
  updatedBy
}) {
  await queryable.query(
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
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
    ON CONFLICT (tape_id)
    DO UPDATE SET
      started_at = EXCLUDED.started_at,
      removed_at = EXCLUDED.removed_at,
      temperature_c = EXCLUDED.temperature_c,
      atmosphere = EXCLUDED.atmosphere,
      other_parameters = EXCLUDED.other_parameters,
      comments = EXCLUDED.comments,
      updated_by = EXCLUDED.updated_by,
      updated_at = now()
    `,
    [
      tapeId,
      startedAt || null,
      removedAt || null,
      temperatureC,
      atmosphere || null,
      otherParameters || null,
      comments || null,
      updatedBy || null
    ]
  );
}

async function fetchLatestPressedTapeDryingStep(queryable, tapeId) {
  const result = await queryable.query(
    `
    SELECT
      s.started_at,
      s.ended_at,
      s.comments,
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
    `,
    [tapeId]
  );

  return result.rows[0] || null;
}

function normalizeDryingOperationCode(value) {
  const raw = String(value || 'drying_tape').trim();
  const code = DRYING_STEP_ALIASES[raw] || raw;
  return DRYING_STEP_CODES.has(code) ? code : null;
}

async function fetchTapeDryingStepByCode(queryable, tapeId, code) {
  const result = await queryable.query(
    `
    SELECT
      s.step_id,
      s.tape_id,
      s.operation_type_id,
      s.performed_by,
      s.started_at,
      s.ended_at,
      s.comments,
      d.temperature_c,
      d.atmosphere,
      d.target_duration_min,
      d.other_parameters
    FROM tape_process_steps s
    JOIN operation_types ot
      ON ot.operation_type_id = s.operation_type_id
    LEFT JOIN tape_step_drying d
      ON d.step_id = s.step_id
    WHERE s.tape_id = $1
      AND ot.code = $2
    `,
    [tapeId, code]
  );

  return result.rows[0] || null;
}

function isBeforeIso(isoA, isoB) {
  if (!isoA || !isoB) return false;
  const a = new Date(isoA);
  const b = new Date(isoB);
  return Number.isFinite(a.getTime()) && Number.isFinite(b.getTime()) && a.getTime() < b.getTime();
}

function statusError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
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

async function assertTapeExists(queryable, tapeId) {
  const tapeExists = await queryable.query(
    `SELECT tape_id FROM tapes WHERE tape_id = $1`,
    [tapeId]
  );

  if (!tapeExists.rowCount) {
    throw statusError('Лента не найдена', 404);
  }
}

function getFiniteTemperatureOrFallback(value, fallback) {
  return value != null && value !== '' && Number.isFinite(Number(value))
    ? Number(value)
    : (fallback ?? null);
}

function assertFinalDryingStartedAfterRequested(requestedStartedAt, finalDrying) {
  // P2 (2026-07-30, drybox_removal_plan.md, approved): the closet-tracking
  // gate is retired — dry-box routes stay for vanilla compatibility but no
  // longer require a finished final drying. Intentionally a no-op.
}

async function saveTapeDryBoxParameters(pool, tapeId, payload, updatedBy) {
  await runInTransaction(pool, async (client) => {
    await assertTapeExists(client, tapeId);

    const currentState = await fetchTapeDryBoxState(client, tapeId);
    const finalDrying = await fetchLatestPressedTapeDryingStep(client, tapeId);
    const requestedStartedAt = payload.started_at ?? currentState?.started_at ?? null;

    assertFinalDryingStartedAfterRequested(requestedStartedAt, finalDrying);

    await upsertTapeDryBoxState(client, {
      tapeId,
      startedAt: requestedStartedAt,
      removedAt: currentState?.removed_at ?? null,
      temperatureC: getFiniteTemperatureOrFallback(payload.temperature_c, currentState?.temperature_c),
      atmosphere: payload.atmosphere ?? currentState?.atmosphere ?? null,
      otherParameters: payload.other_parameters ?? currentState?.other_parameters ?? null,
      comments: payload.comments ?? currentState?.comments ?? null,
      updatedBy
    });
  });

  return fetchTapeDryBoxState(pool, tapeId);
}

async function returnTapeToDryBox(pool, tapeId, payload, updatedBy) {
  await runInTransaction(pool, async (client) => {
    await assertTapeExists(client, tapeId);

    const currentState = await fetchTapeDryBoxState(client, tapeId);
    const finalDrying = await fetchLatestPressedTapeDryingStep(client, tapeId);
    const nextStartedAt = payload.started_at || new Date().toISOString();

    assertFinalDryingStartedAfterRequested(nextStartedAt, finalDrying);

    await upsertTapeDryBoxState(client, {
      tapeId,
      startedAt: nextStartedAt,
      removedAt: null,
      temperatureC: getFiniteTemperatureOrFallback(payload.temperature_c, currentState?.temperature_c),
      atmosphere: payload.atmosphere || currentState?.atmosphere || null,
      otherParameters: payload.other_parameters ?? currentState?.other_parameters ?? null,
      comments: payload.comments ?? currentState?.comments ?? null,
      updatedBy
    });

    await client.query(
      `
      UPDATE tapes
      SET availability_status = 'in_dry_box'
      WHERE tape_id = $1
      `,
      [tapeId]
    );
  });

  return fetchTapeDryBoxState(pool, tapeId);
}

async function placeTapeInDryBox(pool, tapeId, payload, updatedBy) {
  await runInTransaction(pool, async (client) => {
    await assertTapeExists(client, tapeId);

    const currentState = await fetchTapeDryBoxState(client, tapeId);
    const nextStartedAt = payload.started_at || new Date().toISOString();

    await upsertTapeDryBoxState(client, {
      tapeId,
      startedAt: nextStartedAt,
      removedAt: null,
      temperatureC: getFiniteTemperatureOrFallback(payload.temperature_c, currentState?.temperature_c),
      atmosphere: payload.atmosphere || currentState?.atmosphere || null,
      otherParameters: payload.other_parameters ?? currentState?.other_parameters ?? null,
      comments: payload.comments ?? currentState?.comments ?? null,
      updatedBy
    });

    await client.query(
      `
      UPDATE tapes
      SET availability_status = 'in_dry_box'
      WHERE tape_id = $1
      `,
      [tapeId]
    );
  });

  return fetchTapeDryBoxState(pool, tapeId);
}

async function removeTapeFromDryBox(pool, tapeId, updatedBy) {
  await runInTransaction(pool, async (client) => {
    await assertTapeExists(client, tapeId);

    const currentState = await fetchTapeDryBoxState(client, tapeId);
    const finalDrying = await fetchLatestPressedTapeDryingStep(client, tapeId);

    // P2 (2026-07-30): gate retired — see assertFinalDryingStartedAfterRequested.
    const nextStartedAt = currentState?.started_at || finalDrying?.ended_at || new Date().toISOString();

    await upsertTapeDryBoxState(client, {
      tapeId,
      startedAt: nextStartedAt,
      removedAt: new Date().toISOString(),
      temperatureC: currentState?.temperature_c ?? finalDrying.temperature_c ?? null,
      atmosphere: currentState?.atmosphere || finalDrying.atmosphere || null,
      otherParameters: currentState?.other_parameters ?? finalDrying.other_parameters ?? null,
      comments: currentState?.comments ?? finalDrying.comments ?? null,
      updatedBy
    });

    await client.query(
      `
      UPDATE tapes
      SET availability_status = 'out_of_dry_box'
      WHERE tape_id = $1
      `,
      [tapeId]
    );
  });

  return fetchTapeDryBoxState(pool, tapeId);
}

async function depleteTapeDryBox(pool, tapeId, updatedBy) {
  await runInTransaction(pool, async (client) => {
    await assertTapeExists(client, tapeId);

    const currentState = await fetchTapeDryBoxState(client, tapeId);

    await upsertTapeDryBoxState(client, {
      tapeId,
      startedAt: currentState?.started_at || null,
      removedAt: currentState?.removed_at || new Date().toISOString(),
      temperatureC: currentState?.temperature_c ?? null,
      atmosphere: currentState?.atmosphere || null,
      otherParameters: currentState?.other_parameters ?? null,
      comments: currentState?.comments ?? null,
      updatedBy
    });

    await client.query(
      `
      UPDATE tapes
      SET availability_status = 'depleted'
      WHERE tape_id = $1
      `,
      [tapeId]
    );
  });

  return fetchTapeDryBoxState(pool, tapeId);
}

module.exports = {
  depleteTapeDryBox,
  fetchLatestPressedTapeDryingStep,
  fetchTapeDryBoxState,
  fetchTapeDryingStepByCode,
  isBeforeIso,
  normalizeDryingOperationCode,
  removeTapeFromDryBox,
  placeTapeInDryBox,
  returnTapeToDryBox,
  saveTapeDryBoxParameters,
  upsertTapeDryBoxState
};
