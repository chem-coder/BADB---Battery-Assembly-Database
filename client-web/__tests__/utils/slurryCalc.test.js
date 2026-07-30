// Tests for src/utils/slurryCalc.js — port of the vanilla planned-mass /
// solids / solvent-compat math (public/js/1-tapes.js) plus the 2026-07-30
// upgrade: actual-AM-mass pivot for real-time target recalculation.
import { describe, it, expect } from 'vitest'
import {
  computeSlurryPlan,
  computeSolidsSummary,
  collectSolventWarning,
  deriveConversion,
  expandInstanceComponents,
} from '@/utils/slurryCalc'

// Recipe: АМ 96% + Super P 2% + PVDF 2% (dry basis) + NMP (excluded).
const LINES = [
  { recipe_line_id: 1, material_id: 10, material_name: 'NMC 955', recipe_role: 'cathode_active', slurry_percent: 96, include_in_pct: true },
  { recipe_line_id: 2, material_id: 20, material_name: 'Super P', recipe_role: 'conductive_additive', slurry_percent: 2, include_in_pct: true },
  { recipe_line_id: 3, material_id: 30, material_name: 'PVDF', recipe_role: 'binder', slurry_percent: 2, include_in_pct: true },
  { recipe_line_id: 4, material_id: 40, material_name: 'NMP', recipe_role: 'solvent', slurry_percent: null, include_in_pct: false },
]

// Pure instances: empty component lists (loaded, no composition rows).
const PURE = { 101: [], 102: [], 103: [], 104: [] }
const SELECTED = { 1: '101', 2: '102', 3: '103', 4: '104' }

describe('computeSlurryPlan — vanilla parity (target pivot)', () => {
  it('from_active_mass: totalDry = target/активный%, per-line targets and planned masses', () => {
    const plan = computeSlurryPlan({
      lines: LINES, selectedInstanceByLineId: SELECTED, componentsByInstanceId: PURE,
      calcMode: 'from_active_mass', targetMass: 9.6,
    })
    expect(plan.ready).toBe(true)
    expect(plan.pivot).toBe('target')
    expect(plan.totalDryMass).toBeCloseTo(10, 10)             // 9.6 / 0.96
    expect(plan.targetDryByLineId[1]).toBeCloseTo(9.6, 10)
    expect(plan.targetDryByLineId[2]).toBeCloseTo(0.2, 10)
    expect(plan.targetDryByLineId[3]).toBeCloseTo(0.2, 10)
    expect(plan.targetDryByLineId[4]).toBeNull()               // solvent: no dry target
    // pure instances → planned == dry target
    expect(plan.plannedByLineId[1]).toBeCloseTo(9.6, 10)
    expect(plan.plannedByLineId[2]).toBeCloseTo(0.2, 10)
    expect(plan.plannedByLineId[3]).toBeCloseTo(0.2, 10)
    expect(plan.plannedByLineId[4]).toBeNull()                 // no target for solvent
  })

  it('from_slurry_mass derives the active target from the wet input', () => {
    const plan = computeSlurryPlan({
      lines: LINES, selectedInstanceByLineId: SELECTED, componentsByInstanceId: PURE,
      calcMode: 'from_slurry_mass', targetMass: 20,
    })
    // dry% total = 100 → totalDryFromWet = 20; active = 20 * 96/100 = 19.2
    expect(plan.totalDryMass).toBeCloseTo(20, 10)
    expect(plan.targetDryByLineId[1]).toBeCloseTo(19.2, 10)
  })

  it('binder solution instance (5% PVDF in NMP): planned = needDry / fraction', () => {
    const components = {
      ...PURE,
      103: [
        { material_id: 30, material_name: 'PVDF', material_role: 'binder', mass_fraction: 0.05 },
        { material_id: 40, material_name: 'NMP', material_role: 'solvent', mass_fraction: 0.95 },
      ],
    }
    const plan = computeSlurryPlan({
      lines: LINES, selectedInstanceByLineId: SELECTED, componentsByInstanceId: components,
      calcMode: 'from_active_mass', targetMass: 9.6,
    })
    expect(plan.plannedByLineId[3]).toBeCloseTo(0.2 / 0.05, 10) // 4 g of solution
    const row = plan.expandedRows.find(r => r.lineId === 3)
    expect(row.components.find(c => c.material_name === 'NMP').mass).toBeCloseTo(3.8, 10)
  })

  it('premix covering another line zeroes its planned mass (overlap accounting)', () => {
    // Line 1 instance is a premix АМ 96% + Super P 4%: the premix mass
    // needed for the AM target (targetAM/0.96 = totalDry) carries
    // totalDry×0.04 of Super P ≥ its own 2% target → fully satisfied.
    const components = {
      ...PURE,
      101: [
        { material_id: 10, material_name: 'NMC 955', material_role: 'cathode_active', mass_fraction: 0.96 },
        { material_id: 20, material_name: 'Super P', material_role: 'conductive_additive', mass_fraction: 0.04 },
      ],
    }
    const plan = computeSlurryPlan({
      lines: LINES, selectedInstanceByLineId: SELECTED, componentsByInstanceId: components,
      calcMode: 'from_active_mass', targetMass: 9.6,
    })
    const premixMass = plan.targetDryByLineId[1] / 0.96
    expect(plan.plannedByLineId[1]).toBeCloseTo(premixMass, 10)
    // Super P from premix (10×0.04=0.4 г) ≥ its target (0.2 г) → 0 to weigh
    expect(plan.plannedByLineId[2]).toBeCloseTo(0, 10)
  })

  it('pending composition reports pendingInstanceIds and no planned masses', () => {
    const { 103: _omit, ...partial } = PURE
    const plan = computeSlurryPlan({
      lines: LINES, selectedInstanceByLineId: SELECTED, componentsByInstanceId: partial,
      calcMode: 'from_active_mass', targetMass: 9.6,
    })
    expect(plan.pending).toBe(true)
    expect(plan.pendingInstanceIds).toContain('103')
    expect(plan.ready).toBe(false)
  })

  it('d047 slot line (material_id null) resolves via slotMaterialId', () => {
    const lines = [{ ...LINES[0], material_id: null }, ...LINES.slice(1)]
    const plan = computeSlurryPlan({
      lines, selectedInstanceByLineId: SELECTED, componentsByInstanceId: PURE,
      calcMode: 'from_active_mass', targetMass: 9.6, slotMaterialId: 10,
    })
    expect(plan.ready).toBe(true)
    expect(plan.plannedByLineId[1]).toBeCloseTo(9.6, 10)
  })
})

