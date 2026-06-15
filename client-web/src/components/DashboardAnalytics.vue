<script setup>
/**
 * DashboardAnalytics — Chart.js analytics cards.
 * Three charts: production trend (Line), funnel (horizontal Bar), materials by role (Bar).
 */
import { computed } from 'vue'
import { Line, Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler)

const props = defineProps({
  production: { type: Array, default: () => [] },
  funnel: { type: Array, default: () => [] },
  materialsUsage: { type: Array, default: () => [] },
})

// ── Production Line Chart ──
const productionChartData = computed(() => {
  const labels = props.production.map(w => {
    const d = new Date(w.week_start)
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  })
  return {
    labels,
    datasets: [
      {
        label: 'Ленты',
        data: props.production.map(w => Number(w.tapes)),
        borderColor: '#003274',
        backgroundColor: 'rgba(0, 50, 116, 0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
      },
      {
        label: 'Электроды',
        data: props.production.map(w => Number(w.electrode_batches)),
        borderColor: '#52C9A6',
        backgroundColor: 'rgba(82, 201, 166, 0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
      },
      {
        label: 'Аккумуляторы',
        data: props.production.map(w => Number(w.batteries)),
        borderColor: '#D3A754',
        backgroundColor: 'rgba(211, 167, 84, 0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
      },
    ],
  }
})

const productionOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
    title: { display: false },
  },
  scales: {
    y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } }, grid: { color: 'rgba(0,50,116,0.05)' } },
    x: { ticks: { font: { size: 10 } }, grid: { display: false } },
  },
}

// ── Funnel Chart ──
const funnelChartData = computed(() => ({
  labels: props.funnel.map(s => s.stage),
  datasets: [{
    data: props.funnel.map(s => s.count),
    backgroundColor: ['#003274', '#2a7ab5', '#52C9A6', '#D3A754'],
    borderRadius: 4,
    barThickness: 28,
  }],
}))

const funnelOptions = {
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: 'y',
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        afterLabel(ctx) {
          const data = ctx.dataset.data
          const idx = ctx.dataIndex
          if (idx === 0 || data[idx - 1] === 0) return ''
          const pct = ((data[idx] / data[idx - 1]) * 100).toFixed(0)
          return `Конверсия: ${pct}%`
        },
      },
    },
  },
  scales: {
    x: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } }, grid: { color: 'rgba(0,50,116,0.05)' } },
    y: { ticks: { font: { size: 11, weight: 500 } }, grid: { display: false } },
  },
}

// ── Materials by Role ──
const materialsChartData = computed(() => {
  const roles = [...new Set(props.materialsUsage.map(m => m.role).filter(Boolean))]
  const roleLabels = {
    active_material: 'Активный материал',
    conductive_additive: 'Проводящая добавка',
    binder: 'Связующее',
    solvent: 'Растворитель',
    foil: 'Фольга',
  }
  const counts = roles.map(r =>
    props.materialsUsage.filter(m => m.role === r).reduce((s, m) => s + Number(m.usage_count), 0)
  )
  const colors = ['#003274', '#52C9A6', '#D3A754', '#8B5CF6', '#E74C3C', '#6B7280']
  return {
    labels: roles.map(r => roleLabels[r] || r),
    datasets: [{
      data: counts,
      backgroundColor: roles.map((_, i) => colors[i % colors.length]),
      borderRadius: 4,
      barThickness: 28,
    }],
  }
})

const materialsOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
  },
  scales: {
    y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } }, grid: { color: 'rgba(0,50,116,0.05)' } },
    x: { ticks: { font: { size: 10 } }, grid: { display: false } },
  },
}
</script>

<template>
  <div class="analytics-grid">
    <!-- Production trend -->
    <div class="glass-card chart-card chart-card--wide">
      <div class="chart-title">Производство за период</div>
      <div class="chart-wrap">
        <Line v-if="production.length" :data="productionChartData" :options="productionOptions" />
        <div v-else class="chart-empty">Нет данных</div>
      </div>
    </div>

    <!-- Funnel -->
    <div class="glass-card chart-card">
      <div class="chart-title">Воронка</div>
      <div class="chart-wrap chart-wrap--short">
        <Bar v-if="funnel.length" :data="funnelChartData" :options="funnelOptions" />
        <div v-else class="chart-empty">Нет данных</div>
      </div>
    </div>

    <!-- Materials by role -->
    <div class="glass-card chart-card">
      <!-- /dashboard/materials-usage — глобальная статистика справочника,
           фильтр-бар к ней не применяется; говорим об этом явно -->
      <div class="chart-title">Материалы по ролям <span class="chart-title-note">все данные, фильтры не применяются</span></div>
      <div class="chart-wrap chart-wrap--short">
        <Bar v-if="materialsUsage.length" :data="materialsChartData" :options="materialsOptions" />
        <div v-else class="chart-empty">Нет данных</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.analytics-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
}

.chart-card {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.chart-card--wide {
  grid-column: 1 / -1;
}

.chart-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.5);
}

.chart-title-note {
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
  color: rgba(0, 50, 116, 0.4);
  margin-left: 4px;
}

.chart-wrap {
  position: relative;
  height: 260px;
}

.chart-wrap--short {
  height: 200px;
}

.chart-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: rgba(0, 50, 116, 0.3);
  font-size: 13px;
}

@media (max-width: 768px) {
  .analytics-grid { grid-template-columns: 1fr; }
}
</style>
