// Unit tests for src/utils/electrodeStack.js
//
// Encodes the stack-building contract from docs/rules/electrode_stack_rules.md
// and vanilla public/js/3-batteries.js:
//   - coin targets are FIXED (1/1 full cell, 1/0 or 0/1 half cell);
//   - pouch/prism/cylindrical: anodes = cathodes or cathodes + 1;
//   - payload = anode-first interleave of mass-descending roles with
//     contiguous 1-based position_index (UNIQUE constraint server-side);
//   - N/P helper prefers anodes at/just above the per-anode target and is
//     advisory only.

import { describe, it, expect } from 'vitest'
import {
  getStackTargetCounts,
  getEffectiveSelections,
  validateStackSelection,
  interleaveStack,
  buildStackPayload,
  sortByMassDesc,
  sortElectrodesForPicker,
  nextStackSort,
  buildNpRecommendation,
  sumActualCapacity,
  deriveStackAnodeMode,
  defaultStackAnodeMode,
  computeStackAnodeCount,
} from '@/utils/electrodeStack'

const el = (id, mass, extra = {}) => ({ electrode_id: id, electrode_mass_g: mass, ...extra })

const pouchCtx = (cathodes, mode = 'plus_one') => ({
  formFactor: 'pouch',
  coinCellMode: '',
  halfCellType: '',
  targetCathodeCount: cathodes,
  targetAnodeMode: mode,
})
const coinFullCtx = { formFactor: 'coin', coinCellMode: 'full_cell', halfCellType: '' }
const coinHalfCathodeCtx = { formFactor: 'coin', coinCellMode: 'half_cell', halfCellType: 'cathode_vs_li' }

describe('getStackTargetCounts', () => {
  it('pins coin full cell at 1/1 (fixed)', () => {
    expect(getStackTargetCounts(coinFullCtx)).toEqual({ cathodes: 1, anodes: 1, valid: true, fixed: true })
  })

  it('treats coin without a chosen mode as full cell', () => {
    expect(getStackTargetCounts({ formFactor: 'coin' })).toEqual({ cathodes: 1, anodes: 1, valid: true, fixed: true })
  })

  it('half cells pin 1/0 or 0/1; missing type is invalid', () => {
    expect(getStackTargetCounts(coinHalfCathodeCtx)).toEqual({ cathodes: 1, anodes: 0, valid: true, fixed: true })
    expect(getStackTargetCounts({ formFactor: 'coin', coinCellMode: 'half_cell', halfCellType: 'anode_vs_li' }))
      .toEqual({ cathodes: 0, anodes: 1, valid: true, fixed: true })
    expect(getStackTargetCounts({ formFactor: 'coin', coinCellMode: 'half_cell' }).valid).toBe(false)
  })

  it('pouch: anodes derived from mode; invalid until a positive integer count', () => {
    expect(getStackTargetCounts(pouchCtx(30, 'plus_one'))).toEqual({ cathodes: 30, anodes: 31, valid: true, fixed: false })
    expect(getStackTargetCounts(pouchCtx(30, 'same')).anodes).toBe(30)
    expect(getStackTargetCounts(pouchCtx(null)).valid).toBe(false)
    expect(getStackTargetCounts(pouchCtx(0)).valid).toBe(false)
    expect(getStackTargetCounts(pouchCtx(2.5)).valid).toBe(false)
  })

  it('no form factor → invalid', () => {
    expect(getStackTargetCounts({ formFactor: '' }).valid).toBe(false)
  })
})

describe('anode mode helpers', () => {
  it('multi-electrode cells default to plus_one, coin to same', () => {
    expect(defaultStackAnodeMode('pouch')).toBe('plus_one')
    expect(defaultStackAnodeMode('cylindrical')).toBe('plus_one')
    expect(defaultStackAnodeMode('coin')).toBe('same')
  })

  it('restore derives the mode from actual counts', () => {
    expect(deriveStackAnodeMode(30, 31)).toBe('plus_one')
    expect(deriveStackAnodeMode(30, 30)).toBe('same')
  })

  it('computeStackAnodeCount', () => {
    expect(computeStackAnodeCount(30, 'plus_one')).toBe(31)
    expect(computeStackAnodeCount(30, 'same')).toBe(30)
    expect(computeStackAnodeCount(0, 'same')).toBe(null)
  })
})

