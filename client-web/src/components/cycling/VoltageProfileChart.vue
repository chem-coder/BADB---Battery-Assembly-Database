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
  sessionShortLabel, fillColor, cycleAlpha, viridisAt, decimate,
  chartAnimFor, sessionDashFor, dedupeLegend, legendToggleAll,
  convertCapacity, capacityAxisLabel, applyChartStyle,
  exportChartPNG, resetZoom,
} from '@/utils/cyclingChartShared'
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

const chartData = computed(() => {
  const datasets = []
  const sortedCycles = [...props.selectedCycles].sort((a, b) => a - b)
  const useCapacity = hasCapacity.value
  const nCycles = sortedCycles.length
  const vStyle = voltageStyle.value

  for (const s of props.sessions) {
    const colorBase = sessionColorFor(s)
    // Штриховка по сессии (null при одной сессии → семантика заряд/разряд)
    const sessionDash = sessionDashFor(props.sessions.indexOf(s), props.sessions.length)

    sortedCycles.forEach((cycleNum, cIdx) => {
      const points = s.cycleDataMap?.[cycleNum] || []
      if (!points.length) return

      // Децимация только для рендера — сырые точки остаются в cycleDataMap
      // для dQ/dV (ему нужно полное разрешение пиков).
      const charge = decimate(points.filter(d => d.step_type === 'charge' || d.step_type === 'cccv'))
      const discharge = decimate(points.filter(d => d.step_type === 'discharge'))

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
          const ghostCharge = decimate(ghostPoints.filter(d => d.step_type === 'charge' || d.step_type === 'cccv'))
          const ghostDischarge = decimate(ghostPoints.filter(d => d.step_type === 'discharge'))
          const ghostColor = fillColor(colorBase, 0.15)
          const ghostWidth = Math.max(0.6, thickness * 0.55)
          if (showCharge && ghostCharge.length) {
            datasets.push({
              label: `ghost_Ц${cycleNum - 1}_${sessionShortLabel(s, props.sessions)}_charge`,
              isGhost: true,
              data: ghostCharge.map(p => ({ x: xOf(p), y: p.voltage_v })),
              borderColor: ghostColor,
              backgroundColor: ghostColor,
              pointRadius: 0,
              borderWidth: ghostWidth,
              borderDash: chargeDash,
              showLine: true,
            })
          }
          if (showDischarge && ghostDischarge.length) {
            datasets.push({
              label: `ghost_Ц${cycleNum - 1}_${sessionShortLabel(s, props.sessions)}_discharge`,
              isGhost: true,
              data: ghostDischarge.map(p => ({ x: xOf(p), y: p.voltage_v })),
              borderColor: ghostColor,
              backgroundColor: ghostColor,
              pointRadius: 0,
              borderWidth: ghostWidth,
              borderDash: dischargeDash,
              showLine: true,
            })
          }
        }
      }

      if (showCharge && charge.length) {
        datasets.push(applyChartStyle({
          label: `Ц${cycleNum}_${sessionShortLabel(s, props.sessions)} · заряд`,
          data: charge.map(p => ({ x: xOf(p), y: p.voltage_v })),
          borderColor: chargeColor,
          backgroundColor: chargeColor,
          pointBackgroundColor: chargeColor,
          pointBorderColor: chargeColor,
          pointRadius: 0,
          borderWidth: chargeWidth,
          borderDash: sessionDash || chargeDash,
          showLine: true,
        }, vStyle))
      }
      if (showDischarge && discharge.length) {
        datasets.push(applyChartStyle({
          label: `Ц${cycleNum}_${sessionShortLabel(s, props.sessions)} · разряд`,
          data: discharge.map(p => ({ x: xOf(p), y: p.voltage_v })),
          borderColor: cycleColor,
          backgroundColor: cycleColor,
          pointBackgroundColor: cycleColor,
          pointBorderColor: cycleColor,
          pointRadius: 0,
          borderWidth: thickness,
          borderDash: sessionDash || dischargeDash,
          showLine: true,
        }, vStyle))
      }
    })
  }

  return { datasets }
})

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: chartAnimFor(props.sessions.length),
  plugins: {
    legend: {
      display: !props.publicationMode,  // публикационные фигуры без легенд
      position: 'bottom',
      labels: { boxWidth: 12, font: { size: 10 }, generateLabels: dedupeLegend }, onClick: legendToggleAll,
    },
    title: {
      display: true,
      text: (() => {
        if (props.experimentLabel) return `${props.experimentLabel} — профиль V`
        if (!props.selectedCycles.length) return 'Профиль напряжения'
        const cLabel = `${props.selectedCycles.length} ${props.selectedCycles.length === 1 ? 'цикл' : 'циклов'}`
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
      pan:  { enabled: true, mode: axisLock.value },
      zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: axisLock.value },
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
    @style-click="emit('style-click', $event)"
    @reset="resetZoom(chartRef)"
    @export="onExport"
  >
    <Scatter ref="chartRef" :data="chartData" :options="chartOptions" />
  </ChartCard>
</template>
