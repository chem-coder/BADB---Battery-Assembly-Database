const { trackChanges } = require('../middleware/trackChanges');
const { collectDependencyConflicts } = require('../utils/dependencyConflicts');

function statusError(message, statusCode, extra = {}) {
  const err = new Error(message);
  err.statusCode = statusCode;
  Object.assign(err, extra);
  return err;
}

async function getMaterialInstanceContext(queryable, materialInstanceId) {
  const result = await queryable.query(
    `
    SELECT
      mi.material_instance_id,
      mi.material_id,
      mi.name AS instance_name,
      mi.notes AS instance_notes,
      mi.created_at,
      mi.source_id,
      m.name AS material_name,
      m.role AS material_role,
      NOT EXISTS (
        SELECT 1
        FROM material_instance_components mic
        WHERE mic.parent_material_instance_id = mi.material_instance_id
      ) AS is_pure
    FROM material_instances mi
    JOIN materials m
      ON m.material_id = mi.material_id
    WHERE mi.material_instance_id = $1
    `,
    [materialInstanceId]
  );

  return result.rows[0] || null;
}

async function ensureMaterialSourceForPureInstance(queryable, materialInstanceId, updatedByUserId = null) {
  const context = await getMaterialInstanceContext(queryable, materialInstanceId);

  if (!context) {
    const err = new Error('Экземпляр материала не найден');
    err.statusCode = 404;
    throw err;
  }

  if (!context.is_pure) {
    const err = new Error('Источник материала доступен только для 100% чистых экземпляров');
    err.statusCode = 400;
    throw err;
  }

  if (context.source_id) {
    return context;
  }

  const sourceInsert = await queryable.query(
    `
    INSERT INTO material_sources (
      material_id,
      quality_rating_label,
      is_evaluated,
      updated_by
    )
    VALUES ($1, 'tbd', false, $2)
    RETURNING source_id
    `,
    [context.material_id, updatedByUserId]
  );

  await queryable.query(
    `
    UPDATE material_instances
    SET source_id = $1
    WHERE material_instance_id = $2
    `,
    [sourceInsert.rows[0].source_id, materialInstanceId]
  );

  return {
    ...context,
    source_id: sourceInsert.rows[0].source_id
  };
}

async function ensureMaterialPropertiesRow(queryable, materialInstanceId, updatedByUserId = null) {
  const context = await getMaterialInstanceContext(queryable, materialInstanceId);

  if (!context) {
    const err = new Error('Экземпляр материала не найден');
    err.statusCode = 404;
    throw err;
  }

  const current = await queryable.query(
    `
    SELECT material_property_id
    FROM material_properties
    WHERE material_instance_id = $1
    `,
    [materialInstanceId]
  );

  if (current.rows[0]) {
    return {
      context,
      material_property_id: current.rows[0].material_property_id
    };
  }

  const insertResult = await queryable.query(
    `
    INSERT INTO material_properties (
      material_instance_id,
      updated_at,
      updated_by
    )
    VALUES ($1, now(), $2)
    RETURNING material_property_id
    `,
    [materialInstanceId, updatedByUserId]
  );

  return {
    context,
    material_property_id: insertResult.rows[0].material_property_id
  };
}