describe('computeSlurryPlan — actual-AM pivot (Dalia 2026-07-30)', () => {
  it('entered actual AM mass replaces the target as the pivot', () => {
    const plan = computeSlurryPlan({
      lines: LINES, selectedInstanceByLineId: SELECTED, componentsByInstanceId: PURE,
      actualsByLineId: { 1: { mode: 'mass', value: 4.8 } },   // weighed half the target
      calcMode: 'from_active_mass', targetMass: 9.6,
    })
    expect(plan.pivot).toBe('actual_am')
    expect(plan.activeActualMass).toBeCloseTo(4.8, 10)
    expect(plan.totalDryMass).toBeCloseTo(5, 10)               // 4.8 / 0.96
    expect(plan.targetDryByLineId[2]).toBeCloseTo(0.1, 10)     // scaled in real time
    expect(plan.plannedByLineId[3]).toBeCloseTo(0.1, 10)
  })

  it('blank actual AM falls back to the target pivot', () => {
    const plan = computeSlurryPlan({
      lines: LINES, selectedInstanceByLineId: SELECTED, componentsByInstanceId: PURE,
      actualsByLineId: { 1: { mode: 'mass', value: '' } },
      calcMode: 'from_active_mass', targetMass: 9.6,
    })
    expect(plan.pivot).toBe('target')
    expect(plan.targetDryByLineId[2]).toBeCloseTo(0.2, 10)
  })

  it('composite AM instance scales by the AM fraction inside it', () => {
    const components = {
      ...PURE,
      101: [
        { material_id: 10, material_name: 'NMC 955', material_role: 'cathode_active', mass_fraction: 0.5 },
        { material_id: 40, material_name: 'NMP', material_role: 'solvent', mass_fraction: 0.5 },
      ],
    }
    const plan = computeSlurryPlan({
      lines: LINES, selectedInstanceByLineId: SELECTED, componentsByInstanceId: components,
      actualsByLineId: { 1: { mode: 'mass', value: 4 } },      // 4 g of 50% suspension → 2 g AM
      calcMode: 'from_active_mass', targetMass: 9.6,
    })
    expect(plan.pivot).toBe('actual_am')
    expect(plan.totalDryMass).toBeCloseTo(2 / 0.96, 10)
  })
})

