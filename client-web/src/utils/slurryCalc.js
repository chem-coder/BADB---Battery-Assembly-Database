/**
 * slurryCalc — pure slurry-planning math for the tape weighing view.
 *
 * Port of vanilla public/js/1-tapes.js:
 *   recalculatePlannedMasses (:3211), expandInstanceComponentsForPlanning
 *   (:3056), buildMixtureComputationOrder (:3136),
 *   computeSlurrySolidsSummary (:1088), collectSelectedSolventMaterials
 *   (:1159), formatActualDerivedInfo (:970)
 *
 * One deliberate upgrade over vanilla (Dalia, 2026-07-30 review): the
 * ACTUAL weighed mass of the active material, once entered, becomes the
 * pivot for every other line's target — targets follow the real AM mass
 * in real time. While the actual AM mass is blank, targets derive from
 * the tape's target quantity exactly like vanilla.
 *
 * All functions are pure: inputs are plain data, no fetching. When a
 * needed instance composition is not present in componentsByInstanceId,
 * results carry `pending: true` and `pendingInstanceIds` so the caller
 * can fetch and recompute.
 */

const ACTIVE_ROLES = new Set(['cathode_active', 'anode_active'])

function toNum(v) {
  if (v === '' || v == null) return NaN
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

export function isActiveLine(line) {
  return ACTIVE_ROLES.has(line?.recipe_role)
}

// d047 — the active line may be an open slot (material_id null); the
// material then comes from the tape (slotMaterialId).
export function lineMaterialId(line, slotMaterialId) {
  if (line?.material_id != null) return Number(line.material_id)
  if (isActiveLine(line) && slotMaterialId != null && slotMaterialId !== '') {
    return Number(slotMaterialId)
  }
  return NaN
}

// ── Component expansion (vanilla expandInstanceComponentsForPlanning) ──

function aggregateByMaterial(components) {
  const byId = new Map()
  for (const c of components) {
    const mid = Number(c.material_id ?? c.component_material_id)
    const frac = Number(c.mass_fraction)
    if (!Number.isFinite(mid) || !Number.isFinite(frac) || frac <= 0) continue
    const prev = byId.get(mid)
    if (prev) prev.mass_fraction += frac
    else byId.set(mid, { ...c, material_id: mid, mass_fraction: frac })
  }
  return Array.from(byId.values())
}

/**
 * Expand an instance into flat per-material fractions, recursing into
 * nested component instances. componentsByInstanceId[id] === undefined
 * means "not loaded yet" → pending; an empty array means "pure".
 */
export function expandInstanceComponents(instanceId, fallback, componentsByInstanceId, seen = new Set()) {
  if (!instanceId) {
    return { components: aggregateByMaterial([fallback]), pending: false, pendingInstanceIds: [] }
  }
  const key = String(instanceId)
  if (!(key in componentsByInstanceId)) {
    return { components: [], pending: true, pendingInstanceIds: [key] }
  }
  const direct = componentsByInstanceId[key] || []
  if (!Array.isArray(direct) || direct.length === 0) {
    return { components: aggregateByMaterial([fallback]), pending: false, pendingInstanceIds: [] }
  }

  const nextSeen = new Set(seen)
  nextSeen.add(key)
  const expanded = []
  const pendingIds = []

  for (const component of direct) {
    const componentFraction = Number(component.mass_fraction)
    if (!Number.isFinite(componentFraction) || componentFraction <= 0) continue

    const nestedId = component.component_material_instance_id
    if (nestedId && !nextSeen.has(String(nestedId))) {
      const nested = expandInstanceComponents(
        nestedId,
        {
          component_material_instance_id: nestedId,
          component_name: component.component_name || component.material_name || '',
          material_id: Number(component.material_id ?? component.component_material_id),
          material_name: component.material_name || component.component_name || '',
          material_role: component.material_role || null,
          mass_fraction: 1,
        },
        componentsByInstanceId,
        nextSeen
      )
      if (nested.pending) {
        pendingIds.push(...nested.pendingInstanceIds)
        continue
      }
      for (const nc of nested.components) {
        const nf = Number(nc.mass_fraction)
        if (!Number.isFinite(nf) || nf <= 0) continue
        expanded.push({ ...nc, mass_fraction: componentFraction * nf })
      }
      continue
    }
    expanded.push(component)
  }

  if (pendingIds.length) {
    return { components: [], pending: true, pendingInstanceIds: pendingIds }
  }
  return { components: aggregateByMaterial(expanded), pending: false, pendingInstanceIds: [] }
}

// ── Computation order (vanilla buildMixtureComputationOrder) ──
// Mixtures that CONTRIBUTE other targeted materials must be computed
// before the lines of those materials (overlap accounting).

export function buildComputationOrder(lines, expandedByLineId, targetDryByMaterialId, slotMaterialId) {
  const materialLineIndexes = new Map()
  lines.forEach((line, index) => {
    const mid = lineMaterialId(line, slotMaterialId)
    if (!Number.isFinite(mid) || targetDryByMaterialId[mid] == null) return
    if (!materialLineIndexes.has(mid)) materialLineIndexes.set(mid, [])
    materialLineIndexes.get(mid).push(index)
  })

  const outgoing = new Map(lines.map((_, i) => [i, new Set()]))
  const incoming = new Map(lines.map((_, i) => [i, 0]))

  lines.forEach((line, sourceIndex) => {
    const lineMid = lineMaterialId(line, slotMaterialId)
    const components = expandedByLineId.get(Number(line.recipe_line_id)) || []
    for (const c of components) {
      const cmid = Number(c.material_id ?? c.component_material_id)
      if (!Number.isFinite(cmid) || cmid === lineMid) continue
      if (targetDryByMaterialId[cmid] == null) continue
      for (const dep of materialLineIndexes.get(cmid) || []) {
        if (dep === sourceIndex || outgoing.get(sourceIndex).has(dep)) continue
        outgoing.get(sourceIndex).add(dep)
        incoming.set(dep, (incoming.get(dep) || 0) + 1)
      }
    }
  })

  const available = lines.map((_, i) => i).filter(i => (incoming.get(i) || 0) === 0)
  const ordered = []
  while (available.length) {
    available.sort((a, b) => a - b)
    const index = available.shift()
    ordered.push(index)
    for (const dep of Array.from(outgoing.get(index) || []).sort((a, b) => a - b)) {
      const next = (incoming.get(dep) || 0) - 1
      incoming.set(dep, next)
      if (next === 0) available.push(dep)
    }
  }
  if (ordered.length < lines.length) {
    const seen = new Set(ordered)
    lines.forEach((_, i) => { if (!seen.has(i)) ordered.push(i) })
  }
  return ordered
}

// ── Effective actual mass of a line (vanilla getEffectiveActualMassForLine) ──

export function effectiveActualMass(actual, density) {
  if (!actual) return { mass: null, missingDensity: false }
  const mode = actual.mode || actual.measure_mode || 'mass'
  const value = toNum(actual.value ?? (mode === 'volume' ? actual.actual_volume_ml : actual.actual_mass_g))
  if (!(Number.isFinite(value) && value > 0)) return { mass: null, missingDensity: false }
  if (mode === 'volume') {
    const d = Number(density)
    if (!(Number.isFinite(d) && d > 0)) return { mass: null, missingDensity: true }
    return { mass: value * d, missingDensity: false }
  }
  return { mass: value, missingDensity: false }
}

// ── The plan (vanilla recalculatePlannedMasses + actual-AM pivot) ──

export function computeSlurryPlan({
  lines = [],
  selectedInstanceByLineId = {},
  componentsByInstanceId = {},
  actualsByLineId = {},
  densityByLineId = {},
  calcMode = 'from_active_mass',
  targetMass,
  slotMaterialId = null,
}) {
  const empty = {
    ready: false, pending: false, pendingInstanceIds: [],
    pivot: 'target', activeActualMass: null, totalDryMass: null,
    percentByLineId: {}, targetDryByLineId: {}, plannedByLineId: {}, expandedRows: [],
  }
  if (!lines.length) return empty

  const activeLine = lines.find(isActiveLine)
  if (!activeLine) return empty
  const activePercent = Number(activeLine.slurry_percent)
  if (!Number.isFinite(activePercent) || activePercent <= 0 || activePercent > 100) return empty

  const percentByLineId = {}
  for (const l of lines) {
    const p = Number(l.slurry_percent)
    percentByLineId[l.recipe_line_id] = l.include_in_pct && Number.isFinite(p) ? p : null
  }

  // -- pivot: actual AM dry mass when entered (Dalia's real-time rule) --
  let target = null
  let pivot = 'target'
  let activeActualMass = null

  const activeLineId = Number(activeLine.recipe_line_id)
  const activeInstanceId = selectedInstanceByLineId[activeLineId] || selectedInstanceByLineId[String(activeLineId)]
  const activeActual = actualsByLineId[activeLineId] || actualsByLineId[String(activeLineId)]
  const { mass: activeWetMass } = effectiveActualMass(activeActual, densityByLineId[activeLineId])

  if (Number.isFinite(activeWetMass) && activeWetMass > 0) {
    // Dry AM inside the weighed instance: fraction of the AM material in
    // the chosen instance (1 for a pure instance / unknown composition).
    const amMid = lineMaterialId(activeLine, slotMaterialId)
    let fraction = 1
    if (activeInstanceId) {
      const exp = expandInstanceComponents(
        activeInstanceId,
        { material_id: amMid, material_name: activeLine.material_name, material_role: activeLine.recipe_role, mass_fraction: 1 },
        componentsByInstanceId
      )
      if (!exp.pending) {
        const m = exp.components.find(c => Number(c.material_id) === amMid)
        if (m && Number.isFinite(Number(m.mass_fraction)) && Number(m.mass_fraction) > 0) {
          fraction = Number(m.mass_fraction)
        }
      }
    }
    target = activeWetMass * fraction
    pivot = 'actual_am'
    activeActualMass = activeWetMass
  } else {
    const inputValue = toNum(targetMass)
    if (!(Number.isFinite(inputValue) && inputValue > 0)) return { ...empty, percentByLineId }
    if (calcMode === 'from_active_mass') {
      target = inputValue
    } else if (calcMode === 'from_slurry_mass') {
      const totalDryPercent = lines
        .filter(l => l.include_in_pct)
        .reduce((sum, l) => sum + (Number(l.slurry_percent) || 0), 0)
      if (!Number.isFinite(totalDryPercent) || totalDryPercent <= 0 || totalDryPercent > 100) {
        return { ...empty, percentByLineId }
      }
      target = inputValue * (totalDryPercent / 100) * (activePercent / totalDryPercent)
    } else {
      return { ...empty, percentByLineId }
    }
  }

  if (!(Number.isFinite(target) && target > 0)) return { ...empty, percentByLineId }
  const totalDryMass = target / (activePercent / 100)

  // -- dry targets per material --
  const targetDryByMaterialId = {}
  for (const l of lines) {
    if (!l.include_in_pct) continue
    const pct = Number(l.slurry_percent)
    if (!Number.isFinite(pct) || pct <= 0) continue
    const mid = lineMaterialId(l, slotMaterialId)
    if (!Number.isFinite(mid)) continue
    targetDryByMaterialId[mid] = (targetDryByMaterialId[mid] || 0) + totalDryMass * (pct / 100)
  }

  const targetDryByLineId = {}
  for (const l of lines) {
    const mid = lineMaterialId(l, slotMaterialId)
    const v = targetDryByMaterialId[mid]
    targetDryByLineId[l.recipe_line_id] = Number.isFinite(v) ? v : null
  }

  // -- expansion per line (with pending detection) --
  const expandedByLineId = new Map()
  const pendingIds = new Set()
  for (const l of lines) {
    const lid = Number(l.recipe_line_id)
    const instId = selectedInstanceByLineId[lid] || selectedInstanceByLineId[String(lid)]
    if (!instId) continue
    const mid = lineMaterialId(l, slotMaterialId)
    const exp = expandInstanceComponents(
      instId,
      { material_id: mid, material_name: l.material_name, material_role: l.recipe_role, mass_fraction: 1 },
      componentsByInstanceId
    )
    if (exp.pending) { exp.pendingInstanceIds.forEach(id => pendingIds.add(id)); continue }
    expandedByLineId.set(lid, exp.components)
  }
  if (pendingIds.size) {
    return {
      ...empty, percentByLineId, targetDryByLineId, totalDryMass, pivot, activeActualMass,
      pending: true, pendingInstanceIds: Array.from(pendingIds),
    }
  }

  // -- planned instance masses with overlap accounting --
  const remaining = { ...targetDryByMaterialId }
  const plannedByLineId = {}
  const expandedRows = []
  const order = buildComputationOrder(lines, expandedByLineId, targetDryByMaterialId, slotMaterialId)

  for (const idx of order) {
    const l = lines[idx]
    const lid = Number(l.recipe_line_id)
    const instId = selectedInstanceByLineId[lid] || selectedInstanceByLineId[String(lid)]
    if (!instId) { plannedByLineId[lid] = null; continue }

    const mid = lineMaterialId(l, slotMaterialId)
    const needDry = Number(remaining[mid] || 0)
    if (!Number.isFinite(needDry) || needDry <= 0) {
      // material already satisfied by an earlier mixture
      plannedByLineId[lid] = (mid in remaining) ? 0 : null
      continue
    }

    const components = expandedByLineId.get(lid) || []
    const match = components.find(c => Number(c.material_id ?? c.component_material_id) === mid)
    const fLine = match ? Number(match.mass_fraction) : NaN
    if (!Number.isFinite(fLine) || fLine <= 0) { plannedByLineId[lid] = null; continue }

    const instanceMass = needDry / fLine
    plannedByLineId[lid] = instanceMass

    expandedRows.push({
      lineId: lid,
      role: l.recipe_role,
      material: l.material_name,
      instanceMass,
      components: components.map(c => ({
        material_name: c.material_name || c.component_name || '',
        fraction: Number(c.mass_fraction) > 0 ? Number(c.mass_fraction) : 0,
        mass: instanceMass * (Number(c.mass_fraction) > 0 ? Number(c.mass_fraction) : 0),
      })),
    })

    // overlap: subtract SOLID contributions from remaining targets
    for (const c of components) {
      const frac = Number(c.mass_fraction)
      if (!Number.isFinite(frac)) continue
      if (c.material_role === 'solvent') continue
      const cmid = Number(c.material_id ?? c.component_material_id)
      if (!Number.isFinite(cmid) || remaining[cmid] == null) continue
      remaining[cmid] = Math.max(0, remaining[cmid] - instanceMass * frac)
    }
  }

  expandedRows.sort((a, b) =>
    lines.findIndex(l => Number(l.recipe_line_id) === a.lineId) -
    lines.findIndex(l => Number(l.recipe_line_id) === b.lineId))

  return {
    ready: true, pending: false, pendingInstanceIds: [],
    pivot, activeActualMass, totalDryMass,
    percentByLineId, targetDryByLineId, plannedByLineId, expandedRows,
  }
}

// ── Solids summary (vanilla computeSlurrySolidsSummary) ──

export function computeSolidsSummary({
  lines = [],
  selectedInstanceByLineId = {},
  componentsByInstanceId = {},
  actualsByLineId = {},
  densityByLineId = {},
}) {
  let totalWetMass = 0
  let totalSolidsMass = 0
  let hasActualMass = false
  let missingDensity = false
  let pendingComposition = false

  for (const l of lines) {
    const lid = Number(l.recipe_line_id)
    const res = effectiveActualMass(actualsByLineId[lid] || actualsByLineId[String(lid)], densityByLineId[lid])
    if (res.missingDensity) { missingDensity = true; continue }
    if (!(Number.isFinite(res.mass) && res.mass > 0)) continue
    hasActualMass = true
    totalWetMass += res.mass

    if (l.recipe_role === 'solvent') continue // contributes 0 solids

    const instId = selectedInstanceByLineId[lid] || selectedInstanceByLineId[String(lid)]
    if (instId && !(String(instId) in componentsByInstanceId)) { pendingComposition = true; continue }
    let components = instId ? componentsByInstanceId[String(instId)] : null
    if (!Array.isArray(components) || components.length === 0) {
      components = [{ material_role: l.recipe_role, mass_fraction: 1 }]
    }
    for (const c of components) {
      const frac = Number(c.mass_fraction)
      if (!Number.isFinite(frac) || frac <= 0) continue
      if (c.material_role === 'solvent') continue
      totalSolidsMass += res.mass * frac
    }
  }

  if (!hasActualMass || !(totalWetMass > 0)) {
    return { status: 'empty', text: 'Содержание твердых компонентов: —', detail: 'Введите фактические значения для расчёта.' }
  }
  if (missingDensity) {
    return { status: 'incomplete', text: 'Содержание твердых компонентов: —', detail: 'Для расчёта массы из объёма нужна плотность выбранного экземпляра материала.' }
  }
  if (pendingComposition) {
    return { status: 'incomplete', text: 'Содержание твердых компонентов: —', detail: 'Загружается состав выбранных экземпляров материалов.' }
  }
  const pct = (totalSolidsMass / totalWetMass) * 100
  const fmt = (v) => Number.isFinite(v) ? v.toFixed(4).replace(/\.?0+$/, '') : '—'
  return {
    status: 'complete',
    text: `Содержание твердых компонентов: ${pct.toFixed(2)} %`,
    detail: `масса сухих компонентов ${fmt(totalSolidsMass)} г / общая масса ${fmt(totalWetMass)} г`,
  }
}

// ── Solvent compatibility (vanilla collectSelectedSolventMaterials) ──

export function collectSolventWarning({
  lines = [],
  selectedInstanceByLineId = {},
  componentsByInstanceId = {},
}) {
  const byId = new Map()
  const add = (materialId, name) => {
    const id = Number(materialId)
    if (!Number.isFinite(id)) return
    if (!byId.has(id)) byId.set(id, name || `ID ${id}`)
  }
  for (const l of lines) {
    const lid = Number(l.recipe_line_id)
    const instId = selectedInstanceByLineId[lid] || selectedInstanceByLineId[String(lid)]
    if (!instId) continue
    if (l.recipe_role === 'solvent') add(l.material_id, l.material_name)
    const components = componentsByInstanceId[String(instId)]
    if (!Array.isArray(components)) continue // not cached — skip silently
    for (const c of components) {
      if (c.material_role !== 'solvent') continue
      add(c.material_id ?? c.component_material_id, c.material_name || c.component_name)
    }
  }
  const names = Array.from(byId.values())
  return {
    mismatch: names.length > 1,
    names,
    text: names.length > 1
      ? `Внимание: выбраны материалы с разными растворителями: ${names.join(' и ')} — проверьте совместимость связующего и растворителя.`
      : '',
  }
}

// ── ≈-conversion (vanilla formatActualDerivedInfo) ──

export function deriveConversion({ mode, value, density }) {
  const v = toNum(value)
  if (!(Number.isFinite(v) && v > 0)) return { text: '', tone: 'neutral' }
  const d = Number(density)
  if (!(Number.isFinite(d) && d > 0)) {
    if (mode === 'volume') {
      return { text: 'Плотность не указана: масса не рассчитана автоматически.', tone: 'warning' }
    }
    return { text: '', tone: 'neutral' }
  }
  if (mode === 'volume') return { text: `≈ ${(v * d).toFixed(4)} г`, tone: 'derived' }
  return { text: `≈ ${(v / d).toFixed(4)} мл`, tone: 'derived' }
}

export function formatMass(value) {
  return Number.isFinite(value) ? value.toFixed(4).replace(/\.?0+$/, '') : '—'
}
