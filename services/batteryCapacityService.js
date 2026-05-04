function toFiniteNumberOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function calculateCutBatchAreaMm2(batch) {
  if (!batch) return null;

  if (batch.shape === 'circle') {
    const diameter = toFiniteNumberOrNull(batch.diameter_mm);
    if (!(diameter > 0)) return null;
    const radius = diameter / 2;
    return Math.PI * radius * radius;
  }

  if (batch.shape === 'rectangle') {
    const length = toFiniteNumberOrNull(batch.length_mm);
    const width = toFiniteNumberOrNull(batch.width_mm);
    if (!(length > 0) || !(width > 0)) return null;
    return length * width;
  }

  return null;
}

function getSideCountFromSidedness(coatingSidedness) {
  if (coatingSidedness === 'one_sided') return 1;
  if (coatingSidedness === 'two_sided') return 2;
  return null;
}

function averageOfFinite(values) {
  const numeric = (Array.isArray(values) ? values : []).filter((value) => Number.isFinite(value));
  if (!numeric.length) return null;
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}

function getEffectiveActualMass(line) {
  if (!line) return null;

  if (line.measure_mode === 'mass') {
    const actualMass = toFiniteNumberOrNull(line.actual_mass_g);
    return Number.isFinite(actualMass) && actualMass > 0 ? actualMass : null;
  }

  if (line.measure_mode === 'volume') {
    const actualVolumeMl = toFiniteNumberOrNull(line.actual_volume_ml);
    const density = toFiniteNumberOrNull(line.density_g_ml);
    if (!(Number.isFinite(actualVolumeMl) && actualVolumeMl > 0 && Number.isFinite(density) && density > 0)) {
      return null;
    }
    return actualVolumeMl * density;
  }

  return null;
}

function sumOfFinite(values) {
  const numeric = (Array.isArray(values) ? values : []).filter((value) => Number.isFinite(value));
  if (!numeric.length) return null;
  return numeric.reduce((sum, value) => sum + value, 0);
}

function getElectrodeAreaCm2(row) {
  const directArea = toFiniteNumberOrNull(row?.electrode_area_cm2);
  if (Number.isFinite(directArea) && directArea > 0) return directArea;

  const actualCapacity = toFiniteNumberOrNull(row?.capacity_actual_mAh);
  const actualAreal = toFiniteNumberOrNull(row?.areal_capacity_actual_mAh_cm2);
  if (Number.isFinite(actualCapacity) && actualCapacity > 0 && Number.isFinite(actualAreal) && actualAreal > 0) {
    return actualCapacity / actualAreal;
  }

  const theoreticalCapacity = toFiniteNumberOrNull(row?.capacity_theoretical_mAh);
  const theoreticalAreal = toFiniteNumberOrNull(row?.areal_capacity_theoretical_mAh_cm2);
  if (
    Number.isFinite(theoreticalCapacity) &&
    theoreticalCapacity > 0 &&
    Number.isFinite(theoreticalAreal) &&
    theoreticalAreal > 0
  ) {
    return theoreticalCapacity / theoreticalAreal;
  }

  return null;
}

function sumElectrodeAreasCm2(rows) {
  return sumOfFinite((Array.isArray(rows) ? rows : []).map((row) => getElectrodeAreaCm2(row)));
}

function calculateArealCapacity(capacity, area) {
  return Number.isFinite(capacity) && capacity > 0 && Number.isFinite(area) && area > 0
    ? capacity / area
    : null;
}

function pickLimitingArea({ cathodeCapacity, cathodeArea, anodeCapacity, anodeArea }) {
  if (
    Number.isFinite(cathodeCapacity) &&
    Number.isFinite(anodeCapacity) &&
    Number.isFinite(cathodeArea) &&
    Number.isFinite(anodeArea)
  ) {
    return cathodeCapacity <= anodeCapacity ? cathodeArea : anodeArea;
  }

  if (Number.isFinite(cathodeCapacity) && Number.isFinite(cathodeArea)) return cathodeArea;
  if (Number.isFinite(anodeCapacity) && Number.isFinite(anodeArea)) return anodeArea;

  return null;
}

