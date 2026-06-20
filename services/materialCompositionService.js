const { trackChanges } = require('../middleware/trackChanges');

class MaterialCompositionValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MaterialCompositionValidationError';
    this.statusCode = 400;
  }
}

function normalizeMassFraction(value) {
  return Number(value.toFixed(8));
}

function normalizeCompositionPayload(parentId, components) {
  if (!Array.isArray(components) || components.length === 0) {
    throw new MaterialCompositionValidationError('Состав не передан');
  }

  const normalized = [];
  const seenIds = new Set();
  let total = 0;

  for (const component of components) {
    const componentId = Number(component.component_material_instance_id);
    const massFraction = normalizeMassFraction(Number(component.mass_fraction));

    if (
      !Number.isInteger(componentId) ||
      !Number.isFinite(massFraction) ||
      massFraction <= 0 ||
      massFraction > 1
    ) {
      throw new MaterialCompositionValidationError('Некорректные данные состава');
    }

    if (componentId === parentId) {
      throw new MaterialCompositionValidationError('Экземпляр не может содержать сам себя');
    }

    if (seenIds.has(componentId)) {
      throw new MaterialCompositionValidationError('Один и тот же экземпляр нельзя добавить дважды');
    }

    seenIds.add(componentId);
    total += massFraction;

    normalized.push({
      component_material_instance_id: componentId,
      mass_fraction: massFraction,
      notes: component.notes ? String(component.notes).trim() : null
    });
  }

  if (Math.abs(total - 1) > 0.0001) {
    throw new MaterialCompositionValidationError('Сумма состава должна быть ровно 100%');
  }

  return normalized;
}

async function fetchMaterialInstanceComponents(queryable, parentId) {
  const result = await queryable.query(
    `
    SELECT
      mic.material_instance_component_id,
      mic.parent_material_instance_id,
      mic.component_material_instance_id,
      mic.mass_fraction,
      mi.name AS component_name,
      mi.material_id,
      m.name AS material_name,
      m.role AS material_role,
      mic.notes
    FROM material_instance_components mic
    JOIN material_instances mi
      ON mic.component_material_instance_id = mi.material_instance_id
    JOIN materials m
      ON mi.material_id = m.material_id
    WHERE mic.parent_material_instance_id = $1
    ORDER BY mi.name
    `,
    [parentId]
  );

  return result.rows;
}

async function addMaterialInstanceComponent(pool, parentId, componentMaterialInstanceId, massFraction) {
  // Per-row validation for the incremental "add one component" path. Mirrors the
  // per-row checks in normalizeCompositionPayload (id / fraction / self-reference),
  // but deliberately WITHOUT the whole-composition sum-to-100 rule — like the
  // sibling per-component update/delete endpoints, adding one component must not
  // require the running total to equal 100%.
  const componentId = Number(componentMaterialInstanceId);
  const normalizedMassFraction = normalizeMassFraction(Number(massFraction));

  if (!Number.isInteger(componentId) || componentId <= 0) {
    throw new MaterialCompositionValidationError('Некорректные данные состава');
  }

  if (
    !Number.isFinite(normalizedMassFraction) ||
    normalizedMassFraction <= 0 ||
    normalizedMassFraction > 1
  ) {
    throw new MaterialCompositionValidationError('Некорректные данные состава');
  }

  if (componentId === parentId) {
    throw new MaterialCompositionValidationError('Экземпляр не может содержать сам себя');
  }

  const result = await pool.query(
    `
    WITH ins AS (
      INSERT INTO material_instance_components
        (parent_material_instance_id, component_material_instance_id, mass_fraction)
      VALUES ($1, $2, $3)
      RETURNING *
    )
    SELECT
      ins.material_instance_component_id,
      ins.parent_material_instance_id,
      ins.component_material_instance_id,
      ins.mass_fraction,
      mi.name AS component_name,
      mi.material_id,
      m.name AS material_name,
      ins.notes
    FROM ins
    JOIN material_instances mi
      ON ins.component_material_instance_id = mi.material_instance_id
    JOIN materials m
      ON mi.material_id = m.material_id;
    `,
    [parentId, componentId, normalizedMassFraction]
  );

  return result.rows[0];
}

async function replaceMaterialInstanceComposition(pool, parentId, components, userId) {
  const normalized = normalizeCompositionPayload(parentId, components);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const oldComp = await client.query(
      'SELECT component_material_instance_id, mass_fraction, notes FROM material_instance_components WHERE parent_material_instance_id = $1 ORDER BY component_material_instance_id',
      [parentId]
    );

    await client.query(
      `
      DELETE FROM material_instance_components
      WHERE parent_material_instance_id = $1
      `,
      [parentId]
    );

    for (const component of normalized) {
      await client.query(
        `
        INSERT INTO material_instance_components (
          parent_material_instance_id,
          component_material_instance_id,
          mass_fraction,
          notes
        )
        VALUES ($1, $2, $3, $4)
        `,
        [
          parentId,
          component.component_material_instance_id,
          component.mass_fraction,
          component.notes
        ]
      );
    }

    const rows = await fetchMaterialInstanceComponents(client, parentId);

    await trackChanges(
      client,
      'material_composition',
      'material_instances',
      'material_instance_id',
      parentId,
      { composition: JSON.stringify(oldComp.rows) },
      { composition: JSON.stringify(normalized) },
      userId,
      null,
      false
    );

    await client.query('COMMIT');
    return rows;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updateMaterialInstanceComponent(pool, componentId, payload, userId) {
  const massFraction =
    payload.mass_fraction === '' ||
    payload.mass_fraction === null ||
    payload.mass_fraction === undefined
      ? null
      : normalizeMassFraction(Number(payload.mass_fraction));

  if (massFraction === null || !Number.isFinite(massFraction) || massFraction < 0 || massFraction > 1) {
    throw new MaterialCompositionValidationError('Некорректный mass_fraction (ожидается число 0..1)');
  }

  const current = await pool.query(
    'SELECT mass_fraction, notes FROM material_instance_components WHERE material_instance_component_id = $1',
    [componentId]
  );

  if (current.rowCount === 0) {
    const err = new Error('Компонент не найден');
    err.statusCode = 404;
    throw err;
  }

  const newVals = { mass_fraction: massFraction, notes: payload.notes || null };

  const result = await pool.query(
    `
    UPDATE material_instance_components
    SET
      mass_fraction = $1,
      notes = $2
    WHERE material_instance_component_id = $3
    RETURNING *
    `,
    [massFraction, payload.notes || null, componentId]
  );

  if (result.rowCount === 0) {
    const err = new Error('Компонент не найден');
    err.statusCode = 404;
    throw err;
  }

  await trackChanges(
    pool,
    'material_component',
    'material_instance_components',
    'material_instance_component_id',
    componentId,
    current.rows[0],
    newVals,
    userId,
    null,
    false
  );

  return result.rows[0];
}

async function deleteMaterialInstanceComponent(pool, componentId) {
  await pool.query(
    `
    DELETE FROM material_instance_components
    WHERE material_instance_component_id = $1;
    `,
    [componentId]
  );

  return { success: true };
}

module.exports = {
  addMaterialInstanceComponent,
  deleteMaterialInstanceComponent,
  MaterialCompositionValidationError,
  fetchMaterialInstanceComponents,
  normalizeMassFraction,
  replaceMaterialInstanceComposition,
  updateMaterialInstanceComponent
};
