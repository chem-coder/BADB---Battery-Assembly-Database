<script setup>
/**
 * HysteresisChart — гистерезис среднего напряжения ΔV̄ = (V̄_chg − V̄_dch)×1000
 * по циклам (mV; типично 20–400 mV для монеток). Рост = рост поляризации →
 * кинетические потери (SEI, контакт, дендриты). Точки — только у циклов с
 * обоими средними напряжениями.
 *
 * Извлечено из CyclingCharts.vue 1:1 (механический рефакторинг). Прячет себя
 * сам, когда ни одна сессия не несёт средних напряжений (старые загрузки до
 * миграции 019); тумблер показа остаётся у родителя.
 */
import { ref, computed } from 'vue'
import { Line } from 'vue-chartjs'
import '@/utils/cyclingChartSetup'
import { useCyclingStyles } from '@/composables/useCyclingStyles'
import {
  sessionShortLabel, chartAnimFor, dedupeLegend, legendToggleAll,
  exportChartPNG, resetZoom,
} from '@/utils/cyclingChartShared'
import { minMaxDecimate, ensureSortedByX, makeLodHandlers, useFrameCoalesced } from '@/utils/chartLod'
import { timeBuild, makePaintPlugin } from '@/utils/chartPerf'
import ChartCard from '@/components/cycling/ChartCard.vue'

const props = defineProps({
  sessions: { type: Array, default: () => [] },
  experimentLabel: { type: String, default: '' },
})
const emit = defineEmits(['style-click'])

const { getChartStyle, colorForSession: resolveColor, markerForSession } = useCyclingStyles()
const hysteresisStyle = computed(() => getChartStyle('hysteresis'))

function sessionColorFor(session) {
  const idx = props.sessions.findIndex(x => x.session_id === session.session_id)
  return resolveColor('hysteresis', idx >= 0 ? idx : 0)
}

const chartRef = ref(null)
const axisLock = ref('xy')

const hasHysteresisData = computed(() => {
  for (const s of props.sessions) {
    for (const row of s.summary || []) {
      if (row.avg_charge_voltage_v != null && row.avg_discharge_voltage_v != null) return true
    }
  }
  return false
})

// Датасеты + ПОЛНЫЕ серии (LOD): обзор — min-max, зум — пересэмплинг окна.
const built = computed(() => timeBuild('hysteresis', () => {
  const datasets = []
  const fulls = []
  const hStyle = hysteresisStyle.value
  const userWidth = Number(hStyle.borderWidth) || 1.8
  const baseRadius = Number(hStyle.pointRadius) || 3
  // Плотностное гашение маркеров (та же логика, что у Ёмкости)
  const dense = props.sessions.reduce((n, s) => n + Math.min(s.summary?.length || 0, 500), 0) > 1500
  for (const s of props.sessions) {
    if (!s.summary?.length) continue
    const sColor = sessionColorFor(s)
    // Форма маркера по линии — ротация при «разных формах» в ⚙ поповере
    const sIdx = props.sessions.findIndex(x => x.session_id === s.session_id)
    const sMarker = markerForSession('hysteresis', sIdx >= 0 ? sIdx : 0) || 'circle'
    const points = s.summary
      .map(row => {
        const chg = Number(row.avg_charge_voltage_v)
        const dch = Number(row.avg_discharge_voltage_v)
        if (!Number.isFinite(chg) || !Number.isFinite(dch)) return null
        return { x: row.cycle_number, y: (chg - dch) * 1000 }
      })
      .filter(Boolean)
    if (!points.length) continue
    const sorted = ensureSortedByX(points)
    datasets.push({
      label: sessionShortLabel(s, props.sessions),
      data: minMaxDecimate(points),
      normalized: !!sorted,
      ...(sorted ? { parsing: false } : {}),
      borderColor: sColor,
      backgroundColor: sColor,
      tension: 0,
      pointRadius: dense ? 0 : baseRadius,
      pointHitRadius: 6,
      pointHoverRadius: baseRadius + 2,
      pointStyle: sMarker,
      borderWidth: userWidth,
    })
    fulls.push(sorted)
  }
  return { datasets, fulls }
}))

const chartData = computed(() => ({ datasets: built.value.datasets }))

// Репейнт не чаще кадра: шквал реактивных перестроек схлопывается в один
const renderData = useFrameCoalesced(chartData)

// LOD-обработчики зума/панорамы (rAF-гейт внутри)
const lod = makeLodHandlers(() => built.value.fulls)

const paintPlugins = [makePaintPlugin('hysteresis')]

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: chartAnimFor(props.sessions.length),
  plugins: {
    legend: {
      display: props.sessions.length > 1,
      position: 'bottom',
      labels: { boxWidth: 12, font: { size: 11 }, generateLabels: dedupeLegend }, onClick: legendToggleAll,
    },
    title: {
      display: true,
      text: props.experimentLabel
        ? `${props.experimentLabel} — ΔV̄ hysteresis`
        : 'Voltage hysteresis (ΔV̄ = V̄_chg − V̄_dch)',
      font: { size: 13, weight: 600 },
      color: '#003274',
      padding: { bottom: 4 },
    },
    subtitle: {
      display: true,
      text: 'Полиризация — рост = ухудшение кинетики (SEI / контакт / дендриты)',
      font: { size: 11, style: 'italic' },
      color: '#6B7280',
      padding: { bottom: 8 },
    },
    // Drag = панорама, колесо = зум у курсора. Y min=0: ΔV̄ ≥ 0 у здоровых
    // ячеек по определению гистерезиса.
    zoom: {
      pan:  { enabled: true, mode: axisLock.value, onPanComplete: lod.onPanComplete },
      zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: axisLock.value, onZoomComplete: lod.onZoomComplete },
      limits: {
        x: { min: 'original', max: 'original', minRange: 1 },
        y: { min: 0, max: 'original' },
      },
    },
  },
  scales: {
    y: {
      title: { display: true, text: 'ΔV̄, mV', font: { size: 10 } },
      ticks: { font: { size: 10 } },
      beginAtZero: true,
      grid: { color: 'rgba(0,50,116,0.05)' },
    },
    x: {
      type: 'linear',
      title: { display: true, text: 'Cycle number', font: { size: 10 } },
      ticks: { font: { size: 10 }, stepSize: 1 },
      grid: { display: false },
    },
  },
}))

function onExport() {
  exportChartPNG(chartRef, 'voltage_hysteresis', {
    experimentLabel: props.experimentLabel,
    sessions: props.sessions,
  })
}
</script>

<template>
  <ChartCard
    v-if="hasHysteresisData"
    v-model:axisLock="axisLock"
    :axisModes="['xy', 'x', 'y']"
    perfId="hysteresis"
    @style-click="emit('style-click', $event)"
    @reset="resetZoom(chartRef)"
    @export="onExport"
  >
    <Line ref="chartRef" :data="renderData" :options="chartOptions" :plugins="paintPlugins" />
  </ChartCard>
</template>