function computeElectrodeDerivedValues(electrode, capacityContext) {
  const electrodeMass = toFiniteNumberOrNull(electrode?.electrode_mass_g);
  const averageFoilMass = toFiniteNumberOrNull(capacityContext?.average_foil_mass_g);
  const activeFractionTheoretical = toFiniteNumberOrNull(capacityContext?.active_fraction_theoretical);
  const activeFractionActual = toFiniteNumberOrNull(capacityContext?.active_fraction_actual);
  const specificCapacity = toFiniteNumberOrNull(capacityContext?.specific_capacity_mAh_g);
  const electrodeAreaCm2 = toFiniteNumberOrNull(capacityContext?.electrode_area_cm2);
  const sideCount = toFiniteNumberOrNull(capacityContext?.side_count);

  const coatingMass =
    Number.isFinite(electrodeMass) && Number.isFinite(averageFoilMass)
      ? electrodeMass - averageFoilMass
      : null;

  const normalizedCoatingMass = Number.isFinite(coatingMass) && coatingMass > 0 ? coatingMass : null;

  const activeMaterialMassTheoretical =
    Number.isFinite(normalizedCoatingMass) && Number.isFinite(activeFractionTheoretical)
      ? normalizedCoatingMass * activeFractionTheoretical
      : null;

  const activeMaterialMassActual =
    Number.isFinite(normalizedCoatingMass) && Number.isFinite(activeFractionActual)
      ? normalizedCoatingMass * activeFractionActual
      : null;

  const capacityTheoretical =
    Number.isFinite(activeMaterialMassTheoretical) && Number.isFinite(specificCapacity)
      ? activeMaterialMassTheoretical * specificCapacity
      : null;

  const capacityActual =
    Number.isFinite(activeMaterialMassActual) && Number.isFinite(specificCapacity)
      ? activeMaterialMassActual * specificCapacity
      : null;

  const arealCapacityTheoretical = calculateArealCapacity(capacityTheoretical, electrodeAreaCm2);
  const arealCapacityActual = calculateArealCapacity(capacityActual, electrodeAreaCm2);
  const capacityPerSideActual =
    Number.isFinite(arealCapacityActual) && Number.isFinite(sideCount) && sideCount > 1
      ? arealCapacityActual / sideCount
      : null;

  return {
    coating_mass_g: normalizedCoatingMass,
    active_material_mass_theoretical_g: Number.isFinite(activeMaterialMassTheoretical) ? activeMaterialMassTheoretical : null,
    active_material_mass_actual_g: Number.isFinite(activeMaterialMassActual) ? activeMaterialMassActual : null,
    capacity_theoretical_mAh: Number.isFinite(capacityTheoretical) ? capacityTheoretical : null,
    capacity_actual_mAh: Number.isFinite(capacityActual) ? capacityActual : null,
    electrode_area_cm2: Number.isFinite(electrodeAreaCm2) ? electrodeAreaCm2 : null,
    areal_capacity_theoretical_mAh_cm2: Number.isFinite(arealCapacityTheoretical) ? arealCapacityTheoretical : null,
    areal_capacity_actual_mAh_cm2: Number.isFinite(arealCapacityActual) ? arealCapacityActual : null,
    capacity_per_side_actual_mAh_cm2: Number.isFinite(capacityPerSideActual) ? capacityPerSideActual : null
  };
}

