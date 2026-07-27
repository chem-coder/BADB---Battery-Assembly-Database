const express = require('express');
const router = express.Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');
const { trackChanges } = require('../middleware/trackChanges');
const {
  collectDependencyConflicts,
  sendDependencyConflict,
  sendForeignKeyConflict
} = require('../utils/dependencyConflicts');

router.get('/test', async (req, res) => {
  const result = await pool.query('SELECT 1 as ok');
  res.json(result.rows);
});



// -------- RECIPES --------

async function collectRecipeDeleteDependencies(db, recipeId) {
  return collectDependencyConflicts(db, [
    {
      key: 'tapes',
      label: 'ленты с этим рецептом',
      query: `
        SELECT tape_id AS id, name
        FROM tapes
        WHERE tape_recipe_id = $1
        ORDER BY tape_id
        LIMIT 25
      `,
      params: [recipeId]
    }
  ]);
}

async function getRecipeDeleteCheck(db, recipeId) {
  const exists = await db.query(
    'SELECT tape_recipe_id FROM tape_recipes WHERE tape_recipe_id = $1',
    [recipeId]
  );

  if (exists.rowCount === 0) {
    const err = new Error('Рецепт не найден');
    err.statusCode = 404;
    throw err;
  }

  const dependencies = await collectRecipeDeleteDependencies(db, recipeId);

  return {
    tape_recipe_id: recipeId,
    can_delete: dependencies.length === 0,
    message: dependencies.length > 0
      ? 'Нельзя удалить рецепт: он используется в лентах.'
      : '',
    dependencies
  };
}

async function getRecipeReport(db, recipeId) {
  const recipeResult = await db.query(
    `
    SELECT
      r.tape_recipe_id,
      r.role,
      r.name,
      r.variant_label,
      r.notes,
      r.created_by,
      r.created_at,
      u_created.name AS created_by_name,
      r.updated_by,
      r.updated_at,
      u_updated.name AS updated_by_name
    FROM tape_recipes r
    LEFT JOIN users u_created ON u_created.user_id = r.created_by
    LEFT JOIN users u_updated ON u_updated.user_id = r.updated_by
    WHERE r.tape_recipe_id = $1
    `,
    [recipeId]
  );

  if (recipeResult.rowCount === 0) {
    const err = new Error('Рецепт не найден');
    err.statusCode = 404;
    throw err;
  }

  const linesResult = await db.query(
    `
    SELECT
      rl.recipe_line_id,
      rl.material_id,
      m.name AS material_name,
      m.role AS material_role,
      rl.recipe_role,
      rl.include_in_pct,
      rl.slurry_percent,
      rl.line_notes
    FROM tape_recipe_lines rl
    LEFT JOIN materials m ON m.material_id = rl.material_id
    WHERE rl.tape_recipe_id = $1
    ORDER BY
      CASE rl.recipe_role
        WHEN 'cathode_active' THEN 1
        WHEN 'anode_active' THEN 1
        WHEN 'binder' THEN 2
        WHEN 'additive' THEN 3
        WHEN 'solvent' THEN 4
        ELSE 9
      END,
      m.name ASC,
      rl.recipe_line_id
    `,
    [recipeId]
  );

  const usageResult = await db.query(
    `
    SELECT
      t.tape_id,
      t.name,
      t.project_id,
      p.name AS project_name,
      COALESCE(tape_project_names.project_names, p.name) AS project_names,
      r.role,
      COALESCE(t.item_created_at::timestamp, t.created_at) AS created_at
    FROM tapes t
    LEFT JOIN tape_recipes r
      ON r.tape_recipe_id = t.tape_recipe_id
    LEFT JOIN projects p
      ON p.project_id = t.project_id
    LEFT JOIN LATERAL (
      SELECT string_agg(DISTINCT p_linked.name, ', ' ORDER BY p_linked.name) AS project_names
      FROM tape_projects tp
      JOIN projects p_linked
        ON p_linked.project_id = tp.project_id
      WHERE tp.tape_id = t.tape_id
    ) tape_project_names ON true
    WHERE t.tape_recipe_id = $1
    ORDER BY t.item_created_at DESC NULLS LAST, t.created_at DESC NULLS LAST, t.tape_id DESC
    `,
    [recipeId]
  );

  return {
    recipe: recipeResult.rows[0],
    lines: linesResult.rows,
    tape_usage: usageResult.rows
  };
}

