/**
 * Conformance: клиентские реализации метрик ОБЯЗАНЫ воспроизводить
 * golden-векторы контракта (contracts/metrics-golden.v1.json).
 * Те же векторы гоняются по серверному парсеру и Python-импортёрам
 * (scripts/cycling-file-import/test_metrics_conformance.py) — дрейф любой
 * реализации относительно контракта валит CI.
 */
import { describe, it, expect } from 'vitest'
import golden from '@contracts/metrics-golden.v1.json'
import {
  METRICS, CONTRACT_VERSION, getMetric,
  computeMetric, computeStreamSummary, SERIES_IMPL,
  explainMetric, verifyMetric,
} from '@/utils/metricsEngine'

const close = (a, b, tol) => {
  if (b === null) { expect(a).toBeNull(); return }
  expect(a).not.toBeNull()
  expect(Math.abs(a - b)).toBeLessThanOrEqual(tol ?? 1e-9)
}

describe('контракт: целостность', () => {
  it('версия и обязательные поля каждой метрики', () => {
    expect(CONTRACT_VERSION).toBe(1)
    for (const [id, m] of Object.entries(METRICS)) {
      expect(m.label_ru, id).toBeTruthy()
      expect(m.formula, id).toBeTruthy()
      expect(m.formula_text_ru, id).toBeTruthy()
      expect(Array.isArray(m.inputs), id).toBe(true)
      expect(Array.isArray(m.implementations) && m.implementations.length > 0, id).toBe(true)
      expect(Array.isArray(m.lineage) && m.lineage.length > 0, id).toBe(true)
      expect(m.explain_template, id).toBeTruthy()
      expect(typeof m.stored, id).toBe('boolean')
    }
  })

  it('скалярные шаблоны объяснений ссылаются только на объявленные входы (+value/служебные)', () => {
    const extras = new Set(['value', 'n', 'k', 'sigma', 'w1', 'w2', 'grid', 'preset', 'threshold', 'min_coverage', 'formation_exclude', 'baseline_capacity_ah'])
    for (const [id, m] of Object.entries(METRICS)) {
      const declared = new Set(m.inputs.map(i => i.key))
      for (const [, key] of m.explain_template.matchAll(/\{(\w+)\}/g)) {
        expect(declared.has(key) || extras.has(key), `${id}: {${key}} не объявлен`).toBe(true)
      }
    }
  })
})

describe('golden: скалярные метрики', () => {
  for (const [metricId, cases] of Object.entries(golden.scalar_cases)) {
    it(metricId, () => {
      expect(getMetric(metricId), `метрика ${metricId} отсутствует в контракте`).toBeTruthy()
      for (const c of cases) {
        const got = computeMetric(metricId, c.inputs)
        expect(got, `${metricId}: нет клиентской реализации`).not.toBe(undefined)
        close(got, c.expect, c.tol)
      }
    })
  }
})

describe('golden: пересчёт summary из потока точек (канон парсера)', () => {
  it('stream_cycle_basic — все 8 величин', () => {
    const s = computeStreamSummary(golden.stream_cycle_basic.points)
    for (const [key, exp] of Object.entries(golden.stream_cycle_basic.expect)) {
      close(s[key], exp.value, exp.tol)
    }
  })

  it('fallback: поток БЕЗ step_number (старый кэш фронта) — те же 8 величин', () => {
    const stripped = golden.stream_cycle_basic.points.map(({ step_number, ...rest }) => rest)
    const s = computeStreamSummary(stripped)
    for (const [key, exp] of Object.entries(golden.stream_cycle_basic.expect)) {
      close(s[key], exp.value, exp.tol)
    }
  })

  it('нет нужного поля в точках → null (для честного «нет данных», не ложного ✗)', () => {
    const noEnergy = golden.stream_cycle_basic.points.map(({ energy_wh, ...rest }) => rest)
    const s = computeStreamSummary(noEnergy)
    expect(s.charge_energy_wh).toBeNull()
    expect(s.energy_efficiency).toBeNull()
    expect(s.charge_capacity_ah).not.toBeNull()   // ёмкости при этом считаются
  })
})

describe('golden: серийные метрики (SOH / mean±σ / EOL)', () => {
  it('soh_pct: база и формовка', () => {
    for (const c of golden.soh_cases) {
      const got = SERIES_IMPL.soh_pct(c.rows, { formation_exclude: c.formation_exclude })
      expect(got.length).toBe(c.expect.length)
      c.expect.forEach((e, i) => {
        expect(got[i].x).toBe(e.x)
        close(got[i].y, e.y, c.tol)
      })
    }
  })

  it('protocol_mean_std: mean/σ и survivorship-гейт', () => {
    for (const c of golden.mean_std_cases) {
      const got = SERIES_IMPL.protocol_mean_std(c.series, { min_coverage: c.min_coverage })
      expect(got.mean.length).toBe(c.expect_mean.length)
      c.expect_mean.forEach((e, i) => { expect(got.mean[i].x).toBe(e.x); close(got.mean[i].y, e.y, c.tol) })
      if (c.expect_upper) c.expect_upper.forEach((e, i) => close(got.upper[i].y, e.y, c.tol))
      if (c.expect_lower) c.expect_lower.forEach((e, i) => close(got.lower[i].y, e.y, c.tol))
    }
  })

  it('cycles_to_threshold', () => {
    for (const c of golden.threshold_cases) {
      expect(SERIES_IMPL.cycles_to_threshold(c.mean, { threshold: c.threshold })).toBe(c.expect)
    }
  })
})

describe('explain / verify', () => {
  it('explain подставляет реальные числа из шаблона контракта', () => {
    const txt = explainMetric('coulombic_efficiency',
      { discharge_capacity_ah: 0.9, charge_capacity_ah: 1.0 }, 90)
    expect(txt).toBe('CE = 0.9 / 1 × 100 = 90 %')
  })

  it('verify: совпадение с учётом округления парсера (2 знака)', () => {
    const v = verifyMetric('energy_efficiency',
      { discharge_energy_wh: 3.15, charge_energy_wh: 3.7 }, 85.14)
    expect(v.status).toBe('ok')   // пересчёт 85.1351… против хранимого 85.14
  })

  it('verify: ловит реальное расхождение', () => {
    const v = verifyMetric('coulombic_efficiency',
      { discharge_capacity_ah: 0.9, charge_capacity_ah: 1.0 }, 92.3)
    expect(v.status).toBe('mismatch')
    expect(Math.abs(v.diff)).toBeGreaterThan(2)
  })

  it('verify: null против числа = mismatch (guard сработал, а в БД число)', () => {
    const v = verifyMetric('coulombic_efficiency',
      { discharge_capacity_ah: 0.5, charge_capacity_ah: 0 }, 50)
    expect(v.status).toBe('mismatch')
  })
})
