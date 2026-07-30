const { trackChanges } = require('../middleware/trackChanges');
const { collectDependencyConflicts } = require('../utils/dependencyConflicts');
const { fetchWorkflowStatusMap } = require('./tapeWorkflowService');
const {
  attachTapeProjects,
  getPrimaryProjectId,
  normalizeTapeProjectIds,
  replaceTapeProjects
} = require('./tapeProjectService');

function statusError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function parseOptionalId(value) {
  return value ? Number(value) : null;
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

function defaultWorkflowStatus() {
  return {
    workflow_status_code: 'recipe_materials',
    workflow_status_label: 'Выбор экземпляров',
    workflow_complete: false
  };
}

// The tape's active material must exist and its role must match the recipe's
// electrode role (cathode recipe <-> cathode_active material). The recipe's
// active line itself carries no material (open slot, see migration d047).
async function validateActiveMaterial(db, activeMaterialId, recipeId) {
  if (activeMaterialId === null) {
    return;
  }

  const material = await db.query(
    'SELECT role FROM materials WHERE material_id = $1',
    [activeMaterialId]
  );

  if (material.rowCount === 0) {
    throw statusError('Активный материал не найден', 400);
  }

  if (recipeId !== null) {
    const recipe = await db.query(
      'SELECT role FROM tape_recipes WHERE tape_recipe_id = $1',
      [recipeId]
    );

    if (recipe.rowCount === 0) {
      throw statusError('Рецепт не найден', 400);
    }

    const expectedMaterialRole =
      recipe.rows[0].role === 'cathode' ? 'cathode_active' : 'anode_active';

    if (material.rows[0].role !== expectedMaterialRole) {
      throw statusError(
        'Роль активного материала не соответствует роли рецепта (катод/анод)',
        400
      );
    }
  }
}

async function createTape(pool, payload, createdBy) {
  const projectIds = normalizeTapeProjectIds(payload);
  const projectId = getPrimaryProjectId(projectIds);
  const recipeId = parseOptionalId(payload.tape_recipe_id);
  const activeMaterialId = parseOptionalId(payload.active_material_id);
  const itemCreatedAtDate = normalizeOptionalItemCreatedAtDate(payload.item_created_at);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await validateActiveMaterial(client, activeMaterialId, recipeId);

    const result = await client.query(
      `
      INSERT INTO tapes (
        name,
        project_id,
        tape_recipe_id,
        active_material_id,
        created_by,
        created_at,
        updated_at,
        item_created_at,
        notes,
        calc_mode,
        target_mass_g,
        storage_notes
      )
      VALUES ($1,$2,$3,$4,$5,now(),now(),COALESCE($6::date, CURRENT_DATE),$7,$8,$9,$10)
      RETURNING *
      `,
      [
        payload.name,
        projectId,
        recipeId,
        activeMaterialId,
        createdBy,
        itemCreatedAtDate,
        payload.notes ?? null,
        payload.calc_mode ?? null,
        payload.target_mass_g ?? null,
        payload.storage_notes ?? null
      ]
    );

    await replaceTapeProjects(client, result.rows[0].tape_id, projectIds, createdBy);
    const [createdTape] = await attachTapeProjects(client, result.rows);

    await client.query('COMMIT');
    return createdTape;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function listTapes(pool, role) {
  const baseQuery = `
    SELECT
      t.tape_id,
      t.name,
      t.project_id,
      t.tape_recipe_id,
      t.created_by,
      t.created_at,
      t.item_created_at,
      t.updated_at,
      t.status,
      t.availability_status,
      t.notes,
      t.calc_mode,
      t.target_mass_g,
      t.active_material_id,
      m_act.name AS active_material_name,
      m_act.family AS active_material_family,
      r.role,
      r.name AS recipe_name,
      p.name AS project_name,
      u_created.name AS created_by_name,
      t.updated_by,
      t.updated_at,
      u_updated.name AS updated_by_name,
      (
        SELECT string_agg(DISTINCT u.name, ', ' ORDER BY u.name)
        FROM tape_process_steps ts
        JOIN users u ON u.user_id = ts.performed_by
        WHERE ts.tape_id = t.tape_id
      ) AS operators,
      (
        SELECT COUNT(DISTINCT ot2.code)
        FROM tape_process_steps ts2
        JOIN operation_types ot2 ON ot2.operation_type_id = ts2.operation_type_id
        WHERE ts2.tape_id = t.tape_id
      ) AS completed_steps,
      (
        SELECT c.coating_sidedness
        FROM tape_process_steps ts3
        JOIN operation_types ot3 ON ot3.operation_type_id = ts3.operation_type_id
        JOIN tape_step_coating c ON c.step_id = ts3.step_id
        WHERE ts3.tape_id = t.tape_id
          AND ot3.code = 'coating'
        LIMIT 1
      ) AS coating_sidedness
    FROM tapes t
    LEFT JOIN tape_recipes r ON r.tape_recipe_id = t.tape_recipe_id
    LEFT JOIN materials m_act ON m_act.material_id = t.active_material_id
    LEFT JOIN projects p ON p.project_id = t.project_id
    LEFT JOIN users u_created ON u_created.user_id = t.created_by
    LEFT JOIN users u_updated ON u_updated.user_id = t.updated_by
  `;

  const result = role
    ? await pool.query(baseQuery + ' WHERE r.role = $1 ORDER BY t.item_created_at DESC, t.created_at DESC', [role])
    : await pool.query(baseQuery + ' ORDER BY t.item_created_at DESC, t.created_at DESC');

  const rows = result.rows || [];
  const statusMap = await fetchWorkflowStatusMap(pool, rows.map((row) => row.tape_id));

  const rowsWithStatus = rows.map((row) => ({
    ...row,
    ...(statusMap.get(Number(row.tape_id)) || defaultWorkflowStatus())
  }));

  return attachTapeProjects(pool, rowsWithStatus);
}

async function updateTape(pool, id, payload, userId) {
  const projectIds = normalizeTapeProjectIds(payload);
  const projectId = getPrimaryProjectId(projectIds);
  const recipeId = parseOptionalId(payload.tape_recipe_id);
  const activeMaterialId = parseOptionalId(payload.active_material_id);
  const itemCreatedAtDate = normalizeOptionalItemCreatedAtDate(payload.item_created_at);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await validateActiveMaterial(client, activeMaterialId, recipeId);

    const current = await client.query(
      'SELECT tape_id, name, project_id, tape_recipe_id, active_material_id, created_by, created_at, item_created_at, notes, calc_mode, target_mass_g FROM tapes WHERE tape_id = $1',
      [id]
    );

    if (current.rowCount === 0) {
      throw statusError('Лента не найдена', 404);
    }

    const [currentWithProjects] = await attachTapeProjects(client, current.rows);

    const result = await client.query(
      `
      UPDATE tapes
      SET
        name = $1,
        project_id = $2,
        tape_recipe_id = $3,
        active_material_id = $4,
        created_by = $5,
        item_created_at = COALESCE($6::date, item_created_at),
        notes = $7,
        calc_mode = $8,
        target_mass_g = $9,
        storage_notes = CASE WHEN $10 THEN $11 ELSE storage_notes END,
        updated_by = $12,
        updated_at = now()
      WHERE tape_id = $13
      RETURNING *
      `,
      [
        payload.name,
        projectId,
        recipeId,
        activeMaterialId,
        current.rows[0].created_by,
        itemCreatedAtDate,
        payload.notes ?? null,
        payload.calc_mode ?? null,
        payload.target_mass_g ?? null,
        Object.prototype.hasOwnProperty.call(payload, 'storage_notes'),
        Object.prototype.hasOwnProperty.call(payload, 'storage_notes') ? (payload.storage_notes ?? null) : null,
        userId,
        id
      ]
    );

    if (result.rowCount === 0) {
      throw statusError('Лента не найдена', 404);
    }

    await replaceTapeProjects(client, id, projectIds, userId);

    await trackChanges(
      client,
      'tape',
      'tapes',
      'tape_id',
      id,
      currentWithProjects,
      {
        name: payload.name,
        project_id: projectId,
        project_ids: projectIds,
        tape_recipe_id: recipeId,
        active_material_id: activeMaterialId,
        created_by: current.rows[0].created_by,
        item_created_at: result.rows[0].item_created_at,
        notes: payload.notes ?? null,
        calc_mode: payload.calc_mode ?? null,
        target_mass_g: payload.target_mass_g ?? null
      },
      userId
    );

    const [updatedTape] = await attachTapeProjects(client, result.rows);

    await client.query('COMMIT');
    return updatedTape;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function collectTapeDeleteDependencies(pool, tapeId) {
  return collectDependencyConflicts(pool, [
    {
      key: 'battery_electrode_sources',
      label: 'аккумуляторы, где эта лента выбрана как источник электродов',
      query: `
        SELECT DISTINCT b.battery_id AS id, b.battery_notes AS name
        FROM battery_electrode_sources bes
        JOIN batteries b ON b.battery_id = bes.battery_id
        LEFT JOIN electrode_cut_batches ecb ON ecb.cut_batch_id = bes.cut_batch_id
        WHERE bes.tape_id = $1 OR ecb.tape_id = $1
        ORDER BY b.battery_id
        LIMIT 25
      `,
      params: [tapeId]
    },
    {
      key: 'electrode_cut_batches',
      label: 'партии электродов, вырезанные из этой ленты',
      query: `
        SELECT cut_batch_id AS id, comments AS name
        FROM electrode_cut_batches
        WHERE tape_id = $1
        ORDER BY cut_batch_id
        LIMIT 25
      `,
      params: [tapeId]
    },
    {
      key: 'battery_electrodes',
      label: 'аккумуляторы с электродами из этой ленты',
      query: `
        SELECT DISTINCT b.battery_id AS id, b.battery_notes AS name
        FROM battery_electrodes be
        JOIN batteries b ON b.battery_id = be.battery_id
        JOIN electrodes e ON e.electrode_id = be.electrode_id
        JOIN electrode_cut_batches ecb ON ecb.cut_batch_id = e.cut_batch_id
        WHERE ecb.tape_id = $1
        ORDER BY b.battery_id
        LIMIT 25
      `,
      params: [tapeId]
    }
  ]);
}

async function getTapeDeleteCheck(pool, tapeId) {
  const tapeResult = await pool.query(
    'SELECT tape_id FROM tapes WHERE tape_id = $1',
    [tapeId]
  );

  if (tapeResult.rowCount === 0) {
    throw statusError('Лента не найдена', 404);
  }

  const dependencies = await collectTapeDeleteDependencies(pool, tapeId);

  return {
    can_delete: dependencies.length === 0,
    error: dependencies.length > 0
      ? 'Нельзя удалить ленту: она связана с партиями электродов или аккумуляторами'
      : null,
    dependencies
  };
}

async function deleteTape(pool, tapeId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tapeResult = await client.query(
      'SELECT tape_id FROM tapes WHERE tape_id = $1',
      [tapeId]
    );

    if (tapeResult.rowCount === 0) {
      throw statusError('Лента не найдена', 404);
    }

    const dependencies = await collectTapeDeleteDependencies(client, tapeId);

    if (dependencies.length > 0) {
      const err = statusError('Нельзя удалить ленту: она связана с партиями электродов или аккумуляторами', 409);
      err.dependencies = dependencies;
      throw err;
    }

    await client.query('DELETE FROM tape_projects WHERE tape_id = $1', [tapeId]);

    const result = await client.query(
      `DELETE FROM tapes WHERE tape_id = $1`,
      [tapeId]
    );

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
  collectTapeDeleteDependencies,
  createTape,
  deleteTape,
  getTapeDeleteCheck,
  listTapes,
  updateTape
};
