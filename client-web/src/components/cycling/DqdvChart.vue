<script setup>
/**
 * DqdvChart — дифференциальный график: |dQ/dV| vs V (пики фазовых переходов)
 * или |dV/dQ| vs Q (DVA — локализация деградации по ёмкости).
 * Методы: Савицкий–Голей (navani-конвейер, дефолт) / скользящее среднее.
 * Автоподписи пиков (prominence-фильтр) у последнего выбранного цикла.
 *
 * Извлечено из CyclingCharts.vue 1:1 (механический рефакторинг).
 */
import { ref, computed } from 'vue'
import { Scatter } from 'vue-chartjs'
import '@/utils/cyclingChartSetup'
import { useCyclingStyles } from '@/composables/useCyclingStyles'
import { findPeaks } from '@/utils/savitzkyGolay'
import { getDifferentialCurve, savgolCacheVersion } from '@/utils/savgolAsync'
import {
  sessionShortLabel, fillColor, cycleAlpha, viridisAt,
  chartAnimFor, sessionDashFor, dedupeLegend, legendToggleAll,
  applyChartStyle, exportChartPNG, resetZoom,
} from '@/utils/cyclingChartShared'
import { minMaxDecimate, ensureSortedByX, makeLodHandlers, useFrameCoalesced } from '@/utils/chartLod'
import { timeBuild, makePaintPlugin } from '@/utils/chartPerf'
import ChartCard from '@/components/cycling/ChartCard.vue'

const props = defineProps({
  sessions: { type: Array, default: () => [] },
  selectedCycles: { type: Array, default: () => [] },
  stepFilter: { type: String, default: 'discharge' },
  smoothingWindow: { type: Number, default: 5 },
  dqdvMethod: { type: String, default: 'savgol' },   // 'savgol' | 'ma'
  dqdvPreset: { type: String, default: 'standard' },
  dqdvView: { type: String, default: 'dqdv' },       // 'dqdv' | 'dvdq'
  dqdvPeaks: { type: Boolean, default: true },
  cycleGradient: { type: Boolean, default: false },
  publicationMode: { type: Boolean, default: false },
  experimentLabel: { type: String, default: '' },
})
const emit = defineEmits(['style-click'])

const { getChartStyle, colorForSession: resolveColor } = useCyclingStyles()
const dqdvStyle = computed(() => getChartStyle('dqdv'))

function sessionColorFor(session) {
  const idx = props.sessions.findIndex(x => x.session_id === session.session_id)
  return resolveColor('dqdv', idx >= 0 ? idx : 0)
}

const chartRef = ref(null)
const axisLock = ref('xy')

// ── Скользящее среднее (legacy-метод) ──────────────────────────────────
// Сырые разности |ΔQ/ΔV| по соседним точкам одного шага; |ΔV| > 2 mV —
// отсечка шума; сглаживание окном w (1 = без сглаживания).
function computeDQDV(points, smoothingWindow = 5) {
  const charge = points.filter(d => (d.step_type === 'charge' || d.step_type === 'cccv') && d.voltage_v != null && d.capacity_ah != null)
  const discharge = points.filter(d => d.step_type === 'discharge' && d.voltage_v != null && d.capacity_ah != null)

  const wRaw = Number(smoothingWindow)
  const w = Number.isFinite(wRaw) ? Math.max(1, Math.min(21, Math.round(wRaw))) : 5

  function process(steps) {
    if (steps.length < 2) return []
    const raw = []
    for (let i = 1; i < steps.length; i++) {
      // Пары через границу шага не считаем: ELITECH сбрасывает capacity_ah
      // на старте шага — dQ через CC→CV шов был бы ложным пиком.
      if (steps[i].step_number !== steps[i - 1].step_number) continue
      const dV = steps[i].voltage_v - steps[i - 1].voltage_v
      const dQ = steps[i].capacity_ah - steps[i - 1].capacity_ah
      if (Math.abs(dV) < 0.002) continue
      const dqdv = Math.abs(dQ / dV)
      if (!Number.isFinite(dqdv) || dqdv > 1e6) continue
      const v = (steps[i].voltage_v + steps[i - 1].voltage_v) / 2
      raw.push({ x: v, y: dqdv })
    }
    raw.sort((a, b) => a.x - b.x)

    if (w <= 1) return raw

    const half = Math.floor(w / 2)
    const smoothed = []
    for (let i = 0; i < raw.length; i++) {
      const from = Math.max(0, i - half)
      const to = Math.min(raw.length, i + half + 1)
      let sum = 0
      for (let j = from; j < to; j++) sum += raw[j].y
      smoothed.push({ x: raw[i].x, y: sum / (to - from) })
    }
    return smoothed
  }

  return { charge: process(charge), discharge: process(discharge) }
}

