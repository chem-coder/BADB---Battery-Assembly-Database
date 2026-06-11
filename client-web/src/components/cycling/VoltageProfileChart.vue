<script setup>
/**
 * VoltageProfileChart — профиль напряжения (overlay: сессии × выбранные циклы).
 * Кодирование: цвет = сессия (или viridis-градиент порядка циклов), толщина =
 * позиция цикла (новые толще), solid = разряд / dashed = заряд, штриховка по
 * сессии при мульти-наложении. Ghost trace цикла N−1 — бледный контекст.
 *
 * Извлечено из CyclingCharts.vue 1:1 (механический рефакторинг).
 */
import { ref, computed } from 'vue'
import { Scatter } from 'vue-chartjs'
import '@/utils/cyclingChartSetup'
import { useCyclingStyles } from '@/composables/useCyclingStyles'
import {
  sessionShortLabel, fillColor, cycleAlpha, viridisAt,
  chartAnimFor, sessionDashFor, dedupeLegend, legendToggleAll,
  convertCapacity, capacityAxisLabel, applyChartStyle,
  exportChartPNG, resetZoom, pickEvenly,
} from '@/utils/cyclingChartShared'
import { minMaxDecimate, ensureSortedByX, makeLodHandlers, useFrameCoalesced } from '@/utils/chartLod'
import { timeBuild, makePaintPlugin } from '@/utils/chartPerf'
import ChartCard from '@/components/cycling/ChartCard.vue'

const props = defineProps({
  sessions: { type: Array, default: () => [] },
  selectedCycles: { type: Array, default: () => [] },
  stepFilter: { type: String, default: 'discharge' },
  capacityView: { type: String, default: 'absolute' },
  capacityUnit: { type: String, default: 'Ah' },
  publicationMode: { type: Boolean, default: false },
  ghostTrace: { type: Boolean, default: false },
  cycleGradient: { type: Boolean, default: false },
  experimentLabel: { type: String, default: '' },
})
const emit = defineEmits(['style-click'])

const { getChartStyle, colorForSession: resolveColor } = useCyclingStyles()
const voltageStyle = computed(() => getChartStyle('voltage'))

function sessionColorFor(session) {
  const idx = props.sessions.findIndex(x => x.session_id === session.session_id)
  return resolveColor('voltage', idx >= 0 ? idx : 0)
}

const chartRef = ref(null)
const axisLock = ref('xy')

const hasCapacity = computed(() => {
  for (const s of props.sessions) {
    for (const cycleNum of props.selectedCycles) {
      const points = s.cycleDataMap?.[cycleNum] || []
      if (points.some(d => d.capacity_ah != null)) return true
    }
  }
  return false
})

