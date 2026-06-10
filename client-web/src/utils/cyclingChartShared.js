/**
 * cyclingChartShared — общие хелперы графиков циклирования.
 *
 * Извлечено из CyclingCharts.vue (механический рефакторинг 2026-06-10,
 * поведение 1:1). Функции, читавшие props, параметризованы явными
 * аргументами (sessions / unit / view), чтобы модуль оставался чистым и
 * тестируемым; компоненты передают свои props сами.
 */

// ── Подпись сессии (легенды графиков) ──────────────────────────────────
// "Акк. №5" — номер аккумулятора как научный якорь. Два прогона одной
// ячейки получают суффиксы: "№5а"/"№5б" (кириллица а-з, дальше цифры).
// Без battery_id — голый "№42" (session_id).
const BATTERY_RUN_SUFFIX = ['', 'а', 'б', 'в', 'г', 'д', 'е', 'ж', 'з']

export function sessionShortLabel(s, sessions) {
  if (!s.battery_id) return `№${s.session_id}`
  const peers = (sessions || []).filter(x => x.battery_id === s.battery_id)
  if (peers.length <= 1) return `Акк. №${s.battery_id}`
  const idx = peers.findIndex(x => x.session_id === s.session_id)
  const suffix = BATTERY_RUN_SUFFIX[idx + 1] ?? String(idx + 1)
  return `Акк. №${s.battery_id}${suffix}`
}

// ── Цвета ──────────────────────────────────────────────────────────────
// Полупрозрачная заливка из #RRGGBB или hsl() (HSL — автоцвета за пределами
// курируемой палитры).
export function fillColor(color, alpha = 0.08) {
  if (color?.startsWith('hsl(')) {
    return color.replace(/^hsl\((.+)\)$/, `hsla($1, ${alpha})`)
  }
  const h = String(color || '#003274').replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Альфа-градиент по индексу цикла: старые циклы бледнее (контекст), новые
// ярче (текущее состояние ячейки). 0.35 → 1.0 линейно.
export function cycleAlpha(cycleIdx, totalCycles) {
  if (totalCycles <= 1) return 1.0
  return 0.35 + (cycleIdx / (totalCycles - 1)) * 0.65
}

// Viridis (9 стопов, линейная RGB-интерполяция) — перцептивно-равномерный
// градиент порядка циклов: 1-й фиолетовый → последний жёлтый. Публикационный
// стандарт для эволюции пиков; сессии при этом различаются штриховкой.
const VIRIDIS = ['#440154', '#472d7b', '#3b528b', '#2c728e', '#21918c', '#28ae80', '#5ec962', '#addc30', '#fde725']
export function viridisAt(t) {
  const x = Math.max(0, Math.min(1, t)) * (VIRIDIS.length - 1)
  // clamp к последнему сегменту — формат вывода ВСЕГДА 'rgb(r, g, b)'
  const i = Math.min(Math.floor(x), VIRIDIS.length - 2)
  const f = x - i
  const a = VIRIDIS[i], b = VIRIDIS[i + 1]
  const ch = (h, o) => parseInt(h.slice(o, o + 2), 16)
  const mix = (o) => Math.round(ch(a, o) + (ch(b, o) - ch(a, o)) * f)
  return `rgb(${mix(1)}, ${mix(3)}, ${mix(5)})`
}

// ── Децимация для рендера ──────────────────────────────────────────────
// Свыше ~500 точек на линию кривая визуально неотличима от прореженной,
// а Chart.js захлёбывается. Первая и последняя точки всегда сохраняются.
export const RENDER_POINT_CAP = 500

export function decimate(points) {
  if (!points || points.length <= RENDER_POINT_CAP) return points
  const step = Math.ceil(points.length / RENDER_POINT_CAP)
  const out = []
  for (let i = 0; i < points.length; i += step) out.push(points[i])
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1])
  return out
}

