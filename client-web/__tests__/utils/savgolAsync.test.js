/**
 * savgolAsync: мемо-кэш + fallback без Worker (jsdom): расчёт синхронный,
 * повторный вызов отдаёт ТУ ЖЕ кривую (без пересчёта), пресеты различаются.
 */
import { describe, it, expect } from 'vitest'
import { getDifferentialCurve, stepPairsOf, savgolCacheVersion } from '@/utils/savgolAsync'

const POINTS = Array.from({ length: 800 }, (_, i) => ({
  step_number: 1,
  step_type: i < 400 ? 'charge' : 'discharge',
  voltage_v: 3.0 + 0.002 * (i % 400),
  capacity_ah: 1e-5 * (i % 400),
}))

describe('savgolAsync (sync-fallback в jsdom)', () => {
  it('промах кэша → кривая сразу (без Worker), валидной формы', () => {
    const { curve, pending } = getDifferentialCurve(POINTS, { kind: 'dqdv', preset: 'standard', step: 'charge' })
    expect(pending).toBe(false)
    expect(curve.length).toBeGreaterThan(500)
    expect(curve.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true)
  })

  it('мемо: повторный вызов отдаёт ТОТ ЖЕ массив (не пересчитывает)', () => {
    const a = getDifferentialCurve(POINTS, { kind: 'dqdv', preset: 'standard', step: 'charge' }).curve
    const b = getDifferentialCurve(POINTS, { kind: 'dqdv', preset: 'standard', step: 'charge' }).curve
    expect(b).toBe(a)            // идентичность ссылки = кэш-хит
  })

  it('другой пресет / вид / шаг → другая запись кэша', () => {
    const std = getDifferentialCurve(POINTS, { kind: 'dqdv', preset: 'standard', step: 'charge' }).curve
    const strong = getDifferentialCurve(POINTS, { kind: 'dqdv', preset: 'strong', step: 'charge' }).curve
    const dvdq = getDifferentialCurve(POINTS, { kind: 'dvdq', preset: 'standard', step: 'charge' }).curve
    expect(strong).not.toBe(std)
    expect(dvdq).not.toBe(std)
    expect(Math.max(...dvdq.map(p => p.x))).toBeGreaterThan(1)   // x в мА·ч
  })

  it('мало точек → пустая кривая, закэширована', () => {
    const tiny = POINTS.slice(0, 6)
    expect(getDifferentialCurve(tiny, { step: 'charge' }).curve).toEqual([])
  })

  it('stepPairsOf берёт доминантный сегмент шага', () => {
    expect(stepPairsOf(POINTS, 'charge').length).toBe(400)
    expect(stepPairsOf(POINTS, 'discharge').length).toBe(400)
  })

  it('версия кэша — реактивный счётчик (число)', () => {
    expect(typeof savgolCacheVersion.value).toBe('number')
  })
})

describe('перф: кэш против пересчёта (тяжёлый сценарий)', () => {
  it('200 кривых (10 образцов × 10 циклов × 2): повтор из кэша ≥20× быстрее', () => {
    const mk = (seed) => Array.from({ length: 2000 }, (_, i) => ({
      step_number: 1,
      step_type: i < 1000 ? 'charge' : 'discharge',
      voltage_v: 3.0 + 0.0008 * (i % 1000) + seed * 1e-4,
      capacity_ah: 1.3e-5 * (i % 1000),
    }))
    const cycles = Array.from({ length: 100 }, (_, k) => mk(k))
    const run = () => {
      for (const pts of cycles) {
        getDifferentialCurve(pts, { kind: 'dqdv', preset: 'standard', step: 'charge' })
        getDifferentialCurve(pts, { kind: 'dqdv', preset: 'standard', step: 'discharge' })
      }
    }
    let t0 = performance.now(); run(); const first = performance.now() - t0
    t0 = performance.now(); run(); const repeat = performance.now() - t0
    // console.info для глаз в выводе CI
    console.info(`[bench] первый: ${first.toFixed(0)} мс, повтор (кэш): ${repeat.toFixed(2)} мс, ×${(first / repeat).toFixed(0)}`)
    expect(repeat).toBeLessThan(Math.max(5, first / 20))
  })
})
