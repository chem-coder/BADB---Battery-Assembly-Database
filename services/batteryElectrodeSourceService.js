const { trackChanges } = require('../middleware/trackChanges');

const ELECTRODE_SOURCE_ROLES = ['cathode', 'anode'];

class BatteryElectrodeSourceValidationError extends Error {
  // statusCode default 400 (validation). Pass 404 for "row not found"
  // shape errors so the route returns the right status. Optional `details`
  // object exposes richer fields on the JSON response.
  //
  // Allowlist explicit keys instead of Object.assign(this, details) - that
  // would let a caller overwrite this.message / this.statusCode / this.name
  // by passing them in details. Only callers in this service file build
  // details, so the risk is internal - but the explicit form is clearer
  // about the contract and avoids silent surprises if more details fields
  // are added later.
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.name = 'BatteryElectrodeSourceValidationError';
    this.statusCode = statusCode;
    if (details) {
      if (details.missing_roles !== undefined) this.missing_roles = details.missing_roles;
      if (details.updated !== undefined) this.updated = details.updated;
    }
  }
}

function hasOwn(payload, key) {
  return Object.prototype.hasOwnProperty.call(payload || {}, key);
}

function hasMeaningfulValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function normalizeOptionalInteger(value, fieldName) {
  if (!hasMeaningfulValue(value)) return null;

  const number = Number(value);
  if (!Number.isInteger(number)) {
    throw new BatteryElectrodeSourceValidationError(`Некорректное значение ${fieldName}`);
  }

  return number;
}

function normalizeSourceRole(role) {
  const value = String(role || '').trim().toLowerCase();

  if (value === 'cathode' || value === 'anode') return value;

  throw new BatteryElectrodeSourceValidationError('Некорректная роль источника электродов');
}

function normalizeSortOrder(value, fallback) {
  if (!hasMeaningfulValue(value)) return fallback;

  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function normalizeBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const text = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(text)) return true;
  if (['false', '0', 'no', 'off'].includes(text)) return false;

  return fallback;
}

function normalizeSourceRow(raw, fallbackRole, fallbackSortOrder) {
  const role = normalizeSourceRole(raw.role || fallbackRole);
  const tapeId = normalizeOptionalInteger(raw.tape_id, 'tape_id');
  const cutBatchId = normalizeOptionalInteger(raw.cut_batch_id, 'cut_batch_id');
  const sourceNotes = hasMeaningfulValue(raw.source_notes)
    ? String(raw.source_notes).trim()
    : null;
  const rowHasAnyValue =
    tapeId !== null ||
    cutBatchId !== null ||
    sourceNotes !== null;

  if (!rowHasAnyValue) return null;

  if (!cutBatchId) {
    throw new BatteryElectrodeSourceValidationError(
      'Для источника электродов должна быть выбрана партия вырезанных электродов'
    );
  }

  return {
    role,
    tape_id: tapeId,
    cut_batch_id: cutBatchId,
    source_notes: sourceNotes,
    sort_order: normalizeSortOrder(raw.sort_order, fallbackSortOrder),
    is_primary: normalizeBoolean(raw.is_primary, fallbackSortOrder === 0)
  };
}

async function hydrateSourceRowsWithCutBatchTapes(queryable, rows) {
  const cutBatchIds = [...new Set(
    rows
      .filter((row) => row.cut_batch_id)
      .map((row) => row.cut_batch_id)
  )];

  if (!cutBatchIds.length) return rows;

  const result = await queryable.query(
    `
    SELECT cut_batch_id, tape_id
    FROM electrode_cut_batches
    WHERE cut_batch_id = ANY($1::int[])
    `,
    [cutBatchIds]
  );
  const tapeByBatch = result.rows.reduce((acc, row) => {
    acc[Number(row.cut_batch_id)] = Number(row.tape_id);
    return acc;
  }, {});
  const missingBatchIds = cutBatchIds.filter((cutBatchId) => !tapeByBatch[cutBatchId]);

  if (missingBatchIds.length) {
    throw new BatteryElectrodeSourceValidationError('Выбранная партия вырезанных электродов не найдена');
  }

  return rows.map((row) => {
    const cutBatchTapeId = tapeByBatch[row.cut_batch_id] || null;

    if (row.tape_id && cutBatchTapeId && row.tape_id !== cutBatchTapeId) {
      throw new BatteryElectrodeSourceValidationError(
        'Выбранная партия вырезанных электродов не относится к выбранной ленте'
      );
    }

    return {
      ...row,
      tape_id: row.tape_id || cutBatchTapeId
    };
  });
}