// Децимация СТРОК summary (один проход → разряд/заряд/КЭ/pointRadius остаются
// выровнены по индексам). keepSet (выбранные циклы) не выбрасывается никогда.
export function decimateRows(rows, keepSet) {
  const n = rows.length
  if (n <= RENDER_POINT_CAP) return rows
  const step = Math.ceil(n / RENDER_POINT_CAP)
  const out = []
  for (let i = 0; i < n; i++) {
    if (i % step === 0 || i === n - 1 || (keepSet && keepSet.has(rows[i].cycle_number))) {
      out.push(rows[i])
    }
  }
  return out
}

// ── Анимация ───────────────────────────────────────────────────────────
// 150мс — мгновенно, но без рывков; отключается при многих линиях
// (анимировать 12+ серий на каждый redraw — источник лагов).
export const FAST_ANIM = { duration: 150, easing: 'easeOutQuad' }
export const ANIM_HEAVY_AT = 12
export function chartAnimFor(sessionCount) {
  return sessionCount > ANIM_HEAVY_AT ? false : FAST_ANIM
}

// ── Штриховка по сессии ────────────────────────────────────────────────
// Различает ячейки СТИЛЕМ линии на плотных графиках (V-профиль, dQ/dV),
// где маркеры стали бы стеной точек. Применяется только при >1 сессии.
const SESSION_DASH = [[], [6, 3], [3, 3], [9, 4, 2, 4], [5, 5], [11, 3], [2, 4]]
export function sessionDashFor(sessionIndex, sessionCount) {
  if (sessionCount <= 1) return null
  const i = sessionIndex >= 0 ? sessionIndex : 0
  return SESSION_DASH[i % SESSION_DASH.length]
}

// ── Легенда: дедуп + адаптивная сортировка ─────────────────────────────
// Одна запись на «якорь» (текст до " · "): для V/dQdV — "Ц{N}_Акк№X" (цикл ×
// сессия), для ёмкости — "Акк№X". Сортировка цикл→сессия, чтобы один цикл
// разных сессий стоял рядом. Ghost-трейсы в легенду не попадают.
export function dedupeLegend(chart) {
  const seen = new Map()
  chart.data.datasets.forEach((ds, idx) => {
    if (ds.isGhost) return
    const sessionKey = (ds.label || '').split(' · ')[0] || ds.label
    if (!seen.has(sessionKey)) {
      const hidden = !chart.isDatasetVisible(idx)
      seen.set(sessionKey, {
        text: sessionKey,
        fillStyle: ds.borderColor,
        strokeStyle: ds.borderColor,
        lineWidth: 2,
        hidden,
        datasetIndex: idx,
        _datasetIndices: [idx],
      })
    } else {
      seen.get(sessionKey)._datasetIndices.push(idx)
    }
  })
  const entries = Array.from(seen.values())

  const parseCycle = (text) => {
    const m = (text || '').match(/^Ц(\d+)_(.+)/)
    return m ? { cycle: Number(m[1]), rest: m[2] } : null
  }
  entries.sort((a, b) => {
    const ap = parseCycle(a.text)
    const bp = parseCycle(b.text)
    if (!ap && !bp) return 0
    if (!ap) return -1
    if (!bp) return 1
    if (ap.cycle !== bp.cycle) return ap.cycle - bp.cycle
    return ap.rest.localeCompare(bp.rest, 'ru')
  })
  return entries
}

// Клик по сгруппированной записи легенды переключает ВСЕ её датасеты
// (заряд + разряд + КЭ), а не один, как делает дефолтный обработчик.
export function legendToggleAll(e, legendItem, legend) {
  const chart = legend.chart
  const indices = Array.isArray(legendItem._datasetIndices) && legendItem._datasetIndices.length
    ? legendItem._datasetIndices
    : [legendItem.datasetIndex]
  const allVisible = indices.every(i => chart.isDatasetVisible(i))
  indices.forEach(i => chart.setDatasetVisibility(i, !allVisible))
  chart.update()
}

// ── Ёмкость: конвертация единиц / ретенция / форматирование ────────────
// unit: 'Ah' | 'mAh_per_g'; view: 'absolute' | 'retention'.
export function convertCapacity(ah, session, unit) {
  if (ah == null) return null
  if (unit !== 'mAh_per_g') return ah
  const massMg = Number(session?.active_mass_mg)
  if (!Number.isFinite(massMg) || massMg <= 0) return null
  // mAh/g = Ah × 1e6 / m_mg
  return (ah * 1_000_000) / massMg
}

