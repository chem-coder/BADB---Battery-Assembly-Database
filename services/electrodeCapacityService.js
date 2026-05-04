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

function getFallbackComponent(line) {
  const materialId = Number(line?.material_id);
  if (!Number.isInteger(materialId)) return [];
  return [{
    material_id: materialId,
    material_role: line?.material_role || null,
    mass_fraction: 1
  }];
}

function getLineComponents(line, componentsByInstanceId) {
  const selectedInstanceId = Number(line?.material_instance_id);
  if (Number.isInteger(selectedInstanceId) && componentsByInstanceId.has(selectedInstanceId)) {
    return componentsByInstanceId.get(selectedInstanceId);
  }
  return getFallbackComponent(line);
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

  const arealCapacityTheoretical =
    Number.isFinite(capacityTheoretical) && Number.isFinite(electrodeAreaCm2) && electrodeAreaCm2 > 0
      ? capacityTheoretical / electrodeAreaCm2
      : null;

  const arealCapacityActual =
    Number.isFinite(capacityActual) && Number.isFinite(electrodeAreaCm2) && electrodeAreaCm2 > 0
      ? capacityActual / electrodeAreaCm2
      : null;

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
    areal_capacity_theoretical_mAh_cm2: Number.isFinite(arealCapacityTheoretical) ? arealCapacityTheoretical : null,
    areal_capacity_actual_mAh_cm2: Number.isFinite(arealCapacityActual) ? arealCapacityActual : null,
    capacity_per_side_actual_mAh_cm2: Number.isFinite(capacityPerSideActual) ? capacityPerSideActual : null
  };
}

