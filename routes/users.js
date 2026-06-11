const { Router } = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const config = require('../config');
const { auth, requireRole } = require('../middleware/auth');
const { trackChanges } = require('../middleware/trackChanges');
const {
  collectDependencyConflicts,
  sendDependencyConflict,
  sendForeignKeyConflict
} = require('../utils/dependencyConflicts');
const router = Router();


// -------- USERS --------

// CREATE — lead: can add employees only; admin: can add any role
router.post('/', auth, requireRole('admin', 'lead'), async (req, res) => {
  const { name, login, password, active, role, position, department_id } = req.body;
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const trimmedLogin = typeof login === 'string' ? login.trim() : '';
  const trimmedPosition = typeof position === 'string' ? position.trim() : '';
  const hasDepartment = Object.prototype.hasOwnProperty.call(req.body, 'department_id');

  if (!trimmedName) {
    return res.status(400).json({ error: 'Имя пользователя обязательно' });
  }

  if (!trimmedLogin) {
    return res.status(400).json({ error: 'Логин обязателен' });
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Пароль обязателен и должен быть не короче 6 символов' });
  }

  if (typeof active !== 'boolean') {
    return res.status(400).json({ error: 'Статус пользователя обязателен' });
  }

  // Lead cannot create lead/admin users
  const targetRole = role || 'employee';
  if (!config.roles.list.includes(targetRole)) {
    return res.status(400).json({ error: `Некорректная роль пользователя` });
  }

  if (req.user.role !== 'admin' && targetRole !== 'employee') {
    return res.status(403).json({ error: 'Только администратор может добавлять руководителей' });
  }

  if (!trimmedPosition) {
    return res.status(400).json({ error: 'Должность обязательна' });
  }

  if (!hasDepartment) {
    return res.status(400).json({ error: 'Отдел обязателен' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, config.bcrypt.rounds);
    const result = await pool.query(
      `INSERT INTO users (name, active, login, password_hash, role, position, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING user_id, name, active, login, role, position, department_id`,
      [trimmedName, active, trimmedLogin, passwordHash, targetRole, trimmedPosition, department_id || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Пользователь уже существует' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// READ — no auth required (reference data)
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.user_id, u.name, u.active, u.login, u.role, u.position,
              u.department_id, d.name AS department_name,
              (SELECT MAX(created_at) FROM auth_log
               WHERE user_id = u.user_id AND event = 'login_success') AS last_login
       FROM users u
       LEFT JOIN departments d ON d.department_id = u.department_id
       ORDER BY u.name`);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// READ projects where a user is an actual project participant.
// Admins may inspect anyone; ordinary users may inspect only themselves.
router.get('/:id/projects', auth, async (req, res) => {
  const userId = Number(req.params.id);

  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: 'Некорректный user_id' });
  }

  const isAdmin = req.user.role === 'admin';
  const isSelf = Number(req.user.userId) === userId;

  if (!isAdmin && !isSelf) {
    return res.status(403).json({ error: 'Недостаточно прав для просмотра проектов пользователя' });
  }

  try {
    const result = await pool.query(`
      SELECT
        pp.participant_id,
        pp.project_id,
        pp.display_order,
        pp.role_in_team,
        pp.notes,
        p.name AS project_name,
        p.status,
        p.start_date,
        p.due_date,
        p.lead_id,
        lead.name AS lead_name,
        CASE
          WHEN p.lead_id = $1 THEN 'admin'
          ELSE COALESCE((
            SELECT upa.access_level
            FROM user_project_access upa
            WHERE upa.user_id = $1
              AND upa.project_id = p.project_id
              AND (upa.expires_at IS NULL OR upa.expires_at > now())
            ORDER BY
              CASE upa.access_level
                WHEN 'admin' THEN 3
                WHEN 'edit' THEN 2
                WHEN 'view' THEN 1
                ELSE 0
              END DESC,
              upa.granted_at DESC NULLS LAST
            LIMIT 1
          ), 'view')
        END AS access_level
      FROM project_participants pp
      JOIN projects p
        ON p.project_id = pp.project_id
      LEFT JOIN users lead
        ON lead.user_id = p.lead_id
      WHERE pp.user_id = $1
      ORDER BY
        CASE p.status
          WHEN 'active' THEN 0
          WHEN 'paused' THEN 1
          WHEN 'completed' THEN 2
          WHEN 'archived' THEN 3
          ELSE 4
        END,
        p.name,
        pp.display_order,
        pp.participant_id
    `, [userId]);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки проектов пользователя' });
  }
});

// UPDATE — admin can edit anyone; non-admin users can edit only themselves.
router.put('/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { name, login, password, active, role, position, department_id } = req.body;
  const userId = Number(id);
  const resetPassword = req.body.reset_password === true;
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const trimmedLogin = typeof login === 'string' ? login.trim() : '';
  const trimmedPosition = typeof position === 'string' ? position.trim() : '';
  const hasDepartment = Object.prototype.hasOwnProperty.call(req.body, 'department_id');

  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: 'Некорректный user_id' });
  }

  try {
    const current = await pool.query('SELECT name, active, login, role, position, department_id FROM users WHERE user_id = $1', [userId]);
    if (current.rowCount === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const isAdmin = req.user.role === 'admin';
    const isSelf = Number(req.user.userId) === userId;

    if (!isAdmin && !isSelf) {
      return res.status(403).json({ error: 'Недостаточно прав для редактирования пользователя' });
    }

    if (!trimmedName) {
      return res.status(400).json({ error: 'Имя пользователя обязательно' });
    }

    if (!trimmedLogin) {
      return res.status(400).json({ error: 'Логин обязателен' });
    }

    if (!resetPassword && Object.prototype.hasOwnProperty.call(req.body, 'password')) {
      return res.status(400).json({ error: 'Для смены пароля требуется явный сброс пароля' });
    }

    if (resetPassword && (!password || typeof password !== 'string' || password.length < 6)) {
      return res.status(400).json({ error: 'Новый пароль должен быть не короче 6 символов' });
    }

    if (typeof active !== 'boolean') {
      return res.status(400).json({ error: 'Статус пользователя обязателен' });
    }

    const targetRole = role || 'employee';
    if (!config.roles.list.includes(targetRole)) {
      return res.status(400).json({ error: 'Некорректная роль пользователя' });
    }

    if (!isAdmin && targetRole !== current.rows[0].role) {
      return res.status(403).json({ error: 'Только администратор может менять роль пользователя' });
    }

    if (!trimmedPosition) {
      return res.status(400).json({ error: 'Должность обязательна' });
    }

    if (!hasDepartment) {
      return res.status(400).json({ error: 'Отдел обязателен' });
    }

    const passwordHash = resetPassword
      ? await bcrypt.hash(password, config.bcrypt.rounds)
      : null;

    const result = await pool.query(
      `UPDATE users
       SET name = $1,
           active = $2,
           login = $3,
           role = $4,
           position = $5,
           department_id = $6,
           password_hash = COALESCE($7, password_hash),
           token_version = CASE WHEN $7 IS NULL THEN token_version ELSE token_version + 1 END
       WHERE user_id = $8
       RETURNING user_id, name, active, login, role, position, department_id`,
      [trimmedName, active, trimmedLogin, targetRole, trimmedPosition, department_id || null, passwordHash, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    await trackChanges(
      pool,
      'user',
      'users',
      'user_id',
      userId,
      current.rows[0],
      {
        name: trimmedName,
        active,
        login: trimmedLogin,
        role: targetRole,
        position: trimmedPosition,
        department_id: department_id || null
      },
      req.user.userId,
      null,
      false
    );

    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Пользователь с таким именем уже существует' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE — admin can delete anyone; non-admin users can request deletion only for themselves.
router.delete('/:id', auth, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Некорректный user_id' });
  }

  if (req.user.role !== 'admin' && Number(req.user.userId) !== id) {
    return res.status(403).json({ error: 'Недостаточно прав для удаления пользователя' });
  }

  try {
    const dependencies = await collectDependencyConflicts(pool, [
      {
        key: 'projects',
        label: 'проекты, где пользователь является лидом/создателем/редактором',
        query: `
          SELECT project_id AS id, name
          FROM projects
          WHERE lead_id = $1 OR created_by = $1 OR updated_by = $1
          ORDER BY project_id
          LIMIT 25
        `,
        params: [id]
      },
      {
        key: 'project_participants',
        label: 'проекты, где пользователь указан участником',
        query: `
          SELECT p.project_id AS id, p.name
          FROM project_participants pp
          JOIN projects p ON p.project_id = pp.project_id
          WHERE pp.user_id = $1
          ORDER BY p.project_id
          LIMIT 25
        `,
        params: [id]
      },
      {
        key: 'tapes',
        label: 'ленты, созданные или обновлённые пользователем',
        query: `
          SELECT tape_id AS id, name
          FROM tapes
          WHERE created_by = $1 OR updated_by = $1
          ORDER BY tape_id
          LIMIT 25
        `,
        params: [id]
      },
      {
        key: 'batteries',
        label: 'аккумуляторы, созданные или обновлённые пользователем',
        query: `
          SELECT battery_id AS id, battery_notes AS name
          FROM batteries
          WHERE created_by = $1 OR updated_by = $1
          ORDER BY battery_id
          LIMIT 25
        `,
        params: [id]
      },
      {
        key: 'tape_recipes',
        label: 'рецепты, созданные или обновлённые пользователем',
        query: `
          SELECT tape_recipe_id AS id, name
          FROM tape_recipes
          WHERE created_by = $1 OR updated_by = $1
          ORDER BY tape_recipe_id
          LIMIT 25
        `,
        params: [id]
      },
      {
        key: 'inventory',
        label: 'материалы, сепараторы, электролиты или партии электродов с этим пользователем',
        query: `
          SELECT id, name
          FROM (
            SELECT sep_id AS id, name FROM separators WHERE created_by = $1 OR updated_by = $1
            UNION ALL
            SELECT electrolyte_id AS id, name FROM electrolytes WHERE created_by = $1 OR updated_by = $1
            UNION ALL
            SELECT cut_batch_id AS id, 'electrode cut batch #' || cut_batch_id AS name
            FROM electrode_cut_batches
            WHERE created_by = $1 OR updated_by = $1
          ) refs
          ORDER BY id
          LIMIT 25
        `,
        params: [id]
      },
      {
        key: 'tape_process_steps',
        label: 'технологические шаги, выполненные или обновлённые пользователем',
        query: `
          SELECT step_id AS id, 'tape #' || tape_id AS name
          FROM tape_process_steps
          WHERE performed_by = $1 OR updated_by = $1
          ORDER BY step_id
          LIMIT 25
        `,
        params: [id]
      }
    ]);

    if (dependencies.length > 0) {
      return sendDependencyConflict(
        res,
        'Нельзя удалить пользователя: он связан с существующими записями',
        dependencies
      );
    }

    const result = await pool.query('DELETE FROM users WHERE user_id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    res.status(204).end();
  } catch (err) {
    if (sendForeignKeyConflict(res, err, 'Нельзя удалить пользователя: он связан с другими записями')) {
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


module.exports = router;