async function fetchCutBatchCapacityContext(queryable, cutBatchId) {
  const batchResult = await queryable.query(
    `
    SELECT
      b.cut_batch_id,
      b.tape_id,
      b.shape,
      b.diameter_mm,
      b.length_mm,
      b.width_mm,
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
      ) AS coating_sidedness
    FROM electrode_cut_batches b
    WHERE b.cut_batch_id = $1
    `,
    [cutBatchId]
  );

  if (!batchResult.rowCount) {
    return null;
  }

  const batch = batchResult.rows[0];

  const recipeLinesResult = await queryable.query(
    `
    SELECT
      rl.recipe_line_id,
      rl.recipe_role,
      rl.include_in_pct,
      rl.slurry_percent,
      m.name AS material_name,
      a.measure_mode,
      a.actual_volume_ml,
      a.actual_mass_g,
      mp.specific_capacity_mah_g,
      mp.density_g_ml
    FROM electrode_cut_batches b
    JOIN tapes t
      ON t.tape_id = b.tape_id
    JOIN tape_recipe_lines rl
      ON rl.tape_recipe_id = t.tape_recipe_id
    JOIN materials m
      ON m.material_id = rl.material_id
    LEFT JOIN tape_recipe_line_actuals a
      ON a.tape_id = t.tape_id
     AND a.recipe_line_id = rl.recipe_line_id
    LEFT JOIN material_properties mp
      ON mp.material_instance_id = a.material_instance_id
    WHERE b.cut_batch_id = $1
    ORDER BY rl.recipe_role, rl.recipe_line_id
    `,
    [cutBatchId]
  );

  const rows = recipeLinesResult.rows;
  const activeLine = rows.find(
    (line) => line.recipe_role === 'cathode_active' || line.recipe_role === 'anode_active'
  ) || null;

  const totalDryPercent = rows
    .filter((line) => line.include_in_pct)
    .reduce((sum, line) => sum + Number(line.slurry_percent || 0), 0);

  const activePercent = toFiniteNumberOrNull(activeLine?.slurry_percent);
  const activeFractionTheoretical =
    Number.isFinite(activePercent) &&
    Number.isFinite(totalDryPercent) &&
    totalDryPercent > 0
      ? activePercent / totalDryPercent
      : null;

  const actualSolidsRows = rows.filter((line) =>
    Number.isFinite(getEffectiveActualMass(line)) &&
    line.recipe_role !== 'solvent'
  );

  const actualSolidsMass = actualSolidsRows.reduce((sum, line) => {
    const effectiveMass = getEffectiveActualMass(line);
    return sum + (Number.isFinite(effectiveMass) ? effectiveMass : 0);
  }, 0);

  const actualActiveMass = getEffectiveActualMass(activeLine);

  let activeFractionActual = null;
  let actualFractionStatus = 'missing';

  if (Number.isFinite(actualActiveMass) && actualSolidsMass > 0) {
    activeFractionActual = actualActiveMass / actualSolidsMass;
    actualFractionStatus = 'complete';
  } else if (actualSolidsRows.length > 0) {
    actualFractionStatus = 'incomplete';
  }

  const foilMassResult = await queryable.query(
    `
    SELECT mass_g
    FROM foil_mass_measurements
    WHERE cut_batch_id = $1
    ORDER BY foil_measurement_id
    `,
    [cutBatchId]
  );

  const foilMasses = foilMassResult.rows
    .map((row) => toFiniteNumberOrNull(row.mass_g))
    .filter((value) => Number.isFinite(value));

  const averageFoilMass = averageOfFinite(foilMasses);
  const electrodeAreaMm2 = calculateCutBatchAreaMm2(batch);
  const electrodeAreaCm2 =
    Number.isFinite(electrodeAreaMm2) ? electrodeAreaMm2 / 100 : null;

  return {
    cut_batch_id: batch.cut_batch_id,
    tape_id: batch.tape_id,
    active_material_name: activeLine?.material_name || null,
    active_recipe_role: activeLine?.recipe_role || null,
    specific_capacity_mAh_g: toFiniteNumberOrNull(activeLine?.specific_capacity_mah_g),
    active_fraction_theoretical: activeFractionTheoretical,
    active_fraction_actual: activeFractionActual,
    actual_fraction_status: actualFractionStatus,
    average_foil_mass_g: averageFoilMass,
    foil_measurement_count: foilMasses.length,
    electrode_area_mm2: electrodeAreaMm2,
    electrode_area_cm2: electrodeAreaCm2,
    coating_sidedness: batch.coating_sidedness || null,
    side_count: getSideCountFromSidedness(batch.coating_sidedness)
  };
}

async function enrichBatteryElectrodesWithCapacity(queryable, rows) {
  const inputRows = Array.isArray(rows) ? rows : [];
  const cutBatchIds = [...new Set(
    inputRows
      .map((row) => Number(row.cut_batch_id))
      .filter((value) => Number.isInteger(value))
  )];

  const contextEntries = await Promise.all(
    cutBatchIds.map(async (cutBatchId) => [cutBatchId, await fetchCutBatchCapacityContext(queryable, cutBatchId)])
  );
  const contextByBatchId = new Map(contextEntries);

  return inputRows.map((row) => {
    const context = contextByBatchId.get(Number(row.cut_batch_id)) || null;
    const derived = context ? computeElectrodeDerivedValues(row, context) : {
      coating_mass_g: null,
      active_material_mass_theoretical_g: null,
      active_material_mass_actual_g: null,
      capacity_theoretical_mAh: null,
      capacity_actual_mAh: null
    };

    return {
      ...row,
      ...derived,
      coating_sidedness: context?.coating_sidedness || null,
      active_material_name: context?.active_material_name || null,
      specific_capacity_mAh_g: context?.specific_capacity_mAh_g ?? null
    };
  });
}

