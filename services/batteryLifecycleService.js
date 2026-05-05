const { trackChanges } = require('../middleware/trackChanges');
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

async function collectBatteryDeleteBlockers(queryable, batteryId) {
  return collectDependencyConflicts(queryable, [
    {
      key: 'battery_status',
      label: 'статус аккумулятора требует сохранения записи',
      query: `
        SELECT battery_id AS id, status AS name
        FROM batteries
        WHERE battery_id = $1
          AND status IN ('testing', 'completed', 'failed')
      `,
      params: [batteryId]
    },
    {
      key: 'battery_electrodes',
      label: 'электроды, установленные в аккумулятор',
      query: `
        SELECT electrode_id AS id, role::text || COALESCE(' #' || position_index::text, '') AS name
        FROM battery_electrodes
        WHERE battery_id = $1
        ORDER BY position_index NULLS LAST, electrode_id
        LIMIT 25
      `,
      params: [batteryId]
    },
    {
      key: 'electrodes_used_in_battery',
      label: 'электроды со ссылкой на этот аккумулятор',
      query: `
        SELECT electrode_id AS id, number_in_batch AS name
        FROM electrodes
        WHERE used_in_battery_id = $1
        ORDER BY electrode_id
        LIMIT 25
      `,
      params: [batteryId]
    },
    {
      key: 'battery_qc',
      label: 'данные QC аккумулятора',
      query: `
        SELECT battery_id AS id, 'QC' AS name
        FROM battery_qc
        WHERE battery_id = $1
          AND (
            ocv_v IS NOT NULL OR
            esr_mohm IS NOT NULL OR
            NULLIF(BTRIM(qc_notes), '') IS NOT NULL
          )
      `,
      params: [batteryId]
    },
    {
      key: 'battery_electrochem',
      label: 'электрохимические файлы или записи',
      query: `
        SELECT battery_electrochem_id AS id, file_name AS name
        FROM battery_electrochem
        WHERE battery_id = $1
        ORDER BY battery_electrochem_id
        LIMIT 25
      `,
      params: [batteryId]
    },
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
    const scrappedReason = `вернут из аккумулятора #${batteryId} при разборке`;
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
        status = 'disassembled',
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
      { status: 'disassembled' },
      userId,
      ['status'],
      false
    );

    await client.query('COMMIT');

    return {
      success: true,
      battery_id: batteryId,
      status: 'disassembled',
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

async function deleteBatteryRecord(pool, batteryId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await fetchBatteryForLifecycle(client, batteryId);
    const blockers = await collectBatteryDeleteBlockers(client, batteryId);

    if (blockers.length > 0) {
      throw dependencyError('Нельзя удалить аккумулятор: сначала сохраните или очистите связанные лабораторные данные', blockers);
    }

    const deletedCounts = {};

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

    const result = await client.query(
      'DELETE FROM batteries WHERE battery_id = $1',
      [batteryId]
    );

    if (result.rowCount === 0) {
      throw statusError('Аккумулятор не найден', 404);
    }

    await client.query('COMMIT');

    return {
      success: true,
      battery_id: batteryId,
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

  const dependencies = await collectBatteryDeleteBlockers(pool, batteryId);

  return {
    can_delete: dependencies.length === 0,
    error: dependencies.length > 0
      ? 'Нельзя удалить аккумулятор: сначала сохраните или очистите связанные лабораторные данные'
      : null,
    dependencies
  };
}

module.exports = {
  collectBatteryDeleteBlockers,
  deleteBatteryRecord,
  disassembleBattery,
  getBatteryDeleteCheck
};
