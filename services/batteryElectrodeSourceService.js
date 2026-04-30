const { trackChanges } = require('../middleware/trackChanges');

class BatteryElectrodeSourceValidationError extends Error {
  // statusCode default 400 (validation). Pass 404 for "row not found"
  // shape errors so the route returns the right status. Optional `details`
  // object exposes richer fields on the JSON response.
  //
  // Allowlist explicit keys instead of Object.assign(this, details) — that
  // would let a caller overwrite this.message / this.statusCode / this.name
  // by passing them in details. Only callers in this service file build
  // details, so the risk is internal — but the explicit form is clearer
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

async function assertCompatibleSidedness(queryable, cathodeCutBatchId, anodeCutBatchId) {
  const hasCathode = !!cathodeCutBatchId;
  const hasAnode = !!anodeCutBatchId;

  if (!hasCathode || !hasAnode) return;

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
    [[Number(cathodeCutBatchId), Number(anodeCutBatchId)]]
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

  if (form === 'coin') {
    const modeResult = await queryable.query(
      `
      SELECT coin_cell_mode
      FROM battery_coin_config
      WHERE battery_id = $1
      `,
      [batteryId]
    );

    if (modeResult.rows.length === 0) {
      throw new BatteryElectrodeSourceValidationError('Конфигурация coin cell не найдена');
    }

    coinMode = modeResult.rows[0].coin_cell_mode;
  }

  return { form, coinMode };
}

function assertSourceCompleteness(form, coinMode, hasCathode, hasAnode) {
  if (form === 'coin' && coinMode === 'half_cell') {
    if ((hasCathode ? 1 : 0) + (hasAnode ? 1 : 0) !== 1) {
      throw new BatteryElectrodeSourceValidationError('Для монеточной полуячейки должен быть выбран ровно один источник электродов');
    }
  } else if (!hasCathode || !hasAnode) {
    throw new BatteryElectrodeSourceValidationError('Для данного элемента должны быть выбраны и катодный, и анодный источники');
  }
}

async function fetchBatteryElectrodeSources(queryable, batteryId) {
  const result = await queryable.query(
    `
    SELECT
      battery_id,
      role,
      tape_id,
      cut_batch_id,
      source_notes,
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
    ORDER BY role;
    `,
    [batteryId]
  );

  return result.rows.length === 0 ? null : result.rows;
}

async function saveBatteryElectrodeSources(pool, batteryId, payload) {
  const {
    cathode_tape_id,
    cathode_cut_batch_id,
    cathode_source_notes,
    anode_tape_id,
    anode_cut_batch_id,
    anode_source_notes
  } = payload;

  const { form, coinMode } = await getBatteryFormAndCoinMode(pool, batteryId);

  const hasCathode = !!cathode_tape_id && !!cathode_cut_batch_id;
  const hasAnode = !!anode_tape_id && !!anode_cut_batch_id;

  if (hasCathode && hasAnode) {
    await assertCompatibleSidedness(pool, cathode_cut_batch_id, anode_cut_batch_id);
  }
  assertSourceCompleteness(form, coinMode, hasCathode, hasAnode);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (hasCathode) {
      await client.query(
        `
        INSERT INTO battery_electrode_sources
          (battery_id, role, tape_id, cut_batch_id, source_notes)
        VALUES
          ($1, 'cathode', $2, $3, $4)
        ON CONFLICT (battery_id, role)
        DO UPDATE SET
          tape_id = EXCLUDED.tape_id,
          cut_batch_id = EXCLUDED.cut_batch_id,
          source_notes = EXCLUDED.source_notes
        `,
        [
          batteryId,
          Number(cathode_tape_id),
          Number(cathode_cut_batch_id),
          cathode_source_notes || null
        ]
      );
    } else {
      await client.query(
        `
        DELETE FROM battery_electrode_sources
        WHERE battery_id = $1 AND role = 'cathode'
        `,
        [batteryId]
      );
    }

    if (hasAnode) {
      await client.query(
        `
        INSERT INTO battery_electrode_sources
          (battery_id, role, tape_id, cut_batch_id, source_notes)
        VALUES
          ($1, 'anode', $2, $3, $4)
        ON CONFLICT (battery_id, role)
        DO UPDATE SET
          tape_id = EXCLUDED.tape_id,
          cut_batch_id = EXCLUDED.cut_batch_id,
          source_notes = EXCLUDED.source_notes
        `,
        [
          batteryId,
          Number(anode_tape_id),
          Number(anode_cut_batch_id),
          anode_source_notes || null
        ]
      );
    } else {
      await client.query(
        `
        DELETE FROM battery_electrode_sources
        WHERE battery_id = $1 AND role = 'anode'
        `,
        [batteryId]
      );
    }

    const result = await client.query(
      `
      SELECT
        battery_id,
        role,
        tape_id,
        cut_batch_id,
        source_notes
      FROM battery_electrode_sources
      WHERE battery_id = $1
      ORDER BY role
      `,
      [batteryId]
    );

    await client.query('COMMIT');
    return result.rows;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updateBatteryElectrodeSources(pool, batteryId, payload, userId) {
  const {
    cathode_tape_id,
    cathode_cut_batch_id,
    cathode_source_notes,
    anode_tape_id,
    anode_cut_batch_id,
    anode_source_notes
  } = payload;

  const hasCathode = !!cathode_tape_id && !!cathode_cut_batch_id;
  const hasAnode = !!anode_tape_id && !!anode_cut_batch_id;

  if (hasCathode && hasAnode) {
    await assertCompatibleSidedness(pool, cathode_cut_batch_id, anode_cut_batch_id);
  }

  const currentSources = await pool.query(
    'SELECT role, tape_id, cut_batch_id, source_notes FROM battery_electrode_sources WHERE battery_id = $1',
    [batteryId]
  );
  const oldCathode = currentSources.rows.find((row) => row.role === 'cathode') || {};
  const oldAnode = currentSources.rows.find((row) => row.role === 'anode') || {};

  // rowCount-aware UPDATEs: if the role row doesn't exist yet, the UPDATE
  // affects 0 rows. Previously the service silently returned success — the
  // UI thought the source was saved but nothing was persisted. Now we
  // explicitly report which roles were missing so the caller can fall back
  // to POST or inform the user.
  const cathodeUpd = await pool.query(
    `
    UPDATE battery_electrode_sources
    SET
      tape_id = $2,
      cut_batch_id = $3,
      source_notes = $4
    WHERE battery_id = $1
      AND role = 'cathode'
    `,
    [
      batteryId,
      cathode_tape_id || null,
      cathode_cut_batch_id || null,
      cathode_source_notes || null
    ]
  );

  const anodeUpd = await pool.query(
    `
    UPDATE battery_electrode_sources
    SET
      tape_id = $2,
      cut_batch_id = $3,
      source_notes = $4
    WHERE battery_id = $1
      AND role = 'anode'
    `,
    [
      batteryId,
      anode_tape_id || null,
      anode_cut_batch_id || null,
      anode_source_notes || null
    ]
  );

  const cathodeNew = { tape_id: cathode_tape_id || null, cut_batch_id: cathode_cut_batch_id || null, source_notes: cathode_source_notes || null };
  const anodeNew = { tape_id: anode_tape_id || null, cut_batch_id: anode_cut_batch_id || null, source_notes: anode_source_notes || null };

  if (oldCathode.role) {
    await trackChanges(pool, 'battery_electrode_source_cathode', 'battery_electrode_sources', 'battery_id', batteryId, oldCathode, cathodeNew, userId, null, false);
  }
  if (oldAnode.role) {
    await trackChanges(pool, 'battery_electrode_source_anode', 'battery_electrode_sources', 'battery_id', batteryId, oldAnode, anodeNew, userId, null, false);
  }

  // If the caller sent cathode fields but no cathode row exists (likewise
  // for anode), the PATCH is a no-op for that role. Surface it as 404 so
  // the UI can recover (e.g. POST first) instead of being told success.
  const missingRoles = [];
  const cathodeRequested = cathode_tape_id !== undefined || cathode_cut_batch_id !== undefined || cathode_source_notes !== undefined;
  const anodeRequested = anode_tape_id !== undefined || anode_cut_batch_id !== undefined || anode_source_notes !== undefined;
  if (cathodeRequested && cathodeUpd.rowCount === 0) missingRoles.push('cathode');
  if (anodeRequested && anodeUpd.rowCount === 0) missingRoles.push('anode');

  if (missingRoles.length > 0) {
    throw new BatteryElectrodeSourceValidationError(
      `Записи для ролей [${missingRoles.join(', ')}] не существуют. Используйте POST /battery_electrode_sources для создания.`,
      404,
      {
        missing_roles: missingRoles,
        updated: { cathode: cathodeUpd.rowCount, anode: anodeUpd.rowCount },
      }
    );
  }

  return {
    success: true,
    updated: { cathode: cathodeUpd.rowCount, anode: anodeUpd.rowCount },
  };
}

module.exports = {
  BatteryElectrodeSourceValidationError,
  fetchBatteryElectrodeSources,
  saveBatteryElectrodeSources,
  updateBatteryElectrodeSources
};