function normalizePrimaryRows(rows) {
  const byRole = new Map();

  rows.forEach((row) => {
    if (!byRole.has(row.role)) byRole.set(row.role, []);
    byRole.get(row.role).push(row);
  });

  byRole.forEach((roleRows) => {
    const sortedRows = roleRows.sort((a, b) => a.sort_order - b.sort_order);
    const explicitPrimaryRows = sortedRows.filter((row) => row.is_primary);

    sortedRows.forEach((row) => {
      row.is_primary = false;
    });

    (explicitPrimaryRows[0] || sortedRows[0]).is_primary = true;
  });

  return rows;
}

function assertNoDuplicateRoleBatches(rows) {
  const keys = new Set();

  rows.forEach((row) => {
    const key = `${row.role}:${row.cut_batch_id}`;
    if (keys.has(key)) {
      throw new BatteryElectrodeSourceValidationError(
        'Одна и та же партия не может быть выбрана дважды для одной роли'
      );
    }
    keys.add(key);
  });
}

function getArrayPayload(payload = {}) {
  if (Array.isArray(payload.sources)) return payload.sources;
  if (Array.isArray(payload.electrode_sources)) return payload.electrode_sources;
  return null;
}

function getLegacyRolePayload(payload, role) {
  return {
    role,
    tape_id: payload[`${role}_tape_id`],
    cut_batch_id: payload[`${role}_cut_batch_id`],
    source_notes: payload[`${role}_source_notes`],
    sort_order: 0,
    is_primary: true
  };
}

function roleWasRequestedInLegacyPayload(payload, role) {
  return [
    `${role}_tape_id`,
    `${role}_cut_batch_id`,
    `${role}_source_notes`
  ].some((fieldName) => hasOwn(payload, fieldName));
}

function normalizeBatteryElectrodeSourcePayload(payload = {}) {
  const arrayPayload = getArrayPayload(payload);

  if (arrayPayload) {
    const rows = arrayPayload
      .map((source, index) => normalizeSourceRow(source || {}, null, index))
      .filter(Boolean);

    assertNoDuplicateRoleBatches(rows);

    return {
      mode: 'array',
      rows: normalizePrimaryRows(rows),
      requestedRoles: ELECTRODE_SOURCE_ROLES
    };
  }

  const rows = [];
  const requestedRoles = [];

  ELECTRODE_SOURCE_ROLES.forEach((role) => {
    if (roleWasRequestedInLegacyPayload(payload, role)) {
      requestedRoles.push(role);
      const row = normalizeSourceRow(getLegacyRolePayload(payload, role), role, 0);
      if (row) rows.push(row);
    }
  });

  assertNoDuplicateRoleBatches(rows);

  return {
    mode: 'legacy',
    rows: normalizePrimaryRows(rows),
    requestedRoles
  };
}

function getRowsByRole(rows) {
  return rows.reduce((acc, row) => {
    if (!acc[row.role]) acc[row.role] = [];
    acc[row.role].push(row);
    return acc;
  }, {});
}

async function assertCompatibleSidedness(queryable, cutBatchIds) {
  const uniqueCutBatchIds = [...new Set(
    (Array.isArray(cutBatchIds) ? cutBatchIds : Array.from(arguments).slice(1))
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value))
  )];

  if (uniqueCutBatchIds.length < 2) return;

  const sidednessResult = await queryable.query(
    `
    SELECT
      cb.cut_batch_id,
      (
        SELECT c.coating_sidedness
        FROM tape_process_steps ts
        JOIN operation_types ot
          ON ot.operation_type_id = ts.operation_type_id
        JOIN tape_step_coating c
          ON c.step_id = ts.step_id
        WHERE ts.tape_id = cb.tape_id
          AND ot.code = 'coating'
        LIMIT 1
      ) AS coating_sidedness
    FROM electrode_cut_batches cb
    WHERE cb.cut_batch_id = ANY($1::int[])
    `,
    [uniqueCutBatchIds]
  );

  const sidednessValues = [...new Set(
    sidednessResult.rows
      .map((row) => row.coating_sidedness || null)
      .filter(Boolean)
  )];

  if (sidednessValues.length > 1) {
    throw new BatteryElectrodeSourceValidationError('Нельзя смешивать 1- и 2-сторонние электроды в одной ячейке');
  }
}

async function getBatteryFormAndCoinMode(queryable, batteryId) {
  const batteryResult = await queryable.query(
    `SELECT form_factor FROM batteries WHERE battery_id = $1`,
    [batteryId]
  );

  if (batteryResult.rows.length === 0) {
    throw new BatteryElectrodeSourceValidationError('Некорректный ID батареи');
  }

  const form = batteryResult.rows[0].form_factor;
  let coinMode = null;
  let halfCellType = null;

  if (form === 'coin') {
    const modeResult = await queryable.query(
      `
      SELECT coin_cell_mode, half_cell_type
      FROM battery_coin_config
      WHERE battery_id = $1
      `,
      [batteryId]
    );

    if (modeResult.rows.length === 0) {
      throw new BatteryElectrodeSourceValidationError('Конфигурация coin cell не найдена');
    }

    coinMode = modeResult.rows[0].coin_cell_mode;
    halfCellType = modeResult.rows[0].half_cell_type;
  }

  return { form, coinMode, halfCellType };
}

