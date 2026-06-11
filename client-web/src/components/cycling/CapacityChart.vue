<script setup>
/**
 * CapacityChart — Ёмкость + Кулоновская эффективность (двойная ось Y),
 * публикационный стиль коллеги:
 *   Левая Y  — ёмкость: solid + ЗАЛИТЫЙ маркер (разряд), dashed + ПОЛЫЙ (заряд)
 *   Правая Y — CE другой цветовой семьёй (охра соло / десатурированный мульти)
 * Клик по точке ёмкости — добавить/убрать цикл из выборки (emit toggle-cycle).
 *
 * Извлечено из CyclingCharts.vue 1:1 (механический рефакторинг).
 */
import { ref, computed } from 'vue'
import { Line } from 'vue-chartjs'
import '@/utils/cyclingChartSetup'
import { useCyclingStyles } from '@/composables/useCyclingStyles'
import {
  sessionShortLabel, fillColor, chartAnimFor,
  dedupeLegend, legendToggleAll, firstValidDischargeCap, projectCapacity,
  capacityAxisLabel, exportChartPNG, resetZoom,
} from '@/utils/cyclingChartShared'
import { minMaxDecimate, ensureSortedByX, makeLodHandlers, useFrameCoalesced } from '@/utils/chartLod'
import ChartCard from '@/components/cycling/ChartCard.vue'

const props = defineProps({
  sessions: { type: Array, default: () => [] },
  selectedCycles: { type: Array, default: () => [] },
  stepFilter: { type: String, default: 'discharge' },
  capacityView: { type: String, default: 'absolute' },   // 'absolute' | 'retention'
  capacityUnit: { type: String, default: 'Ah' },          // 'Ah' | 'mAh_per_g'
  experimentLabel: { type: String, default: '' },
})
const emit = defineEmits(['style-click', 'toggle-cycle'])

const { getChartStyle, colorForSession: resolveColor, markerForSession } = useCyclingStyles()
const capacityStyle = computed(() => getChartStyle('capacity'))

function sessionColorFor(session) {
  const idx = props.sessions.findIndex(x => x.session_id === session.session_id)
  return resolveColor('capacity', idx >= 0 ? idx : 0)
}

const chartRef = ref(null)
// Двойная ось Y (Ёмкость + КЭ): независимая панорама Y рассинхронизировала
// бы КЭ — поэтому только XY/X, дефолт X.
const axisLock = ref('x')

const CE_COLOR = '#D3A754'  // охра BADB — CE соло-сессии (как у коллеги)

const hasSummary = computed(() => props.sessions.some(s => s.summary?.length))

// Датасеты + ПОЛНЫЕ серии (LOD): обзор — min-max децимация, зум — пересэмплинг
// окна из полного разрешения. Выбранные циклы доливаются в обзорный уровень,
// чтобы их +2px маркер «что отрисовано ниже» не пропадал после прореживания.
const built = computed(() => {
  const datasets = []
  const fulls = []
  const selectedSet = new Set(props.selectedCycles)
  const isSolo = props.sessions.length === 1
  const showDischarge = props.stepFilter !== 'charge'
  const showCharge = props.stepFilter === 'charge' || props.stepFilter === 'both'
  const cStyle = capacityStyle.value
  const userWidth = Number(cStyle.borderWidth) || 1.8

  function withSelected(dec, full) {
    if (!selectedSet.size || dec === full) return dec
    const have = new Set(dec)
    const add = full.filter(p => selectedSet.has(p.x) && !have.has(p))
    if (!add.length) return dec
    return [...dec, ...add].sort((a, b) => a.x - b.x)
  }

  function pushDs(ds, full) {
    const sorted = ensureSortedByX(full)
    ds.data = withSelected(minMaxDecimate(full), full)
    if (sorted) ds.normalized = true
    datasets.push(ds)
    fulls.push(sorted)
  }

  for (const s of props.sessions) {
    if (!s.summary?.length) continue
    const rows = s.summary

    const sColor = sessionColorFor(s)

    // В ретенции каждая сессия нормируется на свою первую валидную ёмкость
    // разряда (стартует со 100%); без базы — null-значения = разрыв, не NaN.
    const refCap = props.capacityView === 'retention' ? firstValidDischargeCap(s) : null

    const baseRadius = Number(cStyle.pointRadius) || 3
    // Форма маркера по линии — ротация при «разных формах» в ⚙ поповере
    const sIdx = props.sessions.findIndex(x => x.session_id === s.session_id)
    const markerStyle = markerForSession('capacity', sIdx >= 0 ? sIdx : 0) || 'circle'
    if (showDischarge) {
      pushDs({
        label: sessionShortLabel(s, props.sessions),
        yAxisID: 'y',
        borderColor: sColor,
        backgroundColor: sColor,       // залитый маркер
        fill: false,
        tension: 0,
        // scriptable вместо параллельного массива: радиус по точке, остаётся
        // верным при любой LOD-подмене data (массив бы рассинхронизировался)
        pointRadius: (ctx) => (selectedSet.has(ctx.raw?.x) ? baseRadius + 2 : baseRadius),
        pointBackgroundColor: sColor,
        pointBorderColor: sColor,
        pointStyle: markerStyle || 'circle',
        pointHoverRadius: baseRadius + 3,
        borderWidth: userWidth,
      }, rows.map(row => ({
        x: row.cycle_number,
        y: projectCapacity(row.discharge_capacity_ah, s, refCap, props.capacityView, props.capacityUnit),
      })))
    }

    // Заряд — ПОЛЫЙ маркер + пунктир (конвенция коллеги)
    if (showCharge) {
      pushDs({
        label: showDischarge ? `${sessionShortLabel(s, props.sessions)} · charge` : sessionShortLabel(s, props.sessions),
        yAxisID: 'y',
        borderColor: sColor,
        backgroundColor: '#ffffff',     // полый центр
        borderDash: [4, 2],
        tension: 0,
        pointRadius: baseRadius,
        pointBackgroundColor: '#ffffff',
        pointBorderColor: sColor,
        pointStyle: markerStyle || 'circle',
        pointBorderWidth: 1.6,
        borderWidth: Math.max(1, userWidth * 0.8),
      }, rows.map(row => ({
        x: row.cycle_number,
        y: projectCapacity(row.charge_capacity_ah, s, refCap, props.capacityView, props.capacityUnit),
      })))
    }

    // CE — ОТДЕЛЬНАЯ цветовая семья (охра соло; десатурированный мульти)
    const ceColor = isSolo ? CE_COLOR : fillColor(sColor, 0.45)
    pushDs({
      label: `${sessionShortLabel(s, props.sessions)} · CE`,
      yAxisID: 'y1',
      borderColor: ceColor,
      backgroundColor: ceColor,
      tension: 0,
      pointRadius: 2.2,
      pointBackgroundColor: ceColor,
      pointBorderColor: ceColor,
      pointStyle: 'circle',
      borderWidth: 1.2,
    }, rows.map(row => ({
      x: row.cycle_number,
      y: row.coulombic_efficiency,
    })))
  }

  return { datasets, fulls }
})

