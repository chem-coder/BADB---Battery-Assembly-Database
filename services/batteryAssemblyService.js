const {
  buildBatteryCapacitySummary,
  enrichBatteryElectrodesWithCapacity
} = require('./batteryCapacityService');
const { attachBatteryProjects } = require('./batteryProjectService');

function normalizeAssemblyCompleteness(row) {
  if (!row) return null;

  const completeness = {
    battery_id: row.battery_id,
    status: row.status || null,
    has_config: Boolean(row.has_config),
    has_sources: Boolean(row.has_sources),
    has_electrodes: Boolean(row.has_electrodes),
    has_separator: Boolean(row.has_separator),
    has_electrolyte: Boolean(row.has_electrolyte)
  };

  completeness.is_complete = Boolean(
    completeness.has_config &&
    completeness.has_sources &&
    completeness.has_electrodes &&
    completeness.has_separator &&
    completeness.has_electrolyte
  );

  return completeness;
}

async function getBatteryAssemblyCompleteness(queryable, batteryId) {
  const result = await queryable.query(
    `
    WITH battery_context AS (
      SELECT
        b.battery_id,
        b.form_factor,
        b.status,
        cc.coin_cell_mode,
        cc.half_cell_type,
        cc.coin_size_code,
        pc.pouch_case_size_code,
        pc.pouch_case_size_other,
        cy.cyl_size_code
      FROM batteries b
      LEFT JOIN battery_coin_config cc
        ON cc.battery_id = b.battery_id
      LEFT JOIN battery_pouch_config pc
        ON pc.battery_id = b.battery_id
      LEFT JOIN battery_cyl_config cy
        ON cy.battery_id = b.battery_id
      WHERE b.battery_id = $1
    ),
    source_counts AS (
      SELECT
        COUNT(*) FILTER (
          WHERE role = 'cathode'
            AND tape_id IS NOT NULL
            AND cut_batch_id IS NOT NULL
        ) AS cathode_sources,
        COUNT(*) FILTER (
          WHERE role = 'anode'
            AND tape_id IS NOT NULL
            AND cut_batch_id IS NOT NULL
        ) AS anode_sources
      FROM battery_electrode_sources
      WHERE battery_id = $1
    ),
    electrode_counts AS (
      SELECT
        COUNT(*) FILTER (WHERE role = 'cathode') AS cathodes,
        COUNT(*) FILTER (WHERE role = 'anode') AS anodes
      FROM battery_electrodes
      WHERE battery_id = $1
    )
    SELECT
      bc.battery_id,
      bc.status,
      CASE
        WHEN bc.form_factor = 'coin' THEN
          bc.coin_cell_mode IS NOT NULL
          AND bc.coin_size_code IS NOT NULL
          AND (
            bc.coin_cell_mode <> 'half_cell'
            OR bc.half_cell_type IS NOT NULL
          )
        WHEN bc.form_factor IN ('pouch', 'prism') THEN
          bc.pouch_case_size_code IS NOT NULL
          AND (
            bc.pouch_case_size_code <> 'other'
            OR NULLIF(BTRIM(bc.pouch_case_size_other), '') IS NOT NULL
          )
        WHEN bc.form_factor = 'cylindrical' THEN
          bc.cyl_size_code IS NOT NULL
        ELSE false
      END AS has_config,
      CASE
        WHEN bc.form_factor = 'coin'
          AND bc.coin_cell_mode = 'half_cell'
          AND bc.half_cell_type = 'cathode_vs_li'
          THEN sc.cathode_sources > 0 AND sc.anode_sources = 0
        WHEN bc.form_factor = 'coin'
          AND bc.coin_cell_mode = 'half_cell'
          AND bc.half_cell_type = 'anode_vs_li'
          THEN sc.anode_sources > 0 AND sc.cathode_sources = 0
        WHEN bc.form_factor IN ('coin', 'pouch', 'cylindrical', 'prism')
          THEN sc.cathode_sources > 0 AND sc.anode_sources > 0
        ELSE false
      END AS has_sources,
      CASE
        WHEN bc.form_factor = 'coin'
          AND bc.coin_cell_mode = 'half_cell'
          AND bc.half_cell_type = 'cathode_vs_li'
          THEN ec.cathodes = 1 AND ec.anodes = 0
        WHEN bc.form_factor = 'coin'
          AND bc.coin_cell_mode = 'half_cell'
          AND bc.half_cell_type = 'anode_vs_li'
          THEN ec.anodes = 1 AND ec.cathodes = 0
        WHEN bc.form_factor = 'coin'
          THEN ec.cathodes = 1 AND ec.anodes = 1
        WHEN bc.form_factor IN ('pouch', 'cylindrical', 'prism')
          THEN ec.cathodes >= 1
            AND ec.anodes >= 1
            AND (ec.anodes = ec.cathodes OR ec.anodes = ec.cathodes + 1)
        ELSE false
      END AS has_electrodes,
      EXISTS (
        SELECT 1
        FROM battery_sep_config s
        WHERE s.battery_id = $1
          AND s.separator_id IS NOT NULL
      ) AS has_separator,
      EXISTS (
        SELECT 1
        FROM battery_electrolyte e
        WHERE e.battery_id = $1
          AND e.electrolyte_id IS NOT NULL
          AND e.electrolyte_total_ul IS NOT NULL
      ) AS has_electrolyte
    FROM battery_context bc
    CROSS JOIN source_counts sc
    CROSS JOIN electrode_counts ec
    `,
    [batteryId]
  );

  return normalizeAssemblyCompleteness(result.rows[0]);
}