function assertSourceCompleteness(form, coinMode, halfCellType, rows) {
  const byRole = getRowsByRole(rows);
  const cathodeCount = byRole.cathode?.length || 0;
  const anodeCount = byRole.anode?.length || 0;

  if (form === 'coin' && coinMode === 'half_cell') {
    if (halfCellType === 'cathode_vs_li') {
      if (cathodeCount !== 1 || anodeCount !== 0) {
        throw new BatteryElectrodeSourceValidationError('Для катодной монеточной полуячейки должен быть выбран ровно один катодный источник');
      }
      return;
    }

    if (halfCellType === 'anode_vs_li') {
      if (anodeCount !== 1 || cathodeCount !== 0) {
        throw new BatteryElectrodeSourceValidationError('Для анодной монеточной полуячейки должен быть выбран ровно один анодный источник');
      }
      return;
    }

    if (cathodeCount + anodeCount !== 1) {
      throw new BatteryElectrodeSourceValidationError('Для монеточной полуячейки должен быть выбран ровно один источник электродов');
    }
    return;
  }

  if (form === 'coin') {
    if (cathodeCount !== 1 || anodeCount !== 1) {
      throw new BatteryElectrodeSourceValidationError('Для полного монеточного элемента должен быть выбран ровно один катодный и один анодный источник');
    }
    return;
  }

  if (!cathodeCount || !anodeCount) {
    throw new BatteryElectrodeSourceValidationError('Для данного элемента должны быть выбраны и катодный, и анодный источники');
  }
}

async function fetchBatteryElectrodeSources(queryable, batteryId) {
  const result = await queryable.query(
    `
    SELECT
      battery_electrode_source_id,
      battery_id,
      role,
      tape_id,
      cut_batch_id,
      source_notes,
      sort_order,
      is_primary,
      (
        SELECT c.coating_sidedness
        FROM electrode_cut_batches cb
        JOIN tape_process_steps ts
          ON ts.tape_id = cb.tape_id
        JOIN operation_types ot
          ON ot.operation_type_id = ts.operation_type_id
        JOIN tape_step_coating c
          ON c.step_id = ts.step_id
        WHERE cb.cut_batch_id = battery_electrode_sources.cut_batch_id
          AND ot.code = 'coating'
        LIMIT 1
      ) AS coating_sidedness
    FROM battery_electrode_sources
    WHERE battery_id = $1
    ORDER BY role, is_primary DESC, sort_order, battery_electrode_source_id;
    `,
    [batteryId]
  );

  return result.rows.length === 0 ? null : result.rows;
}