const chartData = computed(() => ({ datasets: built.value.datasets }))

// Репейнт не чаще кадра: шквал реактивных перестроек схлопывается в один
const renderData = useFrameCoalesced(chartData)

// LOD-обработчики зума/панорамы (rAF-гейт внутри)
const lod = makeLodHandlers(() => built.value.fulls)

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: chartAnimFor(props.sessions.length),
  onClick: (evt, elements, chart) => {
    // Клик → toggle цикла из первой кликнутой точки; клики по CE — шум.
    if (elements.length > 0) {
      const el = elements[0]
      const ds = chart.data.datasets[el.datasetIndex]
      if (ds?.label?.endsWith('· CE')) return
      const pt = ds?.data?.[el.index]
      const cycle = typeof pt === 'object' ? pt.x : pt
      if (cycle !== undefined) emit('toggle-cycle', cycle)
    }
  },
  plugins: {
    legend: {
      // Соло: без легенды (символику объясняет подзаголовок — как в Excel
      // коллеги). Мульти: легенда, чтобы различать ячейки по цвету.
      display: props.sessions.length > 1,
      position: 'bottom',
      labels: { boxWidth: 12, font: { size: 11 }, generateLabels: dedupeLegend }, onClick: legendToggleAll,
    },
    title: {
      display: true,
      text: props.experimentLabel
        ? props.experimentLabel
        : (props.sessions.length > 1
            ? `Capacity & CE · ${props.sessions.length} cells`
            : 'Capacity & Coulombic Efficiency'),
      font: { size: 13, weight: 600 },
      color: '#003274',
      padding: { bottom: 4 },
    },
    subtitle: {
      display: true,
      text: (() => {
        const parts = []
        if (props.stepFilter !== 'charge') parts.push('● discharge')
        if (props.stepFilter === 'charge' || props.stepFilter === 'both') parts.push('○ charge')
        parts.push('▭ CE →')
        return parts.join('   ')
      })(),
      font: { size: 11, style: 'italic' },
      color: '#6B7280',
      padding: { bottom: 8 },
    },
    tooltip: {
      callbacks: { afterBody: () => 'Клик по ёмкости — добавить/убрать цикл' },
    },
    // Drag = панорама, колесо = зум у курсора. 'original'-границы не пускают
    // в «отрицательные циклы» и пустоту за последним.
    zoom: {
      pan:  { enabled: true, mode: axisLock.value, onPanComplete: lod.onPanComplete },
      zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: axisLock.value, onZoomComplete: lod.onZoomComplete },
      limits: {
        x: { min: 'original', max: 'original', minRange: 1 },
      },
    },
  },
  scales: {
    // Левая Y: ёмкость. beginAtZero — иначе 5% деградации выглядят как 50%.
    y: {
      type: 'linear',
      position: 'left',
      title: { display: true, text: capacityAxisLabel(props.capacityView, props.capacityUnit), font: { size: 10 } },
      beginAtZero: true,
      ticks: { font: { size: 10 } },
      grid: { color: 'rgba(0,50,116,0.05)' },
    },
    // Правая Y: CE. 70–101 по умолчанию — формовочные провалы видны.
    y1: {
      type: 'linear',
      position: 'right',
      title: { display: true, text: 'Coulombic efficiency, %', font: { size: 10 } },
      suggestedMin: 70,
      suggestedMax: 101,
      ticks: { font: { size: 10 } },
      grid: { display: false },
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
  exportChartPNG(chartRef, 'capacity_and_ce', {
    experimentLabel: props.experimentLabel,
    sessions: props.sessions,
  })
}
</script>

<template>
  <ChartCard
    v-model:axisLock="axisLock"
    :axisModes="['xy', 'x']"
    axisTitle="Фиксация оси при зуме/панораме · XY — обе · X — только X. Ось Y двойная (Ёмкость + КЭ) — отдельный зум Y недоступен."
    @style-click="emit('style-click', $event)"
    @reset="resetZoom(chartRef)"
    @export="onExport"
  >
    <Line v-if="hasSummary" ref="chartRef" :data="renderData" :options="chartOptions" />
  </ChartCard>
</template>
