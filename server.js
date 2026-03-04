const express = require('express');
const { Pool } = require('pg');

const app = express();
const PORT = 3000;

// middleware
app.use(express.json());    // w/o this, req.body would be undefined
app.use(express.static('public'));
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
}); 

// Postgres connection
const pool = new Pool({
  user: 'Dalia',
  database: 'badb_v1'
  // , host: 'localhost',   // optional, default is 'localhost'
  // port: 5432             // optional, default is 5432
});

// quick check - temporary
pool.query('SELECT 1')
  .then(() => console.log('Postgres connected'))
  .catch(err => console.error('Postgres connection error', err));


// ** ~~~~~~~~~~ ** ROUTES ** ~~~~~~~~~~ **


// -------- USERS --------

// CREATE
app.post('/api/users', async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Имя пользователя обязательно'});
  }

  try {
    const result = await pool.query(
      'INSERT INTO users (name) VALUES ($1) RETURNING *',
      [name]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    // UNIQUE violation
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Пользователь уже существует'});
    }

    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// READ
app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT user_id, name, active FROM users ORDER BY name');

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера'});
  }
});

// UPDATE
app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { name, active } = req.body;

  if (!name || typeof active !== 'boolean') {
    return res.status(400).json({ error: 'Некорректные данные' });    // 'Имя пользователя и статус активности обязательны'
  }

  try {
    const result = await pool.query(
      'UPDATE users SET name = $1, active = $2 WHERE user_id = $3 RETURNING *',
      [name, active, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Пользователь с таким именем уже существует' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE
app.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query('DELETE FROM users WHERE user_id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});



// -------- SEPARATORS --------

// CREATE
app.post('/api/separators', async (req, res) => {
  const {
    name,
    supplier,
    brand,
    batch,
    air_perm,
    air_perm_units,
    thickness_um,
    porosity,
    comments,
    status = 'available',
    depleted_at,
    file_path
  } = req.body;

  const structure_id = Number(req.body.structure_id);
  const created_by  = Number(req.body.created_by);

  // 1. validate required strings
  if (!name) {
    return res.status(400).json({ error: 'Обязательные поля отсутствуют' });
  }

  // 2. validate required foreign keys
  if (!Number.isInteger(structure_id) || !Number.isInteger(created_by)) {
    return res.status(400).json({ error: 'Некорректные идентификаторы' });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO separators (
        name, supplier, brand, batch,
        structure_id,
        air_perm, air_perm_units,
        thickness_um, porosity,
        comments,
        status, depleted_at,
        created_by,
        file_path
      )
      VALUES (
        $1,$2,$3,$4,
        $5,
        $6,$7,
        $8,$9,
        $10,
        $11,$12,
        $13,
        $14
      )
      RETURNING sep_id
      `,
      [
        name.trim(),
        supplier || null,
        brand || null,
        batch || null,
        structure_id,
        air_perm || null,
        air_perm_units || null,
        thickness_um || null,
        porosity || null,
        comments || null,
        status,
        depleted_at || null,
        created_by,
        file_path || null
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// READ
app.get('/api/separators', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        sep_id,
        name,
        supplier,
        brand,
        batch,
        structure_id,
        air_perm,
        air_perm_units,
        thickness_um,
        porosity,
        comments,
        status,
        depleted_at,
        created_by
      FROM separators
      ORDER BY name;
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// UPDATE
app.put('/api/separators/:id', async (req, res) => {
  const { id } = req.params;

  const {
    name,
    supplier,
    brand,
    batch,
    air_perm,
    air_perm_units,
    thickness_um,
    porosity,
    comments,
    status,
    depleted_at,
    file_path
  } = req.body;

  const structure_id = Number(req.body.structure_id);

  // ---- validation ----
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Название сепаратора обязательно' });
  }

  if (!Number.isInteger(structure_id)) {
    return res.status(400).json({ error: 'Некорректная структура' });
  }

  const cleanName = name.trim();

  const cleanDepletedAt =
    status === 'available' ? null : (depleted_at || null);

  try {
    const result = await pool.query(
      `
      UPDATE separators
      SET
        name = $1,
        supplier = $2,
        brand = $3,
        batch = $4,
        structure_id = $5,
        air_perm = $6,
        air_perm_units = $7,
        thickness_um = $8,
        porosity = $9,
        comments = $10,
        status = $11,
        depleted_at = $12,
        file_path = $13
      WHERE sep_id = $14
      RETURNING *
      `,
      [
        cleanName,
        supplier || null,
        brand || null,
        batch || null,
        structure_id,
        air_perm || null,
        air_perm_units || null,
        thickness_um || null,
        porosity || null,
        comments || null,
        status || 'available',
        cleanDepletedAt,
        file_path || null,
        id
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Сепаратор не найден' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE
app.delete('/api/separators/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM separators WHERE sep_id = $1',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Сепаратор не найден' });
    }

    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});



// -------- STRUCTURES --------

// CREATE
app.post('/api/structures', async (req, res) => {
  const { name, comments } = req.body;
  
  // 1. validate required strings
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Название структуры обязательно' });
  }
  
  const cleanName = name.trim();

  try {
    const result = await pool.query(
      `
      INSERT INTO separator_structure (name, comments)
      VALUES ($1, $2)
      RETURNING sep_str_id, name, comments
      `,
      [cleanName, comments || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      // unique violation on name
      return res.status(409).json({ error: 'Такая структура уже существует' });
    }

    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// READ
app.get('/api/structures', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT sep_str_id, name, comments FROM separator_structure ORDER BY name'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// UPDATE
app.put('/api/structures/:id', async (req, res) => {
  const { id } = req.params;
  const { name, comments } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Название структуры обязательно' });
  }

  try {
    const result = await pool.query(
      `
      UPDATE separator_structure
      SET name = $1,
          comments = $2
      WHERE sep_str_id = $3
      RETURNING sep_str_id, name, comments
      `,
      [name.trim(), comments || null, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Структура не найдена' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Такая структура уже существует' });
    }

    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE
app.delete('/api/structures/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM separator_structure WHERE sep_str_id = $1',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Структура не найдена' });
    }

    res.status(204).end();
  } catch (err) {
    if (err.code === '23503') {
      // foreign key violation
      return res.status(409).json({
        error: 'Нельзя удалить структуру, которая используется в сепараторах'
      });
    }

    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});



// -------- PROJECTS --------

// CREATE
app.post('/api/projects', async (req, res) => {
  const {
    name,
    created_by,
    lead_id,
    start_date,
    due_date,
    status = 'active',
    description
  } = req.body;

  const createdBy = Number(created_by);
  const leadId = lead_id ? Number(lead_id) : null;

  // 1. validate required strings
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Название проекта обязательно' });
  }

  // 2. validate required foreign keys
  if (!Number.isInteger(createdBy)) {
    return res.status(400).json({ error: 'Некорректные идентификаторы' });
  }

  // 3. validate optional foreign keys
  if (leadId !== null && !Number.isInteger(leadId)) {
    return res.status(400).json({ error: 'Некорректный руководитель' });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO projects
        (name, created_by, lead_id, start_date, due_date, status, description)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7)
      RETURNING project_id
      `,
      [
        name.trim(),
        createdBy,
        leadId,
        start_date || null,
        due_date || null,
        status,
        description || null
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// READ
app.get('/api/projects', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        p.project_id,
        p.name,
        p.created_by,
        p.lead_id,
        u.name AS lead_name,
        p.start_date,
        p.due_date,
        p.status,
        p.description
      FROM projects p
      LEFT JOIN users u
        ON p.lead_id = u.user_id
      ORDER BY p.name;
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// UPDATE
app.put('/api/projects/:id', async (req, res) => {
  const { id } = req.params;
  const {
    name,
    lead_id,
    start_date,
    due_date,
    status,
    description
  } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Название проекта обязательно' });
  }

  try {
    const result = await pool.query(
      `
      UPDATE projects
      SET
        name = $1,
        lead_id = $2,
        start_date = $3,
        due_date = $4,
        status = $5,
        description = $6,
        updated_at = now()
      WHERE project_id = $7
      RETURNING *
      `,
      [
        name.trim(),
        lead_id || null,
        start_date || null,
        due_date || null,
        status || 'active',
        description || null,
        id
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Проект не найден' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE
app.delete('/api/projects/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM projects WHERE project_id = $1',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Проект не найден' });
    }

    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});



// -------- MATERIALS --------

// CREATE
app.post('/api/materials', async (req, res) => {
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
app.get('/api/materials', async (req, res) => {
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
app.put('/api/materials/:id', async (req, res) => {
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
app.delete('/api/materials/:id', async (req, res) => {
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
app.post('/api/materials/:id/instances', async (req, res) => {
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
app.get('/api/materials/:id/instances', async (req, res) => {
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
app.put('/api/material-instances/:id', async (req, res) => {
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
app.delete('/api/material-instances/:id', async (req, res) => {
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
app.get('/api/material-instances/:id/components', async (req, res) => {
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
app.post('/api/material-instances/:id/components', async (req, res) => {
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
app.put('/api/material-instance-components/:id', async (req, res) => {
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
app.delete('/api/material-instance-components/:id', async (req, res) => {
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




// -------- RECIPES --------

// CREATE: new recipe + lines
app.post('/api/recipes', async (req, res) => {
  const {
    role,
    name,
    variant_label,
    notes,
    created_by,
    lines
  } = req.body;

  const createdBy = Number(created_by);

  if (
    !Number.isInteger(createdBy) ||
    !name ||
    !role ||
    !Array.isArray(lines) || 
    lines.length === 0
  ) {
    return res.status(400).json({ error: 'Некорректные данные запроса' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const recipeResult = await client.query(
      `
      INSERT INTO tape_recipes (
        role, name, variant_label, notes, created_by
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING tape_recipe_id
      `,
      [role, name, variant_label || null, notes || null, createdBy]
    );

    const recipeId = recipeResult.rows[0].tape_recipe_id;

    for (const line of lines) {
      const {
        material_id,
        recipe_role,
        include_in_pct,
        slurry_percent,
        line_notes
      } = line;

      const pct =
        slurry_percent === '' || slurry_percent === null
          ? null
          : Number(slurry_percent);

      const matId = Number(material_id);

      const includeInPct =
        include_in_pct === false || include_in_pct === 'false'
          ? false
          : true;

      // If excluded (solvent), percent must be NULL to satisfy the new CHECK constraint
      const pctFinal = includeInPct ? pct : null;

      if (
        !Number.isInteger(matId) ||
        !recipe_role ||
        (includeInPct && (pctFinal === null || !Number.isFinite(pctFinal) || pctFinal < 0 || pctFinal > 100)) ||
        (!includeInPct && pctFinal !== null)
      ) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Некорректные данные строки рецепта' });
      }

      await client.query(
        `
        INSERT INTO tape_recipe_lines (
          tape_recipe_id,
          material_id,
          recipe_role,
          include_in_pct,
          slurry_percent,
          line_notes
        )
        VALUES ($1,$2,$3,$4,$5,$6)
        `,
        [
          recipeId,
          matId,
          recipe_role,
          includeInPct,
          pctFinal,
          line_notes ?? null
        ]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ tape_recipe_id: recipeId });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});

// COPY: duplicate recipe + lines
app.post('/api/recipes/:id/duplicate', async (req, res) => {
  const sourceRecipeId = Number(req.params.id);
  const { created_by } = req.body;
  const createdBy = Number(created_by);

  if (!Number.isInteger(sourceRecipeId) || !Number.isInteger(createdBy)) {
    return res.status(400).json({ error: 'Некорректные данные запроса' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // create new recipe by copying header
    const recipeResult = await client.query(
      `
      INSERT INTO tape_recipes (
        role,
        name,
        variant_label,
        notes,
        created_by
      )
      SELECT
        role,
        name || ' (copy)',
        variant_label,
        notes,
        $2
      FROM tape_recipes
      WHERE tape_recipe_id = $1
      RETURNING tape_recipe_id
      `,
      [sourceRecipeId, createdBy]
    );

    if (recipeResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Рецепт не найден' });
    }

    const newRecipeId = recipeResult.rows[0].tape_recipe_id;

    // copy recipe lines
    await client.query(
      `
      INSERT INTO tape_recipe_lines (
        tape_recipe_id,
        material_id,
        recipe_role,
        include_in_pct,
        slurry_percent,
        line_notes
      )
      SELECT
        $2,
        material_id,
        recipe_role,
        include_in_pct,
        slurry_percent,
        line_notes
      FROM tape_recipe_lines
      WHERE tape_recipe_id = $1
      `,
      [sourceRecipeId, newRecipeId]
    );

    await client.query('COMMIT');
    res.status(201).json({ tape_recipe_id: newRecipeId });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});

// READ
app.get('/api/recipes', async (req, res) => {
  const role = req.query.role ? String(req.query.role) : null;

  if (req.query.role && role !== 'cathode' && role !== 'anode') {
    return res.status(400).json({ error: 'Некорректный role (ожидается cathode или anode)' });
  }

  try {
        let sql = `
      SELECT
        r.tape_recipe_id,
        r.role,
        r.name,
        r.variant_label,
        r.notes,
        r.created_by,
        r.created_at,
        act.active_material_name,
        act.active_percent,
        u.name AS created_by_name
      FROM tape_recipes r
      JOIN users u ON u.user_id = r.created_by
      LEFT JOIN LATERAL (
        SELECT
          m.name AS active_material_name,
          rl.slurry_percent AS active_percent
        FROM tape_recipe_lines rl
        JOIN materials m ON m.material_id = rl.material_id
        WHERE rl.tape_recipe_id = r.tape_recipe_id
          AND rl.recipe_role IN ('cathode_active','anode_active')
        LIMIT 1
      ) act ON true
    `;

    const params = [];
    const where = [];

    if (role !== null) {
      params.push(role);
      where.push(`r.role = $${params.length}`);
    }

    if (where.length) {
      sql += ` WHERE ` + where.join(' AND ');
    }

    sql += ` ORDER BY r.name ASC, r.variant_label ASC NULLS FIRST;`;

    const result = await pool.query(sql, params);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// READ: recipe details (header only)
app.get('/api/recipes/:id', async (req, res) => {
  const recipeId = Number(req.params.id);

  if (!Number.isInteger(recipeId)) {
    return res.status(400).json({ error: 'Некорректный tape_recipe_id' });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        tape_recipe_id,
        role,
        name,
        variant_label,
        notes,
        created_by,
        created_at
      FROM tape_recipes
      WHERE tape_recipe_id = $1
      `,
      [recipeId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Рецепт не найден' });
    }

    res.json(result.rows[0]); // one recipe object
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// READ: recipe lines (composition)
app.get('/api/recipes/:id/lines', async (req, res) => {
  const recipeId = Number(req.params.id);

  if (!Number.isInteger(recipeId)) {
    return res.status(400).json({ error: 'Некорректный tape_recipe_id' });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        rl.recipe_line_id,
        rl.material_id,
        m.name AS material_name,
        rl.recipe_role,
        rl.include_in_pct,
        rl.slurry_percent,
        rl.line_notes
      FROM tape_recipe_lines rl
      JOIN materials m ON m.material_id = rl.material_id
      WHERE rl.tape_recipe_id = $1
      ORDER BY
        rl.recipe_role,
        m.name ASC,
        rl.recipe_line_id;
      `,
      [recipeId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// UPDATE: recipe header + replace-all lines
app.put('/api/recipes/:id', async (req, res) => {
  const recipeId = Number(req.params.id);

  const {
    role,
    name,
    variant_label,
    notes,
    lines
  } = req.body;

  if (
    !Number.isInteger(recipeId) ||
    !name ||
    !role ||
    !Array.isArray(lines) ||
    lines.length === 0
  ) {
    return res.status(400).json({ error: 'Некорректные данные запроса' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const updateResult = await client.query(
      `
      UPDATE tape_recipes
      SET
        role = $2,
        name = $3,
        variant_label = $4,
        notes = $5
      WHERE tape_recipe_id = $1
      `,
      [
        recipeId,
        role,
        name,
        variant_label || null,
        notes || null
      ]
    );

    if (updateResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Рецепт не найден' });
    }

    // remove old lines
    await client.query(
      `
      DELETE FROM tape_recipe_lines
      WHERE tape_recipe_id = $1
      `,
      [recipeId]
    );

    // insert new lines
    for (const line of lines) {
      const {
        material_id,
        recipe_role,
        include_in_pct,
        slurry_percent,
        line_notes
      } = line;

      const matId = Number(material_id);

      const includeInPct =
        include_in_pct === false || include_in_pct === 'false'
          ? false
          : true;

      const pct =
        slurry_percent === '' || slurry_percent === null || slurry_percent === undefined
          ? null
          : Number(slurry_percent);

      // If excluded, percent must be NULL to satisfy the CHECK constraint
      const pctFinal = includeInPct ? pct : null;

      if (
        !Number.isInteger(matId) ||
        !recipe_role ||
        (includeInPct && (pctFinal === null || !Number.isFinite(pctFinal) || pctFinal < 0 || pctFinal > 100)) ||
        (!includeInPct && pctFinal !== null)
      ) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Некорректные данные строки рецепта' });
      }

      await client.query(
        `
        INSERT INTO tape_recipe_lines (
          tape_recipe_id,
          material_id,
          recipe_role,
          include_in_pct,
          slurry_percent,
          line_notes
        )
        VALUES ($1,$2,$3,$4,$5,$6)
        `,
        [
          recipeId,
          matId,
          recipe_role,
          includeInPct,
          pctFinal,
          line_notes ?? null
        ]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});

// DELETE recipe (header + cascade lines)
app.delete('/api/recipes/:id', async (req, res) => {
  const recipeId = Number(req.params.id);

  if (!Number.isInteger(recipeId)) {
    return res.status(400).json({ error: 'Некорректный tape_recipe_id' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM tape_recipes WHERE tape_recipe_id = $1',
      [recipeId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Рецепт не найден' });
    }

    // lines are deleted automatically (ON DELETE CASCADE)
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


// -- RECIPE LINE ACTUALS --
// CREATE
app.post('/api/tapes/:id/actuals', async (req, res) => {
  const tapeId = Number(req.params.id);

  if (!Number.isInteger(tapeId)) {
    return res.status(400).json({ error: 'Некорректный tape_id' });
  }

  const {
    recipe_line_id,
    material_instance_id,
    measure_mode,
    actual_mass_g,
    actual_volume_ml
  } = req.body;

  try {
    const result = await pool.query(
      `
      INSERT INTO tape_recipe_line_actuals (
        tape_id,
        recipe_line_id,
        material_instance_id,
        measure_mode,
        actual_mass_g,
        actual_volume_ml
      )
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (tape_id, recipe_line_id)
      DO UPDATE SET
        material_instance_id = EXCLUDED.material_instance_id,
        measure_mode = EXCLUDED.measure_mode,
        actual_mass_g = EXCLUDED.actual_mass_g,
        actual_volume_ml = EXCLUDED.actual_volume_ml,
        recorded_at = now()
      RETURNING *
      `,
      [
        tapeId,
        recipe_line_id,
        material_instance_id,
        measure_mode,
        actual_mass_g,
        actual_volume_ml
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения фактических данных' });
  }
});

// READ
app.get('/api/tapes/:id/actuals', async (req, res) => {
  const tapeId = Number(req.params.id);

  if (!Number.isInteger(tapeId)) {
    return res.status(400).json({ error: 'Некорректный tape_id' });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        a.actual_id,
        a.tape_id,
        a.recipe_line_id,
        a.material_instance_id,
        a.measure_mode,
        a.actual_mass_g,
        a.actual_volume_ml,
        a.recorded_at
      FROM tape_recipe_line_actuals a
      WHERE a.tape_id = $1
      ORDER BY a.recipe_line_id
      `,
      [tapeId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки фактических данных' });
  }
});



// ---------- ELECTROLYTES ----------

// CREATE electrolyte
// POST /api/electrolytes
app.post('/api/electrolytes', async (req, res) => {
  const {
    name,
    electrolyte_type,
    solvent_system,
    salts,
    concentration,
    additives,
    notes,
    status = 'active',
    created_by
  } = req.body;

  if (!name || !electrolyte_type || !created_by) {
    return res.status(400).json({ error: 'Обязательные поля отсутствуют' });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO electrolytes (
        name,
        electrolyte_type,
        solvent_system,
        salts,
        concentration,
        additives,
        notes,
        status,
        created_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
      `,
      [
        name,
        electrolyte_type,
        solvent_system || null,
        salts || null,
        concentration || null,
        additives || null,
        notes || null,
        status,
        created_by
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при создании электролита' });
  }
});

// READ all electrolytes (global list)
// GET /api/electrolytes
app.get('/api/electrolytes', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        e.electrolyte_id,
        e.name,
        e.electrolyte_type,
        e.created_by,
        u.name AS created_by_name,
        e.created_at,
        e.status,
        e.solvent_system,
        e.salts,
        e.concentration,
        e.additives,
        e.notes
      FROM electrolytes e
      JOIN users u ON u.user_id = e.created_by
      ORDER BY e.name ASC;
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при получении электролитов' });
  }
});

// UPDATE electrolyte
// PUT /api/electrolytes/:id
app.put('/api/electrolytes/:id', async (req, res) => {
  const electrolyteId = Number(req.params.id);

  if (!Number.isInteger(electrolyteId)) {
    return res.status(400).json({ error: 'Некорректный electrolyte_id' });
  }

  const {
    name,
    electrolyte_type,
    solvent_system,
    salts,
    concentration,
    additives,
    notes,
    status
  } = req.body;

  try {
    const result = await pool.query(
      `
      UPDATE electrolytes
      SET
        name = $1,
        electrolyte_type = $2,
        solvent_system = $3,
        salts = $4,
        concentration = $5,
        additives = $6,
        notes = $7,
        status = $8
      WHERE electrolyte_id = $9
      RETURNING *
      `,
      [
        name,
        electrolyte_type,
        solvent_system || null,
        salts || null,
        concentration || null,
        additives || null,
        notes || null,
        status || 'active',
        electrolyteId
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при обновлении электролита' });
  }
});

// DELETE electrolyte
// DELETE /api/electrolytes/:id
app.delete('/api/electrolytes/:id', async (req, res) => {
  const electrolyteId = Number(req.params.id);

  if (!Number.isInteger(electrolyteId)) {
    return res.status(400).json({ error: 'Некорректный electrolyte_id' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM electrolytes WHERE electrolyte_id = $1',
      [electrolyteId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Электролит не найден' });
    }

    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка удаления электролита' });
  }
});



// -------- TAPES --------

// CREATE tape
app.post('/api/tapes', async (req, res) => {
  const {
    name,
    project_id,
    tape_recipe_id,
    created_by,
    notes,
    calc_mode,
    target_mass_g
  } = req.body;

  const projectId = Number(project_id);
  const recipeId  = Number(tape_recipe_id);
  const createdBy = Number(created_by);

  if (
    !Number.isInteger(projectId) ||
    !Number.isInteger(recipeId) ||
    !Number.isInteger(createdBy)
  ) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO tapes (
        name,
        project_id,
        tape_recipe_id,
        created_by,
        notes,
        calc_mode,
        target_mass_g
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
      `,
      [
        name,
        projectId,
        recipeId,
        createdBy,
        notes || null,
        calc_mode || null,
        target_mass_g || null
      ]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// READ
app.get('/api/tapes', async (req, res) => {
  const { role } = req.query;

  try {
    const result = role
      ? await pool.query(
          `
          SELECT
            t.tape_id,
            t.name,
            t.project_id,
            t.tape_recipe_id,
            t.created_by,
            t.created_at,
            t.status,
            t.notes,
            t.calc_mode,
            t.target_mass_g,
            r.role,
            r.name AS recipe_name
          FROM tapes t
          JOIN tape_recipes r
            ON r.tape_recipe_id = t.tape_recipe_id
          WHERE r.role = $1
          ORDER BY t.created_at DESC
          `,
          [role]
        )
      : await pool.query(
          `
          SELECT
            t.tape_id,
            t.name,
            t.project_id,
            t.tape_recipe_id,
            t.created_by,
            t.created_at,
            t.status,
            t.notes,
            t.calc_mode,
            t.target_mass_g,
            r.role,
            r.name AS recipe_name
          FROM tapes t
          JOIN tape_recipes r
            ON r.tape_recipe_id = t.tape_recipe_id
          ORDER BY t.created_at DESC
          `
        );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// EDIT
app.put('/api/tapes/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  const {
    name,
    project_id,
    tape_recipe_id,
    created_by,
    notes,
    calc_mode,
    target_mass_g
  } = req.body;

  const projectId = Number(project_id);
  const recipeId  = Number(tape_recipe_id);
  const createdBy = Number(created_by);

  if (
    !Number.isInteger(projectId) ||
    !Number.isInteger(recipeId) ||
    !Number.isInteger(createdBy)
  ) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    const result = await pool.query(
      `
      UPDATE tapes
      SET
        name = $1,
        project_id = $2,
        tape_recipe_id = $3,
        created_by = $4,
        notes = $5,
        calc_mode = $6,
        target_mass_g = $7
      WHERE tape_id = $8
      RETURNING *
      `,
      [
        name,
        projectId,
        recipeId,
        createdBy,
        notes || null,
        calc_mode || null,
        target_mass_g || null,
        id
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления' });
  }
});

// DELETE
app.delete('/api/tapes/:id', async (req, res) => {
  const id = Number(req.params.id);

  try {
    await pool.query(
      `DELETE FROM tapes WHERE tape_id = $1`,
      [id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});



// --------- GENERAL/GENERIC STEP READING (for any operation type) --------

/*
operation_types

operation_type_id |        code         |        display        | ui_order 
-------------------+---------------------+-----------------------+----------
                1 | drying_am           | Drying AM             |        0
                2 | weighing            | Weighing              |        1
                3 | mixing              | Mixing                |        2
                4 | coating             | Coating               |        3
                5 | drying_tape         | Drying (tape)         |        4
                6 | calendering         | Calendering           |        5
                7 | drying_pressed_tape | Drying (pressed tape) |        6
*/

// WRITE (dispatcher): POST /api/tapes/:id/steps/by-code/:code
app.post('/api/tapes/:id/steps/by-code/:code', async (req, res) => {
  const tapeId = Number(req.params.id);
  const code = String(req.params.code || '').trim();

  if (!Number.isInteger(tapeId) || !code) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  // DRYING codes -> forward to existing drying save logic by duplicating the same SQL here
  if (code === 'drying_am' || code === 'drying_tape' || code === 'drying_pressed_tape') {
    const {
      performed_by,
      started_at,
      comments,
      temperature_c,
      atmosphere,
      target_duration_min,
      other_parameters
    } = req.body || {};

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1) lookup operation_type_id by code
      const ot = await client.query(
        `SELECT operation_type_id FROM operation_types WHERE code = $1`,
        [code]
      );
      if (ot.rows.length === 0) {
        throw new Error(`Unknown operation code: ${code}`);
      }
      const operationTypeId = ot.rows[0].operation_type_id;

      // 2) upsert base step (unique: tape_id + operation_type_id)
      const step = await client.query(
        `
        INSERT INTO tape_process_steps (tape_id, operation_type_id, performed_by, started_at, comments)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (tape_id, operation_type_id)
        DO UPDATE SET
          performed_by = EXCLUDED.performed_by,
          started_at   = EXCLUDED.started_at,
          comments     = EXCLUDED.comments
        RETURNING step_id
        `,
        [
          tapeId,
          operationTypeId,
          Number(performed_by) || null,
          started_at || null,
          comments || null
        ]
      );

      const stepId = step.rows[0].step_id;

      // 3) upsert drying subtype
      await client.query(
        `
        INSERT INTO tape_step_drying
          (step_id, temperature_c, atmosphere, target_duration_min, other_parameters)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (step_id)
        DO UPDATE SET
          temperature_c = EXCLUDED.temperature_c,
          atmosphere = EXCLUDED.atmosphere,
          target_duration_min = EXCLUDED.target_duration_min,
          other_parameters = EXCLUDED.other_parameters
        `,
        [
          stepId,
          Number.isFinite(Number(temperature_c)) ? Number(temperature_c) : null,
          atmosphere || null,
          Number.isFinite(Number(target_duration_min)) ? Number(target_duration_min) : null,
          other_parameters || null
        ]
      );

      await client.query('COMMIT');
      return res.status(201).json({ step_id: stepId });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(err);
      return res.status(500).json({ error: 'Failed to save drying step' });
    } finally {
      client.release();
    }
  }

  // WEIGHING (header only, no subtype table)
  if (code === 'weighing') {
    const {
      performed_by,
      started_at,
      comments
    } = req.body || {};

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const ot = await client.query(
        `SELECT operation_type_id FROM operation_types WHERE code = $1`,
        [code]
      );

      if (ot.rows.length === 0) {
        throw new Error(`Unknown operation code: ${code}`);
      }

      const operationTypeId = ot.rows[0].operation_type_id;

      const step = await client.query(
        `
        INSERT INTO tape_process_steps
          (tape_id, operation_type_id, performed_by, started_at, comments)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (tape_id, operation_type_id)
        DO UPDATE SET
          performed_by = EXCLUDED.performed_by,
          started_at   = EXCLUDED.started_at,
          comments     = EXCLUDED.comments
        RETURNING step_id
        `,
        [
          tapeId,
          operationTypeId,
          Number(performed_by) || null,
          started_at || null,
          comments || null
        ]
      );

      await client.query('COMMIT');
      return res.status(201).json({ step_id: step.rows[0].step_id });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error(err);
      return res.status(500).json({ error: 'Failed to save weighing step' });
    } finally {
      client.release();
    }
  }

  // MIXING (header + tape_step_mixing)
  if (code === 'mixing') {
    const {
      performed_by,
      started_at,
      comments,
      slurry_volume_ml,
      dry_mixing_id,
      dry_start_time,
      dry_duration_min,
      dry_rpm,
      wet_mixing_id,
      wet_start_time,
      wet_duration_min,
      wet_rpm,
      viscosity_cP
    } = req.body || {};

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1) lookup operation_type_id by code
      const ot = await client.query(
        `SELECT operation_type_id FROM operation_types WHERE code = $1`,
        [code]
      );
      if (ot.rows.length === 0) {
        throw new Error(`Unknown operation code: ${code}`);
      }
      const operationTypeId = ot.rows[0].operation_type_id;

      // 2) upsert base step
      const step = await client.query(
        `
        INSERT INTO tape_process_steps (tape_id, operation_type_id, performed_by, started_at, comments)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (tape_id, operation_type_id)
        DO UPDATE SET
          performed_by = EXCLUDED.performed_by,
          started_at   = EXCLUDED.started_at,
          comments     = EXCLUDED.comments
        RETURNING step_id
        `,
        [
          tapeId,
          operationTypeId,
          Number(performed_by) || null,
          started_at || null,
          comments || null
        ]
      );

      const stepId = step.rows[0].step_id;

      // 3) upsert mixing subtype
      await client.query(
        `
        INSERT INTO tape_step_mixing
          (step_id, slurry_volume_ml,
          dry_mixing_id, dry_start_time, dry_duration_min, dry_rpm,
          wet_mixing_id, wet_start_time, wet_duration_min, wet_rpm,
          viscosity_cP)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (step_id)
        DO UPDATE SET
          slurry_volume_ml  = EXCLUDED.slurry_volume_ml,
          dry_mixing_id     = EXCLUDED.dry_mixing_id,
          dry_start_time    = EXCLUDED.dry_start_time,
          dry_duration_min  = EXCLUDED.dry_duration_min,
          dry_rpm           = EXCLUDED.dry_rpm,
          wet_mixing_id     = EXCLUDED.wet_mixing_id,
          wet_start_time    = EXCLUDED.wet_start_time,
          wet_duration_min  = EXCLUDED.wet_duration_min,
          wet_rpm           = EXCLUDED.wet_rpm,
          viscosity_cP      = EXCLUDED.viscosity_cP
        `,
        [
          stepId,
          Number.isFinite(Number(slurry_volume_ml)) ? Number(slurry_volume_ml) : null,

          Number(dry_mixing_id) || null,
          dry_start_time || null,
          Number.isFinite(Number(dry_duration_min)) ? Number(dry_duration_min) : null,
          dry_rpm || null,

          Number(wet_mixing_id) || null,
          wet_start_time || null,
          Number.isFinite(Number(wet_duration_min)) ? Number(wet_duration_min) : null,
          wet_rpm || null,

          Number.isFinite(Number(viscosity_cP)) ? Number(viscosity_cP) : null
        ]
      );

      await client.query('COMMIT');
      return res.status(201).json({ step_id: stepId });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error(err);
      return res.status(500).json({ error: 'Failed to save mixing step' });
    } finally {
      client.release();
    }
  }

  // COATING (header + tape_step_coating)
  if (code === 'coating') {
    const {
      performed_by,
      started_at,
      comments,
      foil_id,
      coating_id
    } = req.body || {};

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1) lookup operation_type_id
      const ot = await client.query(
        `SELECT operation_type_id FROM operation_types WHERE code = $1`,
        [code]
      );

      if (ot.rows.length === 0) {
        throw new Error(`Unknown operation code: ${code}`);
      }

      const operationTypeId = ot.rows[0].operation_type_id;

      // 2) upsert base step
      const step = await client.query(
        `
        INSERT INTO tape_process_steps
          (tape_id, operation_type_id, performed_by, started_at, comments)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (tape_id, operation_type_id)
        DO UPDATE SET
          performed_by = EXCLUDED.performed_by,
          started_at   = EXCLUDED.started_at,
          comments     = EXCLUDED.comments
        RETURNING step_id
        `,
        [
          tapeId,
          operationTypeId,
          Number(performed_by) || null,
          started_at || null,
          comments || null
        ]
      );

      const stepId = step.rows[0].step_id;

      // 3) upsert coating subtype
      await client.query(
        `
        INSERT INTO tape_step_coating
          (step_id, foil_id, coating_id)
        VALUES ($1,$2,$3)
        ON CONFLICT (step_id)
        DO UPDATE SET
          foil_id = EXCLUDED.foil_id,
          coating_id = EXCLUDED.coating_id
        `,
        [
          stepId,
          Number(foil_id) || null,
          Number(coating_id) || null
        ]
      );

      await client.query('COMMIT');
      return res.status(201).json({ step_id: stepId });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error(err);
      return res.status(500).json({ error: 'Failed to save coating step' });
    } finally {
      client.release();
    }
  }

  // CALENDERING (header + tape_step_calendering)
  if (code === 'calendering') {
    const {
      performed_by,
      started_at,
      comments,
      temp_c,
      pressure_value,
      pressure_units,
      draw_speed_m_min,
      other_params,
      init_thickness_microns,
      final_thickness_microns,
      no_passes,
      appearance
    } = req.body || {};

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1) lookup operation_type_id
      const ot = await client.query(
        `SELECT operation_type_id FROM operation_types WHERE code = $1`,
        [code]
      );

      if (ot.rows.length === 0) {
        throw new Error(`Unknown operation code: ${code}`);
      }

      const operationTypeId = ot.rows[0].operation_type_id;

      // 2) upsert base step
      const step = await client.query(
        `
        INSERT INTO tape_process_steps
          (tape_id, operation_type_id, performed_by, started_at, comments)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (tape_id, operation_type_id)
        DO UPDATE SET
          performed_by = EXCLUDED.performed_by,
          started_at   = EXCLUDED.started_at,
          comments     = EXCLUDED.comments
        RETURNING step_id
        `,
        [
          tapeId,
          operationTypeId,
          Number(performed_by) || null,
          started_at || null,
          comments || null
        ]
      );

      const stepId = step.rows[0].step_id;

      // 3) upsert calendering subtype
      await client.query(
        `
        INSERT INTO tape_step_calendering (
          step_id,
          temp_c,
          pressure_value,
          pressure_units,
          draw_speed_m_min,
          other_params,
          init_thickness_microns,
          final_thickness_microns,
          no_passes,
          appearance
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (step_id)
        DO UPDATE SET
          temp_c = EXCLUDED.temp_c,
          pressure_value = EXCLUDED.pressure_value,
          pressure_units = EXCLUDED.pressure_units,
          draw_speed_m_min = EXCLUDED.draw_speed_m_min,
          other_params = EXCLUDED.other_params,
          init_thickness_microns = EXCLUDED.init_thickness_microns,
          final_thickness_microns = EXCLUDED.final_thickness_microns,
          no_passes = EXCLUDED.no_passes,
          appearance = EXCLUDED.appearance
        `,
        [
          stepId,
          Number.isFinite(Number(temp_c)) ? Number(temp_c) : null,
          Number.isFinite(Number(pressure_value)) ? Number(pressure_value) : null,
          pressure_units || null,
          Number.isFinite(Number(draw_speed_m_min)) ? Number(draw_speed_m_min) : null,
          other_params || null,
          Number.isFinite(Number(init_thickness_microns)) ? Number(init_thickness_microns) : null,
          Number.isFinite(Number(final_thickness_microns)) ? Number(final_thickness_microns) : null,
          Number.isFinite(Number(no_passes)) ? Number(no_passes) : null,
          appearance || null
        ]
      );

      await client.query('COMMIT');
      return res.status(201).json({ step_id: stepId });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error(err);
      return res.status(500).json({ error: 'Failed to save calendering step' });
    } finally {
      client.release();
    }
  }

  return res.status(501).json({ error: `No saver implemented for code: ${code}` });
});

// READ
app.get('/api/tapes/:id/steps/by-code/:code', async (req, res) => {
  const tapeId = Number(req.params.id);
  const code = String(req.params.code || '').trim();

  if (!Number.isInteger(tapeId) || !code) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  try {
    // Determine subtype join
    let subtypeJoin = '';
    let subtypeSelect = '';

    if (
      code === 'drying_am' ||
      code === 'drying_tape' ||
      code === 'drying_pressed_tape'
    ) {
      subtypeJoin = `
        LEFT JOIN tape_step_drying d
          ON d.step_id = s.step_id
      `;
      subtypeSelect = `
        d.temperature_c,
        d.atmosphere,
        d.target_duration_min,
        d.other_parameters
      `;
    }

    if (code === 'mixing') {
      subtypeJoin = `
        LEFT JOIN tape_step_mixing m
          ON m.step_id = s.step_id
      `;
      subtypeSelect = `
        m.slurry_volume_ml,
        m.dry_mixing_id,
        m.dry_start_time,
        m.dry_duration_min,
        m.dry_rpm,
        m.wet_mixing_id,
        m.wet_start_time,
        m.wet_duration_min,
        m.wet_rpm,
        m.viscosity_cP
      `;
    }

    if (code === 'coating') {
      subtypeJoin = `
        LEFT JOIN tape_step_coating c
          ON c.step_id = s.step_id
      `;
      subtypeSelect = `
        c.foil_id,
        c.coating_id
      `;
    }

    if (code === 'calendering') {
      subtypeJoin = `
        LEFT JOIN tape_step_calendering cal
          ON cal.step_id = s.step_id
      `;
      subtypeSelect = `
        cal.temp_c,
        cal.pressure_value,
        cal.pressure_units,
        cal.draw_speed_m_min,
        cal.other_params,
        cal.init_thickness_microns,
        cal.final_thickness_microns,
        cal.no_passes,
        cal.appearance
      `;
    }

    const result = await pool.query(
      `
      SELECT
        s.step_id,
        s.tape_id,
        s.operation_type_id,
        s.performed_by,
        s.started_at,
        s.comments
        ${subtypeSelect ? ',' + subtypeSelect : ''}
      FROM tape_process_steps s
      JOIN operation_types ot
        ON ot.operation_type_id = s.operation_type_id
      ${subtypeJoin}
      WHERE s.tape_id = $1
        AND ot.code = $2
      `,
      [tapeId, code]
    );

    res.json(result.rows[0] || null);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load step' });
  }
});

// UPDATE

// DELETE 


// -------- TAPE PROCESS STEPS (DRYING) --------

/*
tape_step_drying
step_id
temperature_c
atmosphere
target_duration_min
other_parameters
*/

// CREATE
// POST /api/tapes/:tapeId/steps/drying (body includes operation_code)

// READ
/*
GET /api/tapes/:tapeId/steps/drying?operation_code=drying_am
GET /api/tapes/:tapeId/steps/drying?operation_code=drying_tape
GET /api/tapes/:tapeId/steps/drying?operation_code=drying_pressed_tape

This must be kept for drying because it joins tape_step_drying and returns temperature_c, atmosphere, target_duration_min. The generic read-by-code route does not return those fields.
*/

// UPDATE (important - user may want to update start time if they start the drying process again)
// With time, logging-like approach may be more appropriate, but not for version 1.

// DELETE (cascade when the tape is deleted)


// -------- DRYING ATMOSPHERES (REFERENCE) --------

/*
drying_atmospheres

drying_atmosphere_id |   code   |    display    | ui_order | is_active 
----------------------+----------+---------------+----------+-----------
                    1 | air      | Воздух        |        0 | t
                    2 | vacuum   | Вакуум        |        1 | t
                    3 | n2       | Азот (N₂)     |        2 | t
                    4 | ar       | Аргон (Ar)    |        3 | t
                    5 | dry_room | Сухая комната |        4 | t
*/

// READ
app.get('/api/drying-atmospheres', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT drying_atmosphere_id, code, display, ui_order
      FROM drying_atmospheres
      WHERE is_active = true
      ORDER BY ui_order ASC, display ASC
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки атмосфер' });
  }
});

// -------- TAPE PROCESS STEPS (WEIGHING) --------
/* This gets triggered via the tape_recipe_line_actuals routes */


// -------- TAPE PROCESS STEPS (MIXING) --------

/*
tape_step_mixing
step_id
slurry_volume_ml
dry_mixing_id
dry_start_time
dry_duration_min
dry_rpm
wet_mixing_id
wet_start_time
wet_duration_min
wet_rpm
viscosity_cP
*/

// CREATE
// POST /api/tapes/:id/steps/mixing

// READ
// GET /api/tapes/:id/steps/mixing

// UPDATE (user may add values gradually as they run the process and collect data - start time, duration, rpm, etc.)
// DELETE (cascade when the tape is deleted)


// -------- MIXING METHODS (REFERENCE) --------

/*
dry_mixing_methods
dry_mixing_id |     name      |         description         
--------------+---------------+-----------------------------
            1 | none          | Сухую смесь не перемешивали
            2 | mortar_pestle | Вручную: ступка и пестик
            3 | spatula       | Вручную: шпателем
            4 | turbula       | Турбула / смеситель Шатца
*/

// READ: dry mixing methods
app.get('/api/dry-mixing-methods', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT dry_mixing_id, name, description
      FROM dry_mixing_methods
      ORDER BY dry_mixing_id ASC
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки dry mixing методов' });
  }
});

/*
wet_mixing_methods
wet_mixing_id |   name   |       description        
---------------+----------+--------------------------
            1 | by_hand  | Вручную
            2 | mag_stir | Магнитная мешалка
            3 | gn_vm_7  | Вакуумный миксер GN-VM-7
*/

// READ: wet mixing methods
app.get('/api/wet-mixing-methods', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT wet_mixing_id, name, description
      FROM wet_mixing_methods
      ORDER BY wet_mixing_id ASC
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки wet mixing методов' });
  }
});




// -------- TAPE PROCESS STEPS (COATING) --------

/*
tape_step_coating
step_id
foil_id
coating_id
*/

// CREATE
// POST /api/tapes/:id/steps/coating
// (later; upsert/join tape_step_coating)

// READ
// GET /api/tapes/:id/steps/coating
// (later; upsert/join tape_step_coating)


// Update can probably be skipped here - once coated, that's done. Correct me if I am wrong.
// DELETE (cascade when the tape is deleted)



// -------- COATING METHODS (REFERENCE) --------

/*
coating_methods

coating_id|      name      | gap_um | coat_temp_c | coat_time_min |            comments            
----------+----------------+--------+-------------+---------------+--------------------------------
        1 | dr_blade       |        |             |               | Ракель / Dr. Blade (GN-VC-15H)
        2 | coater_machine |        |             |               | Машина для намазки
*/

// READ
app.get('/api/coating-methods', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT coating_id, name, gap_um, coat_temp_c, coat_time_min, comments
      FROM coating_methods
      ORDER BY coating_id ASC
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки методов намазки' });
  }
});

// -------- FOILS (REFERENCE) --------

// READ
app.get('/api/foils', async (req, res) => {
  try {

    const { rows } = await pool.query(`
      SELECT foil_id, type
      FROM foils
      ORDER BY type
    `);

    res.json(rows);

  } catch (err) {
    console.error('Error loading foils:', err);
    res.status(500).json({ error: 'Failed to load foils' });
  }
});


// -------- TAPE PROCESS STEPS (CALENDERING) --------

/* tape_step_calendering
step_id
temp_c
pressure_value
pressure_units
draw_speed_m_min
other_params
init_thickness_microns
final_thickness_microns
no_passes
appearance
*/

// CREATE
// POST /api/tapes/:id/steps/calendering
// (later; upsert/join tape_step_calendering)

// READ
// GET /api/tapes/:id/steps/calendering
// (later; upsert/join tape_step_calendering)

// UPDATE (user may add values gradually as they run the process and collect data) 
// DELETE (cascade when the tape is deleted)





// -------- ELECTRODE CUT BATCHES --------

// CREATE cut batch
app.post('/api/electrode-cut-batches', async (req, res) => {
  const { tape_id, created_by, comments } = req.body;

  if (!Number.isInteger(tape_id) || !Number.isInteger(created_by)) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO electrode_cut_batches (tape_id, created_by, comments)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [tape_id, created_by, comments || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});



// -------- FOIL MASS MEASUREMENTS --------

// ADD measurement
app.post('/api/electrode-cut-batches/:id/foil-measurements', async (req, res) => {
  const cutBatchId = Number(req.params.id);
  const { mass_g } = req.body;

  if (!Number.isInteger(cutBatchId) || !mass_g || Number(mass_g) <= 0) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO foil_mass_measurements (cut_batch_id, mass_g)
      VALUES ($1, $2)
      RETURNING *
      `,
      [cutBatchId, mass_g]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET measurements
app.get('/api/electrode-cut-batches/:id/foil-measurements', async (req, res) => {
  const cutBatchId = Number(req.params.id);

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    const result = await pool.query(
      `
      SELECT *
      FROM foil_mass_measurements
      WHERE cut_batch_id = $1
      ORDER BY foil_measurement_id
      `,
      [cutBatchId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});



// -------- ELECTRODES --------

// CREATE electrode
app.post('/api/electrodes', async (req, res) => {
  const {
    cut_batch_id,
    shape,
    diameter_mm,
    length_mm,
    width_mm,
    total_mass_g,
    cup_number,
    comments
  } = req.body;

  if (!Number.isInteger(cut_batch_id) || !shape || !total_mass_g) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO electrodes (
        cut_batch_id,
        shape,
        diameter_mm,
        length_mm,
        width_mm,
        total_mass_g,
        cup_number,
        comments
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
      `,
      [
        cut_batch_id,
        shape,
        diameter_mm || null,
        length_mm || null,
        width_mm || null,
        total_mass_g,
        cup_number || null,
        comments || null
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET electrodes by batch
app.get('/api/electrode-cut-batches/:id/electrodes', async (req, res) => {
  const cutBatchId = Number(req.params.id);

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    const result = await pool.query(
      `
      SELECT *
      FROM electrodes
      WHERE cut_batch_id = $1
      ORDER BY electrode_id
      `,
      [cutBatchId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// UPDATE electrode status
app.put('/api/electrodes/:id/status', async (req, res) => {
  const electrodeId = Number(req.params.id);
  const { status, used_in_battery_id, scrapped_reason } = req.body;

  if (!Number.isInteger(electrodeId) || !status) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    const result = await pool.query(
      `
      UPDATE electrodes
      SET status = $1,
          used_in_battery_id = $2,
          scrapped_reason = $3
      WHERE electrode_id = $4
      RETURNING *
      `,
      [
        status,
        used_in_battery_id || null,
        scrapped_reason || null,
        electrodeId
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Электрод не найден' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});



// -------- ELECTRODE DRYING --------

// CREATE drying record
app.post('/api/electrode-cut-batches/:id/drying', async (req, res) => {
  const cutBatchId = Number(req.params.id);
  const { temperature_c, comments } = req.body;

  if (!Number.isInteger(cutBatchId) || !temperature_c) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO electrode_drying (cut_batch_id, temperature_c, comments)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [cutBatchId, temperature_c, comments || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET drying records by batch
app.get('/api/electrode-cut-batches/:id/drying', async (req, res) => {
  const cutBatchId = Number(req.params.id);

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    const result = await pool.query(
      `
      SELECT *
      FROM electrode_drying
      WHERE cut_batch_id = $1
      ORDER BY drying_id
      `,
      [cutBatchId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});






// Start server
app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});