// SavGol-кривые считает savgolAsync: мемо-кэш (повторные перестройки ~0 мс) +
// параллельный пул Web Workers на промахах (UI не блокируется; кривые
// проявляются прогрессивно по бампу savgolCacheVersion).

// Датасеты + пики + ПОЛНЫЕ серии (LOD-источник) одним проходом.
// Пики ищутся на полной сетке (точнее позиции, чем на прореженной).
const dqdvComputed = computed(() => timeBuild('dqdv', () => {
  const datasets = []
  const peaks = []
  const fulls = []   // 1:1 с datasets — для зум-пересэмплинга

  function pushDs(ds, full) {
    const sorted = ensureSortedByX(full)
    ds.data = minMaxDecimate(full)
    if (sorted) { ds.normalized = true; ds.parsing = false }
    datasets.push(ds)
    fulls.push(sorted)
  }
  const isDvdq = props.dqdvView === 'dvdq'
  const useSavgol = props.dqdvMethod === 'savgol' || isDvdq   // dV/dQ — только SG
  const sortedCycles = [...props.selectedCycles].sort((a, b) => a - b)
  const nCycles = sortedCycles.length
  const dStyle = dqdvStyle.value
  // реактивная зависимость: готовность кривых из пула воркеров
  void savgolCacheVersion.value

  for (const s of props.sessions) {
    const colorBase = sessionColorFor(s)
    const sessionDash = sessionDashFor(props.sessions.indexOf(s), props.sessions.length)
    sortedCycles.forEach((cycleNum, cIdx) => {
      const points = s.cycleDataMap?.[cycleNum] || []
      if (!points.length) return

      let charge, discharge
      if (useSavgol) {
        const kind = isDvdq ? 'dvdq' : 'dqdv'
        charge = getDifferentialCurve(points, { kind, preset: props.dqdvPreset, step: 'charge' }).curve || []
        discharge = getDifferentialCurve(points, { kind, preset: props.dqdvPreset, step: 'discharge' }).curve || []
      } else {
        ({ charge, discharge } = computeDQDV(points, props.smoothingWindow))
      }
      // ±30% модуляция толщины по индексу цикла — глаз следит эволюцию пиков.
      const userWidth = Number(dStyle.borderWidth) || 1.2
      const cycleMul = nCycles > 1 ? (0.7 + (cIdx / (nCycles - 1)) * 0.6) : 1
      const thickness = userWidth * cycleMul
      const alpha = cycleAlpha(cIdx, nCycles)
      const cycleColor = props.cycleGradient
        ? viridisAt(nCycles <= 1 ? 1 : cIdx / (nCycles - 1))
        : fillColor(colorBase, alpha)
      const showCharge = props.stepFilter !== 'discharge'
      const showDischarge = props.stepFilter !== 'charge'

      // Автоподпись пиков: только ПОСЛЕДНИЙ выбранный цикл сессии/шага —
      // подписи маркируют текущее состояние, эволюцию показывает градиент.
      const annotate = useSavgol && props.dqdvPeaks && cIdx === nCycles - 1
      const fmt = (p) => (isDvdq ? `${p.x.toFixed(2)} мА·ч` : `${p.x.toFixed(2)} В`)

      if (showCharge && charge.length) {
        if (annotate) peaks.push(...findPeaks(charge).map(p => ({ ...p, color: cycleColor, label: fmt(p) })))
        pushDs(applyChartStyle({
          label: `Ц${cycleNum}_${sessionShortLabel(s, props.sessions)} · заряд`,
          borderColor: cycleColor,
          backgroundColor: cycleColor,
          pointBackgroundColor: cycleColor,
          pointBorderColor: cycleColor,
          pointRadius: 0,
          borderWidth: thickness,
          borderDash: sessionDash || [4, 2],
          showLine: true,
        }, dStyle), charge)
      }
      if (showDischarge && discharge.length) {
        if (annotate) peaks.push(...findPeaks(discharge).map(p => ({ ...p, color: cycleColor, label: fmt(p) })))
        pushDs(applyChartStyle({
          label: `Ц${cycleNum}_${sessionShortLabel(s, props.sessions)} · разряд`,
          borderColor: cycleColor,
          backgroundColor: cycleColor,
          pointBackgroundColor: cycleColor,
          pointBorderColor: cycleColor,
          pointRadius: 0,
          borderWidth: thickness,
          borderDash: sessionDash || undefined,
          showLine: true,
        }, dStyle), discharge)
      }
    })
  }

  return { datasets, peaks, fulls }
}))

