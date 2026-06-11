/**
 * chartLod — viewport-adaptive level-of-detail для Chart.js.
 *
 * Проблема: статическая децимация (каждая N-я точка по всему диапазону)
 * не добавляет деталей при зуме и может терять экстремумы (алиасинг).
 *
 * Решение (как в TradingView/Grafana):
 *  1. minMaxDecimate — пер-бакетная децимация min+max: на экране ~cap точек,
 *     но огибающая кривой сохраняется ТОЧНО (ни один пик не пропадает).
 *  2. applyViewportLod — на zoom/pan берём ПОЛНЫЕ данные, бинарным поиском
 *     режем по видимому окну X и децимируем срез: чем сильнее приближение,
 *     тем больше реальных деталей на тех же ~cap точках.
 *
 * Требование: точки каждой серии отсортированы по x по возрастанию (наши
 * полуциклы/сетки SavGol это гарантируют).
 */

export const LOD_POINT_CAP = 500

/**
 * Min-max децимация: разбиваем на ~cap/2 бакетов, из каждого берём точку с
 * минимальным и точку с максимальным y (в порядке x). Первая и последняя
 * точки всегда сохраняются. ≤cap → исходный массив (без копии).
 */
export function minMaxDecimate(points, cap = LOD_POINT_CAP) {
  const n = points?.length || 0
  if (n <= cap) return points || []
  const buckets = Math.max(2, Math.floor(cap / 2))
  const step = n / buckets
  const out = [points[0]]
  for (let b = 0; b < buckets; b++) {
    const from = Math.max(1, Math.floor(b * step))
    const to = Math.min(n - 1, Math.floor((b + 1) * step))
    if (from >= to) continue
    let minI = from, maxI = from
    for (let i = from + 1; i < to; i++) {
      if (points[i].y < points[minI].y) minI = i
      if (points[i].y > points[maxI].y) maxI = i
    }
    // в порядке x, без дублей
    const a = Math.min(minI, maxI), z = Math.max(minI, maxI)
    if (out[out.length - 1] !== points[a]) out.push(points[a])
    if (z !== a) out.push(points[z])
  }
  if (out[out.length - 1] !== points[n - 1]) out.push(points[n - 1])
  return out
}

/**
 * LOD требует сортировки по x (бинарный поиск окна). Серия сортирована —
 * возвращаем её же; нет (например, заряд CC+CV: capacity_ah сбрасывается на
 * шве шага и x идёт назад) — null, и такая серия остаётся на статической
 * min-max децимации. O(n), один раз при построении датасетов.
 */
export function ensureSortedByX(points) {
  if (!points || !points.length) return null
  for (let i = 1; i < points.length; i++) {
    if (points[i].x < points[i - 1].x) return null
  }
  return points
}

/** Бинарный поиск первого индекса с x >= target (массив отсортирован по x). */
export function lowerBoundX(points, target) {
  let lo = 0, hi = points.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (points[mid].x < target) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * Срез по видимому окну [xMin, xMax] с одной точкой запаса с каждой стороны
 * (линия не обрывается на краю экрана), затем min-max децимация до cap.
 */
export function lodSlice(fullPoints, xMin, xMax, cap = LOD_POINT_CAP) {
  const n = fullPoints?.length || 0
  if (!n) return []
  const from = Math.max(0, lowerBoundX(fullPoints, xMin) - 1)
  const to = Math.min(n, lowerBoundX(fullPoints, xMax) + 1)
  if (from >= to) return []
  const windowed = fullPoints.slice(from, to)
  return minMaxDecimate(windowed, cap)
}

/**
 * Применить LOD ко всем сериям графика по текущему окну оси X.
 *
 * fullSeries: массив той же длины и порядка, что chart.data.datasets —
 * элемент = ПОЛНЫЙ (недецимированный, сортированный по x) массив точек серии,
 * либо null (серию не трогаем). Мутируем data датасетов НАПРЯМУЮ на инстансе
 * (мимо Vue-реактивности — пересборка computed вернула бы обзорную децимацию)
 * и перерисовываем без анимации.
 *
 * Вызывается из onZoomComplete/onPanComplete зум-плагина; сброс зума тоже
 * прогоняет его — окно становится полным, серии возвращаются к обзорному LOD.
 */
export function applyViewportLod(chart, fullSeries, cap = LOD_POINT_CAP) {
  if (!chart?.scales?.x || !Array.isArray(fullSeries)) return
  const { min, max } = chart.scales.x
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return
  const datasets = chart.data?.datasets || []
  let changed = false
  for (let i = 0; i < datasets.length && i < fullSeries.length; i++) {
    const full = fullSeries[i]
    if (!full || !full.length) continue
    datasets[i].data = lodSlice(full, min, max, cap)
    changed = true
  }
  if (changed) chart.update('none')
}

/**
 * useFrameCoalesced — схлопывает шквал реактивных перестроек в одну на кадр.
 *
 * Источник лага: догрузка циклов/тогглы порождают НЕСКОЛЬКО обновлений
 * activeSessionViews подряд — каждое тащит полный rebuild датасетов и полный
 * repaint каждого графика. Канвас-репейнт (а не математика: 30 SavGol-кривых
 * = 39 мс, замерено) — самое дорогое; рисовать его чаще кадра бессмысленно.
 *
 * Возвращает shallowRef, который догоняет source не чаще requestAnimationFrame.
 * Первое значение — синхронно (без пустого первого кадра).
 */
import { watch, shallowRef } from 'vue'

export function useFrameCoalesced(source) {
  const out = shallowRef(source.value)
  let scheduled = false
  watch(source, () => {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      out.value = source.value
    })
  })
  return out
}

/**
 * Фабрика обработчиков для опций зум-плагина: один rAF-гейт на график, чтобы
 * непрерывная панорама не пересэмплировала чаще кадра.
 */
export function makeLodHandlers(getFullSeries, cap = LOD_POINT_CAP) {
  let scheduled = false
  function run({ chart }) {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      applyViewportLod(chart, getFullSeries() || [], cap)
    })
  }
  return { onZoomComplete: run, onPanComplete: run }
}
