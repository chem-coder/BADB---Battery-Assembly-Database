const { trackChanges } = require('../middleware/trackChanges');
const { deleteBatteryElectrochemFileLinks } = require('./batteryElectrochemService');
const { collectDependencyConflicts } = require('../utils/dependencyConflicts');

function statusError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function dependencyError(message, dependencies) {
  const err = statusError(message, 409);
  err.dependencies = dependencies;
  return err;
}

const BATTERY_DELETE_BLOCKED_MESSAGE = 'Нельзя удалить аккумулятор: запись содержит историю испытаний или связана с модулем';
const BATTERY_DELETE_CONFIRMABLE_MESSAGE = 'Для удаления аккумулятора подтвердите действие и выберите, что сделать с электродами';

async function fetchBatteryForLifecycle(queryable, batteryId) {
  const result = await queryable.query(
    `
    SELECT
      battery_id,
      status,
      battery_notes,
      updated_by,
      updated_at
    FROM batteries
    WHERE battery_id = $1
    FOR UPDATE
    `,
    [batteryId]
  );

  if (result.rowCount === 0) {
    throw statusError('Аккумулятор не найден', 404);
  }

  return result.rows[0];
}

async function collectBatteryHardDeleteBlockers(queryable, batteryId) {
  return collectDependencyConflicts(queryable, [
    {
      key: 'cycling_sessions',
      label: 'циклирование аккумулятора',
      query: `
        SELECT session_id AS id, file_name AS name
        FROM cycling_sessions
        WHERE battery_id = $1
        ORDER BY session_id
        LIMIT 25
      `,
      params: [batteryId]
    },
    {
      key: 'module_batteries',
      label: 'модуль, в который входит аккумулятор',
      query: `
        SELECT module_id AS id, 'позиция ' || position_index::text AS name
        FROM module_batteries
        WHERE battery_id = $1
        ORDER BY module_id, position_index
        LIMIT 25
      `,
      params: [batteryId]
    }
  ]);
}

const BATTERY_OWNED_DATA_CHECKS = [
  {
    key: 'battery_coin_config',
    label: 'конфигурация монеточного аккумулятора',
    query: 'SELECT battery_id AS id, coin_size_code AS name FROM battery_coin_config WHERE battery_id = $1'
  },
  {
    key: 'battery_pouch_config',
    label: 'конфигурация пакетного/призматического аккумулятора',
    query: 'SELECT battery_id AS id, pouch_case_size_code AS name FROM battery_pouch_config WHERE battery_id = $1'
  },
  {
    key: 'battery_cyl_config',
    label: 'конфигурация цилиндрического аккумулятора',
    query: 'SELECT battery_id AS id, cyl_size_code AS name FROM battery_cyl_config WHERE battery_id = $1'
  },
  {
    key: 'battery_electrodes',
    label: 'электроды, установленные в аккумулятор',
    query: `
      SELECT electrode_id AS id, role::text || COALESCE(' #' || position_index::text, '') AS name
      FROM battery_electrodes
      WHERE battery_id = $1
      ORDER BY position_index NULLS LAST, electrode_id
    `
  },
  {
    key: 'battery_electrode_sources',
    label: 'связи с партиями электродов',
    query: `
      SELECT cut_batch_id AS id, role AS name
      FROM battery_electrode_sources
      WHERE battery_id = $1
      ORDER BY role
    `
  },
  {
    key: 'battery_sep_config',
    label: 'связь с сепаратором',
    query: 'SELECT separator_id AS id, separator_notes AS name FROM battery_sep_config WHERE battery_id = $1'
  },
  {
    key: 'battery_electrolyte',
    label: 'связь с электролитом',
    query: 'SELECT electrolyte_id AS id, electrolyte_notes AS name FROM battery_electrolyte WHERE battery_id = $1'
  },
  {
    key: 'battery_projects',
    label: 'связи с проектами',
    query: 'SELECT project_id AS id, NULL::text AS name FROM battery_projects WHERE battery_id = $1 ORDER BY project_id'
  },
  {
    key: 'battery_qc',
    label: 'данные QC аккумулятора',
    query: 'SELECT battery_id AS id, qc_notes AS name FROM battery_qc WHERE battery_id = $1'
  },
  {
    key: 'battery_electrochem',
    label: 'записи/файлы электрохимии',
    query: `
      SELECT battery_electrochem_id AS id, COALESCE(file_name, electrochem_notes) AS name, file_link
      FROM battery_electrochem
      WHERE battery_id = $1
      ORDER BY battery_electrochem_id
    `
  }
];

