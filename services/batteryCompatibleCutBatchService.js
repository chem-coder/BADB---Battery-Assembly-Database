const { attachElectrodeBatchProjects } = require('./electrodeBatchProjectService');
const { ELECTRODE_CUT_BATCH_ORDER_BY_SQL } = require('../utils/electrodeCutBatchSort');

function normalizeSelectedBatchIds(selectedBatchIds) {
  const source = Array.isArray(selectedBatchIds) ? selectedBatchIds : [selectedBatchIds];
  const normalized = [];

  source.forEach((value) => {
    if (value === null || value === undefined || value === '') return;
    const id = Number(value);
    if (Number.isInteger(id) && !normalized.includes(id)) {
      normalized.push(id);
    }
  });

  return normalized;
}

async function fetchCompatibleElectrodeCutBatches(pool, batteryId, tapeId, selectedBatchIds = []) {
  const pinnedBatchIds = normalizeSelectedBatchIds(selectedBatchIds);

  const result = await pool.query(
    `
    WITH battery_context AS (
      SELECT
        b.battery_id,
        b.form_factor,
        CASE
          WHEN b.form_factor = 'coin' THEN cc.coin_size_code
          WHEN b.form_factor IN ('pouch', 'prism') THEN pc.pouch_case_size_code
          WHEN b.form_factor = 'cylindrical' THEN cy.cyl_size_code
          ELSE NULL
        END AS target_config_code,
        CASE
          WHEN b.form_factor = 'coin' THEN 'circle'
          WHEN b.form_factor IN ('pouch', 'cylindrical', 'prism') THEN 'rectangle'
          ELSE NULL
        END AS expected_shape
      FROM batteries b
      LEFT JOIN battery_coin_config cc
        ON cc.battery_id = b.battery_id
      LEFT JOIN battery_pouch_config pc
        ON pc.battery_id = b.battery_id
      LEFT JOIN battery_cyl_config cy
        ON cy.battery_id = b.battery_id
      WHERE b.battery_id = $1
    )
    SELECT
      b.*,
      t.name AS tape_name,
      t.availability_status AS tape_availability_status,
      r.role AS tape_role,
      u.name AS created_by_name,
      (
        SELECT c.coating_sidedness
        FROM tape_process_steps ts_coating
        JOIN operation_types ot_coating
          ON ot_coating.operation_type_id = ts_coating.operation_type_id
        JOIN tape_step_coating c
          ON c.step_id = ts_coating.step_id
        WHERE ts_coating.tape_id = b.tape_id
          AND ot_coating.code = 'coating'
        LIMIT 1
      ) AS coating_sidedness,
      (
        ctx.expected_shape IS NOT NULL
        AND b.shape = ctx.expected_shape
        AND b.target_form_factor = ctx.form_factor
        AND (
          ctx.form_factor <> 'coin'
          OR (
            SELECT c.coating_sidedness
            FROM tape_process_steps ts_coating
            JOIN operation_types ot_coating
              ON ot_coating.operation_type_id = ts_coating.operation_type_id
            JOIN tape_step_coating c
              ON c.step_id = ts_coating.step_id
            WHERE ts_coating.tape_id = b.tape_id
              AND ot_coating.code = 'coating'
            LIMIT 1
          ) = 'one_sided'
        )
      ) AS is_compatibility_match,
      d.start_time AS drying_start,
      d.end_time AS drying_end,
      COALESCE(ec.electrode_count, 0) AS electrode_count
    FROM electrode_cut_batches b
    CROSS JOIN battery_context ctx
    JOIN tapes t
      ON t.tape_id = b.tape_id
    LEFT JOIN tape_recipes r
      ON r.tape_recipe_id = t.tape_recipe_id
    LEFT JOIN users u
      ON u.user_id = b.created_by
    LEFT JOIN electrode_drying d
      ON d.cut_batch_id = b.cut_batch_id
    LEFT JOIN (
      SELECT
        cut_batch_id,
        COUNT(*) AS electrode_count
      FROM electrodes
      GROUP BY cut_batch_id
    ) ec
      ON ec.cut_batch_id = b.cut_batch_id
    WHERE ($2::integer IS NULL OR b.tape_id = $2)
      AND (
        (
          ctx.expected_shape IS NOT NULL
          AND b.shape = ctx.expected_shape
          AND b.target_form_factor = ctx.form_factor
          AND (
            ctx.form_factor <> 'coin'
            OR (
              SELECT c.coating_sidedness
              FROM tape_process_steps ts_coating
              JOIN operation_types ot_coating
                ON ot_coating.operation_type_id = ts_coating.operation_type_id
              JOIN tape_step_coating c
                ON c.step_id = ts_coating.step_id
              WHERE ts_coating.tape_id = b.tape_id
                AND ot_coating.code = 'coating'
              LIMIT 1
            ) = 'one_sided'
          )
        )
        OR (
          CARDINALITY($3::int[]) > 0
          AND b.cut_batch_id = ANY($3::int[])
        )
      )
    ORDER BY
      CASE WHEN b.cut_batch_id = ANY($3::int[]) THEN 0 ELSE 1 END,
      ${ELECTRODE_CUT_BATCH_ORDER_BY_SQL}
    `,
    [batteryId, tapeId, pinnedBatchIds]
  );

  return attachElectrodeBatchProjects(pool, result.rows);
}

module.exports = {
  fetchCompatibleElectrodeCutBatches
};