function buildBatchCapacitySummary(electrodes, capacityContext) {
  const usableElectrodes = (Array.isArray(electrodes) ? electrodes : []).filter((row) => Number(row.status_code) !== 3);

  const averageCoatingMass = averageOfFinite(usableElectrodes.map((row) => toFiniteNumberOrNull(row.coating_mass_g)));
  const averageActiveMaterialMassTheoretical = averageOfFinite(usableElectrodes.map((row) => toFiniteNumberOrNull(row.active_material_mass_theoretical_g)));
  const averageActiveMaterialMassActual = averageOfFinite(usableElectrodes.map((row) => toFiniteNumberOrNull(row.active_material_mass_actual_g)));
  const averageCapacityTheoretical = averageOfFinite(usableElectrodes.map((row) => toFiniteNumberOrNull(row.capacity_theoretical_mAh)));
  const averageCapacityActual = averageOfFinite(usableElectrodes.map((row) => toFiniteNumberOrNull(row.capacity_actual_mAh)));
  const electrodeAreaCm2 = toFiniteNumberOrNull(capacityContext?.electrode_area_cm2);
  const sideCount = toFiniteNumberOrNull(capacityContext?.side_count);

  const arealCapacityTheoretical =
    Number.isFinite(averageCapacityTheoretical) && Number.isFinite(electrodeAreaCm2) && electrodeAreaCm2 > 0
      ? averageCapacityTheoretical / electrodeAreaCm2
      : null;
  const arealCapacityActual =
    Number.isFinite(averageCapacityActual) && Number.isFinite(electrodeAreaCm2) && electrodeAreaCm2 > 0
      ? averageCapacityActual / electrodeAreaCm2
      : null;

  const capacityPerSideTheoretical =
    Number.isFinite(arealCapacityTheoretical) && Number.isFinite(sideCount) && sideCount > 1
      ? arealCapacityTheoretical / sideCount
      : null;
  const capacityPerSideActual =
    Number.isFinite(arealCapacityActual) && Number.isFinite(sideCount) && sideCount > 1
      ? arealCapacityActual / sideCount
      : null;

  return {
    active_material_name: capacityContext?.active_material_name || null,
    active_material_instance_id: capacityContext?.active_material_instance_id ?? null,
    specific_capacity_mAh_g: toFiniteNumberOrNull(capacityContext?.specific_capacity_mAh_g),
    active_fraction_theoretical: toFiniteNumberOrNull(capacityContext?.active_fraction_theoretical),
    active_fraction_actual: toFiniteNumberOrNull(capacityContext?.active_fraction_actual),
    actual_fraction_status: capacityContext?.actual_fraction_status || null,
    average_foil_mass_g: toFiniteNumberOrNull(capacityContext?.average_foil_mass_g),
    foil_measurement_count: Number(capacityContext?.foil_measurement_count) || 0,
    electrode_area_mm2: toFiniteNumberOrNull(capacityContext?.electrode_area_mm2),
    electrode_area_cm2: toFiniteNumberOrNull(capacityContext?.electrode_area_cm2),
    coating_sidedness: capacityContext?.coating_sidedness || null,
    side_count: Number(capacityContext?.side_count) || null,
    average_coating_mass_g: averageCoatingMass,
    average_active_material_mass_theoretical_g: averageActiveMaterialMassTheoretical,
    average_active_material_mass_actual_g: averageActiveMaterialMassActual,
    average_capacity_theoretical_mAh: averageCapacityTheoretical,
    average_capacity_actual_mAh: averageCapacityActual,
    areal_capacity_theoretical_mAh_cm2: arealCapacityTheoretical,
    areal_capacity_actual_mAh_cm2: arealCapacityActual,
    capacity_per_side_theoretical_mAh_cm2: capacityPerSideTheoretical,
    capacity_per_side_actual_mAh_cm2: capacityPerSideActual,
    included_electrode_count: usableElectrodes.length,
    included_capacity_theoretical_count: usableElectrodes.filter((row) => Number.isFinite(toFiniteNumberOrNull(row.capacity_theoretical_mAh))).length,
    included_capacity_actual_count: usableElectrodes.filter((row) => Number.isFinite(toFiniteNumberOrNull(row.capacity_actual_mAh))).length
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
      rl.material_id,
      rl.recipe_role,
      rl.include_in_pct,
      rl.slurry_percent,
      m.name AS material_name,
      m.role AS material_role,
      a.material_instance_id,
      mi.name AS instance_name,
      a.measure_mode,
      a.actual_mass_g,
      a.actual_volume_ml,
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
    LEFT JOIN material_instances mi
      ON mi.material_instance_id = a.material_instance_id
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
    totalDryPercent > 0 &&
    activePercent >= 0
      ? activePercent / totalDryPercent
      : null;

  const selectedInstanceIds = rows
    .map((row) => Number(row.material_instance_id))
    .filter((value) => Number.isInteger(value));

  const componentsByInstanceId = new Map();

  if (selectedInstanceIds.length) {
    const componentsResult = await queryable.query(
      `
      SELECT
        mic.parent_material_instance_id,
        mi.material_id,
        m.role AS material_role,
        mic.mass_fraction
      FROM material_instance_components mic
      JOIN material_instances mi
        ON mi.material_instance_id = mic.component_material_instance_id
      JOIN materials m
        ON m.material_id = mi.material_id
      WHERE mic.parent_material_instance_id = ANY($1::int[])
      ORDER BY mic.parent_material_instance_id, mic.material_instance_component_id
      `,
      [selectedInstanceIds]
    );

    componentsResult.rows.forEach((row) => {
      const instanceId = Number(row.parent_material_instance_id);
      if (!componentsByInstanceId.has(instanceId)) {
        componentsByInstanceId.set(instanceId, []);
      }
      componentsByInstanceId.get(instanceId).push({
        material_id: Number(row.material_id),
        material_role: row.material_role || null,
        mass_fraction: Number(row.mass_fraction)
      });
    });
  }

  const activeMaterialId = Number(activeLine?.material_id);
  let totalActualSolidsMass = 0;
  let actualActiveMaterialMass = 0;
  let hasUsableActuals = false;

  rows.forEach((line) => {
    const actualMass = getEffectiveActualMass(line);
    if (!(Number.isFinite(actualMass) && actualMass > 0)) return;

    hasUsableActuals = true;

    const components = getLineComponents(line, componentsByInstanceId);
    components.forEach((component) => {
      const fraction = toFiniteNumberOrNull(component.mass_fraction);
      if (!(Number.isFinite(fraction) && fraction > 0)) return;
      if (component.material_role === 'solvent') return;

      const componentMass = actualMass * fraction;
      totalActualSolidsMass += componentMass;

      if (Number.isInteger(activeMaterialId) && Number(component.material_id) === activeMaterialId) {
        actualActiveMaterialMass += componentMass;
      }
    });
  });

  const actualFractionStatus =
    !hasUsableActuals ? 'unavailable'
    : !(totalActualSolidsMass > 0) ? 'incomplete'
    : !(actualActiveMaterialMass >= 0) ? 'incomplete'
    : 'complete';

  const activeFractionActual =
    totalActualSolidsMass > 0
      ? actualActiveMaterialMass / totalActualSolidsMass
      : null;

  const foilStatsResult = await queryable.query(
    `
    SELECT
      AVG(mass_g) AS average_foil_mass_g,
      COUNT(*)::int AS foil_measurement_count
    FROM foil_mass_measurements
    WHERE cut_batch_id = $1
    `,
    [cutBatchId]
  );

  const foilStats = foilStatsResult.rows[0] || {};
  const electrodeAreaMm2 = calculateCutBatchAreaMm2(batch);
  const electrodeAreaCm2 = Number.isFinite(electrodeAreaMm2) ? electrodeAreaMm2 / 100 : null;
  const coatingSidedness = batch.coating_sidedness || null;
  const sideCount = getSideCountFromSidedness(coatingSidedness);

  return {
    cut_batch_id: batch.cut_batch_id,
    tape_id: batch.tape_id,
    active_material_name: activeLine?.instance_name || activeLine?.material_name || null,
    active_material_instance_id: Number(activeLine?.material_instance_id) || null,
    specific_capacity_mAh_g: toFiniteNumberOrNull(activeLine?.specific_capacity_mah_g),
    active_fraction_theoretical: activeFractionTheoretical,
    active_fraction_actual: Number.isFinite(activeFractionActual) ? activeFractionActual : null,
    actual_fraction_status: actualFractionStatus,
    average_foil_mass_g: toFiniteNumberOrNull(foilStats.average_foil_mass_g),
    foil_measurement_count: Number(foilStats.foil_measurement_count) || 0,
    electrode_area_mm2: electrodeAreaMm2,
    electrode_area_cm2: electrodeAreaCm2,
    coating_sidedness: coatingSidedness,
    side_count: sideCount
  };
}

module.exports = {
  buildBatchCapacitySummary,
  computeElectrodeDerivedValues,
  fetchCutBatchCapacityContext
};
