<script setup>
/**
 * CyclingSohChart — protocol-grouped cycle-life comparison. Two Y-metrics on
 * the same data (matching the colleague Excel, which plots both):
 *   • «Ёмкость, Ah» — raw discharge capacity vs cycle
 *   • «SOH, %»      — capacity retention vs cycle (default)
 * One thin line per cell coloured by protocol, optional per-protocol mean ± σ
 * band, and (SOH only) an 80 % EOL reference line with a cycles-to-EOL readout.
 *
 *   SOH(n) = DChg.Cap(n) / DChg.Cap(baseline) × 100 %
 *
 * Baseline = first cycle after the (optional) formation exclusion. Default
 * excludes 0 cycles → normalise to cycle 1 (matches colleague Excel). The
 * "формовка: N" control raises the baseline past N formation cycles.
 *
 * Self-contained: it owns its display controls (formation N, mode, EOL),
 * takes only `sessions` (the active session views, each with summary +
 * protocol + color). Re-derives on every data/selection change → the chart
 * auto-rebuilds, which is the whole point.
 */
import { ref, computed } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler,
} from 'chart.js'
import zoomPlugin from 'chartjs-plugin-zoom'
import { cellSohSeries, protocolMeanStd, cyclesToThreshold } from '@/utils/cyclingSoh'
import { minMaxDecimate, ensureSortedByX, makeLodHandlers, useFrameCoalesced } from '@/utils/chartLod'
import { timeBuild, makePaintPlugin, perfEnabled, chartPerf } from '@/utils/chartPerf'
import { useExpanded } from '@/composables/useExpanded'

// Idempotent — CyclingCharts registers the same set; registering twice is a
// no-op, but we register here too so this component stands on its own.
ChartJS.register(LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler, zoomPlugin)

const props = defineProps({
  sessions: { type: Array, default: () => [] },
})

// Distinct, reasonably accessible hues; protocols map by sorted order.
const PROTO_COLORS = [
  '#003274', '#D3A754', '#2E7D32', '#C0392B',
  '#7B4F9D', '#0097A7', '#E67E22', '#5D4037',
  '#1565C0', '#AD1457',
]

// ── Display controls (per this chart) ──
const formationExclude = ref(0)        // exclude first N cycles from baseline+plot
const mode = ref('cells')              // 'cells' | 'mean'
const metric = ref('soh')              // 'soh' (%) | 'capacity' (Ah) — colleague plots both
const eolThreshold = ref(80)           // % SOH end-of-life line
const showEol = ref(true)
const hiddenProtocols = ref(new Set()) // protocols toggled off via the legend

const isSoh = computed(() => metric.value === 'soh')

function toggleProtocol(proto) {
  const s = new Set(hiddenProtocols.value)
  s.has(proto) ? s.delete(proto) : s.add(proto)
  hiddenProtocols.value = s
}

const sohChartRef = ref(null)

// Разворот в полноэкранный оверлей (Esc / фон / кнопка — выход)
const { expanded, toggle: toggleExpanded } = useExpanded()

