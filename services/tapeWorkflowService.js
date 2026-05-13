const WORKFLOW_STATUS_ORDER = [
  { code: 'recipe_materials', label: 'Выбор экземпляров' },
  { code: 'drying_am', label: 'Сушка активного материала' },
  { code: 'weighing', label: 'Замес пасты' },
  { code: 'mixing', label: 'Перемешивание' },
  { code: 'coating', label: 'Нанесение' },
  { code: 'drying_tape', label: 'Сушка ленты до каландрирования' },
  { code: 'calendering', label: 'Каландрирование' },
  { code: 'drying_pressed_tape', label: 'Сушка ленты после каландрирования' }
];

function isFilled(value) {
  return value !== null && value !== undefined && value !== '';
}

function hasSavedHeader(step) {
  return Boolean(step) && isFilled(step.performed_by) && isFilled(step.started_at);
}

function hasCompleteCoatingGaps(step) {
  if (!isFilled(step?.gap_um)) return false;
  if (step?.coating_sidedness === 'two_sided') {
    return isFilled(step.gap_um_side2);
  }
  return true;
}

function computeTapeWorkflowStatus({ recipeMeta, stepsByCode }) {
  const recipeComplete =
    recipeMeta.total_lines > 0 &&
    recipeMeta.selected_instance_lines >= recipeMeta.total_lines;

  const weighingActualsComplete =
    recipeMeta.required_actual_lines === 0 ||
    recipeMeta.filled_actual_lines >= recipeMeta.required_actual_lines;

  const completionMap = {
    recipe_materials: recipeComplete,
    drying_am: hasSavedHeader(stepsByCode.drying_am),
    weighing: hasSavedHeader(stepsByCode.weighing) && weighingActualsComplete,
    mixing: hasSavedHeader(stepsByCode.mixing),
    coating:
      hasSavedHeader(stepsByCode.coating) &&
      isFilled(stepsByCode.coating?.foil_id) &&
      isFilled(stepsByCode.coating?.coating_id) &&
      hasCompleteCoatingGaps(stepsByCode.coating),
    drying_tape: hasSavedHeader(stepsByCode.drying_tape),
    calendering: hasSavedHeader(stepsByCode.calendering),
    drying_pressed_tape: hasSavedHeader(stepsByCode.drying_pressed_tape)
  };

  const firstIncomplete = WORKFLOW_STATUS_ORDER.find(
    ({ code }) => !completionMap[code]
  );

  if (firstIncomplete) {
    return {
      workflow_status_code: firstIncomplete.code,
      workflow_status_label: firstIncomplete.label,
      workflow_complete: false
    };
  }

  return {
    workflow_status_code: 'finished',
    workflow_status_label: 'Завершено',
    workflow_complete: true
  };
}

function isPositiveFiniteNumber(value) {
  return Number.isFinite(value) && value > 0;
}

function getEffectiveActualMassFromLine(line) {
  if (!line) return null;

  if (line.measure_mode === 'mass') {
    const actualMass = Number(line.actual_mass_g);
    return isPositiveFiniteNumber(actualMass) ? actualMass : null;
  }

  if (line.measure_mode === 'volume') {
    const actualVolumeMl = Number(line.actual_volume_ml);
    const density = Number(line.density_g_ml);
    if (!isPositiveFiniteNumber(actualVolumeMl) || !isPositiveFiniteNumber(density)) {
      return null;
    }
    return actualVolumeMl * density;
  }

  return null;
}

function emptyMixtureRows(rows) {
  return rows.map((line) => ({
    recipe_line_id: line.recipe_line_id,
    instance_display: line.instance_name || '—',
    target_quantity_g: null,
    actual_mass_g: line.actual_mass_g ?? null,
    actual_volume_ml: line.actual_volume_ml ?? null,
    measure_mode: line.measure_mode || null,
    difference_g: null,
    percent_error: null
  }));
}

