class BatteryElectrodeStackConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BatteryElectrodeStackConflictError';
    this.statusCode = 409;
  }
}

function countStackRoles(stack) {
  return stack.reduce((acc, row) => {
    if (row.role === 'cathode') acc.cathodes += 1;
    if (row.role === 'anode') acc.anodes += 1;
    return acc;
  }, { cathodes: 0, anodes: 0 });
}

function assertValidStackRoles(stack) {
  const invalidRole = stack.find((row) => row.role !== 'cathode' && row.role !== 'anode');

  if (invalidRole) {
    throw new BatteryElectrodeStackConflictError('В стеке есть электрод с некорректной ролью');
  }

  const electrodeIds = stack.map((row) => Number(row.electrode_id));
  const uniqueElectrodeIds = new Set(electrodeIds);

  if (electrodeIds.length !== uniqueElectrodeIds.size) {
    throw new BatteryElectrodeStackConflictError('Один и тот же электрод нельзя добавить в стек дважды');
  }
}

async function fetchBatteryStackContext(queryable, batteryId) {
  const batteryResult = await queryable.query(
    `
    SELECT
      b.form_factor,
      cc.coin_cell_mode,
      cc.half_cell_type
    FROM batteries b
    LEFT JOIN battery_coin_config cc
      ON cc.battery_id = b.battery_id
    WHERE b.battery_id = $1
    `,
    [batteryId]
  );

  if (batteryResult.rowCount === 0) {
    throw new BatteryElectrodeStackConflictError('Аккумулятор не найден');
  }

  const sourcesResult = await queryable.query(
    `
    SELECT role, cut_batch_id
    FROM battery_electrode_sources
    WHERE battery_id = $1
    `,
    [batteryId]
  );

  return {
    battery: batteryResult.rows[0],
    sourceByRole: sourcesResult.rows.reduce((acc, row) => {
      acc[row.role] = Number(row.cut_batch_id);
      return acc;
    }, {})
  };
}

function assertStackCountMatchesBattery(context, stack) {
  const { cathodes, anodes } = countStackRoles(stack);
  const { form_factor, coin_cell_mode, half_cell_type } = context.battery;

  if (form_factor === 'coin' && coin_cell_mode === 'half_cell') {
    if (half_cell_type === 'cathode_vs_li' && (cathodes !== 1 || anodes !== 0)) {
      throw new BatteryElectrodeStackConflictError('Для катодной полуячейки нужен ровно 1 катод и 0 анодов');
    }

    if (half_cell_type === 'anode_vs_li' && (anodes !== 1 || cathodes !== 0)) {
      throw new BatteryElectrodeStackConflictError('Для анодной полуячейки нужен ровно 1 анод и 0 катодов');
    }

    return;
  }

  if (form_factor === 'coin') {
    if (cathodes !== 1 || anodes !== 1) {
      throw new BatteryElectrodeStackConflictError('Для полного монеточного элемента нужен ровно 1 катод и 1 анод');
    }

    return;
  }

  if (form_factor === 'pouch' || form_factor === 'cylindrical') {
    if (cathodes < 1 || anodes < 1 || !(anodes === cathodes || anodes === cathodes + 1)) {
      throw new BatteryElectrodeStackConflictError(
        'Для пакетного или цилиндрического элемента количество анодов должно совпадать с количеством катодов или быть больше на один'
      );
    }
  }
}

async function assertStackElectrodesMatchSources(queryable, context, stack) {
  if (stack.length === 0) return;

  const electrodeIds = stack.map((row) => Number(row.electrode_id));
  const electrodeResult = await queryable.query(
    `
    SELECT electrode_id, cut_batch_id
    FROM electrodes
    WHERE electrode_id = ANY($1::int[])
    `,
    [electrodeIds]
  );
  const batchByElectrodeId = electrodeResult.rows.reduce((acc, row) => {
    acc[Number(row.electrode_id)] = Number(row.cut_batch_id);
    return acc;
  }, {});

  for (const row of stack) {
    const electrodeId = Number(row.electrode_id);
    const expectedBatchId = context.sourceByRole[row.role];
    const actualBatchId = batchByElectrodeId[electrodeId];

    if (!expectedBatchId) {
      throw new BatteryElectrodeStackConflictError('Для выбранной роли электрода не сохранён источник');
    }

    if (!actualBatchId || actualBatchId !== expectedBatchId) {
      throw new BatteryElectrodeStackConflictError(
        `Электрод ${electrodeId} не принадлежит выбранной партии для этой роли`
      );
    }
  }
}

async function assertBatteryStackIsValid(queryable, batteryId, stack) {
  assertValidStackRoles(stack);
  if (stack.length === 0) return;

  const context = await fetchBatteryStackContext(queryable, batteryId);
  assertStackCountMatchesBattery(context, stack);
  await assertStackElectrodesMatchSources(queryable, context, stack);
}

async function saveBatteryElectrodeStack(pool, batteryId, stack) {
  const nextElectrodeIds = stack
    .map((row) => Number(row.electrode_id))
    .filter((electrodeId) => Number.isInteger(electrodeId));

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await assertBatteryStackIsValid(client, batteryId, stack);

    await client.query(
      `
      UPDATE electrodes
      SET
        status_code = 1,
        used_in_battery_id = NULL
      WHERE used_in_battery_id = $1
        AND NOT (electrode_id = ANY($2::int[]))
      `,
      [batteryId, nextElectrodeIds]
    );

    await client.query(
      `DELETE FROM battery_electrodes WHERE battery_id = $1`,
      [batteryId]
    );

    for (const row of stack) {
      await client.query(
        `
        INSERT INTO battery_electrodes (
          battery_id,
          electrode_id,
          role,
          position_index
        )
        VALUES ($1,$2,$3,$4)
        `,
        [
          batteryId,
          row.electrode_id,
          row.role,
          row.position_index
        ]
      );

      const updateResult = await client.query(
        `
        UPDATE electrodes
        SET
          status_code = 2,
          used_in_battery_id = $1
        WHERE electrode_id = $2
          AND (
            status_code = 1 OR
            used_in_battery_id = $1
          )
        RETURNING electrode_id
        `,
        [
          batteryId,
          row.electrode_id
        ]
      );

      if (updateResult.rows.length === 0) {
        throw new BatteryElectrodeStackConflictError(
          `Электрод ${row.electrode_id} уже используется или недоступен`
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function fetchBatteryElectrodeStack(queryable, batteryId) {
  const result = await queryable.query(
    `
    SELECT
      electrode_id,
      role,
      position_index
    FROM battery_electrodes
    WHERE battery_id = $1
    ORDER BY position_index
    `,
    [batteryId]
  );

  return result.rows;
}

module.exports = {
  BatteryElectrodeStackConflictError,
  fetchBatteryElectrodeStack,
  saveBatteryElectrodeStack
};
