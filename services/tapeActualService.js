function statusError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function saveTapeActual(pool, tapeId, payload) {
  // The chosen instance must belong to the line's material; the active slot
  // line (material_id IS NULL, d047) is filled by the tape's active material.
  if (payload.material_instance_id != null) {
    const check = await pool.query(
      `
      SELECT
        COALESCE(rl.material_id, t.active_material_id) AS expected_material_id,
        (rl.material_id IS NULL) AS is_active_slot,
        mi.material_id AS instance_material_id
      FROM tape_recipe_lines rl
      JOIN tapes t ON t.tape_id = $1
      LEFT JOIN material_instances mi ON mi.material_instance_id = $3
      WHERE rl.recipe_line_id = $2
      `,
      [tapeId, payload.recipe_line_id, payload.material_instance_id]
    );

    if (check.rowCount === 0) {
      throw statusError('Строка рецепта не найдена', 400);
    }

    const guard = check.rows[0];

    if (guard.instance_material_id === null) {
      throw statusError('Экземпляр материала не найден', 400);
    }

    if (guard.is_active_slot && guard.expected_material_id === null) {
      throw statusError('Сначала выберите активный материал ленты', 400);
    }

    if (Number(guard.instance_material_id) !== Number(guard.expected_material_id)) {
      throw statusError(
        guard.is_active_slot
          ? 'Экземпляр должен принадлежать активному материалу ленты'
          : 'Экземпляр не принадлежит материалу строки рецепта',
        400
      );
    }
  }

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
      measure_mode = CASE
        WHEN EXCLUDED.measure_mode IS NULL
          AND EXCLUDED.actual_mass_g IS NULL
          AND EXCLUDED.actual_volume_ml IS NULL
        THEN tape_recipe_line_actuals.measure_mode
        ELSE EXCLUDED.measure_mode
      END,
      actual_mass_g = CASE
        WHEN EXCLUDED.measure_mode IS NULL
          AND EXCLUDED.actual_mass_g IS NULL
          AND EXCLUDED.actual_volume_ml IS NULL
        THEN tape_recipe_line_actuals.actual_mass_g
        ELSE EXCLUDED.actual_mass_g
      END,
      actual_volume_ml = CASE
        WHEN EXCLUDED.measure_mode IS NULL
          AND EXCLUDED.actual_mass_g IS NULL
          AND EXCLUDED.actual_volume_ml IS NULL
        THEN tape_recipe_line_actuals.actual_volume_ml
        ELSE EXCLUDED.actual_volume_ml
      END,
      recorded_at = now()
    RETURNING *
    `,
    [
      tapeId,
      payload.recipe_line_id,
      payload.material_instance_id,
      payload.measure_mode,
      payload.actual_mass_g,
      payload.actual_volume_ml
    ]
  );

  return result.rows[0];
}

async function listTapeActuals(pool, tapeId) {
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

  return result.rows;
}

module.exports = {
  listTapeActuals,
  saveTapeActual
};
