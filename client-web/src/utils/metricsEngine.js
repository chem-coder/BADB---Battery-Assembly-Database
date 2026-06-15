/**
 * metricsEngine — клиентский слой над contracts/metrics.v1.json.
 *
 * Принцип «объяснение = тот же код, что и расчёт»:
 *  - формулы/входы/происхождение читаются ИЗ КОНТРАКТА (единый источник,
 *    общий с серверным парсером и Python-импортёрами);
 *  - референс-реализации здесь проходят те же golden-векторы
 *    (contracts/metrics-golden.v1.json), что сервер и Python — дрейф любой
 *    реализации валит CI, а не молча искажает подсказку;
 *  - explain — подстановка реальных чисел в шаблон контракта (никакого eval,
 *    никакой генерации текста);
 *  - verify — живой пересчёт значением референс-реализации и сравнение с
 *    хранимым: «✓ совпадает / ✗ расхождение» (аудит, а не доверие).
 */
import contract from '@contracts/metrics.v1.json'
import { cellSohSeries, protocolMeanStd, cyclesToThreshold } from '@/utils/cyclingSoh'

export const METRICS = contract.metrics
export const CONTRACT_VERSION = contract.version

export function getMetric(id) {
  return METRICS[id] || null
}

// ── Референс-реализации (скалярные) ────────────────────────────────────
// Семантика 1:1 с каноном (scripts/parse_cycling.py) — включая guard'ы.
const num = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v))

const IMPL = {
  coulombic_efficiency(i) {
    const chg = num(i.charge_capacity_ah), dch = num(i.discharge_capacity_ah)
    if (chg == null || chg <= 0 || dch == null) return null
    return (dch / chg) * 100
  },
  energy_efficiency(i) {
    const chg = num(i.charge_energy_wh), dch = num(i.discharge_energy_wh)
    if (chg == null || chg <= 0 || dch == null) return null
    return (dch / chg) * 100
  },
  hysteresis_mv(i) {
    const a = num(i.avg_charge_voltage_v), b = num(i.avg_discharge_voltage_v)
    if (a == null || b == null) return null
    return (a - b) * 1000
  },
  specific_capacity_mah_g(i) {
    const q = num(i.capacity_ah), m = num(i.active_mass_mg)
    if (q == null || m == null || m <= 0) return null
    return (q * 1e6) / m
  },
  capacity_retention_pct(i) {
    const q = num(i.capacity_ah), ref = num(i.ref_capacity_ah)
    if (q == null || ref == null || ref <= 0) return null
    return (q / ref) * 100
  },
}

// Серийные метрики делегируются в проверенные утилиты (те же, что рисуют
// графики — по построению не могут разойтись с отображением).
export const SERIES_IMPL = {
  soh_pct: (rows, opts) => cellSohSeries(rows, { formationExclude: opts?.formation_exclude ?? 0, metric: 'soh' }),
  protocol_mean_std: (seriesList, opts) => protocolMeanStd(seriesList, { minCoverage: opts?.min_coverage ?? 1 }),
  cycles_to_threshold: (mean, opts) => cyclesToThreshold(mean, opts?.threshold ?? 80),
}

export function computeMetric(id, inputs) {
  const fn = IMPL[id]
  return fn ? fn(inputs || {}) : undefined   // undefined = нет клиентской реализации
}

// ── Канонический пересчёт summary из сырых точек ───────────────────────
// Зеркало агрегации parse_cycling.py: per-step максимум кумулятивов → сумма
// по шагам того же типа; средние напряжения — простое среднее по точкам.
// Используется кнопкой «Перепроверить», когда точки цикла загружены.
export function computeStreamSummary(points) {
  const src = points || []
  // Fallback для потоков без step_number (точки, закэшированные фронтом до
  // того, как API стал его отдавать): непрерывные сегменты одного step_type
  // ≈ шаги — ёмкость сбрасывается на смене типа, а CC→CV шов это тоже смена
  // типа ('charge'→'cccv').
  const hasSn = src.some(p => p.step_number != null)
  const sn = new Array(src.length)
  if (hasSn) {
    for (let i = 0; i < src.length; i++) sn[i] = src[i].step_number
  } else {
    let run = 0, prevType = null
    for (let i = 0; i < src.length; i++) {
      if (src[i].step_type !== prevType) { run++; prevType = src[i].step_type }
      sn[i] = run
    }
  }
  const buckets = { charge: [], discharge: [] }
  for (let i = 0; i < src.length; i++) {
    const p = src[i]
    const st = p.step_type
    if (st === 'charge' || st === 'cccv') buckets.charge.push({ p, sn: sn[i] })
    else if (st === 'discharge') buckets.discharge.push({ p, sn: sn[i] })
  }
  function perStepMaxSum(pts, key) {
    const perStep = new Map()
    for (const { p, sn: stepId } of pts) {
      const v = num(p[key])
      if (v == null || stepId == null) continue
      const cur = perStep.get(stepId)
      if (cur == null || v > cur) perStep.set(stepId, v)
    }
    if (!perStep.size) return null
    let s = 0; for (const v of perStep.values()) s += v
    return s
  }
  function pointMeanV(pts) {
    const vs = pts.map(({ p }) => num(p.voltage_v)).filter(v => v != null)
    return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null
  }
  const out = {
    charge_capacity_ah: perStepMaxSum(buckets.charge, 'capacity_ah'),
    discharge_capacity_ah: perStepMaxSum(buckets.discharge, 'capacity_ah'),
    charge_energy_wh: perStepMaxSum(buckets.charge, 'energy_wh'),
    discharge_energy_wh: perStepMaxSum(buckets.discharge, 'energy_wh'),
    avg_charge_voltage_v: pointMeanV(buckets.charge),
    avg_discharge_voltage_v: pointMeanV(buckets.discharge),
  }
  out.coulombic_efficiency = IMPL.coulombic_efficiency(out)
  out.energy_efficiency = IMPL.energy_efficiency(out)
  return out
}

// ── Объяснение: подстановка чисел в шаблон контракта (без eval) ────────
export function fmtNum(v, digits = 4) {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  const n = Number(v)
  if (n !== 0 && Math.abs(n) < 1e-3) return n.toExponential(3)
  return String(parseFloat(n.toFixed(digits)))
}

export function explainMetric(id, inputs = {}, value = null, extras = {}) {
  const m = getMetric(id)
  if (!m?.explain_template) return null
  const dict = { ...inputs, ...extras, value }
  return m.explain_template.replace(/\{(\w+)\}/g, (_, key) =>
    key in dict ? fmtNum(dict[key]) : `{${key}}`
  )
}

// ── Сверка: живой пересчёт против хранимого ────────────────────────────
// ok при |Δ| ≤ max(absTol, relTol·|пересчитанного|). absTol по умолчанию
// покрывает округление парсера при записи (CE/EE до 2 знаков, V до 4).
export function verifyMetric(id, inputs, storedValue, { absTol = 0.011, relTol = 0.001 } = {}) {
  const recomputed = computeMetric(id, inputs)
  if (recomputed === undefined) return { status: 'no-impl' }
  const stored = num(storedValue)
  if (recomputed === null || stored === null) {
    return { status: recomputed === null && stored === null ? 'ok' : 'mismatch', recomputed, stored, diff: null }
  }
  const diff = recomputed - stored
  const ok = Math.abs(diff) <= Math.max(absTol, relTol * Math.abs(recomputed))
  return { status: ok ? 'ok' : 'mismatch', recomputed, stored, diff }
}