async function collectBatteryConfirmableOwnedData(queryable, batteryId) {
  return collectDependencyConflicts(
    queryable,
    BATTERY_OWNED_DATA_CHECKS.map((check) => ({
      ...check,
      params: [batteryId]
    }))
  );
}

async function collectBatteryDisassembleBlockers(queryable, batteryId) {
  return collectDependencyConflicts(queryable, [
    {
      key: 'module_batteries',
      label: 'модуль, в который входит аккумулятор',
      query: `
        SELECT module_id AS id, 'позиция ' || position_index::text AS name
        FROM module_batteries
        WHERE battery_id = $1
        ORDER BY module_id, position_index
        LIMIT 25
      `,
      params: [batteryId]
    }
  ]);
}

async function deleteCount(queryable, sql, params) {
  const result = await queryable.query(sql, params);
  return result.rowCount || 0;
}

async function fetchBatteryElectrodeIds(queryable, batteryId) {
  const result = await queryable.query(
    `
    SELECT DISTINCT electrode_id
    FROM (
      SELECT electrode_id
      FROM battery_electrodes
      WHERE battery_id = $1

      UNION

      SELECT electrode_id
      FROM electrodes
      WHERE used_in_battery_id = $1
    ) linked_electrodes
    ORDER BY electrode_id
    `,
    [batteryId]
  );

  return result.rows.map((row) => Number(row.electrode_id));
}

async function fetchLinkedBatteryElectrodes(queryable, batteryId) {
  const result = await queryable.query(
    `
    SELECT DISTINCT ON (e.electrode_id)
      e.electrode_id,
      e.number_in_batch,
      e.cut_batch_id,
      e.status_code,
      e.used_in_battery_id,
      e.scrapped_reason,
      be.role,
      be.position_index
    FROM electrodes e
    LEFT JOIN battery_electrodes be
      ON be.electrode_id = e.electrode_id
      AND be.battery_id = $1
    WHERE be.battery_id = $1
       OR e.used_in_battery_id = $1
    ORDER BY e.electrode_id, be.position_index NULLS LAST
    `,
    [batteryId]
  );

  return result.rows;
}

async function fetchBatteryDeleteAuditSnapshot(queryable, batteryId) {
  const batteryResult = await queryable.query(
    `
    SELECT
      b.battery_id,
      b.project_id,
      p.name AS project_name,
      b.form_factor,
      b.status,
      b.created_by,
      u_created.name AS created_by_name,
      b.created_at,
      b.updated_by,
      u_updated.name AS updated_by_name,
      b.updated_at,
      b.battery_notes
    FROM batteries b
    LEFT JOIN projects p
      ON p.project_id = b.project_id
    LEFT JOIN users u_created
      ON u_created.user_id = b.created_by
    LEFT JOIN users u_updated
      ON u_updated.user_id = b.updated_by
    WHERE b.battery_id = $1
    `,
    [batteryId]
  );
  const projectResult = await queryable.query(
    `
    SELECT bp.project_id, p.name
    FROM battery_projects bp
    LEFT JOIN projects p
      ON p.project_id = bp.project_id
    WHERE bp.battery_id = $1
    ORDER BY bp.project_id
    `,
    [batteryId]
  );

  return {
    ...(batteryResult.rows[0] || {}),
    projects: projectResult.rows
  };
}

function normalizeElectrodeDisposition(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['available', 'scrapped'].includes(normalized) ? normalized : null;
}

function validateBatteryDeleteOptions(batteryId, linkedElectrodes, options = {}) {
  const phrase = `DELETE BATTERY ${batteryId}`;

  if (options.confirmation !== phrase) {
    throw statusError(`Для удаления аккумулятора введите ${phrase}`, 400);
  }

  if (linkedElectrodes.length === 0) {
    return {
      electrodeDisposition: null,
      scrappedReason: null
    };
  }

  const electrodeDisposition = normalizeElectrodeDisposition(options.electrode_disposition);

  if (!electrodeDisposition) {
    throw statusError('Выберите, что сделать с электродами перед удалением аккумулятора', 400);
  }

  const defaultReason = `возвращен из аккумулятора #${batteryId} при удалении записи`;
  const scrappedReason = electrodeDisposition === 'scrapped'
    ? String(options.scrapped_reason || '').trim() || defaultReason
    : null;

  return {
    electrodeDisposition,
    scrappedReason
  };
}

