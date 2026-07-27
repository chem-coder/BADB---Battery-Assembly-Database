const { trackChanges } = require('../middleware/trackChanges');
const { collectDependencyConflicts } = require('../utils/dependencyConflicts');

function statusError(message, statusCode, extra = {}) {
  const err = new Error(message);
  err.statusCode = statusCode;
  Object.assign(err, extra);
  return err;
}

async function createMaterial(pool, payload, userId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
      INSERT INTO materials (name, role, family)
      VALUES ($1, $2, $3)
      RETURNING material_id, name, role, family
      `,
      [payload.name, payload.role, payload.family || null]
    );

    const instanceResult = await client.query(
      `
      INSERT INTO material_instances (
        material_id,
        name,
        notes
      )
      VALUES ($1, $2, $3)
      RETURNING material_instance_id
      `,
      [
        result.rows[0].material_id,
        `${payload.name} (чистый)`,
        null
      ]
    );

    const sourceInsert = await client.query(
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
      [result.rows[0].material_id, userId]
    );

    await client.query(
      `
      UPDATE material_instances
      SET source_id = $1
      WHERE material_instance_id = $2
      `,
      [sourceInsert.rows[0].source_id, instanceResult.rows[0].material_instance_id]
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function listMaterials(pool) {
  const result = await pool.query(
    `
    SELECT m.material_id, m.name, m.role, m.family,
           m.updated_by,
           m.updated_at,
           u_updated.name AS updated_by_name
    FROM materials m
    LEFT JOIN users u_updated ON u_updated.user_id = m.updated_by
    ORDER BY m.name
    `
  );

  return result.rows;
}

async function updateMaterial(pool, materialId, payload, userId) {
  const current = await pool.query('SELECT name, role, family FROM materials WHERE material_id = $1', [materialId]);
  if (current.rowCount === 0) {
    throw statusError('Материал не найден', 404);
  }

  const newVals = { name: payload.name, role: payload.role, family: payload.family || null };

  const result = await pool.query(
    `
    UPDATE materials
    SET name = $1, role = $2, family = $3, updated_by = $4, updated_at = now()
    WHERE material_id = $5
    RETURNING material_id, name, role, family, updated_by, updated_at
    `,
    [newVals.name, newVals.role, newVals.family, userId, materialId]
  );

  if (result.rowCount === 0) {
    throw statusError('Материал не найден', 404);
  }

  await trackChanges(pool, 'material', 'materials', 'material_id', materialId, current.rows[0], newVals, userId);

  return result.rows[0];
}

async function deleteMaterial(pool, materialId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const dependencies = await collectDependencyConflicts(client, [
      {
        key: 'material_instances',
        label: 'экземпляры этого материала',
        query: `
          SELECT material_instance_id AS id, name
          FROM material_instances
          WHERE material_id = $1
          ORDER BY material_instance_id
          LIMIT 25
        `,
        params: [materialId]
      },
      {
        key: 'tape_recipe_lines',
        label: 'рецепты, где используется этот материал',
        query: `
          SELECT DISTINCT tr.tape_recipe_id AS id, tr.name
          FROM tape_recipe_lines trl
          JOIN tape_recipes tr ON tr.tape_recipe_id = trl.tape_recipe_id
          WHERE trl.material_id = $1
          ORDER BY tr.tape_recipe_id
          LIMIT 25
        `,
        params: [materialId]
      },
      {
        key: 'tapes_active_material',
        label: 'ленты, где это активный материал',
        query: `
          SELECT tape_id AS id, name
          FROM tapes
          WHERE active_material_id = $1
          ORDER BY tape_id
          LIMIT 25
        `,
        params: [materialId]
      }
    ]);

    if (dependencies.length > 0) {
      throw statusError(
        'Нельзя удалить материал: он используется в экземплярах или рецептах',
        409,
        { dependencies }
      );
    }

    await client.query(
      `
      DELETE FROM material_source_files
      WHERE source_id IN (
        SELECT source_id
        FROM material_sources
        WHERE material_id = $1
      )
      `,
      [materialId]
    );

    await client.query(
      `
      DELETE FROM material_sources
      WHERE material_id = $1
      `,
      [materialId]
    );

    const result = await client.query(
      'DELETE FROM materials WHERE material_id = $1',
      [materialId]
    );

    if (result.rowCount === 0) {
      throw statusError('Материал не найден', 404);
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
  createMaterial,
  deleteMaterial,
  listMaterials,
  updateMaterial
};
