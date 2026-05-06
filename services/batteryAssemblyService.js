const {
  buildBatteryCapacitySummary,
  enrichBatteryElectrodesWithCapacity
} = require('./batteryCapacityService');
const { attachBatteryProjects } = require('./batteryProjectService');

async function ensureBatteryAssembledStatus(queryable, batteryId) {
  await queryable.query(
    `
    WITH readiness AS (
      SELECT
        (
          EXISTS (
            SELECT 1
            FROM batteries b
            JOIN battery_coin_config c ON c.battery_id = b.battery_id
            WHERE b.battery_id = $1
              AND b.form_factor = 'coin'
          )
          OR EXISTS (
            SELECT 1
            FROM batteries b
            JOIN battery_pouch_config p ON p.battery_id = b.battery_id
            WHERE b.battery_id = $1
              AND b.form_factor = 'pouch'
              AND p.pouch_case_size_code IS NOT NULL
              AND (
                p.pouch_case_size_code <> 'other'
                OR NULLIF(BTRIM(p.pouch_case_size_other), '') IS NOT NULL
              )
          )
          OR EXISTS (
            SELECT 1
            FROM batteries b
            JOIN battery_cyl_config cy ON cy.battery_id = b.battery_id
            WHERE b.battery_id = $1
              AND b.form_factor = 'cylindrical'
          )
        ) AS has_config,
        EXISTS (
          SELECT 1 FROM battery_electrode_sources es WHERE es.battery_id = $1
        ) AS has_sources,
        EXISTS (
          SELECT 1 FROM battery_electrodes el WHERE el.battery_id = $1
        ) AS has_electrodes,
        EXISTS (
          SELECT 1 FROM battery_sep_config s WHERE s.battery_id = $1
        ) AS has_separator,
        EXISTS (
          SELECT 1 FROM battery_electrolyte e WHERE e.battery_id = $1
        ) AS has_electrolyte
    )
    UPDATE batteries b
    SET status = 'assembled'
    FROM readiness r
    WHERE b.battery_id = $1
      AND (b.status IS NULL OR b.status = 'disassembled')
      AND r.has_config
      AND r.has_sources
      AND r.has_electrodes
      AND r.has_separator
      AND r.has_electrolyte
    `,
    [batteryId]
  );
}

async function fetchBatteryAssembly(queryable, batteryId) {
  await ensureBatteryAssembledStatus(queryable, batteryId);

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
          jsonb_agg(to_jsonb(es)),
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
  await ensureBatteryAssembledStatus(queryable, batteryId);

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
          jsonb_agg(to_jsonb(esx) ORDER BY esx.role),
          '[]'::jsonb
        )
        FROM (
          SELECT
            es.battery_id,
            es.role,
            es.tape_id,
            es.cut_batch_id,
            es.source_notes,
            t.name AS tape_name,
            p.name AS tape_project_name,
            tr.name AS tape_recipe_name,
            tr.role AS tape_recipe_role,
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
  fetchBatteryReport
};
