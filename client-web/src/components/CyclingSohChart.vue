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

// Per-protocol mean ± σ. minCoverage = half the cells, so the mean is only
// drawn where at least half the cohort is still alive (survivorship guard).
function protocolStats(sessions) {
  const minCoverage = Math.max(1, Math.ceil(sessions.length / 2))
  return protocolMeanStd(sessions.map(cellSeries), { minCoverage })
}

function hexToRgba(hex, a) {
  const h = hex.replace('#', '')
  const n = parseInt(h, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

const maxCycle = computed(() => {
  let m = 1
  for (const s of props.sessions) {
    for (const r of (s.summary || [])) {
      if (Number(r.cycle_number) > m) m = Number(r.cycle_number)
    }
  }
  return m
})

const chartData = computed(() => {
  const datasets = []
  for (const [proto, sessions] of protocolGroups.value) {
    if (hiddenProtocols.value.has(proto)) continue   // legend toggle
    const color = protocolColor.value.get(proto)
    if (mode.value === 'cells') {
      sessions.forEach((s, i) => {
        const data = cellSeries(s)
        if (!data.length) return
        // light alpha spread so overlapping cells of one protocol differ
        const alpha = sessions.length > 1 ? 0.55 + 0.4 * (i / (sessions.length - 1)) : 0.8
        datasets.push({
          label: `${proto} · ${shortLabel(s)}`,
          data,
          borderColor: hexToRgba(color, alpha),
          backgroundColor: hexToRgba(color, alpha),
          borderWidth: 1.4,
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.2,
          fill: false,
          _proto: proto,
        })
      })
    } else {
      const { mean, upper, lower } = protocolStats(sessions)
      if (!mean.length) continue
      // mean line (bold) + band (upper hidden, lower fills to upper)
      datasets.push({
        label: `${proto} (среднее, n=${sessions.length})`,
        data: mean,
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2.6,
        pointRadius: 0,
        pointHoverRadius: 3,
        tension: 0.2,
        fill: false,
        _proto: proto,
      })
      datasets.push({
        label: `${proto} +σ`, data: upper, borderColor: 'transparent',
        backgroundColor: 'transparent', pointRadius: 0, fill: false, tension: 0.2,
        _band: true,
      })
      datasets.push({
        label: `${proto} −σ`, data: lower, borderColor: 'transparent',
        backgroundColor: hexToRgba(color, 0.13), pointRadius: 0, fill: '-1', tension: 0.2,
        _band: true,
      })
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
  }
  return { datasets }
})

const yAxisLabel = computed(() => (isSoh.value ? 'SOH, %' : 'DCh ёмкость, Ah'))
const chartTitle = computed(() => (isSoh.value
  ? 'SOH — удержание ёмкости по протоколам'
  : 'Разрядная ёмкость по протоколам'))
const unit = computed(() => (isSoh.value ? '%' : 'Ah'))
const yDecimals = computed(() => (isSoh.value ? 2 : 4))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
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
      pan: { enabled: true, mode: 'xy', modifierKey: 'shift' },
      zoom: { wheel: { enabled: true, modifierKey: 'ctrl' }, pinch: { enabled: true }, mode: 'xy' },
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
    const { mean, minN, maxN } = protocolStats(sessions)
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
  <div class="soh-chart-card glass-card">
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

        <label class="soh-field" :title="isSoh ? 'Исключить первые N формовочных циклов из нормировки (0 = считать с формовкой)' : 'Скрыть первые N формовочных циклов'">
          формовка
          <input v-model.number="formationExclude" type="number" min="0" max="50" class="soh-input" />
        </label>

        <label v-if="isSoh" class="soh-field soh-field--eol" title="Линия конца жизни (End of Life)">
          <input type="checkbox" v-model="showEol" />
          EOL
          <input v-model.number="eolThreshold" type="number" min="1" max="100" class="soh-input" :disabled="!showEol" />%
        </label>

        <button class="soh-icon-btn" title="Скачать PNG" @click="exportPNG"><i class="pi pi-image"></i></button>
        <button class="soh-icon-btn" title="Сброс зума" @click="resetZoom"><i class="pi pi-search-minus"></i></button>
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

    <div class="soh-wrap">
      <Line v-if="protocolGroups.length" ref="sohChartRef" :data="chartData" :options="chartOptions" />
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
