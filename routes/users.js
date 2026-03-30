const { Router } = require('express');
const pool = require('../db/pool');
const router = Router();


// -------- USERS --------

// CREATE
router.post('/', async (req, res) => {
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
router.get('/', async (req, res) => {
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
router.put('/:id', async (req, res) => {
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
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query('DELETE FROM users WHERE user_id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


module.exports = router;