describe('computeSolidsSummary', () => {
  it('computes solids percent from actuals (solvent contributes wet mass only)', () => {
    const res = computeSolidsSummary({
      lines: LINES, selectedInstanceByLineId: SELECTED, componentsByInstanceId: PURE,
      actualsByLineId: {
        1: { mode: 'mass', value: 9.6 },
        2: { mode: 'mass', value: 0.2 },
        3: { mode: 'mass', value: 0.2 },
        4: { mode: 'mass', value: 10 },
      },
    })
    expect(res.status).toBe('complete')
    expect(res.text).toContain(((10 / 20) * 100).toFixed(2))   // 10 g solids / 20 g total
  })

  it('volume without density → incomplete with the density hint', () => {
    // Vanilla check order: some OTHER line must carry a real mass first —
    // with only the density-less line filled, vanilla (and the port)
    // report 'empty'.
    const res = computeSolidsSummary({
      lines: LINES, selectedInstanceByLineId: SELECTED, componentsByInstanceId: PURE,
      actualsByLineId: { 1: { mode: 'mass', value: 9.6 }, 4: { mode: 'volume', value: 5 } },
      densityByLineId: {},
    })
    expect(res.status).toBe('incomplete')
    expect(res.detail).toContain('плотность')
  })
})

describe('collectSolventWarning', () => {
  it('flags two distinct solvents across selected instances', () => {
    const components = {
      ...PURE,
      103: [
        { material_id: 30, material_name: 'PVDF', material_role: 'binder', mass_fraction: 0.05 },
        { material_id: 41, material_name: 'Вода', material_role: 'solvent', mass_fraction: 0.95 },
      ],
    }
    const res = collectSolventWarning({
      lines: LINES, selectedInstanceByLineId: SELECTED, componentsByInstanceId: components,
    })
    expect(res.mismatch).toBe(true)
    expect(res.names).toEqual(expect.arrayContaining(['NMP', 'Вода']))
  })

  it('single solvent system → no warning', () => {
    const res = collectSolventWarning({
      lines: LINES, selectedInstanceByLineId: SELECTED, componentsByInstanceId: PURE,
    })
    expect(res.mismatch).toBe(false)
  })
})

describe('deriveConversion / expandInstanceComponents', () => {
  it('volume × density → ≈ g; mass ÷ density → ≈ ml; volume w/o density warns', () => {
    expect(deriveConversion({ mode: 'volume', value: 2, density: 1.03 }).text).toBe('≈ 2.0600 г')
    expect(deriveConversion({ mode: 'mass', value: 2.06, density: 1.03 }).text).toBe('≈ 2.0000 мл')
    expect(deriveConversion({ mode: 'volume', value: 2, density: null }).tone).toBe('warning')
  })

  it('nested instance expansion multiplies fractions', () => {
    const cache = {
      201: [{ material_id: 30, material_name: 'PVDF', material_role: 'binder', mass_fraction: 0.5, component_material_instance_id: 202 }],
      202: [
        { material_id: 30, material_name: 'PVDF', material_role: 'binder', mass_fraction: 0.1 },
        { material_id: 40, material_name: 'NMP', material_role: 'solvent', mass_fraction: 0.9 },
      ],
    }
    const res = expandInstanceComponents(201, { material_id: 30, mass_fraction: 1 }, cache)
    expect(res.pending).toBe(false)
    expect(res.components.find(c => c.material_id === 30).mass_fraction).toBeCloseTo(0.05, 10)
    expect(res.components.find(c => c.material_id === 40).mass_fraction).toBeCloseTo(0.45, 10)
  })
})