// Первая валидная ёмкость разряда (>0) — база 100% ретенции. Нет базы →
// null, графики показывают разрыв вместо NaN.
export function firstValidDischargeCap(session) {
  const rows = session?.summary
  if (!Array.isArray(rows)) return null
  for (const row of rows) {
    const c = Number(row?.discharge_capacity_ah)
    if (Number.isFinite(c) && c > 0) return c
  }
  return null
}

export function projectCapacity(ah, session, refCap, view, unit) {
  if (ah == null || !Number.isFinite(ah)) return null
  if (view === 'retention') {
    if (!refCap || refCap <= 0) return null
    return (ah / refCap) * 100
  }
  return convertCapacity(ah, session, unit)
}

export function capacityAxisLabel(view, unit) {
  if (view === 'retention') return 'Retention, %'
  return unit === 'mAh_per_g' ? 'C, mAh/g' : 'Capacity, Ah'
}

export function formatCap(ah, session, unit) {
  const v = convertCapacity(ah, session, unit)
  if (v == null || !Number.isFinite(v)) return '—'
  return unit === 'mAh_per_g' ? v.toFixed(2) : v.toFixed(5)
}
export function formatPct(v) {
  return (v == null || !Number.isFinite(v)) ? '—' : v.toFixed(2)
}
export function formatVolt(v) {
  return (v == null || !Number.isFinite(v)) ? '—' : v.toFixed(3)
}

// Применение пер-графикового стиля (из активного пресета) к датасету:
// borderWidth/pointStyle/pointRadius единообразно; цвет уже посчитан палитрой.
export function applyChartStyle(ds, chartStyle) {
  if (!chartStyle) return ds
  const bw = Number(chartStyle.borderWidth)
  if (Number.isFinite(bw) && bw > 0) ds.borderWidth = bw
  const r = Number(chartStyle.pointRadius)
  if (Number.isFinite(r) && r >= 0) {
    ds.pointRadius = r
    ds.pointHoverRadius = r > 0 ? r + 2 : 0
  }
  if (chartStyle.pointStyle !== undefined) {
    ds.pointStyle = chartStyle.pointStyle
  }
  return ds
}

// ── PNG-экспорт / сброс зума ───────────────────────────────────────────
export function sanitizeFilename(str) {
  return String(str).replace(/[^a-zA-Zа-яА-ЯёЁ0-9_-]/g, '_').slice(0, 80)
}

// Публикационный PNG: белый фон (прозрачный канвас плохо вставляется в
// Word/PDF), 2× DPR для печати, имя из experimentLabel или session ids.
export function exportChartPNG(chartRef, name, { experimentLabel, sessions } = {}) {
  const inst = chartRef.value?.chart
  if (!inst) return

  const originalRatio = inst.options.devicePixelRatio
  inst.options.devicePixelRatio = Math.max(2, window.devicePixelRatio || 1)
  inst.resize()

  const src = inst.canvas
  const tmp = document.createElement('canvas')
  tmp.width = src.width
  tmp.height = src.height
  const ctx = tmp.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, tmp.width, tmp.height)
  ctx.drawImage(src, 0, 0)

  const url = tmp.toDataURL('image/png', 1)

  inst.options.devicePixelRatio = originalRatio
  inst.resize()

  const link = document.createElement('a')
  link.href = url
  const prefix = experimentLabel
    ? sanitizeFilename(experimentLabel)
    : 'cycling_' + ((sessions || []).map(s => s.session_id).join('_') || 'x')
  link.download = `${prefix}_${sanitizeFilename(name)}.png`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// Сброс зума/панорамы (zoom-плагин вешает resetZoom на инстанс; vue-chartjs
// оборачивает его в .chart). No-op до маунта графика.
export function resetZoom(chartRef) {
  const inst = chartRef?.value?.chart
  if (inst && typeof inst.resetZoom === 'function') inst.resetZoom()
}
