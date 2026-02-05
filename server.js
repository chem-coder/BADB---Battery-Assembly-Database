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




// Start server
app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});