// Датасеты + параллельный массив ПОЛНЫХ серий (LOD-источник): при зуме
// onZoomComplete пересэмплирует видимое окно из полного разрешения — детали
// проявляются по мере приближения, на экране всегда ~500 точек.
const built = computed(() => timeBuild('voltage', () => {
  const datasets = []
  const fulls = []        // 1:1 с datasets; null = серия не для LOD (несортирована)
  // Выбор циклов безлимитный; РЕНДЕРИМ равномерную подвыборку ≤24 кривых —
  // больше наложений нечитаемо и убивает канвас. Заголовок честно говорит
  // «показано N из M».
  const sortedCycles = pickEvenly([...props.selectedCycles].sort((a, b) => a - b), 24)
  const useCapacity = hasCapacity.value
  const nCycles = sortedCycles.length
  const vStyle = voltageStyle.value

  // Полная серия {x,y} → датасет с min-max обзорной децимацией; сортированные
  // серии получают normalized-подсказку Chart.js и попадают в LOD-список.
  function pushDs(ds, mapped) {
    const full = ensureSortedByX(mapped)
    ds.data = minMaxDecimate(mapped)
    if (full) { ds.normalized = true; ds.parsing = false }
    datasets.push(ds)
    fulls.push(full)
  }

  for (const s of props.sessions) {
    const colorBase = sessionColorFor(s)
    // Штриховка по сессии (null при одной сессии → семантика заряд/разряд)
    const sessionDash = sessionDashFor(props.sessions.indexOf(s), props.sessions.length)

    sortedCycles.forEach((cycleNum, cIdx) => {
      const points = s.cycleDataMap?.[cycleNum] || []
      if (!points.length) return

      // ПОЛНЫЕ полуциклы (без статической децимации — она теперь обзорный
      // уровень LOD внутри pushDs, а зум достаёт полное разрешение).
      const charge = points.filter(d => d.step_type === 'charge' || d.step_type === 'cccv')
      const discharge = points.filter(d => d.step_type === 'discharge')

      // Публикация: плоская толщина (как Excel коллеги). Интерактив: ±30%
      // модуляция по индексу цикла — деградация читается без легенды.
      const userWidth = Number(vStyle.borderWidth) || 1.6
      const cycleMul = nCycles > 1 ? (0.7 + (cIdx / (nCycles - 1)) * 0.6) : 1
      const thickness = props.publicationMode ? userWidth : userWidth * cycleMul

      const alpha = cycleAlpha(cIdx, nCycles)
      // Цвет цикла: viridis-градиент порядка или альфа-фейд цвета сессии.
      const gradientBase = props.cycleGradient
        ? viridisAt(nCycles <= 1 ? 1 : cIdx / (nCycles - 1))
        : null
      const cycleColor = gradientBase || fillColor(colorBase, alpha)
      // «Оба»: заряд приглушён и тоньше — разряд читается главным.
      const bothMode = props.stepFilter === 'both'
      const chargeColor = bothMode
        ? (gradientBase ? gradientBase.replace('rgb(', 'rgba(').replace(')', ', 0.35)') : fillColor(colorBase, alpha * 0.4))
        : cycleColor
      const chargeWidth = bothMode ? thickness * 0.8 : thickness

      // Публикация: оба полуцикла одним дашем (форма кривой различает).
      const chargeDash = [4, 2]
      const dischargeDash = props.publicationMode ? [4, 2] : undefined

      // X: ёмкость (с конвертацией в mAh/g) или время, если ёмкости нет.
      const xOf = (p) => useCapacity ? convertCapacity(p.capacity_ah, s, props.capacityUnit) : p.time_s

      const showCharge = props.stepFilter !== 'discharge'
      const showDischarge = props.stepFilter !== 'charge'

      // Ghost trace цикла N−1 (бледный, тонкий, без легенды). Рисуется
      // первым — основные линии поверх. Авто-fetch не триггерим.
      if (props.ghostTrace && cycleNum > 1) {
        const ghostPoints = s.cycleDataMap?.[cycleNum - 1] || []
        if (ghostPoints.length) {
          const ghostCharge = ghostPoints.filter(d => d.step_type === 'charge' || d.step_type === 'cccv')
          const ghostDischarge = ghostPoints.filter(d => d.step_type === 'discharge')
          const ghostColor = fillColor(colorBase, 0.15)
          const ghostWidth = Math.max(0.6, thickness * 0.55)
          if (showCharge && ghostCharge.length) {
            pushDs({
              label: `ghost_Ц${cycleNum - 1}_${sessionShortLabel(s, props.sessions)}_charge`,
              isGhost: true,
              borderColor: ghostColor,
              backgroundColor: ghostColor,
              pointRadius: 0,
              borderWidth: ghostWidth,
              borderDash: chargeDash,
              showLine: true,
            }, ghostCharge.map(p => ({ x: xOf(p), y: p.voltage_v })))
          }
          if (showDischarge && ghostDischarge.length) {
            pushDs({
              label: `ghost_Ц${cycleNum - 1}_${sessionShortLabel(s, props.sessions)}_discharge`,
              isGhost: true,
              borderColor: ghostColor,
              backgroundColor: ghostColor,
              pointRadius: 0,
              borderWidth: ghostWidth,
              borderDash: dischargeDash,
              showLine: true,
            }, ghostDischarge.map(p => ({ x: xOf(p), y: p.voltage_v })))
          }
        }
      }

      if (showCharge && charge.length) {
        pushDs(applyChartStyle({
          label: `Ц${cycleNum}_${sessionShortLabel(s, props.sessions)} · заряд`,
          borderColor: chargeColor,
          backgroundColor: chargeColor,
          pointBackgroundColor: chargeColor,
          pointBorderColor: chargeColor,
          pointRadius: 0,
          borderWidth: chargeWidth,
          borderDash: sessionDash || chargeDash,
          showLine: true,
        }, vStyle), charge.map(p => ({ x: xOf(p), y: p.voltage_v })))
      }
      if (showDischarge && discharge.length) {
        pushDs(applyChartStyle({
          label: `Ц${cycleNum}_${sessionShortLabel(s, props.sessions)} · разряд`,
          borderColor: cycleColor,
          backgroundColor: cycleColor,
          pointBackgroundColor: cycleColor,
          pointBorderColor: cycleColor,
          pointRadius: 0,
          borderWidth: thickness,
          borderDash: sessionDash || dischargeDash,
          showLine: true,
        }, vStyle), discharge.map(p => ({ x: xOf(p), y: p.voltage_v })))
      }
    })
  }

  return { datasets, fulls }
}))