function computeTapeMixtureRows({ tape, recipeLines, componentsByInstanceId }) {
  const rows = Array.isArray(recipeLines) ? recipeLines : [];
  const inputValue = Number(tape?.target_mass_g);

  if (!isPositiveFiniteNumber(inputValue)) {
    return emptyMixtureRows(rows);
  }

  const activeLine = rows.find(
    (line) => line.recipe_role === 'cathode_active' || line.recipe_role === 'anode_active'
  );
  const activePercent = Number(activeLine?.slurry_percent);

  if (!isPositiveFiniteNumber(activePercent) || activePercent > 100) {
    return emptyMixtureRows(rows);
  }

  let target = inputValue;

  if (tape?.calc_mode === 'from_slurry_mass') {
    const totalDryPercent = rows
      .filter((line) => line.include_in_pct)
      .reduce((sum, line) => sum + Number(line.slurry_percent || 0), 0);

    if (!isPositiveFiniteNumber(totalDryPercent) || totalDryPercent > 100) {
      return emptyMixtureRows(rows);
    }

    const totalDryMassFromWet = inputValue * (totalDryPercent / 100);
    target = totalDryMassFromWet * (activePercent / totalDryPercent);
  }

  if (!isPositiveFiniteNumber(target)) {
    return emptyMixtureRows(rows);
  }

  const totalDryMass = target / (activePercent / 100);
  const targetDryByMaterialId = {};
  const remainingDryByMaterialId = {};

  rows.forEach((line) => {
    if (!line || !line.include_in_pct) return;
    if (line.slurry_percent === null || line.slurry_percent === undefined || line.slurry_percent === '') return;

    const pct = Number(line.slurry_percent);
    const materialId = Number(line.material_id);
    if (!isPositiveFiniteNumber(pct) || !Number.isFinite(materialId)) return;

    const dryMass = totalDryMass * (pct / 100);
    targetDryByMaterialId[materialId] = (targetDryByMaterialId[materialId] || 0) + dryMass;
  });

  Object.keys(targetDryByMaterialId).forEach((materialId) => {
    remainingDryByMaterialId[materialId] = targetDryByMaterialId[materialId];
  });

  return rows.map((line) => {
    const selectedInstanceId = Number(line.material_instance_id);
    const lineMaterialId = Number(line.material_id);
    let targetQuantity = null;

    if (Number.isFinite(selectedInstanceId) && Number.isFinite(lineMaterialId)) {
      const needDry = Number(remainingDryByMaterialId[lineMaterialId] || 0);

      if (needDry <= 0) {
        targetQuantity = 0;
      } else {
        let components = componentsByInstanceId.get(selectedInstanceId) || [];

        if (!components.length) {
          components = [{
            material_id: lineMaterialId,
            material_role: null,
            mass_fraction: 1
          }];
        }

        const matchingComponent = components.find(
          (component) => Number(component.material_id) === lineMaterialId
        );
        const fraction = Number(matchingComponent?.mass_fraction);

        if (isPositiveFiniteNumber(fraction)) {
          targetQuantity = needDry / fraction;

          components.forEach((component) => {
            const componentMaterialId = Number(component.material_id);
            const componentFraction = Number(component.mass_fraction);

            if (!Number.isFinite(componentMaterialId) || !Number.isFinite(componentFraction)) return;
            if (component.material_role === 'solvent') return;
            if (remainingDryByMaterialId[componentMaterialId] == null) return;

            remainingDryByMaterialId[componentMaterialId] -= targetQuantity * componentFraction;
            if (remainingDryByMaterialId[componentMaterialId] < 0) {
              remainingDryByMaterialId[componentMaterialId] = 0;
            }
          });
        }
      }
    }

    const actualMass = getEffectiveActualMassFromLine(line);
    const difference =
      Number.isFinite(actualMass) && Number.isFinite(targetQuantity)
        ? actualMass - targetQuantity
        : null;
    const percentError =
      Number.isFinite(difference) && Number.isFinite(targetQuantity) && targetQuantity !== 0
        ? (difference / targetQuantity) * 100
        : null;

    return {
      recipe_line_id: line.recipe_line_id,
      instance_display: line.instance_name || '—',
      target_quantity_g: Number.isFinite(targetQuantity) ? targetQuantity : null,
      actual_mass_g: Number.isFinite(actualMass) ? actualMass : null,
      actual_volume_ml: line.measure_mode === 'volume' ? Number(line.actual_volume_ml) : null,
      measure_mode: line.measure_mode || null,
      difference_g: Number.isFinite(difference) ? difference : null,
      percent_error: Number.isFinite(percentError) ? percentError : null
    };
  });
}