async function applyBatteryDeleteElectrodeDisposition(queryable, linkedElectrodes, disposition, scrappedReason) {
  const electrodeIds = linkedElectrodes
    .map((row) => Number(row.electrode_id))
    .filter(Number.isInteger);

  if (electrodeIds.length === 0 || !disposition) {
    return [];
  }

  if (disposition === 'available') {
    await queryable.query(
      `
      UPDATE electrodes
      SET
        status_code = 1,
        used_in_battery_id = NULL,
        scrapped_reason = NULL
      WHERE electrode_id = ANY($1::int[])
      `,
      [electrodeIds]
    );
  } else {
    await queryable.query(
      `
      UPDATE electrodes
      SET
        status_code = 3,
        used_in_battery_id = NULL,
        scrapped_reason = $2
      WHERE electrode_id = ANY($1::int[])
      `,
      [electrodeIds, scrappedReason]
    );
  }

  return electrodeIds;
}

async function insertBatteryDeleteAudit(client, batteryId, userId, details) {
  await client.query(
    `
    INSERT INTO activity_log (
      user_id,
      action,
      entity,
      entity_id,
      details
    )
    VALUES ($1, 'delete', 'battery', $2, $3::jsonb)
    `,
    [
      userId,
      batteryId,
      JSON.stringify(details)
    ]
  );
}