const chartData = computed(() => ({ datasets: built.value.datasets }))

// Репейнт не чаще кадра: шквал реактивных перестроек схлопывается в один
const renderData = useFrameCoalesced(chartData)

// LOD-обработчики зума/панорамы (rAF-гейт внутри): пересэмплинг видимого окна
const lod = makeLodHandlers(() => built.value.fulls)

const paintPlugins = [makePaintPlugin('voltage')]

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  // порог по max(сессии, датасеты): на плотных наложениях (сессии × циклы ×
  // полуциклы) анимация каждой перекраски — чистый джанк
  animation: chartAnimFor(Math.max(props.sessions.length, built.value.datasets.length)),
  plugins: {
    legend: {
      display: !props.publicationMode,  // публикационные фигуры без легенд
      position: 'bottom',
      labels: { boxWidth: 12, font: { size: 10 }, generateLabels: dedupeLegend }, onClick: legendToggleAll,
    },
    title: {
      display: true,
      text: (() => {
        const shown = Math.min(props.selectedCycles.length, 24)
        const thinned = props.selectedCycles.length > 24 ? ` (показано ${shown} из ${props.selectedCycles.length}, равномерно)` : ''
        if (props.experimentLabel) return `${props.experimentLabel} — профиль V${thinned}`
        if (!props.selectedCycles.length) return 'Профиль напряжения'
        const cLabel = `${props.selectedCycles.length} ${props.selectedCycles.length === 1 ? 'цикл' : 'циклов'}${thinned}`
        if (props.sessions.length <= 1) return `Профиль напряжения — ${cLabel}`
        return `Профиль напряжения — ${props.sessions.length} измерений × ${cLabel}`
      })(),
      font: { size: 13, weight: 600 },
      color: '#003274',
      padding: { bottom: 10 },
    },
    // Drag = панорама, колесо = зум у курсора; границы держат в реальных
    // диапазонах ёмкости/напряжения.
    zoom: {
      pan:  { enabled: true, mode: axisLock.value, onPanComplete: lod.onPanComplete },
      zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: axisLock.value, onZoomComplete: lod.onZoomComplete },
      limits: {
        x: { min: 'original', max: 'original' },
        y: { min: 'original', max: 'original' },
      },
    },
  },
  scales: {
    y: { title: { display: true, text: 'E, V', font: { size: 10 } }, ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,50,116,0.05)' } },
    x: {
      type: 'linear',
      title: {
        display: true,
        text: hasCapacity.value ? capacityAxisLabel(props.capacityView, props.capacityUnit) : 'Time, s',
        font: { size: 10 },
      },
      ticks: { font: { size: 10 } },
      grid: { display: false },
    },
  },
}))

function onExport() {
  exportChartPNG(chartRef, 'voltage_profile', {
    experimentLabel: props.experimentLabel,
    sessions: props.sessions,
  })
}
</script>

<template>
  <ChartCard
    v-model:axisLock="axisLock"
    :axisModes="['xy', 'x', 'y']"
    perfId="voltage"
    @style-click="emit('style-click', $event)"
    @reset="resetZoom(chartRef)"
    @export="onExport"
  >
    <Scatter ref="chartRef" :data="renderData" :options="chartOptions" :plugins="paintPlugins" />
  </ChartCard>
</template>
