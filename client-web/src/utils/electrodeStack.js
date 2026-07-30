/**
 * electrodeStack — pure logic for the battery electrode stack builder
 * («Формирование стека»). Vanilla parity: public/js/3-batteries.js
 * (state.stack + buildStackPayload + validateStackSelection + the N/P
 * helper) and docs/rules/electrode_stack_rules.md.
 *
 * Everything here is side-effect-free so it is unit-testable and shared
 * between the panel component and tests. The stack CONTEXT object used
 * throughout is:
 *   { formFactor, coinCellMode, halfCellType, targetCathodeCount, targetAnodeMode }
 */

// pouch|prism use rectangle electrodes and free target counts; cylindrical
// behaves the same for stack purposes (vanilla isMultiElectrodeFormFactor).
const MULTI_ELECTRODE_FORM_FACTORS = ['pouch', 'prism', 'cylindrical']

export function isMultiElectrodeFormFactor(formFactor) {
  return MULTI_ELECTRODE_FORM_FACTORS.includes(formFactor)
}

export function normalizeStackAnodeMode(mode) {
  return mode === 'plus_one' ? 'plus_one' : 'same'
}

// Vanilla getDefaultStackAnodeMode: multi-electrode cells default to one
// extra anode (outer anodes sandwich the cathodes); coin has fixed counts.
export function defaultStackAnodeMode(formFactor) {
  return isMultiElectrodeFormFactor(formFactor) ? 'plus_one' : 'same'
}

// Restore path: a saved stack's mode is whatever its counts say — this can
// legitimately flip a pouch cell back to 'same'.
export function deriveStackAnodeMode(cathodeCount, anodeCount) {
  return anodeCount === cathodeCount + 1 ? 'plus_one' : 'same'
}

export function computeStackAnodeCount(cathodeCount, mode) {
  if (!Number.isInteger(cathodeCount) || cathodeCount <= 0) return null
  return cathodeCount + (normalizeStackAnodeMode(mode) === 'plus_one' ? 1 : 0)
}

/**
 * Target electrode counts for the current battery context.
 * Returns { cathodes, anodes, valid, fixed }:
 *  - fixed=true → counts are dictated by the form factor / cell mode and
 *    the count inputs must not be shown (coin is pinned at 1/1, 1/0, 0/1);
 *  - valid=false → selection must be disabled until the operator fixes
 *    the context (e.g. entered a cathode count for a pouch cell).
 */
export function getStackTargetCounts(ctx) {
  const { formFactor, coinCellMode, halfCellType } = ctx || {}
  if (formFactor === 'coin') {
    if (coinCellMode === 'half_cell') {
      if (halfCellType === 'cathode_vs_li') return { cathodes: 1, anodes: 0, valid: true, fixed: true }
      if (halfCellType === 'anode_vs_li') return { cathodes: 0, anodes: 1, valid: true, fixed: true }
      return { cathodes: 0, anodes: 0, valid: false, fixed: true }
    }
    // full_cell — and coin with the mode not chosen yet behaves as full
    // cell (mirrors isBatteryStackSectionComplete's «coin (full)» branch).
    return { cathodes: 1, anodes: 1, valid: true, fixed: true }
  }
  if (isMultiElectrodeFormFactor(formFactor)) {
    const cathodes = Number(ctx.targetCathodeCount)
    const mode = normalizeStackAnodeMode(ctx.targetAnodeMode)
    const validCathodes = Number.isInteger(cathodes) && cathodes > 0
    return {
      cathodes: validCathodes ? cathodes : null,
      anodes: validCathodes ? computeStackAnodeCount(cathodes, mode) : null,
      valid: validCathodes,
      fixed: false,
    }
  }
  return { cathodes: 0, anodes: 0, valid: false, fixed: true }
}

/**
 * Coin clipping (vanilla getEffectiveBatterySelections): a half cell keeps
 * only the relevant role, coin full cell keeps at most one of each.
 * Multi-electrode cells pass through untouched.
 */
export function getEffectiveSelections(ctx, cathodes, anodes) {
  const cs = Array.isArray(cathodes) ? cathodes : []
  const as = Array.isArray(anodes) ? anodes : []
  if (ctx?.formFactor === 'coin') {
    if (ctx.coinCellMode === 'half_cell') {
      if (ctx.halfCellType === 'cathode_vs_li') return { cathodes: cs.slice(0, 1), anodes: [] }
      if (ctx.halfCellType === 'anode_vs_li') return { cathodes: [], anodes: as.slice(0, 1) }
      return { cathodes: [], anodes: [] }
    }
    return { cathodes: cs.slice(0, 1), anodes: as.slice(0, 1) }
  }
  return { cathodes: cs, anodes: as }
}