async function replaceSourceRows(queryable, batteryId, rows, rolesToReplace = ELECTRODE_SOURCE_ROLES) {
  await queryable.query(
    `
    DELETE FROM battery_electrode_sources
    WHERE battery_id = $1
      AND role::text = ANY($2::text[])
    `,
    [batteryId, rolesToReplace]
  );

  for (const row of rows.filter((source) => rolesToReplace.includes(source.role))) {
    await queryable.query(
      `
      INSERT INTO battery_electrode_sources
        (battery_id, role, tape_id, cut_batch_id, source_notes, sort_order, is_primary)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        batteryId,
        row.role,
        row.tape_id,
        row.cut_batch_id,
        row.source_notes,
        row.sort_order,
        row.is_primary
      ]
    );
  }
}

async function saveBatteryElectrodeSourcesInTransaction(queryable, batteryId, payload) {
  const normalized = normalizeBatteryElectrodeSourcePayload(payload);
  normalized.rows = await hydrateSourceRowsWithCutBatchTapes(queryable, normalized.rows);
  const { form, coinMode, halfCellType } = await getBatteryFormAndCoinMode(queryable, batteryId);

  assertSourceCompleteness(form, coinMode, halfCellType, normalized.rows);
  await assertCompatibleSidedness(
    queryable,
    normalized.rows.map((row) => row.cut_batch_id)
  );

  await replaceSourceRows(queryable, batteryId, normalized.rows);

  const result = await queryable.query(
    `
    SELECT
      battery_electrode_source_id,
      battery_id,
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
  );

  return result.rows;
}

async function saveBatteryElectrodeSources(pool, batteryId, payload) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const rows = await saveBatteryElectrodeSourcesInTransaction(client, batteryId, payload);
    await client.query('COMMIT');
    return rows;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function fetchExistingSourceRows(queryable, batteryId) {
  const result = await queryable.query(
    `
    SELECT
      battery_electrode_source_id,
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
  );

  return result.rows;
}

function serializeRowsByRole(rows) {
  return ELECTRODE_SOURCE_ROLES.reduce((acc, role) => {
    acc[role] = rows
      .filter((row) => row.role === role)
      .map((row) => ({
        tape_id: row.tape_id || null,
        cut_batch_id: row.cut_batch_id || null,
        source_notes: row.source_notes || null,
        sort_order: row.sort_order || 0,
        is_primary: Boolean(row.is_primary)
      }));
    return acc;
  }, {});
}

async function applyLegacySourcePatch(queryable, batteryId, normalized, existingRows) {
  const existingByRole = getRowsByRole(existingRows);
  const rowsByRole = getRowsByRole(normalized.rows);
  const missingRoles = [];
  const updated = { cathode: 0, anode: 0 };

  for (const role of normalized.requestedRoles) {
    const requestedRow = rowsByRole[role]?.[0] || null;

    if (!requestedRow) {
      const deleteResult = await queryable.query(
      `
      DELETE FROM battery_electrode_sources
      WHERE battery_id = $1
        AND role::text = $2
      `,
      [batteryId, role]
      );
      updated[role] = deleteResult.rowCount;
      continue;
    }

    if (!existingByRole[role]?.length) {
      missingRoles.push(role);
      continue;
    }

    await queryable.query(
      `
      UPDATE battery_electrode_sources
      SET is_primary = false
      WHERE battery_id = $1
        AND role::text = $2
      `,
      [batteryId, role]
    );

    await queryable.query(
      `
      DELETE FROM battery_electrode_sources
      WHERE battery_id = $1
        AND role::text = $2
        AND cut_batch_id = $3
      `,
      [batteryId, role, requestedRow.cut_batch_id]
    );

    const insertResult = await queryable.query(
      `
      INSERT INTO battery_electrode_sources
        (battery_id, role, tape_id, cut_batch_id, source_notes, sort_order, is_primary)
      VALUES
        ($1, $2, $3, $4, $5, 0, true)
      `,
      [
        batteryId,
        role,
        requestedRow.tape_id,
        requestedRow.cut_batch_id,
        requestedRow.source_notes
      ]
    );

    updated[role] = insertResult.rowCount;
  }

  if (missingRoles.length > 0) {
    throw new BatteryElectrodeSourceValidationError(
      `Записи для ролей [${missingRoles.join(', ')}] не существуют. Используйте POST /battery_electrode_sources для создания.`,
      404,
      {
        missing_roles: missingRoles,
        updated
      }
    );
  }

  return updated;
}

async function updateBatteryElectrodeSources(pool, batteryId, payload, userId) {
  const normalized = normalizeBatteryElectrodeSourcePayload(payload);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const oldRows = await fetchExistingSourceRows(client, batteryId);
    normalized.rows = await hydrateSourceRowsWithCutBatchTapes(client, normalized.rows);

    await assertCompatibleSidedness(
      client,
      normalized.rows.map((row) => row.cut_batch_id)
    );

    let updated = { cathode: 0, anode: 0 };

    if (normalized.mode === 'array') {
      await replaceSourceRows(client, batteryId, normalized.rows, normalized.requestedRoles);
      updated = {
        cathode: normalized.rows.filter((row) => row.role === 'cathode').length,
        anode: normalized.rows.filter((row) => row.role === 'anode').length
      };
    } else {
      updated = await applyLegacySourcePatch(client, batteryId, normalized, oldRows);
    }

    const newRows = await fetchExistingSourceRows(client, batteryId);
    const oldByRole = serializeRowsByRole(oldRows);
    const newByRole = serializeRowsByRole(newRows);

    for (const role of ELECTRODE_SOURCE_ROLES) {
      if (JSON.stringify(oldByRole[role]) !== JSON.stringify(newByRole[role])) {
        await trackChanges(
          client,
          `battery_electrode_source_${role}`,
          'battery_electrode_sources',
          'battery_id',
          batteryId,
          { sources: JSON.stringify(oldByRole[role]) },
          { sources: JSON.stringify(newByRole[role]) },
          userId,
          null,
          false
        );
      }
    }

    await client.query('COMMIT');

    return {
      success: true,
      updated
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  BatteryElectrodeSourceValidationError,
  fetchBatteryElectrodeSources,
  normalizeBatteryElectrodeSourcePayload,
  saveBatteryElectrodeSourcesInTransaction,
  saveBatteryElectrodeSources,
  updateBatteryElectrodeSources
};