// CREATE: new recipe + lines
router.post('/', auth, async (req, res) => {
  const {
    role,
    name,
    variant_label,
    notes,
    lines
  } = req.body;

  const createdBy = req.user.userId;

  if (
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

      // Active line is an open slot: the material is chosen on the tape
      // (tapes.active_material_id), so material_id must be NULL here.
      const isActiveSlot =
        recipe_role === 'cathode_active' || recipe_role === 'anode_active';

      const matId =
        material_id === null || material_id === undefined || material_id === ''
          ? null
          : Number(material_id);

      const includeInPct =
        include_in_pct === false || include_in_pct === 'false'
          ? false
          : true;

      // If excluded (solvent), percent must be NULL to satisfy the new CHECK constraint
      const pctFinal = includeInPct ? pct : null;

      if (isActiveSlot && matId !== null) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'Активная строка рецепта не указывает материал — он выбирается на ленте'
        });
      }

      if (
        (!isActiveSlot && !Number.isInteger(matId)) ||
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
router.post('/:id/duplicate', auth, async (req, res) => {
  const sourceRecipeId = Number(req.params.id);
  const createdBy = req.user.userId;

  if (!Number.isInteger(sourceRecipeId)) {
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
router.get('/', auth, async (req, res) => {
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
        act.active_percent,
        mats.material_names,
        u_created.name AS created_by_name,
        r.updated_by,
        r.updated_at,
        u_updated.name AS updated_by_name
      FROM tape_recipes r
      LEFT JOIN users u_created ON u_created.user_id = r.created_by
      LEFT JOIN users u_updated ON u_updated.user_id = r.updated_by
      LEFT JOIN LATERAL (
        SELECT rl.slurry_percent AS active_percent
        FROM tape_recipe_lines rl
        WHERE rl.tape_recipe_id = r.tape_recipe_id
          AND rl.recipe_role IN ('cathode_active','anode_active')
        LIMIT 1
      ) act ON true
      LEFT JOIN LATERAL (
        SELECT string_agg(DISTINCT m.name, ', ' ORDER BY m.name) AS material_names
        FROM tape_recipe_lines rl
        JOIN materials m ON m.material_id = rl.material_id
        WHERE rl.tape_recipe_id = r.tape_recipe_id
      ) mats ON true
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

router.get('/:id/report', auth, async (req, res) => {
  const recipeId = Number(req.params.id);

  if (!Number.isInteger(recipeId)) {
    return res.status(400).json({ error: 'Некорректный tape_recipe_id' });
  }

  try {
    res.json(await getRecipeReport(pool, recipeId));
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки печатного отчёта по рецепту' });
  }
});

router.get('/:id/delete-check', auth, async (req, res) => {
  const recipeId = Number(req.params.id);

  if (!Number.isInteger(recipeId)) {
    return res.status(400).json({ error: 'Некорректный tape_recipe_id' });
  }

  try {
    res.json(await getRecipeDeleteCheck(pool, recipeId));
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка проверки удаления рецепта' });
  }
});

// READ: recipe details (header only)
router.get('/:id', auth, async (req, res) => {
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
router.get('/:id/lines', auth, async (req, res) => {
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
      LEFT JOIN materials m ON m.material_id = rl.material_id
      WHERE rl.tape_recipe_id = $1
      ORDER BY rl.recipe_line_id;
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
router.put('/:id', auth, async (req, res) => {
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

    // Snapshot current header for changelog
    const current = await client.query(
      'SELECT role, name, variant_label, notes FROM tape_recipes WHERE tape_recipe_id = $1',
      [recipeId]
    );
    if (current.rowCount === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ error: 'Рецепт не найден' });
    }

    const newVals = { role, name, variant_label: variant_label || null, notes: notes || null };

    const updateResult = await client.query(
      `
      UPDATE tape_recipes
      SET
        role = $2,
        name = $3,
        variant_label = $4,
        notes = $5,
        updated_by = $6,
        updated_at = now()
      WHERE tape_recipe_id = $1
      `,
      [
        recipeId,
        role,
        name,
        variant_label || null,
        notes || null,
        req.user.userId
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

      // Active line is an open slot: the material is chosen on the tape
      // (tapes.active_material_id), so material_id must be NULL here.
      const isActiveSlot =
        recipe_role === 'cathode_active' || recipe_role === 'anode_active';

      const matId =
        material_id === null || material_id === undefined || material_id === ''
          ? null
          : Number(material_id);

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

      if (isActiveSlot && matId !== null) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'Активная строка рецепта не указывает материал — он выбирается на ленте'
        });
      }

      if (
        (!isActiveSlot && !Number.isInteger(matId)) ||
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

    await trackChanges(client, 'recipe', 'tape_recipes', 'tape_recipe_id', recipeId, current.rows[0], newVals, req.user.userId);

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
router.delete('/:id', auth, async (req, res) => {
  const recipeId = Number(req.params.id);

  if (!Number.isInteger(recipeId)) {
    return res.status(400).json({ error: 'Некорректный tape_recipe_id' });
  }

  try {
    const dependencies = await collectRecipeDeleteDependencies(pool, recipeId);

    if (dependencies.length > 0) {
      return sendDependencyConflict(
        res,
        'Нельзя удалить рецепт: он используется в лентах',
        dependencies
      );
    }

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
    if (sendForeignKeyConflict(res, err, 'Нельзя удалить рецепт: он связан с другими записями')) {
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});



module.exports = router;