async function disassembleBattery(pool, batteryId, userId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const current = await fetchBatteryForLifecycle(client, batteryId);
    const blockers = await collectBatteryDisassembleBlockers(client, batteryId);

    if (blockers.length > 0) {
      throw dependencyError('Нельзя разобрать аккумулятор: он связан с модулем', blockers);
    }

    const electrodeIds = await fetchBatteryElectrodeIds(client, batteryId);
    const scrappedReason = `возвращен из аккумулятора #${batteryId} при разборке`;
    const deletedCounts = {};

    if (electrodeIds.length > 0) {
      await client.query(
        `
        UPDATE electrodes
        SET
          status_code = 3,
          used_in_battery_id = NULL,
          scrapped_reason = $1
        WHERE electrode_id = ANY($2::int[])
        `,
        [scrappedReason, electrodeIds]
      );
    }

    deletedCounts.battery_electrodes = await deleteCount(
      client,
      'DELETE FROM battery_electrodes WHERE battery_id = $1',
      [batteryId]
    );
    deletedCounts.battery_electrode_sources = await deleteCount(
      client,
      'DELETE FROM battery_electrode_sources WHERE battery_id = $1',
      [batteryId]
    );
    deletedCounts.battery_sep_config = await deleteCount(
      client,
      'DELETE FROM battery_sep_config WHERE battery_id = $1',
      [batteryId]
    );
    deletedCounts.battery_electrolyte = await deleteCount(
      client,
      'DELETE FROM battery_electrolyte WHERE battery_id = $1',
      [batteryId]
    );

    await client.query(
      `
      UPDATE batteries
      SET
        status = NULL,
        updated_by = $1,
        updated_at = now()
      WHERE battery_id = $2
      `,
      [userId, batteryId]
    );

    await trackChanges(
      client,
      'battery',
      'batteries',
      'battery_id',
      batteryId,
      current,
      { status: null },
      userId,
      ['status'],
      false
    );

    await client.query('COMMIT');

    return {
      success: true,
      battery_id: batteryId,
      status: null,
      scrapped_electrode_ids: electrodeIds,
      scrapped_reason: scrappedReason,
      deleted_counts: deletedCounts
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deleteBatteryRecord(pool, batteryId, userId, options = {}) {
  const client = await pool.connect();
  let electrochemFileLinks = [];

  try {
    await client.query('BEGIN');

    await fetchBatteryForLifecycle(client, batteryId);
    const hardBlockers = await collectBatteryHardDeleteBlockers(client, batteryId);

    if (hardBlockers.length > 0) {
      throw dependencyError(BATTERY_DELETE_BLOCKED_MESSAGE, hardBlockers);
    }

    const linkedElectrodes = await fetchLinkedBatteryElectrodes(client, batteryId);
    const {
      electrodeDisposition,
      scrappedReason
    } = validateBatteryDeleteOptions(batteryId, linkedElectrodes, options);
    const auditSnapshot = await fetchBatteryDeleteAuditSnapshot(client, batteryId);
    const confirmableOwnedData = await collectBatteryConfirmableOwnedData(client, batteryId);
    const affectedElectrodeIds = await applyBatteryDeleteElectrodeDisposition(
      client,
      linkedElectrodes,
      electrodeDisposition,
      scrappedReason
    );
    const deletedCounts = {};

    const electrochemResult = await client.query(
      `
      DELETE FROM battery_electrochem
      WHERE battery_id = $1
      RETURNING battery_electrochem_id, file_name, file_link, electrochem_notes
      `,
      [batteryId]
    );
    deletedCounts.battery_electrochem = electrochemResult.rowCount || 0;
    electrochemFileLinks = electrochemResult.rows.map((row) => row.file_link).filter(Boolean);

    deletedCounts.battery_electrodes = await deleteCount(
      client,
      'DELETE FROM battery_electrodes WHERE battery_id = $1',
      [batteryId]
    );
    deletedCounts.battery_electrode_sources = await deleteCount(
      client,
      'DELETE FROM battery_electrode_sources WHERE battery_id = $1',
      [batteryId]
    );
    deletedCounts.battery_sep_config = await deleteCount(
      client,
      'DELETE FROM battery_sep_config WHERE battery_id = $1',
      [batteryId]
    );
    deletedCounts.battery_electrolyte = await deleteCount(
      client,
      'DELETE FROM battery_electrolyte WHERE battery_id = $1',
      [batteryId]
    );
    deletedCounts.battery_qc = await deleteCount(
      client,
      'DELETE FROM battery_qc WHERE battery_id = $1',
      [batteryId]
    );
    deletedCounts.battery_coin_config = await deleteCount(
      client,
      'DELETE FROM battery_coin_config WHERE battery_id = $1',
      [batteryId]
    );
    deletedCounts.battery_pouch_config = await deleteCount(
      client,
      'DELETE FROM battery_pouch_config WHERE battery_id = $1',
      [batteryId]
    );
    deletedCounts.battery_cyl_config = await deleteCount(
      client,
      'DELETE FROM battery_cyl_config WHERE battery_id = $1',
      [batteryId]
    );
    deletedCounts.battery_projects = await deleteCount(
      client,
      'DELETE FROM battery_projects WHERE battery_id = $1',
      [batteryId]
    );

    await insertBatteryDeleteAudit(client, batteryId, userId, {
      battery: auditSnapshot,
      confirmation: options.confirmation,
      electrode_disposition: electrodeDisposition,
      scrapped_reason: scrappedReason,
      linked_electrodes: linkedElectrodes,
      affected_electrode_ids: affectedElectrodeIds,
      hard_blockers: hardBlockers,
      confirmable_owned_data: confirmableOwnedData,
      deleted_counts: deletedCounts,
      deleted_electrochem: electrochemResult.rows
    });

    const result = await client.query(
      'DELETE FROM batteries WHERE battery_id = $1',
      [batteryId]
    );

    if (result.rowCount === 0) {
      throw statusError('Аккумулятор не найден', 404);
    }

    await client.query('COMMIT');
    await deleteBatteryElectrochemFileLinks(electrochemFileLinks);

    return {
      success: true,
      battery_id: batteryId,
      electrode_disposition: electrodeDisposition,
      affected_electrode_ids: affectedElectrodeIds,
      deleted_counts: deletedCounts
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getBatteryDeleteCheck(pool, batteryId) {
  const batteryResult = await pool.query(
    'SELECT battery_id FROM batteries WHERE battery_id = $1',
    [batteryId]
  );

  if (batteryResult.rowCount === 0) {
    throw statusError('Аккумулятор не найден', 404);
  }

  const [hardBlockers, confirmableOwnedData, linkedElectrodes] = await Promise.all([
    collectBatteryHardDeleteBlockers(pool, batteryId),
    collectBatteryConfirmableOwnedData(pool, batteryId),
    fetchLinkedBatteryElectrodes(pool, batteryId)
  ]);

  return {
    can_delete: hardBlockers.length === 0,
    error: hardBlockers.length > 0
      ? BATTERY_DELETE_BLOCKED_MESSAGE
      : null,
    message: hardBlockers.length > 0
      ? BATTERY_DELETE_BLOCKED_MESSAGE
      : BATTERY_DELETE_CONFIRMABLE_MESSAGE,
    hard_blockers: hardBlockers,
    confirmable_owned_data: confirmableOwnedData,
    linked_electrodes: linkedElectrodes,
    dependencies: hardBlockers
  };
}

module.exports = {
  collectBatteryDeleteBlockers: collectBatteryHardDeleteBlockers,
  deleteBatteryRecord,
  disassembleBattery,
  getBatteryDeleteCheck
};