/**
 * Full-selection validation before save. Returns a Russian error string
 * (vanilla verbatim) or null when the stack is saveable. Server re-checks
 * everything — these messages just save the round-trip.
 */
export function validateStackSelection(ctx, cathodes, anodes) {
  const eff = getEffectiveSelections(ctx, cathodes, anodes)
  const c = eff.cathodes.length
  const a = eff.anodes.length

  if (ctx?.formFactor === 'coin' && ctx.coinCellMode === 'half_cell') {
    if (ctx.halfCellType === 'cathode_vs_li') {
      return c === 1 && a === 0 ? null : 'Для полуячейки cathode_vs_li нужен ровно 1 катод и ни одного анода.'
    }
    if (ctx.halfCellType === 'anode_vs_li') {
      return a === 1 && c === 0 ? null : 'Для полуячейки anode_vs_li нужен ровно 1 анод и ни одного катода.'
    }
    return 'Выберите тип полуячейки.'
  }

  if (ctx?.formFactor === 'coin') {
    return c === 1 && a === 1 ? null : 'Для полного монеточного элемента нужен ровно 1 катод и ровно 1 анод.'
  }

  if (isMultiElectrodeFormFactor(ctx?.formFactor)) {
    const targets = getStackTargetCounts(ctx)
    if (!targets.valid) return 'Укажите количество катодов и выберите режим количества анодов.'
    if (c === 0) return 'Выберите хотя бы один катод.'
    if (a === 0) return 'Выберите хотя бы один анод.'
    if (c !== targets.cathodes || a !== targets.anodes) {
      return `Выберите ровно указанное количество электродов: катодов = ${targets.cathodes}, анодов = ${targets.anodes}.`
    }
    if (!(a === c || a === c + 1)) {
      return `Несбалансированный стек: катодов = ${c}, анодов = ${a}. Для пакетного и цилиндрического элемента количество анодов должно совпадать с количеством катодов или быть больше на один.`
    }
    return null
  }

  return 'Укажите количество катодов и выберите режим количества анодов.'
}

