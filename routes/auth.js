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

  // All writes for this login go through one serialized transaction. The
  // pg_advisory_xact_lock on hashtext(login) serializes concurrent login
  // attempts for the SAME login string, closing the count-then-insert race
  // that would otherwise let N parallel attempts each read the same
  // "below limit" count and all bypass the lockout.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [login.toLowerCase()]);

    // Brute-force protection: count recent failed attempts (now under the lock)
    const lockoutCheck = await client.query(
      `SELECT COUNT(*) AS cnt FROM auth_log
       WHERE login = $1 AND event = 'login_failed'
       AND created_at > now() - make_interval(mins => $2)`,
      [login, config.rateLimit.lockoutWindowMinutes]
    );

    if (parseInt(lockoutCheck.rows[0].cnt, 10) >= config.rateLimit.maxFailedAttempts) {
      await client.query(
        `INSERT INTO auth_log (login, event, ip_address, user_agent, details)
         VALUES ($1, 'login_failed', $2, $3, $4)`,
        [login, ip, userAgent, JSON.stringify({ reason: 'locked_out' })]
      );
      await client.query('COMMIT');
      return res.status(429).json({
        error: 'Too many failed attempts',
        retryAfter: config.rateLimit.lockoutWindowMinutes * 60
      });
    }

    const userResult = await client.query(
      'SELECT user_id, name, login, password_hash, role, position, token_version, active FROM users WHERE lower(login) = lower($1)',
      [login]
    );

    if (userResult.rowCount === 0) {
      await client.query(
        `INSERT INTO auth_log (login, event, ip_address, user_agent, details)
         VALUES ($1, 'login_failed', $2, $3, $4)`,
        [login, ip, userAgent, JSON.stringify({ reason: 'user_not_found' })]
      );
      await client.query('COMMIT');
      return res.status(401).json({ error: 'Invalid login or password' });
    }

    const user = userResult.rows[0];

    const valid = await bcrypt.compare(password, user.password_hash || '');
    if (!valid) {
      await client.query(
        `INSERT INTO auth_log (user_id, login, event, ip_address, user_agent, details)
         VALUES ($1, $2, 'login_failed', $3, $4, $5)`,
        [user.user_id, login, ip, userAgent, JSON.stringify({ reason: 'wrong_password' })]
      );
      await client.query('COMMIT');
      return res.status(401).json({ error: 'Invalid login or password' });
    }

    // Soft-disabled users cannot log in (see users.active + middleware/auth.js)
    if (user.active === false) {
      await client.query(
        `INSERT INTO auth_log (user_id, login, event, ip_address, user_agent, details)
         VALUES ($1, $2, 'login_failed', $3, $4, $5)`,
        [user.user_id, login, ip, userAgent, JSON.stringify({ reason: 'account_disabled' })]
      );
      await client.query('COMMIT');
      return res.status(403).json({ error: 'Учётная запись отключена. Обратитесь к администратору.' });
    }

    // Successful login — log + issue token
    await client.query(
      `INSERT INTO auth_log (user_id, login, event, ip_address, user_agent)
       VALUES ($1, $2, 'login_success', $3, $4)`,
      [user.user_id, login, ip, userAgent]
    );
    await client.query('COMMIT');

    // Post-transaction: project access list + JWT issuance don't need the lock
    const projectsResult = await pool.query(
      'SELECT project_id FROM user_project_access WHERE user_id = $1',
      [user.user_id]
    );
    const projects = projectsResult.rows.map(r => r.project_id);

    const token = jwt.sign(
      { userId: user.user_id, login: user.login, role: user.role, tokenVersion: user.token_version },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
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
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
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
      `SELECT u.user_id, u.name, u.login, u.role, u.position, u.department_id,
              d.name AS department_name, d.head_user_id
       FROM users u
       LEFT JOIN departments d ON d.department_id = u.department_id
       WHERE u.user_id = $1`,
      [req.user.userId]
    );

    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    const projectsResult = await pool.query(
      `SELECT upa.project_id, upa.access_level
       FROM user_project_access upa
       WHERE upa.user_id = $1`,
      [user.user_id]
    );

    // Director = user_id 20 (position contains 'Директор')
    const isDirector = (user.position || '').toLowerCase().includes('директор');
    const isDepartmentHead = user.head_user_id === user.user_id;

    res.json({
      userId: user.user_id,
      name: user.name,
      login: user.login,
      role: user.role,
      position: user.position || null,
      department: user.department_id ? {
        id: user.department_id,
        name: user.department_name,
      } : null,
      isDepartmentHead,
      isDirector,
      projects: projectsResult.rows,
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

    // Bump token_version → invalidates all existing JWTs for this user
    const updated = await pool.query(
      'UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE user_id = $2 RETURNING token_version',
      [passwordHash, user.user_id]
    );

    await pool.query(
      `INSERT INTO auth_log (user_id, login, event, ip_address, user_agent)
       VALUES ($1, $2, 'password_changed', $3, $4)`,
      [user.user_id, req.user.login, ip, userAgent]
    );

    // Issue fresh token so the current session stays alive
    const newToken = jwt.sign(
      { userId: user.user_id, login: req.user.login, role: req.user.role, tokenVersion: updated.rows[0].token_version },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    res.json({ message: 'Пароль успешно изменён', token: newToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/change-password-public (no JWT — for login page)
// Legitimate flow for users with a temporary/initial password issued by admin:
// caller provides login + CURRENT password + NEW password; we verify current
// via bcrypt, bump token_version (revokes all existing JWTs), and issue a
// fresh token. Brute-force count + password check wrapped in the same
// advisory-lock transaction as /login to prevent the race.
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

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [login.toLowerCase()]);

    const lockoutCheck = await client.query(
      `SELECT COUNT(*) AS cnt FROM auth_log
       WHERE login = $1 AND event = 'login_failed'
       AND created_at > now() - make_interval(mins => $2)`,
      [login, config.rateLimit.lockoutWindowMinutes]
    );
    if (parseInt(lockoutCheck.rows[0].cnt, 10) >= config.rateLimit.maxFailedAttempts) {
      await client.query('COMMIT');
      return res.status(429).json({
        error: 'Too many failed attempts',
        retryAfter: config.rateLimit.lockoutWindowMinutes * 60
      });
    }

    const userResult = await client.query(
      'SELECT user_id, login, password_hash, active FROM users WHERE lower(login) = lower($1)',
      [login]
    );

    if (userResult.rowCount === 0) {
      await client.query(
        `INSERT INTO auth_log (login, event, ip_address, user_agent, details)
         VALUES ($1, 'login_failed', $2, $3, $4)`,
        [login, ip, userAgent, JSON.stringify({ reason: 'user_not_found', via: 'change-password-public' })]
      );
      await client.query('COMMIT');
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const user = userResult.rows[0];

    // Soft-disabled users can't change password via this endpoint either —
    // they'd just be able to log in again after. Reject explicitly.
    if (user.active === false) {
      await client.query(
        `INSERT INTO auth_log (user_id, login, event, ip_address, user_agent, details)
         VALUES ($1, $2, 'login_failed', $3, $4, $5)`,
        [user.user_id, login, ip, userAgent, JSON.stringify({ reason: 'account_disabled', via: 'change-password-public' })]
      );
      await client.query('COMMIT');
      return res.status(403).json({ error: 'Учётная запись отключена. Обратитесь к администратору.' });
    }

    const valid = await bcrypt.compare(current_password, user.password_hash || '');
    if (!valid) {
      await client.query(
        `INSERT INTO auth_log (user_id, login, event, ip_address, user_agent, details)
         VALUES ($1, $2, 'login_failed', $3, $4, $5)`,
        [user.user_id, login, ip, userAgent, JSON.stringify({ reason: 'wrong_password', via: 'change-password-public' })]
      );
      await client.query('COMMIT');
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    if (new_password === current_password) {
      await client.query('COMMIT');
      return res.status(400).json({ error: 'Новый пароль должен отличаться' });
    }

    const passwordHash = await bcrypt.hash(new_password, config.bcrypt.rounds);

    // Bump token_version → invalidates all existing JWTs for this user
    const updated = await client.query(
      'UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE user_id = $2 RETURNING login, role, token_version',
      [passwordHash, user.user_id]
    );

    await client.query(
      `INSERT INTO auth_log (user_id, login, event, ip_address, user_agent)
       VALUES ($1, $2, 'password_changed', $3, $4)`,
      [user.user_id, user.login, ip, userAgent]
    );

    await client.query('COMMIT');

    // Issue token so user can proceed without re-login
    const newToken = jwt.sign(
      { userId: user.user_id, login: updated.rows[0].login, role: updated.rows[0].role, tokenVersion: updated.rows[0].token_version },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    res.json({ message: 'Пароль успешно изменён', token: newToken });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// POST /api/auth/admin-reset-password/:userId (admin only)
// For the "user forgot password" flow: admin sets a new temporary password
// that the user will then change via /change-password-public on next login.
// Body: { new_password: string }  — min 6 chars, same rules as other endpoints.
// Side effects:
//   - hashes new_password with bcrypt
//   - bumps token_version → revokes all existing JWTs for this user
//   - writes auth_log event 'password_reset_by_admin' with details
// Does NOT email anyone — lab is LAN-only; admin tells the user the new
// temporary password verbally or via internal chat.
router.post('/admin-reset-password/:userId', auth, requireRole('admin'), async (req, res) => {
  const targetUserId = Number(req.params.userId);
  const { new_password } = req.body;

  if (!Number.isInteger(targetUserId)) {
    return res.status(400).json({ error: 'Некорректный user_id' });
  }
  if (!new_password || typeof new_password !== 'string' || new_password.length < 6) {
    return res.status(400).json({ error: 'Минимум 6 символов' });
  }

  const ip = req.ip;
  const userAgent = req.headers['user-agent'] || '';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Look up target — also get login for audit logging
    const target = await client.query(
      'SELECT user_id, login, active FROM users WHERE user_id = $1',
      [targetUserId]
    );
    if (target.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    const targetLogin = target.rows[0].login;

    // Allow reset even for disabled users — admin may reset then re-enable.
    const passwordHash = await bcrypt.hash(new_password, config.bcrypt.rounds);

    const updated = await client.query(
      'UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE user_id = $2 RETURNING token_version',
      [passwordHash, targetUserId]
    );
    if (updated.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Audit: record WHO reset WHOSE password. The acting admin is in req.user;
    // the target user_id goes into the `details` JSON column. We log under
    // the TARGET user's login so a "recent auth_log for <target>" query shows
    // the reset event in their history.
    await client.query(
      `INSERT INTO auth_log (user_id, login, event, ip_address, user_agent, details)
       VALUES ($1, $2, 'password_reset_by_admin', $3, $4, $5)`,
      [
        targetUserId,
        targetLogin,
        ip,
        userAgent,
        JSON.stringify({ reset_by_user_id: req.user.userId, reset_by_login: req.user.login })
      ]
    );

    await client.query('COMMIT');
    res.json({
      message: 'Пароль сброшен. Передайте новый пароль пользователю лично.',
      user_id: targetUserId,
      login: targetLogin,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Ошибка сброса пароля' });
  } finally {
    client.release();
  }
});

// GET /api/auth/log — login journal (admin/lead only)
router.get('/log', auth, requireRole('admin', 'lead'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const offset = Number(req.query.offset) || 0;

  try {
    const result = await pool.query(`
      SELECT al.id, al.user_id, al.login, al.event, al.ip_address,
             al.user_agent, al.details, al.created_at,
             u.name AS user_name, d.name AS department_name
      FROM auth_log al
      LEFT JOIN users u ON u.user_id = al.user_id
      LEFT JOIN departments d ON d.department_id = u.department_id
      ORDER BY al.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const countResult = await pool.query('SELECT COUNT(*) AS total FROM auth_log');

    res.json({
      rows: result.rows,
      total: parseInt(countResult.rows[0].total, 10),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