async function fetchBatteryAssembly(queryable, batteryId) {
  const result = await queryable.query(
    `
    SELECT jsonb_build_object(

      'battery',
      (
        SELECT row_to_json(b)
        FROM batteries b
        WHERE b.battery_id = $1
      ),

      'coin_config',
      (
        SELECT row_to_json(c)
        FROM battery_coin_config c
        WHERE c.battery_id = $1
      ),

      'pouch_config',
      (
        SELECT row_to_json(p)
        FROM battery_pouch_config p
        WHERE p.battery_id = $1
      ),

      'cyl_config',
      (
        SELECT row_to_json(cy)
        FROM battery_cyl_config cy
        WHERE cy.battery_id = $1
      ),

      'separator',
      (
        SELECT row_to_json(s)
        FROM battery_sep_config s
        WHERE s.battery_id = $1
      ),

      'electrolyte',
      (
        SELECT row_to_json(e)
        FROM battery_electrolyte e
        WHERE e.battery_id = $1
      ),

      'qc',
      (
        SELECT row_to_json(q)
        FROM battery_qc q
        WHERE q.battery_id = $1
      ),

      'electrochem',
      (
        SELECT COALESCE(
          jsonb_agg(to_jsonb(ec) ORDER BY ec.battery_electrochem_id),
          '[]'::jsonb
        )
        FROM battery_electrochem ec
        WHERE ec.battery_id = $1
      ),

      'electrode_sources',
      (
        SELECT COALESCE(
          jsonb_agg(to_jsonb(es) ORDER BY es.role, es.is_primary DESC, es.sort_order, es.battery_electrode_source_id),
          '[]'::jsonb
        )
        FROM battery_electrode_sources es
        WHERE es.battery_id = $1
      ),

      'electrodes',
      (
        SELECT COALESCE(
          jsonb_agg(to_jsonb(elx) ORDER BY elx.position_index),
          '[]'::jsonb
        )
        FROM (
          SELECT
            be.battery_id,
            be.electrode_id,
            be.role,
            be.position_index,
            e.electrode_mass_g,
            e.cut_batch_id
          FROM battery_electrodes be
          LEFT JOIN electrodes e
            ON e.electrode_id = be.electrode_id
          WHERE be.battery_id = $1
        ) elx
      )

    ) AS assembly
    `,
    [batteryId]
  );

  const assembly = result.rows[0].assembly;

  if (!assembly.battery) {
    return null;
  }

  [assembly.battery] = await attachBatteryProjects(queryable, [assembly.battery]);
  assembly.electrodes = await enrichBatteryElectrodesWithCapacity(queryable, assembly.electrodes);
  assembly.capacity_summary = buildBatteryCapacitySummary(assembly.electrodes);

  return assembly;
}

