const express = require('express');
const router = express.Router();

function normalizeMassFraction(value) {
  return Number(value.toFixed(8));
}
const pool = require('../db');
const { auth } = require('../middleware/auth');
const { trackChanges } = require('../middleware/trackChanges');

router.get('/test', async (req, res) => {
  const result = await pool.query('SELECT 1 as ok');
  res.json(result.rows);
});

/*
  materials
    └── material_instances
          └── material_instance_components
*/


// -------- MATERIALS --------

// CREATE
router.post('/', auth, async (req, res) => {
  const { name, role } = req.body;
  const cleanName = typeof name === 'string' ? name.trim() : '';

  if (!cleanName) {
    return res.status(400).json({ error: 'Название обязательно' });
  }

  // role is optional in schema (role public.material_role), but UI requires it.
  if (typeof role !== 'string' || !role.trim()) {
    return res.status(400).json({ error: 'Роль обязательна' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
      INSERT INTO materials (name, role)
      VALUES ($1, $2)
      RETURNING material_id, name, role
      `,
      [cleanName, role]
    );

    await client.query(
      `
      INSERT INTO material_instances (
        material_id,
        name,
        notes
      )
      VALUES ($1, $2, $3)
      `,
      [
        result.rows[0].material_id,
        `${cleanName} (чистый)`,
        null
      ]
    );

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Материал с таким названием уже существует' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});

// READ
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT m.material_id, m.name, m.role,
             m.updated_by,
             m.updated_at,
             u_updated.name AS updated_by_name
      FROM materials m
      LEFT JOIN users u_updated ON u_updated.user_id = m.updated_by
      ORDER BY m.name
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// UPDATE
router.put('/:id', auth, async (req, res) => {
  const id = Number(req.params.id);
  const { name, role } = req.body;

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Некорректный material_id' });
  }

  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Название обязательно' });
  }

  if (typeof role !== 'string' || !role.trim()) {
    return res.status(400).json({ error: 'Роль обязательна' });
  }

  try {
    const current = await pool.query('SELECT name, role FROM materials WHERE material_id = $1', [id]);
    if (current.rowCount === 0) {
      return res.status(404).json({ error: 'Материал не найден' });
    }

    const newVals = { name: name.trim(), role };

    const result = await pool.query(
      `
      UPDATE materials
      SET name = $1, role = $2, updated_by = $3, updated_at = now()
      WHERE material_id = $4
      RETURNING material_id, name, role, updated_by, updated_at
      `,
      [newVals.name, newVals.role, req.user.userId, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Материал не найден' });
    }

    await trackChanges(pool, 'material', 'materials', 'material_id', id, current.rows[0], newVals, req.user.userId);

    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Материал с таким названием уже существует' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE
router.delete('/:id', auth, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Некорректный material_id' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM materials WHERE material_id = $1',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Материал не найден' });
    }

    res.status(204).end();
  } catch (err) {
    // likely FK restrict from material_instances (ON DELETE RESTRICT)
    if (err.code === '23503') {
      return res.status(409).json({ error: 'Нельзя удалить материал: существуют экземпляры (instances)' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});



// -------- MATERIAL INSTANCES --------

// CREATE instance for material
router.post('/:id/instances', auth, async (req, res) => {
  const materialId = Number(req.params.id);

  if (!Number.isInteger(materialId)) {
    return res.status(400).json({ error: 'Некорректный material_id' });
  }

  const { name, notes } = req.body;

  try {
    const result = await pool.query(
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
        created_at
      `,
      [
        materialId,
        name,
        notes || null
      ]
      );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// READ all instances for composition dropdowns
router.get('/instances', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        mi.material_instance_id,
        mi.material_id,
        mi.name,
        mi.notes,
        mi.created_at,
        m.name AS material_name,
        m.role AS material_role
      FROM material_instances mi
      JOIN materials m
        ON mi.material_id = m.material_id
      ORDER BY mi.name, mi.material_instance_id
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки экземпляров материалов' });
  }
});

// READ instances for a material
router.get('/:id/instances', auth, async (req, res) => {
  const materialId = Number(req.params.id);

  if (!Number.isInteger(materialId)) {
    return res.status(400).json({ error: 'Некорректный material_id' });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        material_instance_id,
        material_id,
        name,
        notes,
        created_at
      FROM material_instances
      WHERE material_id = $1
      ORDER BY created_at DESC, material_instance_id DESC
      `,
      [materialId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});



// UPDATE instance
// OLD ROUTE: .put('/api/material-instances/:id'
router.put('/instances/:id', auth, async (req, res) => {
  const instanceId = Number(req.params.id);

  if (!Number.isInteger(instanceId)) {
    return res.status(400).json({ error: 'Некорректный material_instance_id' });
  }

  const { name, notes } = req.body;

  try {
    const current = await pool.query('SELECT name, notes FROM material_instances WHERE material_instance_id = $1', [instanceId]);
    if (current.rowCount === 0) {
      return res.status(404).json({ error: 'Экземпляр материала не найден' });
    }

    const newVals = { name, notes: notes || null };

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
      [newVals.name, newVals.notes, instanceId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Экземпляр материала не найден' });
    }

    await trackChanges(pool, 'material_instance', 'material_instances', 'material_instance_id', instanceId, current.rows[0], newVals, req.user.userId, null, false);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE instance
// OLD ROUTE: .delete('/api/material-instances/:id'
router.delete('/instances/:id', auth, async (req, res) => {
  const instanceId = Number(req.params.id);

  if (!Number.isInteger(instanceId)) {
    return res.status(400).json({ error: 'Некорректный material_instance_id' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM material_instances WHERE material_instance_id = $1',
      [instanceId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Экземпляр материала не найден' });
    }

    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});



// -------- MATERIAL INSTANCE COMPONENTS --------

// --- GET components for a material instance ---
router.get('/instances/:id/components', auth, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const result = await pool.query(
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
      ORDER BY mi.name;
      `,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки компонентов' });
  }
});

// --- ADD component to instance ---
router.post('/instances/:id/components', auth, async (req, res) => {
  const parentId = Number(req.params.id);
  const { component_material_instance_id, mass_fraction } = req.body;
  try {
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
      [parentId, component_material_instance_id, mass_fraction]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка добавления компонента' });
  }
});

// --- REPLACE full composition for an instance ---
router.put('/instances/:id/components', auth, async (req, res) => {
  const parentId = Number(req.params.id);
  const components = Array.isArray(req.body.components) ? req.body.components : null;

  if (!Number.isInteger(parentId)) {
    return res.status(400).json({ error: 'Некорректный material_instance_id' });
  }

  if (!components || components.length === 0) {
    return res.status(400).json({ error: 'Состав не передан' });
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
      return res.status(400).json({ error: 'Некорректные данные состава' });
    }

    if (componentId === parentId) {
      return res.status(400).json({ error: 'Экземпляр не может содержать сам себя' });
    }

    if (seenIds.has(componentId)) {
      return res.status(400).json({ error: 'Один и тот же экземпляр нельзя добавить дважды' });
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
    return res.status(400).json({ error: 'Сумма состава должна быть ровно 100%' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Snapshot old composition for changelog
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

    const result = await client.query(
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

    // Log composition change as JSON diff
    await trackChanges(client, 'material_composition', 'material_instances', 'material_instance_id', parentId,
      { composition: JSON.stringify(oldComp.rows) },
      { composition: JSON.stringify(normalized) },
      req.user.userId, null, false
    );

    await client.query('COMMIT');
    res.json(result.rows);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения состава' });
  } finally {
    client.release();
  }
});



// --- UPDATE component ---
router.put('/instances/components/:id', auth, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Некорректный material_instance_component_id' });
  }

  const { mass_fraction, notes } = req.body;

  const mf =
    mass_fraction === '' || mass_fraction === null || mass_fraction === undefined
      ? null
      : normalizeMassFraction(Number(mass_fraction));

  if (mf === null || !Number.isFinite(mf) || mf < 0 || mf > 1) {
    return res.status(400).json({ error: 'Некорректный mass_fraction (ожидается число 0..1)' });
  }

  try {
    const current = await pool.query('SELECT mass_fraction, notes FROM material_instance_components WHERE material_instance_component_id = $1', [id]);
    if (current.rowCount === 0) {
      return res.status(404).json({ error: 'Компонент не найден' });
    }

    const newVals = { mass_fraction: mf, notes: notes || null };

    const result = await pool.query(
      `
      UPDATE material_instance_components
      SET
        mass_fraction = $1,
        notes = $2
      WHERE material_instance_component_id = $3
      RETURNING *
      `,
      [mf, notes || null, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Компонент не найден' });
    }

    await trackChanges(pool, 'material_component', 'material_instance_components', 'material_instance_component_id', id, current.rows[0], newVals, req.user.userId, null, false);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// --- DELETE component ---
router.delete('/instances/components/:id', auth, async (req, res) => {
  const id = Number(req.params.id);
  try {
    await pool.query(
      `
      DELETE FROM material_instance_components
      WHERE material_instance_component_id = $1;
      `,
      [id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка удаления компонента' });
  }
});




module.exports = router;
