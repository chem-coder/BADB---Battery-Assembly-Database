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
  try {
    let {
      name,
      supplier,
      brand,
      default_role,
      exclude_from_composition,
      comments,
      created_by
    } = req.body;

    const result = await pool.query(
      `
      INSERT INTO materials (
        name,
        supplier,
        brand,
        default_role,
        exclude_from_composition,
        comments,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
      `,
      [
        name,
        supplier || null,
        brand || null,
        default_role,
        exclude_from_composition ?? false,
        comments || null,
        created_by
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);

    // unique constraint violation (name, supplier, brand)
    if (err.code === '23505') {
      return res.status(400).json({
        error: 'Материал с таким названием, поставщиком и брендом уже существует'
      });
    }

    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// READ
app.get('/api/materials', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        material_id,
        name,
        supplier,
        brand,
        default_role,
        exclude_from_composition,
        comments,
        created_by,
        created_at
      FROM materials
      ORDER BY name;
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// UPDATE
app.put('/api/materials/:id', async (req, res) => {
  const { id } = req.params;
  const {
    name,
    supplier,
    brand,
    default_role,
    exclude_from_composition,
    comments,
    created_by
  } = req.body;

  // 1. validate name
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Название обязательно' });
  }

  // 2. validate created_by
  if (!created_by) {
    return res.status(400).json({ error: 'Обязательные поля отсутствуют' });
  }

  const createdBy = Number(created_by);

  if (!Number.isInteger(createdBy)) {
    return res.status(400).json({ error: 'Некорректные идентификаторы' });
  }

  try {
    const result = await pool.query(
      `
      UPDATE materials
      SET
        name = $1,
        supplier = $2,
        brand = $3,
        default_role = $4,
        exclude_from_composition = $5,
        comments = $6,
        created_by = $7
      WHERE material_id = $8
      RETURNING *;
      `,
      [
        name.trim(),
        supplier || null,
        brand || null,
        default_role,
        exclude_from_composition ?? false,
        comments || null,
        created_by,
        id
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Материал не найден' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);

    if (err.code === '23505') {
      return res.status(400).json({
        error: 'Материал с такими параметрами уже существует'
      });
    }

    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


// DELETE
app.delete('/api/materials/:id', async (req, res) => {
  const { id } = req.params;

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
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


// -------- MATERIAL BATCHES --------

// CREATE batch for material
app.post('/api/materials/:id/batches', async (req, res) => {
  const materialId = Number(req.params.id);

  if (!Number.isInteger(materialId)) {
    return res.status(400).json({ error: 'Некорректный material_id' });
  }

  const {
    batch_code,
    supplier_lot,
    received_at,
    status = 'available',
    depleted_at,
    passport_file,
    comments,
    created_by
  } = req.body;

  // ---- validation ----
  if (!batch_code || !batch_code.trim()) {
    return res.status(400).json({ error: 'Код партии обязателен' });
  }

  const createdBy = created_by ? Number(created_by) : null;
  if (created_by && !Number.isInteger(createdBy)) {
    return res.status(400).json({ error: 'Некорректный created_by' });
  }

  // enforce status ↔ depleted_at rule
  const cleanDepletedAt =
    status === 'available' ? null : (depleted_at || new Date());

  try {
    const result = await pool.query(
      `
      INSERT INTO material_batches (
        material_id,
        batch_code,
        supplier_lot,
        received_at,
        status,
        depleted_at,
        passport_file,
        comments,
        created_by
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9
      )
      RETURNING *;
      `,
      [
        materialId,
        batch_code.trim(),
        supplier_lot || null,
        received_at || null,
        status,
        cleanDepletedAt,
        passport_file || null,
        comments || null,
        createdBy
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    // unique (material_id, batch_code)
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'Партия с таким кодом уже существует для этого материала'
      });
    }

    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// READ (batches for a material)
app.get('/api/materials/:id/batches', async (req, res) => {
  const materialId = Number(req.params.id);

  if (!Number.isInteger(materialId)) {
    return res.status(400).json({ error: 'Некорректный material_id' });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        material_batch_id,
        material_id,
        batch_code,
        supplier_lot,
        received_at,
        status,
        depleted_at,
        passport_file,
        comments,
        created_by,
        created_at,
        edited_by,
        edited_at
      FROM material_batches
      WHERE material_id = $1
      ORDER BY created_at DESC, material_batch_id DESC;
      `,
      [materialId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// UPDATE batch status
app.put('/api/material-batches/:id/status', async (req, res) => {
  const batchId = Number(req.params.id);
  const { status } = req.body;

  if (!Number.isInteger(batchId)) {
    return res.status(400).json({ error: 'Некорректный batch_id' });
  }

  if (!['available', 'depleted', 'scrap'].includes(status)) {
    return res.status(400).json({ error: 'Некорректный статус' });
  }

  const depletedAt = status === 'available' ? null : new Date();

  try {
    const result = await pool.query(
      `
      UPDATE material_batches
      SET
        status = $1,
        depleted_at = $2
      WHERE material_batch_id = $3
      RETURNING *;
      `,
      [status, depletedAt, batchId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Партия не найдена' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE batch
app.delete('/api/material-batches/:id', async (req, res) => {
  const batchId = Number(req.params.id);

  if (!Number.isInteger(batchId)) {
    return res.status(400).json({ error: 'Некорректный batch_id' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM material_batches WHERE material_batch_id = $1',
      [batchId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Партия не найдена' });
    }

    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


// -------- RECIPES --------

// CREATE: new recipe + lines
app.post('/api/recipes', async (req, res) => {
  const {
    project_id,
    role,
    name,
    variant_label,
    notes,
    created_by,
    lines
  } = req.body;

  if (
    !Number.isInteger(project_id) ||
    !Number.isInteger(created_by) ||
    !name ||
    !role ||
    !Array.isArray(lines)
  ) {
    return res.status(400).json({ error: 'Некорректные данные запроса' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const recipeResult = await client.query(
      `
      INSERT INTO tape_recipes (
        project_id, role, name, variant_label, notes, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING tape_recipe_id
      `,
      [project_id, role, name, variant_label || null, notes || null, created_by]
    );

    const recipeId = recipeResult.rows[0].tape_recipe_id;

    for (const line of lines) {
      const {
        material_id,
        recipe_role,
        measure_mode,
        target_mass_g,
        target_volume_ml,
        include_in_pct,
        line_notes
      } = line;
      
      await client.query(
        `
        INSERT INTO tape_recipe_lines (
          tape_recipe_id,
          material_id,
          recipe_role,
          measure_mode,
          target_mass_g,
          target_volume_ml,
          include_in_pct,
          line_notes
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `,
        [
          recipeId,
          material_id,
          recipe_role,
          measure_mode,
          target_mass_g ?? null,
          target_volume_ml ?? null,
          include_in_pct ?? null,
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

  if (!Number.isInteger(sourceRecipeId) || !Number.isInteger(created_by)) {
    return res.status(400).json({ error: 'Некорректные данные запроса' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // create new recipe by copying header
    const recipeResult = await client.query(
      `
      INSERT INTO tape_recipes (
        project_id,
        role,
        name,
        variant_label,
        notes,
        created_by
      )
      SELECT
        project_id,
        role,
        name || ' (copy)',
        variant_label,
        notes,
        $2
      FROM tape_recipes
      WHERE tape_recipe_id = $1
      RETURNING tape_recipe_id
      `,
      [sourceRecipeId, created_by]
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
        measure_mode,
        target_mass_g,
        target_volume_ml,
        include_in_pct,
        line_notes
      )
      SELECT
        $2,
        material_id,
        recipe_role,
        measure_mode,
        target_mass_g,
        target_volume_ml,
        include_in_pct,
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

// READ: list recipes by project_id
app.get('/api/recipes', async (req, res) => {
  const projectId = req.query.project_id
    ? Number(req.query.project_id)
    : null;

  try {
    const result = projectId
      ? await pool.query(
          `
          SELECT
            r.tape_recipe_id,
            r.project_id,
            r.role,
            r.name,
            r.variant_label,
            r.notes,
            r.created_by,
            r.created_at,
            u.name AS created_by_name
          FROM tape_recipes r
          JOIN users u ON u.user_id = r.created_by
          WHERE r.project_id = $1
          ORDER BY r.created_at DESC;
          `,
          [projectId]
        )
      : await pool.query(
          `
          SELECT
            r.tape_recipe_id,
            r.project_id,
            r.role,
            r.name,
            r.variant_label,
            r.notes,
            r.created_by,
            r.created_at,
            u.name AS created_by_name
          FROM tape_recipes r
          JOIN users u ON u.user_id = r.created_by
          ORDER BY r.created_at DESC;
          `
        );

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
        project_id,
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
        rl.measure_mode,
        rl.target_mass_g,
        rl.target_volume_ml,
        rl.include_in_pct,
        rl.line_notes
      FROM tape_recipe_lines rl
      JOIN materials m ON m.material_id = rl.material_id
      WHERE rl.tape_recipe_id = $1
      ORDER BY rl.recipe_line_id
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
    !Array.isArray(lines)
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
        measure_mode,
        target_mass_g,
        target_volume_ml,
        include_in_pct,
        line_notes
      } = line;

      await client.query(
        `
        INSERT INTO tape_recipe_lines (
          tape_recipe_id,
          material_id,
          recipe_role,
          measure_mode,
          target_mass_g,
          target_volume_ml,
          include_in_pct,
          line_notes
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `,
        [
          recipeId,
          material_id,
          recipe_role,
          measure_mode,
          target_mass_g ?? null,
          target_volume_ml ?? null,
          include_in_pct ?? null,
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


// ---------- ELECTROLYTES ----------

// CREATE electrolyte
// POST /api/electrolytes
app.post('/api/electrolytes', async (req, res) => {
  const {
    project_id,
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

  if (!project_id || !name || !electrolyte_type || !created_by) {
    return res.status(400).json({ error: 'Обязательные поля отсутствуют' });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO electrolytes (
        project_id,
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
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
      `,
      [
        project_id,
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
        e.project_id,
        p.name AS project_name,
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
      JOIN projects p ON p.project_id = e.project_id
      JOIN users u ON u.user_id = e.created_by
      ORDER BY e.created_at DESC
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


// -------- TAPES --------

app.get('/api/tapes', async (req, res) => {
  const { role } = req.query;

  try {
    const result = role
      ? await pool.query(
          `
          SELECT
            t.tape_id,
            t.project_id,
            t.prepared_at,
            t.status,
            r.role,
            r.name AS recipe_name
          FROM tapes t
          JOIN tape_recipes r
            ON r.tape_recipe_id = t.tape_recipe_id
          WHERE r.role = $1
          ORDER BY t.prepared_at DESC
          `,
          [role]
        )
      : await pool.query(
          `
          SELECT
            t.tape_id,
            t.project_id,
            t.prepared_at,
            t.status,
            r.role,
            r.name AS recipe_name
          FROM tapes t
          JOIN tape_recipes r
            ON r.tape_recipe_id = t.tape_recipe_id
          ORDER BY t.prepared_at DESC
          `
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