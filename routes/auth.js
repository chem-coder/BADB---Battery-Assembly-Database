const { Router } = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const config = require('../config');
const { auth, requireRole } = require('../middleware/auth');

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { login, password } = req.body;

  if (!login || !password) {
    return res.status(400).json({ error: 'Login and password are required' });
  }

  const ip = req.ip;
  const userAgent = req.headers['user-agent'] || '';

  try {
    // Brute-force protection: count recent failed attempts
    const lockoutCheck = await pool.query(
      `SELECT COUNT(*) AS cnt FROM auth_log
       WHERE login = $1 AND event = 'login_failed'
       AND created_at > now() - interval '${config.rateLimit.lockoutWindowMinutes} minutes'`,
      [login]
    );

    if (parseInt(lockoutCheck.rows[0].cnt, 10) >= config.rateLimit.maxFailedAttempts) {
      // Log the locked-out attempt
      await pool.query(
        `INSERT INTO auth_log (login, event, ip_address, user_agent, details)
         VALUES ($1, 'login_failed', $2, $3, $4)`,
        [login, ip, userAgent, JSON.stringify({ reason: 'locked_out' })]
      );

      return res.status(429).json({
        error: 'Too many failed attempts',
        retryAfter: config.rateLimit.lockoutWindowMinutes * 60
      });
    }

    // Find user by login
    const userResult = await pool.query(
      'SELECT user_id, name, login, password_hash, role, position FROM users WHERE lower(login) = lower($1)',
      [login]
    );

    if (userResult.rowCount === 0) {
      await pool.query(
        `INSERT INTO auth_log (login, event, ip_address, user_agent, details)
         VALUES ($1, 'login_failed', $2, $3, $4)`,
        [login, ip, userAgent, JSON.stringify({ reason: 'user_not_found' })]
      );
      return res.status(401).json({ error: 'Invalid login or password' });
    }

    const user = userResult.rows[0];

    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash || '');
    if (!valid) {
      await pool.query(
        `INSERT INTO auth_log (user_id, login, event, ip_address, user_agent, details)
         VALUES ($1, $2, 'login_failed', $3, $4, $5)`,
        [user.user_id, login, ip, userAgent, JSON.stringify({ reason: 'wrong_password' })]
      );
      return res.status(401).json({ error: 'Invalid login or password' });
    }

    // Get project access list
    const projectsResult = await pool.query(
      'SELECT project_id FROM user_project_access WHERE user_id = $1',
      [user.user_id]
    );
    const projects = projectsResult.rows.map(r => r.project_id);

    // Create JWT token
    const token = jwt.sign(
      { userId: user.user_id, login: user.login, role: user.role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    // Log successful login
    await pool.query(
      `INSERT INTO auth_log (user_id, login, event, ip_address, user_agent)
       VALUES ($1, $2, 'login_success', $3, $4)`,
      [user.user_id, login, ip, userAgent]
    );

    res.json({
      token,
      user: {
        userId: user.user_id,
        name: user.name,
        login: user.login,
        role: user.role,
        position: user.position || null
      },
      projects
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/register (admin only)
router.post('/register', auth, requireRole('admin'), async (req, res) => {
  const { login, password, name, role } = req.body;

  if (!login || !password || !name) {
    return res.status(400).json({ error: 'Login, password, and name are required' });
  }

  const userRole = role || config.roles.default;
  if (!config.roles.list.includes(userRole)) {
    return res.status(400).json({ error: `Invalid role. Must be one of: ${config.roles.list.join(', ')}` });
  }

  try {
    const passwordHash = await bcrypt.hash(password, config.bcrypt.rounds);

    const result = await pool.query(
      `INSERT INTO users (name, login, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING user_id, name, login, role`,
      [name, login, passwordHash, userRole]
    );

    const newUser = result.rows[0];

    // Log registration
    await pool.query(
      `INSERT INTO auth_log (user_id, login, event, ip_address, user_agent, details)
       VALUES ($1, $2, 'register', $3, $4, $5)`,
      [newUser.user_id, login, req.ip, req.headers['user-agent'] || '',
       JSON.stringify({ createdBy: req.user.userId, newUserId: newUser.user_id, role: userRole })]
    );

    res.status(201).json({
      userId: newUser.user_id,
      name: newUser.name,
      login: newUser.login,
      role: newUser.role
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'User with this login already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me (requires auth)
router.get('/me', auth, async (req, res) => {
  try {
    const userResult = await pool.query(
      'SELECT user_id, name, login, role, position FROM users WHERE user_id = $1',
      [req.user.userId]
    );

    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    const projectsResult = await pool.query(
      'SELECT project_id FROM user_project_access WHERE user_id = $1',
      [user.user_id]
    );
    const projects = projectsResult.rows.map(r => r.project_id);

    res.json({
      userId: user.user_id,
      name: user.name,
      login: user.login,
      role: user.role,
      position: user.position || null,
      projects
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/auth/change-password (requires auth)
router.put('/change-password', auth, async (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current and new passwords are required' });
  }

  if (new_password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  const ip = req.ip;
  const userAgent = req.headers['user-agent'] || '';

  try {
    const userResult = await pool.query(
      'SELECT user_id, password_hash FROM users WHERE user_id = $1',
      [req.user.userId]
    );

    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    const valid = await bcrypt.compare(current_password, user.password_hash || '');
    if (!valid) {
      return res.status(401).json({ error: 'Неверный текущий пароль' });
    }

    const passwordHash = await bcrypt.hash(new_password, config.bcrypt.rounds);

    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE user_id = $2',
      [passwordHash, user.user_id]
    );

    await pool.query(
      `INSERT INTO auth_log (user_id, login, event, ip_address, user_agent)
       VALUES ($1, $2, 'password_changed', $3, $4)`,
      [user.user_id, req.user.login, ip, userAgent]
    );

    res.json({ message: 'Пароль успешно изменён' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/change-password-public (no JWT — for login page)
router.post('/change-password-public', async (req, res) => {
  const { login, current_password, new_password } = req.body;

  if (!login || !current_password || !new_password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (new_password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  const ip = req.ip;
  const userAgent = req.headers['user-agent'] || '';

  try {
    const userResult = await pool.query(
      'SELECT user_id, login, password_hash FROM users WHERE lower(login) = lower($1)',
      [login]
    );

    if (userResult.rowCount === 0) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const user = userResult.rows[0];

    const valid = await bcrypt.compare(current_password, user.password_hash || '');
    if (!valid) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    if (new_password === current_password) {
      return res.status(400).json({ error: 'Новый пароль должен отличаться' });
    }

    const passwordHash = await bcrypt.hash(new_password, config.bcrypt.rounds);

    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE user_id = $2',
      [passwordHash, user.user_id]
    );

    await pool.query(
      `INSERT INTO auth_log (user_id, login, event, ip_address, user_agent)
       VALUES ($1, $2, 'password_changed', $3, $4)`,
      [user.user_id, user.login, ip, userAgent]
    );

    res.json({ message: 'Пароль успешно изменён' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
