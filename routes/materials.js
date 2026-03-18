const express = require('express');
const router = express.Router();
const pool = require('../db');

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
router.post('/', async (req, res) => {
  const { name, role } = req.body;

  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Название обязательно' });
  }

  // role is optional in schema (role public.material_role), but UI requires it.
  if (typeof role !== 'string' || !role.trim()) {
    return res.status(400).json({ error: 'Роль обязательна' });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO materials (name, role)
      VALUES ($1, $2)
      RETURNING material_id, name, role
      `,
      [name.trim(), role]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Материал с таким названием уже существует' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// READ
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT material_id, name, role
      FROM materials
      ORDER BY name
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// UPDATE
router.put('/:id', async (req, res) => {
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
    const result = await pool.query(
      `
      UPDATE materials
      SET name = $1, role = $2
      WHERE material_id = $3
      RETURNING material_id, name, role
      `,
      [name.trim(), role, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Материал не найден' });
    }

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
router.delete('/:id', async (req, res) => {
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
router.post('/:id/instances', async (req, res) => {
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

// READ instances for a material
router.get('/:id/instances', async (req, res) => {
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
router.put('/instances/:id', async (req, res) => {
  const instanceId = Number(req.params.id);

  if (!Number.isInteger(instanceId)) {
    return res.status(400).json({ error: 'Некорректный material_instance_id' });
  }

  const { name, notes } = req.body;

  try {
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
      [
        name,
        notes || null,
        instanceId
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Экземпляр материала не найден' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE instance
// OLD ROUTE: .delete('/api/material-instances/:id'
router.delete('/instances/:id', async (req, res) => {
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
router.get('/instances/:id/components', async (req, res) => {
  const id = Number(req.params.id);

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
});

// --- ADD component to instance ---
router.post('/instances/:id/components', async (req, res) => {
  const parentId = Number(req.params.id);
  const { component_material_instance_id, mass_fraction } = req.body;

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
});



// --- UPDATE component ---
router.put('/instances/components/:id', async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Некорректный material_instance_component_id' });
  }

  const { mass_fraction, notes } = req.body;

  const mf =
    mass_fraction === '' || mass_fraction === null || mass_fraction === undefined
      ? null
      : Number(mass_fraction);

  if (mf === null || !Number.isFinite(mf) || mf < 0 || mf > 1) {
    return res.status(400).json({ error: 'Некорректный mass_fraction (ожидается число 0..1)' });
  }

  try {
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

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// --- DELETE component ---
router.delete('/instances/components/:id', async (req, res) => {
  const id = Number(req.params.id);

  await pool.query(
    `
    DELETE FROM material_instance_components
    WHERE material_instance_component_id = $1;
    `,
    [id]
  );

  res.json({ success: true });
});




module.exports = router;