describe('getEffectiveSelections (coin clipping)', () => {
  it('half cell keeps only the relevant role', () => {
    const eff = getEffectiveSelections(coinHalfCathodeCtx, [el(1), el(2)], [el(3)])
    expect(eff.cathodes.map(e => e.electrode_id)).toEqual([1])
    expect(eff.anodes).toEqual([])
  })

  it('coin full cell clips to 1/1; pouch passes through', () => {
    const eff = getEffectiveSelections(coinFullCtx, [el(1), el(2)], [el(3), el(4)])
    expect(eff.cathodes.length).toBe(1)
    expect(eff.anodes.length).toBe(1)
    const pouch = getEffectiveSelections(pouchCtx(2), [el(1), el(2)], [el(3)])
    expect(pouch.cathodes.length).toBe(2)
  })
})

describe('validateStackSelection', () => {
  it('coin full cell needs exactly 1 + 1', () => {
    expect(validateStackSelection(coinFullCtx, [el(1)], [el(2)])).toBe(null)
    expect(validateStackSelection(coinFullCtx, [], [el(2)]))
      .toBe('Для полного монеточного элемента нужен ровно 1 катод и ровно 1 анод.')
  })

  it('half cell messages', () => {
    expect(validateStackSelection(coinHalfCathodeCtx, [el(1)], [])).toBe(null)
    expect(validateStackSelection(coinHalfCathodeCtx, [], []))
      .toBe('Для полуячейки cathode_vs_li нужен ровно 1 катод и ни одного анода.')
    expect(validateStackSelection({ formFactor: 'coin', coinCellMode: 'half_cell' }, [], []))
      .toBe('Выберите тип полуячейки.')
  })

  it('pouch: needs valid targets and exact counts', () => {
    const ctx = pouchCtx(2, 'plus_one') // targets 2/3
    const c = [el(1), el(2)]
    const a = [el(3), el(4), el(5)]
    expect(validateStackSelection(ctx, c, a)).toBe(null)
    expect(validateStackSelection(ctx, c, a.slice(0, 2)))
      .toBe('Выберите ровно указанное количество электродов: катодов = 2, анодов = 3.')
    expect(validateStackSelection(pouchCtx(null), c, a))
      .toBe('Укажите количество катодов и выберите режим количества анодов.')
    expect(validateStackSelection(pouchCtx(2), [], a)).toBe('Выберите хотя бы один катод.')
    expect(validateStackSelection(pouchCtx(2), c, [])).toBe('Выберите хотя бы один анод.')
  })
})

describe('sortByMassDesc', () => {
  it('heaviest first, null masses sink, ties by id', () => {
    const sorted = sortByMassDesc([el(1, null), el(2, '0.5'), el(3, '0.7'), el(5, '0.5')])
    expect(sorted.map(e => e.electrode_id)).toEqual([3, 2, 5, 1])
  })
})

describe('interleaveStack / buildStackPayload', () => {
  it('anode-first interleave with trailing extra anode, contiguous 1-based positions', () => {
    const ctx = pouchCtx(2, 'plus_one')
    const cathodes = [el(10, '0.5'), el(11, '0.7')]
    const anodes = [el(20, '0.3'), el(21, '0.4'), el(22, '0.2')]
    const payload = buildStackPayload(ctx, cathodes, anodes)
    // anodes mass-desc: 21, 20, 22; cathodes mass-desc: 11, 10
    expect(payload).toEqual([
      { electrode_id: 21, role: 'anode', position_index: 1 },
      { electrode_id: 11, role: 'cathode', position_index: 2 },
      { electrode_id: 20, role: 'anode', position_index: 3 },
      { electrode_id: 10, role: 'cathode', position_index: 4 },
      { electrode_id: 22, role: 'anode', position_index: 5 },
    ])
  })

  it('display rows carry the same order as the payload', () => {
    const ctx = coinFullCtx
    const rows = interleaveStack(ctx, [el(1, '0.5')], [el(2, '0.4')])
    expect(rows.map(r => [r.electrode.electrode_id, r.role, r.position])).toEqual([
      [2, 'anode', 1],
      [1, 'cathode', 2],
    ])
  })
})

