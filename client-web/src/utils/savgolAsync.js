/**
 * savgolAsync — мемо-кэш SavGol-кривых + параллельный расчёт в пуле Web Workers.
 *
 * Два слоя против лагов «много графиков × много образцов»:
 *
 *  1. КЭШ (главный выигрыш): кривая (полуцикл × вид × пресет) считается ОДИН
 *     раз за жизнь данных. Ключ — ссылка на массив точек цикла (cycleDataMap
 *     переиспользует массивы между перестройками вида) → WeakMap, память
 *     освобождается вместе с данными. Повторные перестройки (тогглы, догрузки,
 *     смена стилей) берут готовое из кэша за ~0 мс.
 *
 *  2. ПУЛ ВОРКЕРОВ (параллелизм): промахи кэша считаются вне главного потока,
 *     раскидываются round-robin по min(4, ядра−1) воркерам — первый расчёт
 *     сотен кривых идёт параллельно и не блокирует интерфейс; кривые
 *     проявляются прогрессивно (по готовности бампается savgolCacheVersion,
 *     графики перечитывают кэш через свою реактивность).
 *
 *  Fallback: среда без Worker (jsdom-тесты, экзотика) → синхронный расчёт на
 *  месте, тот же кэш. Поведение идентично, просто без параллелизма.
 */
import { shallowRef } from 'vue'
import { dqdvSavGol, dvdqSavGol } from '@/utils/savitzkyGolay'

// Бамп = «в кэше появились новые готовые кривые» — реактивная зависимость
// для chart-computed'ов (прогрессивное проявление).
export const savgolCacheVersion = shallowRef(0)

// ── Извлечение пар (общая логика dqdv-графика; единственный дом) ────────
// Доминантный сегмент шага: capacity_ah сбрасывается на границе шага,
// смешение сегментов исказило бы интерполяцию на сетку. CV-полка схлопывается
// в одну точку сетки, rest не даёт ничего.
export function dominantStepPairs(steps) {
  const segments = new Map()
  for (const d of steps) {
    if (d.voltage_v == null || d.capacity_ah == null) continue
    const arr = segments.get(d.step_number)
    if (arr) arr.push({ v: d.voltage_v, q: d.capacity_ah })
    else segments.set(d.step_number, [{ v: d.voltage_v, q: d.capacity_ah }])
  }
  let best = []
  for (const arr of segments.values()) if (arr.length > best.length) best = arr
  return best
}

export function stepPairsOf(points, step) {
  const filtered = step === 'charge'
    ? points.filter(d => d.step_type === 'charge' || d.step_type === 'cccv')
    : points.filter(d => d.step_type === 'discharge')
  return dominantStepPairs(filtered)
}

// ── Пул воркеров ────────────────────────────────────────────────────────
const HAS_WORKER = typeof Worker !== 'undefined'
let pool = null
let rr = 0
let seq = 0
const inFlight = new Map()   // id → { key, bucket }

// Батчинг бампов версии: 30 готовых кривых подряд без батчинга = 30 полных
// перестроек+перекрасок графика (прогрессивное мигание, «строится хуже»).
// Копим завершения и бампаем версию ОДИН раз на кадр.
let bumpScheduled = false
export function scheduleVersionBump() {
  if (bumpScheduled) return
  bumpScheduled = true
  const raf = globalThis.requestAnimationFrame || ((cb) => setTimeout(cb, 16))
  raf(() => {
    bumpScheduled = false
    savgolCacheVersion.value++
  })
}

function getPool() {
  if (pool) return pool
  const size = Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency || 4) - 1))
  pool = Array.from({ length: size }, () => {
    const w = new Worker(new URL('../workers/savgolWorker.js', import.meta.url), { type: 'module' })
    w.onmessage = (e) => {
      const { id, curve } = e.data
      const job = inFlight.get(id)
      if (!job) return
      inFlight.delete(id)
      job.bucket.set(job.key, { state: 'ready', curve })
      scheduleVersionBump()               // один бамп на кадр, не на кривую
    }
    return w
  })
  return pool
}

function computeSync(kind, pairs, preset) {
  if (kind === 'dvdq') {
    return dvdqSavGol(pairs, { preset }).map(p => ({ x: p.x * 1000, y: p.y / 1000 }))
  }
  return dqdvSavGol(pairs, { preset })
}

// ── Кэш ────────────────────────────────────────────────────────────────
// WeakMap<массив точек цикла, Map<"kind|preset|step", entry>>
// entry: { state: 'ready', curve } | { state: 'pending' }
const cache = new WeakMap()

/**
 * Кривая дифференциального графика для точек цикла.
 * Возврат: { curve: [{x,y}] | null, pending: boolean }
 *  — ready: кривая из кэша (мгновенно);
 *  — промах + воркеры: запускает параллельный расчёт, вернёт pending
 *    (по готовности бампнется savgolCacheVersion);
 *  — промах без воркеров: считает синхронно и кэширует.
 */
export function getDifferentialCurve(points, { kind = 'dqdv', preset = 'standard', step = 'charge' } = {}) {
  if (!points || !points.length) return { curve: null, pending: false }
  let bucket = cache.get(points)
  if (!bucket) { bucket = new Map(); cache.set(points, bucket) }
  const key = `${kind}|${preset}|${step}`
  const hit = bucket.get(key)
  if (hit) {
    return hit.state === 'ready'
      ? { curve: hit.curve, pending: false }
      : { curve: null, pending: true }
  }

  const pairs = stepPairsOf(points, step)
  if (pairs.length < 16) {              // мало точек — SavGol не построится
    bucket.set(key, { state: 'ready', curve: [] })
    return { curve: [], pending: false }
  }

  if (!HAS_WORKER) {
    const curve = computeSync(kind, pairs, preset)
    bucket.set(key, { state: 'ready', curve })
    return { curve, pending: false }
  }

  bucket.set(key, { state: 'pending' })
  const id = ++seq
  inFlight.set(id, { key, bucket })
  const workers = getPool()
  workers[rr++ % workers.length].postMessage({ id, kind, pairs, preset })
  return { curve: null, pending: true }
}