// Group active sessions by protocol (null/'' → «без протокола»).
const protocolGroups = computed(() => {
  const groups = new Map()
  for (const s of props.sessions) {
    if (!s.summary?.length) continue
    const key = (s.protocol && String(s.protocol).trim()) || '— без протокола —'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(s)
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru'))
})

const protocolColor = computed(() => {
  const map = new Map()
  protocolGroups.value.forEach(([proto], i) => map.set(proto, PROTO_COLORS[i % PROTO_COLORS.length]))
  return map
})

// Per-cell series for the active metric (thin wrapper over the tested util).
function cellSeries(session) {
  return cellSohSeries(session.summary, {
    formationExclude: formationExclude.value,
    metric: metric.value,
  })
}

function shortLabel(s) {
  return s.file_name || `№${s.session_id}`
}

// ── Memoization (perf) ──────────────────────────────────────────────────
// cell series + per-protocol stats were recomputed in BOTH chartData and
// eolReadout — a full 2× pass over every cell on each toggle. Compute each
// once here; both consumers read these maps.
const seriesBySession = computed(() => {
  const m = new Map()
  for (const s of props.sessions) m.set(s.session_id, cellSeries(s))
  return m
})
function seriesOf(s) { return seriesBySession.value.get(s.session_id) || [] }

// Per-protocol mean ± σ. minCoverage = half the cells, so the mean is only
// drawn where at least half the cohort is still alive (survivorship guard).
function protocolStats(sessions) {
  const minCoverage = Math.max(1, Math.ceil(sessions.length / 2))
  return protocolMeanStd(sessions.map(seriesOf), { minCoverage })
}
const statsByProto = computed(() => {
  const m = new Map()
  for (const [proto, sessions] of protocolGroups.value) m.set(proto, protocolStats(sessions))
  return m
})

function hexToRgba(hex, a) {
  const h = hex.replace('#', '')
  const n = parseInt(h, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

// Max cycle across VISIBLE protocols only — so hiding a long-running protocol
// (e.g. LFP 4.0 @ 1000 cyc) rescales the X-axis to the data that's actually
// shown, instead of leaving empty space out to the global max.
const maxCycle = computed(() => {
  let m = 1
  for (const [proto, sessions] of protocolGroups.value) {
    if (hiddenProtocols.value.has(proto)) continue
    for (const s of sessions) {
      for (const r of (s.summary || [])) {
        if (Number(r.cycle_number) > m) m = Number(r.cycle_number)
      }
    }
  }
  return m
})

// Marker shapes rotated per line so lines differ by SHAPE as well as colour
// (triangles vs circles vs squares…). On by default — the user asked for shape
// distinction; toggle «Формы» off for plain lines. Markers are sampled (~12 per
// line) so dense 1000-cycle curves don't turn into a wall of dots.
const MARKER_SHAPES = ['circle', 'triangle', 'rectRot', 'rect', 'star', 'cross', 'crossRot']
// Off by default — opt in via the «формы» toggle when comparing many lines.
const varyMarkers = ref(false)
function markerShape(i) { return MARKER_SHAPES[i % MARKER_SHAPES.length] }
function sampledRadius(ctx) {
  const n = ctx.dataset?.data?.length || 0
  if (n <= 14) return 3
  return ctx.dataIndex % Math.ceil(n / 12) === 0 ? 3 : 0
}
// Count of lines that will actually be drawn (cells: visible cells; mean:
// visible protocols). Shape-markers exist to TELL LINES APART — so on a single
// line they're pointless noise. Suppress below 2 lines regardless of the toggle.
const visibleLineCount = computed(() => {
  let n = 0
  for (const [proto, sessions] of protocolGroups.value) {
    if (hiddenProtocols.value.has(proto)) continue
    if (mode.value === 'cells') {
      for (const s of sessions) if (seriesOf(s).length) n++
    } else if (statsByProto.value.get(proto)?.mean.length) {
      n++
    }
  }
  return n
})
const showShapeMarkers = computed(() => varyMarkers.value && visibleLineCount.value >= 2)
function markerProps(lineIdx) {
  if (!showShapeMarkers.value) return { pointStyle: 'circle', pointRadius: 0 }
  return { pointStyle: markerShape(lineIdx), pointRadius: sampledRadius }
}

// Display-only decimation: caps a rendered line at ~MAX points (keeps every
// k-th + last) so 600–1000-cycle series stay smooth to pan/zoom. Applied ONLY
// to chart datasets — the EOL math runs on the full memoized series. Equal-
// length arrays (mean/upper/lower) decimate on identical indices → band stays
// x-aligned.
const MAX_RENDER_POINTS = 500
function decimateXY(points) {
  const n = points.length
  if (n <= MAX_RENDER_POINTS) return points
  const k = Math.ceil(n / MAX_RENDER_POINTS)
  const out = []
  for (let i = 0; i < n; i += k) out.push(points[i])
  if (out[out.length - 1] !== points[n - 1]) out.push(points[n - 1])
  return out
}

// Датасеты + ПОЛНЫЕ серии ячеек (LOD): обзор — min-max децимация, зум —
// пересэмплинг видимого окна из полного разрешения. Полоса mean±σ остаётся на
// согласованной стрид-децимации (fill '-1' требует одинаковых x у трёх серий)
// и в LOD не участвует (fulls = null).
const built = computed(() => timeBuild('soh', () => {
  const datasets = []
  const fulls = []
  let lineIdx = 0          // global line counter → distinct shape per line
  for (const [proto, sessions] of protocolGroups.value) {
    if (hiddenProtocols.value.has(proto)) continue   // legend toggle
    const color = protocolColor.value.get(proto)
    if (mode.value === 'cells') {
      sessions.forEach((s, i) => {
        const data = seriesOf(s)
        if (!data.length) return
        // light alpha spread so overlapping cells of one protocol differ
        const alpha = sessions.length > 1 ? 0.55 + 0.4 * (i / (sessions.length - 1)) : 0.8
        const sorted = ensureSortedByX(data)
        datasets.push({
          label: `${proto} · ${shortLabel(s)}`,
          data: minMaxDecimate(data),
          normalized: !!sorted,
          ...(sorted ? { parsing: false } : {}),
          borderColor: hexToRgba(color, alpha),
          backgroundColor: hexToRgba(color, alpha),
          borderWidth: 1.4,
          pointHoverRadius: 4,
          tension: 0,
          fill: false,
          _proto: proto,
          ...markerProps(lineIdx++),
        })
        fulls.push(sorted)
      })
    } else {
      const { mean, upper, lower } = statsByProto.value.get(proto)
      if (!mean.length) continue
      // mean line (bold) + band (upper hidden, lower fills to upper)
      datasets.push({
        label: `${proto} (среднее, n=${sessions.length})`,
        data: decimateXY(mean),
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2.6,
        pointHoverRadius: 4,
        tension: 0,
        fill: false,
        _proto: proto,
        ...markerProps(lineIdx++),
      })
      fulls.push(null)
      datasets.push({
        label: `${proto} +σ`, data: decimateXY(upper), borderColor: 'transparent',
        backgroundColor: 'transparent', pointRadius: 0, fill: false, tension: 0,
        _band: true,
      })
      fulls.push(null)
      datasets.push({
        label: `${proto} −σ`, data: decimateXY(lower), borderColor: 'transparent',
        backgroundColor: hexToRgba(color, 0.13), pointRadius: 0, fill: '-1', tension: 0,
        _band: true,
      })
      fulls.push(null)
    }
  }
  if (isSoh.value && showEol.value && datasets.length) {
    datasets.push({
      label: `${eolThreshold.value}% EOL`,
      data: [{ x: 1, y: eolThreshold.value }, { x: maxCycle.value, y: eolThreshold.value }],
      borderColor: 'rgba(0,0,0,0.4)',
      borderWidth: 1,
      borderDash: [6, 4],
      pointRadius: 0,
      fill: false,
    })
    fulls.push(null)
  }
  return { datasets, fulls }
}))

const chartData = computed(() => ({ datasets: built.value.datasets }))

// Репейнт не чаще кадра (шквал перестроек → один)
const renderData = useFrameCoalesced(chartData)

// LOD-обработчики зума/панорамы (rAF-гейт внутри)
const lod = makeLodHandlers(() => built.value.fulls)

const paintPlugins = [makePaintPlugin('soh')]
const sohPerf = computed(() => (perfEnabled.value ? chartPerf.soh : null))

const yAxisLabel = computed(() => (isSoh.value ? 'SOH, %' : 'DCh ёмкость, Ah'))
const chartTitle = computed(() => (isSoh.value
  ? 'SOH — удержание ёмкости по протоколам'
  : 'Разрядная ёмкость по протоколам'))
const unit = computed(() => (isSoh.value ? '%' : 'Ah'))
const yDecimals = computed(() => (isSoh.value ? 2 : 4))

// Axis lock for zoom/pan: 'xy' | 'x' | 'y'. Fix one axis while scaling the
// other (Origin/Plotly-style). Read live by the zoom config below; toggling it
// recomputes the options so the plugin picks up the new mode immediately.
const axisLock = ref('xy')

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  // Minimal 150ms animation for small comparisons; off when many cells/bands
  // are drawn (animating a large cohort each redraw lagged).
  animation: chartData.value.datasets.length > 10 ? false : { duration: 150, easing: 'easeOutQuad' },
  interaction: { mode: 'nearest', intersect: false },
  plugins: {
    legend: {
      display: false,  // custom protocol legend below; per-cell legend would be huge
    },
    title: {
      display: true,
      text: chartTitle.value,
      font: { size: 13 },
      color: '#003274',
    },
    tooltip: {
      callbacks: {
        label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(yDecimals.value)} ${unit.value} @ цикл ${ctx.parsed.x}`,
      },
      filter: (ctx) => !ctx.dataset._band,
    },
    zoom: {
      pan: { enabled: true, mode: axisLock.value, onPanComplete: lod.onPanComplete },
      zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: axisLock.value, onZoomComplete: lod.onZoomComplete },
      // Keep pan/zoom inside the data range — can't drift off into empty space.
      limits: { x: { min: 'original', max: 'original' }, y: { min: 'original', max: 'original' } },
    },
  },
  scales: {
    x: {
      type: 'linear',
      title: { display: true, text: 'Номер цикла', font: { size: 10 } },
      ticks: { font: { size: 10 } },
      grid: { color: 'rgba(0,50,116,0.05)' },
    },
    y: {
      title: { display: true, text: yAxisLabel.value, font: { size: 10 } },
      ticks: { font: { size: 10 } },
      grid: { color: 'rgba(0,50,116,0.05)' },
    },
  },
}))

// Per-protocol readout from the mean curve. SOH mode → cycles-to-EOL;
// capacity mode → last capacity + fade % from the first cycle.
const eolReadout = computed(() => {
  const rows = []
  for (const [proto, sessions] of protocolGroups.value) {
    if (hiddenProtocols.value.has(proto)) continue
    const { mean, minN, maxN } = statsByProto.value.get(proto)
    const reached = isSoh.value ? cyclesToThreshold(mean, eolThreshold.value) : null
    const first = mean.length ? mean[0] : null
    const last = mean.length ? mean[mean.length - 1] : null
    const fade = (first && last && first.y) ? ((first.y - last.y) / first.y) * 100 : null
    rows.push({
      proto,
      color: protocolColor.value.get(proto),
      n: sessions.length,
      minN, maxN,                       // cohort thinning at the tail
      toEol: reached,
      lastCycle: last?.x ?? null,
      lastVal: last?.y ?? null,
      fade,
    })
  }
  return rows
})

// PNG export — 2× white-background canvas, same approach as the other charts.
function exportPNG() {
  const inst = sohChartRef.value?.chart
  if (!inst) return
  const orig = inst.options.devicePixelRatio
  inst.options.devicePixelRatio = Math.max(2, window.devicePixelRatio || 1)
  inst.resize()
  const src = inst.canvas
  const tmp = document.createElement('canvas')
  tmp.width = src.width; tmp.height = src.height
  const ctx = tmp.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, tmp.width, tmp.height)
  ctx.drawImage(src, 0, 0)
  const url = tmp.toDataURL('image/png', 1)
  inst.options.devicePixelRatio = orig
  inst.resize()
  const link = document.createElement('a')
  link.href = url
  link.download = `soh_${metric.value}_${mode.value}.png`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function resetZoom() {
  sohChartRef.value?.chart?.resetZoom?.()
}
</script>

<template>
  <Teleport to="body" :disabled="!expanded">
    <div v-if="expanded" class="soh-expand-backdrop" @click="toggleExpanded" />
    <div class="soh-chart-card glass-card" :class="{ 'soh-chart-card--expanded': expanded }">
    <div class="soh-head">
      <span class="soh-title">Сравнение по протоколам</span>

      <div class="soh-controls">
        <div class="soh-seg" title="Метрика по оси Y: разрядная ёмкость (Ah) или SOH — удержание (%)">
          <button class="soh-seg-btn" :class="{ 'is-active': metric === 'capacity' }" @click="metric = 'capacity'">Ёмкость, Ah</button>
          <button class="soh-seg-btn" :class="{ 'is-active': metric === 'soh' }" @click="metric = 'soh'">SOH, %</button>
        </div>

        <div class="soh-seg" title="Один график на ячейку, или среднее ± σ по протоколу">
          <button class="soh-seg-btn" :class="{ 'is-active': mode === 'cells' }" @click="mode = 'cells'">Ячейки</button>
          <button class="soh-seg-btn" :class="{ 'is-active': mode === 'mean' }" @click="mode = 'mean'">Среднее ± σ</button>
        </div>

        <label class="soh-field" :class="{ 'soh-field--off': visibleLineCount < 2 }"
               :title="visibleLineCount < 2 ? 'Формы нужны, чтобы различать НЕСКОЛЬКО линий — на одной линии не применяются' : 'Разные формы маркеров по линиям (▲ ● ■ ★…) — различать линии не только цветом, но и формой'">
          <input type="checkbox" v-model="varyMarkers" :disabled="visibleLineCount < 2" />
          формы
        </label>

        <label class="soh-field" :title="isSoh ? 'Исключить первые N формовочных циклов из нормировки (0 = считать с формовкой)' : 'Скрыть первые N формовочных циклов'">
          формовка
          <input v-model.number="formationExclude" type="number" min="0" max="50" class="soh-input" />
        </label>

        <!-- EOL is SOH-only, but we keep it in the layout (dimmed + disabled in
             capacity mode) so toggling the metric never shifts the buttons. -->
        <label class="soh-field soh-field--eol" :class="{ 'soh-field--off': !isSoh }"
               :title="isSoh ? 'Линия конца жизни (End of Life)' : 'EOL — только для режима SOH'">
          <input type="checkbox" v-model="showEol" :disabled="!isSoh" />
          EOL
          <input v-model.number="eolThreshold" type="number" min="1" max="100" class="soh-input" :disabled="!isSoh || !showEol" />%
        </label>

        <div class="soh-axis-lock" title="Фиксация оси при зуме и панораме · XY — обе · X — только X (Y зафиксирован) · Y — только Y">
          <button class="soh-axis-btn" :class="{ 'is-active': axisLock === 'xy' }" @click="axisLock = 'xy'">XY</button>
          <button class="soh-axis-btn" :class="{ 'is-active': axisLock === 'x' }" @click="axisLock = 'x'">X</button>
          <button class="soh-axis-btn" :class="{ 'is-active': axisLock === 'y' }" @click="axisLock = 'y'">Y</button>
        </div>

        <button class="soh-icon-btn" :title="expanded ? 'Свернуть (Esc)' : 'Развернуть на весь экран'" @click="toggleExpanded"><i :class="expanded ? 'pi pi-window-minimize' : 'pi pi-window-maximize'"></i></button>
        <button class="soh-icon-btn" title="Скачать PNG" @click="exportPNG"><i class="pi pi-image"></i></button>
        <button class="soh-icon-btn" title="Сброс зума (или даблклик по графику) · колесо — масштаб у курсора, перетаскивание — панорама" @click="resetZoom"><i class="pi pi-search-minus"></i></button>
      </div>
    </div>

    <!-- Clickable protocol legend (one chip per protocol; click to hide/show) -->
    <div class="soh-legend">
      <button
        v-for="[proto] in protocolGroups"
        :key="proto"
        class="soh-legend-item"
        :class="{ 'is-hidden': hiddenProtocols.has(proto) }"
        :title="hiddenProtocols.has(proto) ? 'Показать протокол' : 'Скрыть протокол'"
        @click="toggleProtocol(proto)"
      >
        <span class="soh-legend-swatch" :style="{ background: protocolColor.get(proto) }"></span>
        {{ proto }}
      </button>
    </div>

    <div class="soh-wrap" @dblclick="resetZoom">
      <div v-if="sohPerf" class="soh-perf-badge">
        ⏱ {{ sohPerf.build ?? '—' }}мс · 🎨 {{ sohPerf.paint ?? '—' }}мс · {{ sohPerf.points != null ? (sohPerf.points > 999 ? (sohPerf.points/1000).toFixed(1) + 'к' : sohPerf.points) : '—' }} тчк
      </div>
      <Line v-if="protocolGroups.length" ref="sohChartRef" :data="renderData" :options="chartOptions" :plugins="paintPlugins" />
      <div v-else class="soh-empty">Нет активных измерений с данными циклирования.</div>
    </div>

    <!-- Per-protocol readout: cycles-to-EOL (SOH) or last capacity + fade (Ah) -->
    <div v-if="eolReadout.length" class="soh-readout">
      <div v-for="r in eolReadout" :key="r.proto" class="soh-readout-row">
        <span class="soh-legend-swatch" :style="{ background: r.color }"></span>
        <strong>{{ r.proto }}</strong>
        <span class="soh-readout-sub">n={{ r.n }}</span>
        <span v-if="mode === 'mean' && r.minN && r.minN < r.maxN" class="soh-readout-warn"
              title="К концу теста доживают не все ячейки — среднее обрезано там, где осталось меньше половины">
          ↘ до n={{ r.minN }}
        </span>
        <template v-if="isSoh">
          <span v-if="r.toEol" class="soh-readout-eol">
            до {{ eolThreshold }}%: <strong>{{ r.toEol }}</strong> цикл.
          </span>
          <span v-else class="soh-readout-ok">
            не достиг {{ eolThreshold }}% (посл. {{ r.lastVal != null ? r.lastVal.toFixed(1) : '—' }}% @ {{ r.lastCycle ?? '—' }})
          </span>
        </template>
        <span v-else class="soh-readout-sub">
          посл. <strong>{{ r.lastVal != null ? r.lastVal.toFixed(4) : '—' }} Ah</strong> @ цикл {{ r.lastCycle ?? '—' }}
          <span v-if="r.fade != null">· спад {{ r.fade.toFixed(1) }}%</span>
        </span>
      </div>
    </div>
    </div>
  </Teleport>
</template>

<style scoped>
.soh-chart-card {
  padding: 12px 14px 14px;
  margin-top: 14px;
  position: relative;
}
.soh-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.soh-title {
  font-size: 14px;
  font-weight: 700;
  color: #003274;
}
.soh-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.soh-seg {
  display: inline-flex;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 6px;
  overflow: hidden;
  background: white;
}
.soh-seg-btn {
  padding: 4px 10px;
  border: none;
  border-right: 1px solid rgba(0, 50, 116, 0.1);
  background: white;
  color: rgba(0, 50, 116, 0.65);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}
.soh-seg-btn:last-child { border-right: none; }
.soh-seg-btn.is-active { background: #003274; color: white; font-weight: 600; }
/* Axis-lock toggle (XY / X / Y) — compact segmented control. */
.soh-axis-lock {
  display: inline-flex;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 6px;
  overflow: hidden;
  background: white;
}
.soh-axis-btn {
  padding: 4px 8px;
  min-width: 26px;
  border: none;
  border-right: 1px solid rgba(0, 50, 116, 0.1);
  background: white;
  color: rgba(0, 50, 116, 0.6);
  font-size: 11px;
  font-weight: 600;
  font-family: inherit;
  letter-spacing: 0.02em;
  cursor: pointer;
}
.soh-axis-btn:last-child { border-right: none; }
.soh-axis-btn.is-active { background: #003274; color: white; }
.soh-axis-btn:not(.is-active):hover { background: rgba(0, 50, 116, 0.06); }
.soh-field {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: rgba(0, 50, 116, 0.55);
}
.soh-field--eol { gap: 4px; text-transform: none; }
/* Keeps EOL in the layout but inert in capacity mode — no button jitter. */
.soh-field--off { opacity: 0.3; pointer-events: none; }
/* ── Развёрнутый режим ── */
.soh-expand-backdrop {
  position: fixed;
  inset: 0;
  z-index: 998;
  background: rgba(10, 25, 55, 0.4);
}
.soh-chart-card--expanded {
  position: fixed;
  inset: 18px;
  z-index: 999;
  background: #fff;
  box-shadow: 0 16px 60px rgba(0, 30, 80, 0.3);
  display: flex;
  flex-direction: column;
  overflow: auto;
}
.soh-chart-card--expanded .soh-wrap {
  flex: 1;
  height: auto;
  min-height: 320px;
}

.soh-perf-badge {
  position: absolute; left: 8px; bottom: 6px; z-index: 2;
  font-size: 10px; font-variant-numeric: tabular-nums;
  color: rgba(0, 50, 116, 0.65); background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(0, 50, 116, 0.1); border-radius: 5px;
  padding: 1px 6px; pointer-events: none;
}
.soh-input {
  width: 48px;
  padding: 3px 6px;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 5px;
  font-size: 12px;
  font-family: inherit;
  color: #003274;
}
.soh-input:disabled { opacity: 0.5; }
.soh-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 26px;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 6px;
  background: white;
  color: rgba(0, 50, 116, 0.6);
  cursor: pointer;
}
.soh-icon-btn:hover { background: rgba(0, 50, 116, 0.05); color: #003274; }
.soh-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 6px;
}
.soh-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: #1F2937;
  border: none;
  background: none;
  font-family: inherit;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 5px;
  transition: background 0.12s, opacity 0.12s;
}
.soh-legend-item:hover { background: rgba(0, 50, 116, 0.06); }
.soh-legend-item.is-hidden {
  opacity: 0.4;
  text-decoration: line-through;
}
.soh-legend-swatch {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  flex-shrink: 0;
}
.soh-wrap {
  position: relative;
  height: 420px;
}
.soh-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: rgba(0, 50, 116, 0.4);
  font-size: 13px;
}
.soh-readout {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(0, 50, 116, 0.08);
}
.soh-readout-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #1F2937;
}
.soh-readout-sub { color: rgba(0, 50, 116, 0.45); font-size: 11px; }
.soh-readout-eol { color: #C0392B; }
.soh-readout-ok { color: #2E7D32; }
.soh-readout-warn { color: #B7791F; font-size: 11px; cursor: help; }
</style>