const chartData = computed(() => ({ datasets: dqdvComputed.value.datasets }))

// Репейнт не чаще кадра: шквал реактивных перестроек схлопывается в один
const renderData = useFrameCoalesced(chartData)

// LOD-обработчики зума/панорамы (rAF-гейт внутри)
const lod = makeLodHandlers(() => dqdvComputed.value.fulls)

// Inline-плагин: точка + подпись позиции над каждым найденным пиком.
// Данные — из options.plugins.dqdvPeaks (реактивно с опциями).
const dqdvPeaksPlugin = {
  id: 'dqdvPeaks',
  afterDatasetsDraw(chart) {
    const cfg = chart.options.plugins?.dqdvPeaks
    if (!cfg?.show || !cfg.peaks?.length) return
    const { ctx, chartArea, scales: { x, y } } = chart
    ctx.save()
    ctx.font = '600 9px Rosatom, "Segoe UI", sans-serif'
    ctx.textAlign = 'center'
    for (const p of cfg.peaks) {
      const px = x.getPixelForValue(p.x)
      const py = y.getPixelForValue(p.y)
      if (!Number.isFinite(px) || !Number.isFinite(py)) continue
      if (px < chartArea.left || px > chartArea.right || py < chartArea.top || py > chartArea.bottom) continue
      ctx.fillStyle = p.color || '#003274'
      ctx.beginPath()
      ctx.arc(px, py, 2.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillText(p.label, px, Math.max(py - 7, chartArea.top + 10))
    }
    ctx.restore()
  },
}

const dqdvPlugins = [dqdvPeaksPlugin, makePaintPlugin('dqdv')]

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: chartAnimFor(props.sessions.length),
  plugins: {
    legend: {
      display: !props.publicationMode,
      position: 'bottom',
      labels: { boxWidth: 12, font: { size: 10 }, generateLabels: dedupeLegend }, onClick: legendToggleAll,
    },
    title: {
      display: true,
      text: props.experimentLabel
        ? `${props.experimentLabel} — ${props.dqdvView === 'dvdq' ? 'dV/dQ' : 'dQ/dV'}`
        : (props.dqdvView === 'dvdq'
            ? 'Дифференциальное напряжение (|dV/dQ|, DVA)'
            : 'Дифференциальная ёмкость (|dQ/dV|)'),
      font: { size: 13, weight: 600 },
      color: '#003274',
      padding: { bottom: 10 },
    },
    // Автоподписи пиков (рисует dqdvPeaksPlugin)
    dqdvPeaks: {
      show: props.dqdvPeaks && (props.dqdvMethod === 'savgol' || props.dqdvView === 'dvdq'),
      peaks: dqdvComputed.value.peaks,
    },
    // Drag = панорама, колесо = зум у курсора. Y min=0: |d·/d·| ≥ 0.
    zoom: {
      pan:  { enabled: true, mode: axisLock.value, onPanComplete: lod.onPanComplete },
      zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: axisLock.value, onZoomComplete: lod.onZoomComplete },
      limits: {
        x: { min: 'original', max: 'original' },
        y: { min: 0, max: 'original' },
      },
    },
  },
  scales: {
    y: {
      title: {
        display: true,
        text: props.dqdvView === 'dvdq' ? '|dV/dQ|, В/мА·ч' : '|dQ/dV|, Ah/V',
        font: { size: 10 },
      },
      ticks: { font: { size: 10 } },
      grid: { color: 'rgba(0,50,116,0.05)' },
    },
    x: {
      type: 'linear',
      title: {
        display: true,
        text: props.dqdvView === 'dvdq' ? 'Q, мА·ч' : 'E, V',
        font: { size: 10 },
      },
      ticks: { font: { size: 10 } },
      grid: { display: false },
    },
  },
}))

function onExport() {
  exportChartPNG(chartRef, props.dqdvView === 'dvdq' ? 'dvdq' : 'dqdv', {
    experimentLabel: props.experimentLabel,
    sessions: props.sessions,
  })
}
</script>

<template>
  <ChartCard
    v-model:axisLock="axisLock"
    :axisModes="['xy', 'x', 'y']"
    perfId="dqdv"
    @style-click="emit('style-click', $event)"
    @reset="resetZoom(chartRef)"
    @export="onExport"
  >
    <Scatter ref="chartRef" :data="renderData" :options="chartOptions" :plugins="dqdvPlugins" />
  </ChartCard>
</template>
