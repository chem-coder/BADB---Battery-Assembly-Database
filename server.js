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

// Routes
app.post('/api/users', async (req, res) => {
  const { user_name } = req.body;

  if (!user_name) {
    return res.status(400).json({ error: 'Имя пользователя обязательно'});
  }

  try {
    const result = await pool.query(
      'INSERT INTO users (user_name) VALUES ($1) RETURNING *',
      [user_name]
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

app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT user_id, user_name, active FROM users ORDER BY user_name');

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера'});
  }
});
// app.put('/api/users/:id', ...);

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

// Start server
app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