async function createMaterialInstance(pool, materialId, payload, userId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
      INSERT INTO material_instances (
        material_id, name, notes
      )
      VALUES ($1,$2,$3)
      RETURNING
        material_instance_id,
        material_id,
        name,
        notes,
        created_at,
        source_id
      `,
      [
        materialId,
        payload.name,
        payload.notes || null
      ]
    );

    let createdRow = result.rows[0];

    if (payload.is_pure === true) {
      const context = await ensureMaterialSourceForPureInstance(
        client,
        createdRow.material_instance_id,
        userId
      );

      createdRow = {
        ...createdRow,
        source_id: context.source_id
      };

      // «Bag arrival» flow (materials_model_cleanup.md §6.4): supplier /
      // lot / receipt date are captured at the moment the instance (a
      // physical bag) is created, in the same transaction — instead of
      // being buried behind the source-info page and staying empty.
      // All optional; blanks stay blank («уточню позже» is legitimate).
      const supplier = typeof payload.supplier === 'string' && payload.supplier.trim() ? payload.supplier.trim() : null;
      const lotNumber = typeof payload.lot_number === 'string' && payload.lot_number.trim() ? payload.lot_number.trim() : null;
      const dateReceived = payload.date_received || null;

      if (supplier || lotNumber || dateReceived) {
        await client.query(
          `
          UPDATE material_sources
          SET supplier      = COALESCE($2, supplier),
              lot_number    = COALESCE($3, lot_number),
              date_received = COALESCE($4, date_received),
              updated_by    = $5
          WHERE source_id = $1
          `,
          [context.source_id, supplier, lotNumber, dateReceived, userId]
        );
      }
    }

    await client.query('COMMIT');
    return createdRow;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function listAllMaterialInstances(pool) {
  const result = await pool.query(
    `
    SELECT
      mi.material_instance_id,
      mi.material_id,
      mi.name,
      mi.notes,
      mi.created_at,
      mi.source_id,
      m.name AS material_name,
      m.role AS material_role,
      mp.density_g_ml,
      NOT EXISTS (
        SELECT 1
        FROM material_instance_components mic
        WHERE mic.parent_material_instance_id = mi.material_instance_id
      ) AS is_pure
    FROM material_instances mi
    JOIN materials m
      ON mi.material_id = m.material_id
    LEFT JOIN material_properties mp
      ON mp.material_instance_id = mi.material_instance_id
    ORDER BY mi.name, mi.material_instance_id
    `
  );

  return result.rows;
}

async function listMaterialInstancesForMaterial(pool, materialId) {
  const result = await pool.query(
    `
    SELECT
      material_instances.material_instance_id,
      material_instances.material_id,
      material_instances.name,
      material_instances.notes,
      material_instances.created_at,
      material_instances.source_id,
      mp.density_g_ml,
      NOT EXISTS (
        SELECT 1
        FROM material_instance_components mic
        WHERE mic.parent_material_instance_id = material_instances.material_instance_id
      ) AS is_pure
    FROM material_instances
    LEFT JOIN material_properties mp
      ON mp.material_instance_id = material_instances.material_instance_id
    WHERE material_instances.material_id = $1
    ORDER BY material_instances.created_at DESC, material_instances.material_instance_id DESC
    `,
    [materialId]
  );

  return result.rows;
}

async function updateMaterialInstance(pool, materialInstanceId, payload, userId) {
  const current = await pool.query(
    'SELECT name, notes FROM material_instances WHERE material_instance_id = $1',
    [materialInstanceId]
  );

  if (current.rowCount === 0) {
    throw statusError('Экземпляр материала не найден', 404);
  }

  const newVals = { name: payload.name, notes: payload.notes || null };

  const result = await pool.query(
    `
    UPDATE material_instances
    SET
      name = $1,
      notes = $2
    WHERE material_instance_id = $3
    RETURNING
      material_instance_id,
      material_id,
      name,
      notes,
      created_at
    `,
    [newVals.name, newVals.notes, materialInstanceId]
  );

  if (result.rowCount === 0) {
    throw statusError('Экземпляр материала не найден', 404);
  }

  await trackChanges(
    pool,
    'material_instance',
    'material_instances',
    'material_instance_id',
    materialInstanceId,
    current.rows[0],
    newVals,
    userId,
    null,
    false
  );

  return result.rows[0];
}

async function deleteMaterialInstance(pool, materialInstanceId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const context = await getMaterialInstanceContext(client, materialInstanceId);
    if (!context) {
      throw statusError('Экземпляр материала не найден', 404);
    }

    const dependencies = await collectDependencyConflicts(client, [
      {
        key: 'material_instance_components',
        label: 'составные материалы, где этот экземпляр является компонентом',
        query: `
          SELECT mic.material_instance_component_id AS id, parent.name
          FROM material_instance_components mic
          JOIN material_instances parent
            ON parent.material_instance_id = mic.parent_material_instance_id
          WHERE mic.component_material_instance_id = $1
          ORDER BY mic.material_instance_component_id
          LIMIT 25
        `,
        params: [materialInstanceId]
      },
      {
        key: 'tape_recipe_line_actuals',
        label: 'ленты, где этот экземпляр выбран как фактический материал',
        query: `
          SELECT DISTINCT t.tape_id AS id, t.name
          FROM tape_recipe_line_actuals trla
          JOIN tapes t ON t.tape_id = trla.tape_id
          WHERE trla.material_instance_id = $1
          ORDER BY t.tape_id
          LIMIT 25
        `,
        params: [materialInstanceId]
      }
    ]);

    if (dependencies.length > 0) {
      throw statusError(
        'Нельзя удалить экземпляр материала: он используется в смесях или лентах',
        409,
        { dependencies }
      );
    }

    await client.query(
      `
      DELETE FROM material_property_files
      WHERE material_property_id IN (
        SELECT material_property_id
        FROM material_properties
        WHERE material_instance_id = $1
      )
      `,
      [materialInstanceId]
    );

    await client.query(
      `
      DELETE FROM material_properties
      WHERE material_instance_id = $1
      `,
      [materialInstanceId]
    );

    const result = await client.query(
      'DELETE FROM material_instances WHERE material_instance_id = $1',
      [materialInstanceId]
    );

    if (result.rowCount === 0) {
      throw statusError('Экземпляр материала не найден', 404);
    }

    if (context.source_id) {
      const sourceStillUsed = await client.query(
        `
        SELECT COUNT(*)::int AS cnt
        FROM material_instances
        WHERE source_id = $1
        `,
        [context.source_id]
      );

      if ((sourceStillUsed.rows[0]?.cnt || 0) === 0) {
        await client.query(
          `
          DELETE FROM material_source_files
          WHERE source_id = $1
          `,
          [context.source_id]
        );

        await client.query(
          `
          DELETE FROM material_sources
          WHERE source_id = $1
          `,
          [context.source_id]
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

module.exports = {
  createMaterialInstance,
  deleteMaterialInstance,
  ensureMaterialPropertiesRow,
  ensureMaterialSourceForPureInstance,
  getMaterialInstanceContext,
  listAllMaterialInstances,
  listMaterialInstancesForMaterial,
  updateMaterialInstance
};
