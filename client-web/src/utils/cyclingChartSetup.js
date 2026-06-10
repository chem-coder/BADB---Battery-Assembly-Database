/**
 * Однократная регистрация Chart.js-примитивов для графиков циклирования.
 * Каждый chart-компонент импортирует этот модуль — register идемпотентен,
 * а единый список гарантирует, что ни один дочерний график не забудет
 * Filler/SubTitle/zoom (симптом: молча пустые области или мёртвый зум).
 */
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  SubTitle,
  Tooltip,
  Legend,
  Filler,
  ScatterController,
} from 'chart.js'
import zoomPlugin from 'chartjs-plugin-zoom'

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, SubTitle, Tooltip, Legend, Filler, ScatterController,
  zoomPlugin,
)

export { ChartJS }