async function fetchBatteryReport(queryable, batteryId) {
  const result = await queryable.query(
    `
    SELECT jsonb_build_object(

      'battery',
      (
        SELECT row_to_json(bx)
        FROM (
          SELECT
            b.battery_id,
            b.project_id,
            p.name AS project_name,
            b.form_factor,
            b.status,
            b.created_by,
            u.name AS created_by_name,
            b.battery_notes,
            b.item_created_at,
            b.created_at,
            b.updated_at
          FROM batteries b
          LEFT JOIN projects p
            ON p.project_id = b.project_id
          LEFT JOIN users u
            ON u.user_id = b.created_by
          WHERE b.battery_id = $1
        ) bx
      ),

      'coin_config',
      (
        SELECT row_to_json(cx)
        FROM (
          SELECT
            c.*
          FROM battery_coin_config c
          WHERE c.battery_id = $1
        ) cx
      ),

      'pouch_config',
      (
        SELECT row_to_json(px)
        FROM (
          SELECT
            p.*
          FROM battery_pouch_config p
          WHERE p.battery_id = $1
        ) px
      ),

      'cyl_config',
      (
        SELECT row_to_json(cyx)
        FROM (
          SELECT
            cy.*
          FROM battery_cyl_config cy
          WHERE cy.battery_id = $1
        ) cyx
      ),

      'separator',
      (
        SELECT row_to_json(sx)
        FROM (
          SELECT
            sconfig.*,
            s.name AS separator_name,
            s.supplier AS separator_supplier,
            s.brand AS separator_brand,
            s.batch AS separator_batch,
            s.thickness_um AS separator_thickness_um
          FROM battery_sep_config sconfig
          LEFT JOIN separators s
            ON s.sep_id = sconfig.separator_id
          WHERE sconfig.battery_id = $1
        ) sx
      ),

      'electrolyte',
      (
        SELECT row_to_json(ex)
        FROM (
          SELECT
            econfig.*,
            e.name AS electrolyte_name,
            e.solvent_system,
            e.salts,
            e.concentration,
            e.additives
          FROM battery_electrolyte econfig
          LEFT JOIN electrolytes e
            ON e.electrolyte_id = econfig.electrolyte_id
          WHERE econfig.battery_id = $1
        ) ex
      ),

      'qc',
      (
        SELECT row_to_json(qx)
        FROM (
          SELECT
            q.*
          FROM battery_qc q
          WHERE q.battery_id = $1
        ) qx
      ),

      'electrochem',
      (
        SELECT COALESCE(
          jsonb_agg(to_jsonb(ecx) ORDER BY ecx.battery_electrochem_id),
          '[]'::jsonb
        )
        FROM (
          SELECT
            ec.battery_electrochem_id,
            ec.file_name,
            ec.file_link,
            ec.electrochem_notes,
            ec.uploaded_at
          FROM battery_electrochem ec
          WHERE ec.battery_id = $1
        ) ecx
      ),

      'electrode_sources',
      (
        SELECT COALESCE(
          jsonb_agg(to_jsonb(esx) ORDER BY esx.role, esx.is_primary DESC, esx.sort_order, esx.battery_electrode_source_id),
          '[]'::jsonb
        )
        FROM (
          SELECT
            es.battery_electrode_source_id,
            es.battery_id,
            es.role,
            es.tape_id,
            es.cut_batch_id,
            es.source_notes,
            es.sort_order,
            es.is_primary,
            t.name AS tape_name,
            p.name AS tape_project_name,
            tr.name AS tape_recipe_name,
            tr.role AS tape_recipe_role,
            m_act.name AS tape_active_material_name,
            cb.target_form_factor,
            cb.target_config_code,
            cb.target_config_other,
            cb.shape,
            cb.diameter_mm,
            cb.length_mm,
            cb.width_mm,
            cb.created_by,
            ub.name AS cut_batch_created_by_name,
            COALESCE(ec.electrode_count, 0) AS electrode_count
          FROM battery_electrode_sources es
          LEFT JOIN tapes t
            ON t.tape_id = es.tape_id
          LEFT JOIN projects p
            ON p.project_id = t.project_id
          LEFT JOIN tape_recipes tr
            ON tr.tape_recipe_id = t.tape_recipe_id
          LEFT JOIN materials m_act
            ON m_act.material_id = t.active_material_id
          LEFT JOIN electrode_cut_batches cb
            ON cb.cut_batch_id = es.cut_batch_id
          LEFT JOIN users ub
            ON ub.user_id = cb.created_by
          LEFT JOIN (
            SELECT
              cut_batch_id,
              COUNT(*) AS electrode_count
            FROM electrodes
            GROUP BY cut_batch_id
          ) ec
            ON ec.cut_batch_id = cb.cut_batch_id
          WHERE es.battery_id = $1
        ) esx
      ),

      'electrodes',
      (
        SELECT COALESCE(
          jsonb_agg(to_jsonb(elx) ORDER BY elx.position_index),
          '[]'::jsonb
        )
        FROM (
          SELECT
            be.electrode_id,
            be.role,
            be.position_index,
            e.electrode_mass_g,
            e.cut_batch_id
          FROM battery_electrodes be
          LEFT JOIN electrodes e
            ON e.electrode_id = be.electrode_id
          WHERE be.battery_id = $1
        ) elx
      )

    ) AS report
    `,
    [batteryId]
  );

  const report = result.rows[0].report;

  if (!report.battery) {
    return null;
  }

  [report.battery] = await attachBatteryProjects(queryable, [report.battery]);
  report.electrodes = await enrichBatteryElectrodesWithCapacity(queryable, report.electrodes);
  report.capacity_summary = buildBatteryCapacitySummary(report.electrodes);

  return report;
}

module.exports = {
  fetchBatteryAssembly,
  fetchBatteryReport,
  getBatteryAssemblyCompleteness
};