describe('picker sorting', () => {
  const pool = [
    el(3, '0.5', { number_in_batch: 2 }),
    el(1, '0.9', { number_in_batch: 1 }),
    el(2, null, { number_in_batch: null }),
  ]

  it('sorts by № ascending by default, non-finite to the bottom', () => {
    expect(sortElectrodesForPicker(pool, { key: 'number', dir: 'asc' }).map(e => e.electrode_id))
      .toEqual([1, 3, 2])
  })

  it('mass descending; null mass still sinks', () => {
    expect(sortElectrodesForPicker(pool, { key: 'mass', dir: 'desc' }).map(e => e.electrode_id))
      .toEqual([1, 3, 2])
    expect(sortElectrodesForPicker(pool, { key: 'mass', dir: 'asc' }).map(e => e.electrode_id))
      .toEqual([3, 1, 2])
  })

  it('nextStackSort toggles the same key, new key uses its default', () => {
    expect(nextStackSort({ key: 'number', dir: 'asc' }, 'number')).toEqual({ key: 'number', dir: 'desc' })
    expect(nextStackSort({ key: 'number', dir: 'asc' }, 'mass')).toEqual({ key: 'mass', dir: 'desc' })
    expect(nextStackSort(null, 'id')).toEqual({ key: 'id', dir: 'asc' })
  })
})

describe('sumActualCapacity', () => {
  it('sums positives; missing/zero capacity marks the total incomplete', () => {
    expect(sumActualCapacity([{ capacity_actual_mAh: 2 }, { capacity_actual_mAh: 3 }]))
      .toEqual({ total: 5, complete: true })
    expect(sumActualCapacity([{ capacity_actual_mAh: 2 }, { capacity_actual_mAh: null }]).complete).toBe(false)
  })
})

describe('buildNpRecommendation', () => {
  const anodes = [
    { electrode_id: 1, capacity_actual_mAh: 4.0 },
    { electrode_id: 2, capacity_actual_mAh: 4.4 },
    { electrode_id: 3, capacity_actual_mAh: 4.2 },
    { electrode_id: 4, capacity_actual_mAh: 3.0 },
  ]

  it('prefers lightest anodes at/above the per-anode target', () => {
    // target total 8.2 over 2 anodes → per-anode 4.1; at/above asc → [3 (4.2), 2 (4.4)]
    const rec = buildNpRecommendation({ anodes, targetAnodeTotal: 8.2, targetAnodeCount: 2 })
    expect(rec.perAnodeTarget).toBeCloseTo(4.1)
    expect([...rec.recommendedIds].sort()).toEqual([2, 3])
    expect(rec.sufficient).toBe(true)
  })

  it('falls back to the largest under-target anodes', () => {
    const rec = buildNpRecommendation({ anodes, targetAnodeTotal: 13.0, targetAnodeCount: 3 })
    // per-anode ≈ 4.333 → at/above: none ≥ 4.34? 4.4 only → then largest below: 4.2, 4.0
    expect(rec.recommendedIds.has(2)).toBe(true)
    expect(rec.recommendedIds.has(3)).toBe(true)
    expect(rec.recommendedIds.has(1)).toBe(true)
    expect(rec.sufficient).toBe(true)
  })

  it('insufficient candidates → sufficient=false; invalid inputs → empty', () => {
    expect(buildNpRecommendation({ anodes: anodes.slice(0, 1), targetAnodeTotal: 8, targetAnodeCount: 2 }).sufficient).toBe(false)
    expect(buildNpRecommendation({ anodes, targetAnodeTotal: 0, targetAnodeCount: 2 }).recommendedIds.size).toBe(0)
  })
})