function buildBatteryCapacitySummary(rows) {
  const inputRows = Array.isArray(rows) ? rows : [];
  const cathodes = inputRows.filter((row) => row.role === 'cathode');
  const anodes = inputRows.filter((row) => row.role === 'anode');

  const cathodeCapacityTheoretical = sumOfFinite(cathodes.map((row) => toFiniteNumberOrNull(row.capacity_theoretical_mAh)));
  const cathodeCapacityActual = sumOfFinite(cathodes.map((row) => toFiniteNumberOrNull(row.capacity_actual_mAh)));
  const anodeCapacityTheoretical = sumOfFinite(anodes.map((row) => toFiniteNumberOrNull(row.capacity_theoretical_mAh)));
  const anodeCapacityActual = sumOfFinite(anodes.map((row) => toFiniteNumberOrNull(row.capacity_actual_mAh)));
  const cathodeAreaCm2 = sumElectrodeAreasCm2(cathodes);
  const anodeAreaCm2 = sumElectrodeAreasCm2(anodes);

  const limitingCapacityTheoretical =
    Number.isFinite(cathodeCapacityTheoretical) && Number.isFinite(anodeCapacityTheoretical)
      ? Math.min(cathodeCapacityTheoretical, anodeCapacityTheoretical)
      : Number.isFinite(cathodeCapacityTheoretical)
        ? cathodeCapacityTheoretical
        : Number.isFinite(anodeCapacityTheoretical)
          ? anodeCapacityTheoretical
          : null;

  const limitingCapacityActual =
    Number.isFinite(cathodeCapacityActual) && Number.isFinite(anodeCapacityActual)
      ? Math.min(cathodeCapacityActual, anodeCapacityActual)
      : Number.isFinite(cathodeCapacityActual)
        ? cathodeCapacityActual
        : Number.isFinite(anodeCapacityActual)
          ? anodeCapacityActual
          : null;

  const npTheoretical =
    Number.isFinite(cathodeCapacityTheoretical) &&
    cathodeCapacityTheoretical > 0 &&
    Number.isFinite(anodeCapacityTheoretical)
      ? anodeCapacityTheoretical / cathodeCapacityTheoretical
      : null;

  const npActual =
    Number.isFinite(cathodeCapacityActual) &&
    cathodeCapacityActual > 0 &&
    Number.isFinite(anodeCapacityActual)
      ? anodeCapacityActual / cathodeCapacityActual
      : null;

  const cathodeArealCapacityTheoretical = calculateArealCapacity(cathodeCapacityTheoretical, cathodeAreaCm2);
  const cathodeArealCapacityActual = calculateArealCapacity(cathodeCapacityActual, cathodeAreaCm2);
  const anodeArealCapacityTheoretical = calculateArealCapacity(anodeCapacityTheoretical, anodeAreaCm2);
  const anodeArealCapacityActual = calculateArealCapacity(anodeCapacityActual, anodeAreaCm2);
  const limitingAreaTheoretical = pickLimitingArea({
    cathodeCapacity: cathodeCapacityTheoretical,
    cathodeArea: cathodeAreaCm2,
    anodeCapacity: anodeCapacityTheoretical,
    anodeArea: anodeAreaCm2
  });
  const limitingAreaActual = pickLimitingArea({
    cathodeCapacity: cathodeCapacityActual,
    cathodeArea: cathodeAreaCm2,
    anodeCapacity: anodeCapacityActual,
    anodeArea: anodeAreaCm2
  });
  const limitingArealCapacityTheoretical = calculateArealCapacity(limitingCapacityTheoretical, limitingAreaTheoretical);
  const limitingArealCapacityActual = calculateArealCapacity(limitingCapacityActual, limitingAreaActual);

  return {
    cathode_count: cathodes.length,
    anode_count: anodes.length,
    cathode_capacity_theoretical_mAh: cathodeCapacityTheoretical,
    cathode_capacity_actual_mAh: cathodeCapacityActual,
    anode_capacity_theoretical_mAh: anodeCapacityTheoretical,
    anode_capacity_actual_mAh: anodeCapacityActual,
    limiting_capacity_theoretical_mAh: limitingCapacityTheoretical,
    limiting_capacity_actual_mAh: limitingCapacityActual,
    np_theoretical: npTheoretical,
    np_actual: npActual,
    cathode_area_cm2: cathodeAreaCm2,
    anode_area_cm2: anodeAreaCm2,
    cathode_areal_capacity_theoretical_mAh_cm2: cathodeArealCapacityTheoretical,
    cathode_areal_capacity_actual_mAh_cm2: cathodeArealCapacityActual,
    anode_areal_capacity_theoretical_mAh_cm2: anodeArealCapacityTheoretical,
    anode_areal_capacity_actual_mAh_cm2: anodeArealCapacityActual,
    limiting_areal_capacity_theoretical_mAh_cm2: limitingArealCapacityTheoretical,
    limiting_areal_capacity_actual_mAh_cm2: limitingArealCapacityActual
  };
}

module.exports = {
  buildBatteryCapacitySummary,
  enrichBatteryElectrodesWithCapacity
};
