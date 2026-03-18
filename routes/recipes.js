const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/test', async (req, res) => {
  const result = await pool.query('SELECT 1 as ok');
  res.json(result.rows);
});



// -------- RECIPES --------

// CREATE: new recipe + lines
router.post('/', async (req, res) => {
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
router.post('/:id/duplicate', async (req, res) => {
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
router.get('/', async (req, res) => {
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
router.get('/:id', async (req, res) => {
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
router.get('/:id/lines', async (req, res) => {
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
router.put('/:id', async (req, res) => {
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
router.delete('/:id', async (req, res) => {
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



module.exports = router;