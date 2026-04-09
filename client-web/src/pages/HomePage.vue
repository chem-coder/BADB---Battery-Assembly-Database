<script setup>
import { ref, computed, defineAsyncComponent, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import Select from 'primevue/select'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import PageHeader from '@/components/PageHeader.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import DashboardPipeline from '@/components/DashboardPipeline.vue'
const DashboardGraph = defineAsyncComponent(() => import('@/components/DashboardGraph.vue'))
const DashboardAnalytics = defineAsyncComponent(() => import('@/components/DashboardAnalytics.vue'))
import { workflowSections, referenceSections } from '@/config/navigation'

const router = useRouter()

// ── Tab state ─────────────────────────────────────────────────────────
const activeTab = ref('overview') // 'overview' | 'pipeline' | 'graph' | 'analytics'

// ── Dashboard data ────────────────────────────────────────────────────
const kpiData = ref(null)
const filterOptions = ref({ projects: [], operators: [] })
const activity = ref([])
const production = ref([])
const graphData = ref({ nodes: [], edges: [] })
const funnelData = ref([])
const materialsUsage = ref([])
const allTapes = ref([])
const allBatches = ref([])
const allElectrodeBatches = ref([])
const loading = ref(true)

// ── Filters ───────────────────────────────────────────────────────────
const selectedPeriod = ref('30d')
const selectedProject = ref(null)
const selectedOperator = ref(null)

const periodOptions = [
  { label: '7 дней', value: '7d' },
  { label: '30 дней', value: '30d' },
  { label: '90 дней', value: '90d' },
  { label: 'Всё время', value: 'all' },
]

// ── Reference counts ──────────────────────────────────────────────────
const refCounts = ref({})

// ── Recent data for tables ────────────────────────────────────────────
const recentData = ref({})
const recentErrors = ref({})

// ── Fetch ─────────────────────────────────────────────────────────────
async function loadDashboard() {
  loading.value = true
  const period = selectedPeriod.value

  try {
    const projectParam = selectedProject.value ? `&project_id=${selectedProject.value}` : ''
    const operatorParam = selectedOperator.value ? `&operator_id=${selectedOperator.value}` : ''

    const [kpi, filters, act, prod, graph, funnel, matUsage, tapesRes, batchesRes, batteriesRes] = await Promise.allSettled([
      api.get(`/api/dashboard/kpi?period=${period}${projectParam}${operatorParam}`),
      api.get('/api/dashboard/filter-options'),
      api.get('/api/dashboard/activity?limit=15'),
      api.get(`/api/dashboard/production?weeks=12`),
      api.get(`/api/dashboard/graph?limit=200${projectParam}${operatorParam}`),
      api.get(`/api/dashboard/funnel?period=${period}`),
      api.get('/api/dashboard/materials-usage'),
      api.get('/api/tapes'),
      api.get('/api/electrodes/electrode-cut-batches'),
      api.get('/api/batteries'),
    ])

    if (kpi.status === 'fulfilled') kpiData.value = kpi.value.data
    if (filters.status === 'fulfilled') filterOptions.value = filters.value.data
    if (act.status === 'fulfilled') activity.value = act.value.data
    if (prod.status === 'fulfilled') production.value = prod.value.data
    if (graph.status === 'fulfilled') graphData.value = graph.value.data
    if (funnel.status === 'fulfilled') funnelData.value = funnel.value.data
    if (matUsage.status === 'fulfilled') materialsUsage.value = matUsage.value.data
    if (tapesRes.status === 'fulfilled') allTapes.value = tapesRes.value.data
    if (batchesRes.status === 'fulfilled') allElectrodeBatches.value = batchesRes.value.data
    if (batteriesRes.status === 'fulfilled') allBatches.value = batteriesRes.value.data
  } catch { /* individual errors handled above */ }

  // Reference counts (lightweight)
  const refFetches = referenceSections
    .filter(s => s.apiPath)
    .map(async s => {
      try {
        const res = await api.get(s.apiPath)
        refCounts.value = { ...refCounts.value, [s.key]: Array.isArray(res.data) ? res.data.length : 0 }
      } catch { /* silent */ }
    })

  // Recent items for workflow sections
  const workflowFetches = workflowSections
    .filter(s => s.apiPath)
    .map(async s => {
      try {
        const res = await api.get(s.apiPath)
        recentData.value = { ...recentData.value, [s.key]: res.data }
      } catch {
        recentErrors.value = { ...recentErrors.value, [s.key]: true }
      }
    })

  await Promise.allSettled([...refFetches, ...workflowFetches])
  loading.value = false
}

onMounted(loadDashboard)

// Reload when period changes
function onPeriodChange() { loadDashboard() }

// ── Computed ──────────────────────────────────────────────────────────
const kpis = computed(() => {
  if (!kpiData.value) return workflowSections.map(s => ({ key: s.key, label: s.shortLabel || s.label, icon: s.icon, customIcon: s.customIcon ?? null, route: s.path, total: '…', lines: [] }))
  const d = kpiData.value
  // Use Dalia's workflow_complete from /api/tapes for accurate counts
  const ft = filteredTapes.value
  const tapeComplete = ft.filter(t => t.workflow_complete).length
  const tapeInProgress = ft.filter(t => !t.workflow_complete).length
  const tapeTotal = ft.length || d.tapes?.total || 0
  return [
    { key: 'tapes', label: 'Ленты', icon: 'pi pi-bars', route: '/tapes', total: tapeTotal, lines: [`Завершено: ${tapeComplete}`, `В работе: ${tapeInProgress}`] },
    { key: 'electrodes', label: 'Электроды', icon: 'pi pi-clone', route: '/electrodes', total: `${d.electrodes?.batches ?? 0} / ${d.electrodes?.electrodes ?? 0}`, lines: ['Партий / шт.'] },
    { key: 'assembly', label: 'Аккумуляторы', icon: 'pi pi-box', route: '/assembly', total: d.batteries?.total ?? 0, lines: [`Собрано: ${d.batteries?.assembled ?? 0}`, `Тестируется: ${d.batteries?.testing ?? 0}`] },
    { key: 'modules', label: 'Модули', icon: 'pi pi-th-large', route: '/modules', total: '—', lines: [] },
  ]
})

const refLinks = computed(() =>
  referenceSections.map(s => ({
    ...s,
    count: kpiData.value
      ? (s.key === 'materials' ? kpiData.value.materials?.total
        : s.key === 'recipes' ? kpiData.value.recipes?.total
        : refCounts.value[s.key] ?? null)
      : refCounts.value[s.key] ?? null,
  }))
)

const recentSections = computed(() =>
  workflowSections.map(s => ({
    ...s,
    label: s.shortLabel || s.label,
    recentLabel: `Последние ${(s.shortLabel || s.label).toLowerCase()}`,
    hasApi: !!s.apiPath,
    items: s.apiPath
      ? [...(recentData.value[s.key] ?? [])]
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .slice(0, 3)
      : [],
    hasError: !!recentErrors.value[s.key],
  }))
)

function goTo(path) { router.push(path) }

function activityIcon(action) {
  if (action === 'create') return 'pi pi-plus-circle'
  if (action === 'update') return 'pi pi-pencil'
  if (action === 'delete') return 'pi pi-trash'
  return 'pi pi-circle'
}

function activityColor(action) {
  if (action === 'create') return '#52C9A6'
  if (action === 'delete') return '#E74C3C'
  return '#003274'
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return 'только что'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} мин назад`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} ч назад`
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

// ── Client-side filtering for Pipeline ───────────────────────────────
function periodCutoff(period) {
  const now = new Date()
  if (period === '7d') return new Date(now - 7 * 86400000)
  if (period === '30d') return new Date(now - 30 * 86400000)
  if (period === '90d') return new Date(now - 90 * 86400000)
  return null
}

function applyFilters(items, projectField = 'project_id', operatorField = 'created_by') {
  let filtered = items
  if (selectedProject.value) filtered = filtered.filter(i => String(i[projectField]) === String(selectedProject.value))
  if (selectedOperator.value) filtered = filtered.filter(i => String(i[operatorField]) === String(selectedOperator.value))
  const cutoff = periodCutoff(selectedPeriod.value)
  if (cutoff) filtered = filtered.filter(i => new Date(i.created_at) >= cutoff)
  return filtered
}

const filteredTapes = computed(() => applyFilters(allTapes.value))
const filteredElectrodeBatches = computed(() => applyFilters(allElectrodeBatches.value))
const filteredBatteries = computed(() => applyFilters(allBatches.value))
</script>

<template>
  <div class="home-page">
    <PageHeader title="Главная" icon="pi pi-home" />

    <!-- ── Tab switcher ── -->
    <div class="tab-switcher">
      <button :class="['tab-btn', activeTab === 'overview' ? 'active' : '']" @click="activeTab = 'overview'">
        <i class="pi pi-chart-bar"></i> Обзор
      </button>
      <button :class="['tab-btn', activeTab === 'pipeline' ? 'active' : '']" @click="activeTab = 'pipeline'">
        <i class="pi pi-arrow-right-arrow-left"></i> Pipeline
      </button>
      <button :class="['tab-btn', activeTab === 'graph' ? 'active' : '']" @click="activeTab = 'graph'">
        <i class="pi pi-sitemap"></i> Граф
      </button>
      <button :class="['tab-btn', activeTab === 'analytics' ? 'active' : '']" @click="activeTab = 'analytics'">
        <i class="pi pi-chart-line"></i> Аналитика
      </button>
    </div>

    <!-- ── Filter bar ── -->
    <div class="glass-card filter-bar">
      <div class="filter-bar-left">
        <Select
          v-model="selectedPeriod"
          :options="periodOptions"
          optionLabel="label"
          optionValue="value"
          size="small"
          @change="onPeriodChange"
          class="filter-period"
        />
        <Select
          v-model="selectedProject"
          :options="filterOptions.projects"
          optionLabel="name"
          optionValue="id"
          placeholder="Все проекты"
          showClear
          size="small"
          class="filter-project"
          @change="loadDashboard()"
        />
        <Select
          v-model="selectedOperator"
          :options="filterOptions.operators"
          optionLabel="name"
          optionValue="id"
          placeholder="Все операторы"
          showClear
          size="small"
          class="filter-operator"
          @change="loadDashboard()"
        />
      </div>
      <div class="filter-presets">
        <button :class="['preset-chip', selectedPeriod === '7d' ? 'active' : '']" @click="selectedPeriod = '7d'; onPeriodChange()">Эта неделя</button>
        <button :class="['preset-chip', selectedPeriod === '30d' ? 'active' : '']" @click="selectedPeriod = '30d'; onPeriodChange()">Месяц</button>
        <button :class="['preset-chip', selectedPeriod === 'all' ? 'active' : '']" @click="selectedPeriod = 'all'; onPeriodChange()">Всё время</button>
      </div>
    </div>

    <!-- ════════ OVERVIEW TAB ════════ -->
    <template v-if="activeTab === 'overview'">

    <!-- ── KPI cards ── -->
    <div class="kpi-grid">
      <div v-for="kpi in kpis" :key="kpi.key" class="glass-card kpi-card" @click="goTo(kpi.route)">
        <div class="kpi-label">
          <i :class="kpi.icon" class="kpi-icon"></i>
          {{ kpi.label }}
        </div>
        <div class="kpi-number">{{ kpi.total }}</div>
        <div v-for="(line, i) in kpi.lines" :key="i" class="kpi-detail">{{ line }}</div>
      </div>
    </div>

    <!-- ── Reference quick-links ── -->
    <div class="glass-card ref-card">
      <div class="ref-card-title">Справочники</div>
      <div class="ref-grid">
        <div v-for="r in refLinks" :key="r.key" class="ref-link" @click="goTo(r.path)">
          <i :class="r.icon" class="ref-icon"></i>
          <span class="ref-label">{{ r.label }}</span>
          <span v-if="r.count !== null" class="ref-count">{{ r.count }}</span>
        </div>
      </div>
    </div>

    <!-- ── Activity timeline ── -->
    <div class="glass-card timeline-card">
        <div class="timeline-title">Активность</div>
        <div v-if="activity.length === 0" class="empty-state">Нет событий</div>
        <div v-else class="timeline-list">
          <div v-for="evt in activity" :key="evt.id" class="timeline-item">
            <div class="timeline-dot" :style="{ background: activityColor(evt.action) }"></div>
            <div class="timeline-content">
              <span class="timeline-action">{{ evt.action }}</span>
              <span class="timeline-entity">{{ evt.entity }} #{{ evt.entity_id }}</span>
              <span class="timeline-user">{{ evt.user_name }}</span>
              <span class="timeline-time">{{ formatTime(evt.created_at) }}</span>
            </div>
          </div>
        </div>
      </div>

    </template><!-- /overview -->

    <!-- ════════ PIPELINE TAB ════════ -->
    <template v-if="activeTab === 'pipeline'">
      <div class="glass-card pipeline-section">
        <DashboardPipeline :tapes="filteredTapes" :electrodeBatches="filteredElectrodeBatches" :batteries="filteredBatteries" />
      </div>
    </template>

    <!-- ════════ GRAPH TAB ════════ -->
    <template v-if="activeTab === 'graph'">
      <div class="glass-card graph-section">
        <DashboardGraph :graphData="graphData" />
      </div>
    </template>

    <!-- ════════ ANALYTICS TAB ════════ -->
    <template v-if="activeTab === 'analytics'">
      <DashboardAnalytics :production="production" :funnel="funnelData" :materialsUsage="materialsUsage" />
    </template>

  </div>
</template>

<style scoped>
.home-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.home-page :deep(.page-header) { margin-bottom: 3px !important; }

/* ── Tab switcher ── */
.tab-switcher {
  display: flex;
  gap: 0.25rem;
  background: rgba(0, 50, 116, 0.04);
  padding: 4px;
  border-radius: 10px;
  width: fit-content;
}
.tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0.45rem 1rem;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #6B7280;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}
.tab-btn:hover { color: #003274; background: rgba(255, 255, 255, 0.5); }
.tab-btn.active {
  background: rgba(255, 255, 255, 0.85);
  color: #003274;
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(0, 50, 116, 0.1);
}
.tab-btn i { font-size: 13px; }

/* ── Pipeline section ── */
.pipeline-section { padding: 1rem; }

/* ── Graph section ── */
.graph-section { padding: 0; min-height: 500px; overflow: hidden; }

/* ── Filter bar ── */
.filter-bar {
  padding: 0.75rem 1.25rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}
.filter-bar-left {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}
.filter-period { width: 140px; }
.filter-project { width: 200px; }
.filter-operator { width: 200px; }
.filter-presets {
  display: flex;
  gap: 0.4rem;
}
.preset-chip {
  padding: 4px 12px;
  border: 0.5px solid rgba(180, 210, 255, 0.55);
  border-radius: 20px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.5);
  color: #6B7280;
  cursor: pointer;
  transition: all 0.15s;
}
.preset-chip:hover { border-color: rgba(82, 201, 166, 0.45); color: #003274; }
.preset-chip.active { background: rgba(0, 50, 116, 0.08); border-color: #003274; color: #003274; font-weight: 600; }

/* ── KPI grid ── */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1.25rem;
}
.kpi-card {
  padding: 1.5rem;
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 50, 116, 0.1);
}
.kpi-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.5);
}
.kpi-icon { font-size: 13px; }
.kpi-number { font-size: 28px; font-weight: 700; color: #003274; margin: 6px 0 4px; }
.kpi-detail { font-size: 12px; color: #6B7280; }

/* ── Reference ── */
.ref-card { padding: 1.5rem; }
.ref-card-title {
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.05em; color: rgba(0, 50, 116, 0.5); margin-bottom: 0.85rem;
}
.ref-grid { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.ref-link {
  display: flex; align-items: center; gap: 6px;
  padding: 0.45rem 0.85rem; border-radius: 8px;
  background: rgba(0, 50, 116, 0.04); border: 1px solid rgba(180, 210, 255, 0.25);
  cursor: pointer; transition: background 0.12s, border-color 0.12s;
  font-size: 0.83rem; color: #333;
}
.ref-link:hover { background: rgba(0, 50, 116, 0.08); border-color: rgba(0, 50, 116, 0.2); }
.ref-icon { font-size: 0.85rem; color: #003274; opacity: 0.7; }
.ref-label { font-weight: 500; }
.ref-count {
  font-size: 0.7rem; font-weight: 700; color: #003274;
  background: rgba(0, 50, 116, 0.08); padding: 1px 6px;
  border-radius: 10px; min-width: 20px; text-align: center;
}

/* ── Timeline ── */
.timeline-card { padding: 0; overflow: hidden; display: flex; flex-direction: column; }
.timeline-title {
  padding: 1rem 1.25rem 0.7rem; font-size: 11px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em; color: rgba(0, 50, 116, 0.5);
  border-bottom: 1px solid rgba(180, 210, 255, 0.25);
}
.timeline-list { padding: 0.5rem 0; overflow-y: auto; max-height: 500px; }
.timeline-item {
  display: flex; align-items: flex-start; gap: 0.75rem;
  padding: 0.5rem 1.25rem;
  transition: background 0.12s;
}
.timeline-item:hover { background: rgba(0, 50, 116, 0.03); }
.timeline-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 5px;
}
.timeline-content {
  display: flex; flex-wrap: wrap; gap: 4px; font-size: 12px; color: #333; line-height: 1.4;
}
.timeline-action { font-weight: 600; color: #003274; }
.timeline-entity { color: #6B7280; }
.timeline-user { color: #6B7280; font-style: italic; }
.timeline-time { color: #9CA3AF; margin-left: auto; font-size: 11px; white-space: nowrap; }

/* ── Mobile ── */
@media (max-width: 768px) {
  .kpi-grid { grid-template-columns: repeat(2, 1fr); }
  .bottom-grid { grid-template-columns: 1fr; }
  .filter-bar { flex-direction: column; align-items: stretch; }
  .filter-bar-left { flex-wrap: wrap; }
  .filter-period, .filter-project, .filter-operator { width: 100%; }
}
</style>