async function fetchWorkflowStatusMap(queryable, tapeIds) {
  const ids = (Array.isArray(tapeIds) ? tapeIds : [])
    .map(Number)
    .filter((id) => Number.isInteger(id));

  if (!ids.length) {
    return new Map();
  }

  const recipeResult = await queryable.query(
    `
    SELECT
      t.tape_id,
      COUNT(rl.recipe_line_id) AS total_lines,
      COUNT(*) FILTER (
        WHERE a.material_instance_id IS NOT NULL
      ) AS selected_instance_lines,
      COUNT(*) FILTER (
        WHERE COALESCE(rl.include_in_pct, false) = true
      ) AS required_actual_lines,
      COUNT(*) FILTER (
        WHERE COALESCE(rl.include_in_pct, false) = true
          AND (
            a.actual_mass_g IS NOT NULL OR
            a.actual_volume_ml IS NOT NULL
          )
      ) AS filled_actual_lines
    FROM tapes t
    JOIN tape_recipe_lines rl
      ON rl.tape_recipe_id = t.tape_recipe_id
    LEFT JOIN tape_recipe_line_actuals a
      ON a.tape_id = t.tape_id
     AND a.recipe_line_id = rl.recipe_line_id
    WHERE t.tape_id = ANY($1::int[])
    GROUP BY t.tape_id
    `,
    [ids]
  );

  const stepsResult = await queryable.query(
    `
    SELECT
      s.tape_id,
      ot.code,
      s.performed_by,
      s.started_at,
      c.foil_id,
      c.coating_id,
      c.coating_sidedness,
      c.gap_um
    FROM tape_process_steps s
    JOIN operation_types ot
      ON ot.operation_type_id = s.operation_type_id
    LEFT JOIN tape_step_coating c
      ON c.step_id = s.step_id
    WHERE s.tape_id = ANY($1::int[])
    `,
    [ids]
  );

  const recipeMetaByTapeId = new Map(
    recipeResult.rows.map((row) => [
      Number(row.tape_id),
      {
        total_lines: Number(row.total_lines) || 0,
        selected_instance_lines: Number(row.selected_instance_lines) || 0,
        required_actual_lines: Number(row.required_actual_lines) || 0,
        filled_actual_lines: Number(row.filled_actual_lines) || 0
      }
    ])
  );

  const stepsByTapeId = new Map();
  stepsResult.rows.forEach((row) => {
    const tapeId = Number(row.tape_id);
    if (!stepsByTapeId.has(tapeId)) {
      stepsByTapeId.set(tapeId, {});
    }
    stepsByTapeId.get(tapeId)[row.code] = row;
  });

  const statusMap = new Map();
  ids.forEach((tapeId) => {
    statusMap.set(
      tapeId,
      computeTapeWorkflowStatus({
        recipeMeta: recipeMetaByTapeId.get(tapeId) || {
          total_lines: 0,
          selected_instance_lines: 0,
          required_actual_lines: 0,
          filled_actual_lines: 0
        },
        stepsByCode: stepsByTapeId.get(tapeId) || {}
      })
    );
  });

  return statusMap;
}

module.exports = {
  WORKFLOW_STATUS_ORDER,
  computeTapeMixtureRows,
  fetchWorkflowStatusMap
};