// Numeric field access with non-finite → null (masses/capacities come from
// the API as strings or nulls). Explicit null/'' guard — Number(null) is 0,
// which would sort a missing mass as a real zero instead of sinking it.
function num(v) {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Per-role physical order: heaviest first (vanilla renderStackSummary /
// buildStackPayload both sort mass descending). Null masses sink to the
// end; ties break by electrode_id ascending for a stable order.
export function sortByMassDesc(electrodes) {
  return [...electrodes].sort((x, y) => {
    const mx = num(x.electrode_mass_g)
    const my = num(y.electrode_mass_g)
    if (mx == null && my == null) return (Number(x.electrode_id) || 0) - (Number(y.electrode_id) || 0)
    if (mx == null) return 1
    if (my == null) return -1
    if (my !== mx) return my - mx
    return (Number(x.electrode_id) || 0) - (Number(y.electrode_id) || 0)
  })
}

/**
 * The «sandwich»: anode-first interleave A1 C1 A2 C2 … (a plus_one stack
 * ends on a trailing anode). Each role is first sorted mass-descending.
 * Returns [{ electrode, role, position }] with 1-based positions — used
 * both for the summary table and (via buildStackPayload) the PUT body,
 * so what the user sees IS what is saved.
 */
export function interleaveStack(ctx, cathodes, anodes) {
  const eff = getEffectiveSelections(ctx, cathodes, anodes)
  const cs = sortByMassDesc(eff.cathodes)
  const as = sortByMassDesc(eff.anodes)
  const rows = []
  const max = Math.max(cs.length, as.length)
  for (let i = 0; i < max; i += 1) {
    if (as[i]) rows.push({ electrode: as[i], role: 'anode' })
    if (cs[i]) rows.push({ electrode: cs[i], role: 'cathode' })
  }
  return rows.map((r, i) => ({ ...r, position: i + 1 }))
}

/**
 * PUT /api/batteries/battery_electrodes/:battery_id body — a BARE array
 * (not wrapped in an object) of { electrode_id, role, position_index }.
 * position_index is 1-based and contiguous: the server preserves it
 * verbatim and UNIQUE (battery_id, position_index) turns collisions into
 * an opaque 500, so contiguous renumbering here is mandatory.
 */
export function buildStackPayload(ctx, cathodes, anodes) {
  return interleaveStack(ctx, cathodes, anodes).map(r => ({
    electrode_id: Number(r.electrode.electrode_id),
    role: r.role,
    position_index: r.position,
  }))
}

// ── Picker table sorting (vanilla stackSort) ──
export const STACK_SORT_DEFAULT_DIRECTIONS = { number: 'asc', mass: 'desc', id: 'asc' }

const SORT_FIELDS = {
  number: 'number_in_batch',
  id: 'electrode_id',
  mass: 'electrode_mass_g',
}

/**
 * Sort the picker pool by the per-role sort state {key, dir}. Non-finite
 * values always sink to the bottom regardless of direction; ties break by
 * electrode_id ascending.
 */
export function sortElectrodesForPicker(electrodes, { key = 'number', dir = 'asc' } = {}) {
  const field = SORT_FIELDS[key] || SORT_FIELDS.number
  const sign = dir === 'desc' ? -1 : 1
  return [...electrodes].sort((x, y) => {
    const vx = num(x[field])
    const vy = num(y[field])
    if (vx == null && vy == null) return (Number(x.electrode_id) || 0) - (Number(y.electrode_id) || 0)
    if (vx == null) return 1
    if (vy == null) return -1
    if (vx !== vy) return sign * (vx - vy)
    return (Number(x.electrode_id) || 0) - (Number(y.electrode_id) || 0)
  })
}

// Next sort state after a header click: same key toggles direction, a new
// key starts at its default direction.
export function nextStackSort(current, key) {
  if (current?.key === key) {
    return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
  }
  return { key, dir: STACK_SORT_DEFAULT_DIRECTIONS[key] || 'asc' }
}

// ── N/P helper («Избыток анода») ──
// Advisory only (electrode_stack_rules.md): recommendations must never
// auto-select, never alter validation, never change position semantics.

/**
 * Σ of actual capacities; returns { total, complete } where complete=false
 * when any electrode lacks a finite positive capacity_actual_mAh (vanilla
 * getBatteryCapacityTotalStatus — an incomplete Σ disables the helper).
 */
export function sumActualCapacity(electrodes) {
  let total = 0
  let complete = true
  for (const e of electrodes) {
    const c = num(e.capacity_actual_mAh)
    if (c == null || c <= 0) { complete = false; continue }
    total += c
  }
  return { total, complete }
}

/**
 * Recommended anode set for a target total capacity (vanilla
 * buildBatteryNpRecommendedAnodeSet): prefer anodes at/just above the
 * per-anode target (ascending — lightest sufficient first), then fall
 * back to the largest of the under-target ones. Takes exactly
 * targetAnodeCount when possible.
 * Returns { perAnodeTarget, recommendedIds:Set, sufficient }.
 */
export function buildNpRecommendation({ anodes, targetAnodeTotal, targetAnodeCount }) {
  const count = Number(targetAnodeCount)
  const total = Number(targetAnodeTotal)
  if (!Number.isInteger(count) || count <= 0 || !Number.isFinite(total) || total <= 0) {
    return { perAnodeTarget: null, recommendedIds: new Set(), sufficient: false }
  }
  const perAnodeTarget = total / count
  const candidates = anodes
    .map(e => ({ id: Number(e.electrode_id), cap: num(e.capacity_actual_mAh) }))
    .filter(e => e.cap != null && e.cap > 0)
  const atOrAbove = candidates.filter(e => e.cap >= perAnodeTarget).sort((x, y) => x.cap - y.cap)
  const below = candidates.filter(e => e.cap < perAnodeTarget).sort((x, y) => y.cap - x.cap)
  const picked = [...atOrAbove, ...below].slice(0, count)
  return {
    perAnodeTarget,
    recommendedIds: new Set(picked.map(e => e.id)),
    sufficient: picked.length === count,
  }
}

// ── Formatting (vanilla formatBatteryCapacity / …Delta / …Ratio) ──
export function fmtStackCapacity(v) {
  const n = num(v)
  return n == null ? '—' : `${n.toFixed(3)} мАч`
}

export function fmtCapacityDelta(v) {
  const n = num(v)
  if (n == null) return '—'
  const s = n.toFixed(3)
  return n > 0 ? `+${s} мАч` : `${s} мАч`
}

export function fmtNpRatio(v) {
  const n = num(v)
  return n == null ? '—' : n.toFixed(3)
}
