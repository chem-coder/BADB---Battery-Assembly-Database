<script setup>
import { ref, computed, defineAsyncComponent, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import api from '@/services/api'
import MultiSelect from 'primevue/multiselect'
import DateInputISO from '@/components/parity/DateInputISO.vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import PageHeader from '@/components/PageHeader.vue'
import DashboardPipeline from '@/components/DashboardPipeline.vue'
const DashboardGraph = defineAsyncComponent(() => import('@/components/DashboardGraph.vue'))
const DashboardAnalytics = defineAsyncComponent(() => import('@/components/DashboardAnalytics.vue'))
import { workflowSections, referenceSections } from '@/config/navigation'

const router = useRouter()
const route = useRoute()
const toast = useToast()

// Role-gate flash: router.beforeEach redirects role-denied users here
// with ?denied=<required-role>. Fire a toast explaining WHY they
// landed on the home page instead of the URL they asked for, then
// replace the URL to clean the query. Without this hook the redirect
// is silent — user sees their URL change to / with no explanation.
onMounted(() => {
  const denied = route.query.denied
  if (typeof denied === 'string' && denied.length > 0) {
    const roleLabels = { admin: 'администратор', lead: 'ведущий', employee: 'сотрудник' }
    toast.add({
      severity: 'warn',
      summary: 'Недостаточно прав',
      detail: `Нужна роль «${roleLabels[denied] || denied}» для доступа к этой странице.`,
      life: 4500,
    })
    // Strip the flash query param without re-navigating — keeps URL
    // clean so a browser refresh doesn't re-fire the toast.
    router.replace({ path: '/', query: {} })
  }
})

// ── Tab state ─────────────────────────────────────────────────────────
const activeTab = ref('overview') // 'overview' | 'pipeline' | 'graph' | 'analytics'

// ── Dashboard data ────────────────────────────────────────────────────
const kpiData = ref(null)
const filterOptions = ref({ projects: [], operators: [] })
const activity = ref([])
const graphData = ref({ nodes: [], edges: [] })
const materialsUsage = ref([])
const allTapes = ref([])
const allBatches = ref([])
const allElectrodeBatches = ref([])
const loading = ref(true)

// ── Filters ───────────────────────────────────────────────────────────
const selectedPeriod = ref('30d')
const selectedProjects = ref([])
const selectedOperators = ref([])
const customDateFrom = ref('')
const customDateTo = ref('')

// Подписи коротки намеренно — это сегменты-кнопки, не пункты дропдауна
const periodOptions = [
  { label: '7 дн', value: '7d' },
  { label: '30 дн', value: '30d' },
  { label: '90 дн', value: '90d' },
  { label: 'Всё', value: 'all' },
  { label: 'Интервал', value: 'custom' },
]

// Период — чисто клиентский фильтр: все вкладки, кроме графа, считаются
// из уже загруженных списков, поэтому смена периода не делает ни одного
// запроса (раньше перекачивала весь дашборд).
function setPeriod(v) {
  selectedPeriod.value = v
}

const filtersDirty = computed(() =>
  selectedProjects.value.length > 0 || selectedOperators.value.length > 0 || selectedPeriod.value !== '30d'
)
function resetFilters() {
  // Граф был серверно отфильтрован только при ровно одном выбранном
  // проекте/операторе — лишь тогда сброс требует его перезапроса.
  const graphWasFiltered = selectedProjects.value.length === 1 || selectedOperators.value.length === 1
  selectedProjects.value = []
  selectedOperators.value = []
  selectedPeriod.value = '30d'
  customDateFrom.value = ''
  customDateTo.value = ''
  if (graphWasFiltered) reloadGraph()
}

// ── Reference counts ──────────────────────────────────────────────────
const refCounts = ref({})


// ── Fetch ─────────────────────────────────────────────────────────────
// Граф — единственный серверный запрос, зависящий от фильтров (и только
// при ровно одном выбранном проекте/операторе: эндпоинт принимает один id).
function graphQuery() {
  const projectParam = selectedProjects.value.length === 1 ? `&project_id=${selectedProjects.value[0]}` : ''
  const operatorParam = selectedOperators.value.length === 1 ? `&operator_id=${selectedOperators.value[0]}` : ''
  return `/api/dashboard/graph?limit=200${projectParam}${operatorParam}`
}

async function loadDashboard() {
  loading.value = true

  try {
    // Воронка и тренд производства считаются на клиенте из tapes/batches/
    // batteries (см. clientFunnel / clientProduction) — серверные
    // /dashboard/funnel и /dashboard/production не запрашиваем. KPI нужен
    // только ради счётчиков материалов/рецептур в refLinks (count(*) без
    // фильтров), поэтому период/проект/оператор ему не передаём.
    const [kpi, filters, act, graph, matUsage, tapesRes, batchesRes, batteriesRes] = await Promise.allSettled([
      api.get('/api/dashboard/kpi?period=all'),
      api.get('/api/dashboard/filter-options'),
      api.get('/api/dashboard/activity?limit=80'),
      api.get(graphQuery()),
      api.get('/api/dashboard/materials-usage'),
      api.get('/api/tapes'),
      api.get('/api/electrodes/electrode-cut-batches'),
      api.get('/api/batteries'),
    ])

    if (kpi.status === 'fulfilled') kpiData.value = kpi.value.data
    if (filters.status === 'fulfilled') filterOptions.value = filters.value.data
    if (act.status === 'fulfilled') activity.value = act.value.data
    if (graph.status === 'fulfilled') graphData.value = graph.value.data
    if (matUsage.status === 'fulfilled') materialsUsage.value = matUsage.value.data
    if (tapesRes.status === 'fulfilled') allTapes.value = tapesRes.value.data
    if (batchesRes.status === 'fulfilled') allElectrodeBatches.value = batchesRes.value.data
    if (batteriesRes.status === 'fulfilled') allBatches.value = batteriesRes.value.data
  } catch { /* individual errors handled above */ }

  // Счётчики справочников. Материалы/рецептуры уже есть в ответе /kpi
  // (refLinks предпочитает kpiData) — их полные списки не скачиваем.
  const refFetches = referenceSections
    .filter(s => s.apiPath && s.key !== 'materials' && s.key !== 'recipes')
    .map(async s => {
      try {
        const res = await api.get(s.apiPath)
        refCounts.value = { ...refCounts.value, [s.key]: Array.isArray(res.data) ? res.data.length : 0 }
      } catch { /* silent */ }
    })

  await Promise.allSettled(refFetches)
  loading.value = false
}

onMounted(loadDashboard)

// Смена проекта/оператора перезапрашивает ТОЛЬКО граф — остальные вкладки
// фильтруются на клиенте из уже загруженных списков.
async function reloadGraph() {
  try {
    const res = await api.get(graphQuery())
    graphData.value = res.data
  } catch { /* граф остаётся с прежними данными */ }
}

// ── Computed ──────────────────────────────────────────────────────────
const kpis = computed(() => {
  if (!kpiData.value) return workflowSections.map(s => ({ key: s.key, label: s.shortLabel || s.label, icon: s.icon, customIcon: s.customIcon ?? null, route: s.path, total: '…', lines: [] }))
  // Use filtered client-side data for accurate counts
  const ft = filteredTapes.value
  const fe = filteredElectrodeBatches.value
  const fb = filteredBatteries.value
  const tapeComplete = ft.filter(t => t.workflow_complete).length
  const tapeInProgress = ft.filter(t => !t.workflow_complete).length
  const battAssembled = fb.filter(b => b.status === 'assembled').length
  const battTesting = fb.filter(b => b.status === 'testing').length
  return [
    { key: 'tapes', label: 'Ленты', icon: 'pi pi-bars', route: '/tapes', total: ft.length, lines: [`Завершено: ${tapeComplete}`, `В работе: ${tapeInProgress}`] },
    { key: 'electrodes', label: 'Электроды', icon: 'pi pi-clone', route: '/electrodes', total: fe.length, lines: [`Партий: ${fe.length}`] },
    { key: 'assembly', label: 'Аккумуляторы', icon: 'pi pi-box', route: '/assembly', total: fb.length, lines: [`Собрано: ${battAssembled}`, `Тестируется: ${battTesting}`] },
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


function goTo(path) { router.push(path) }


function activityColor(action) {
  if (action === 'create' || action === 'register') return '#52C9A6'
  if (action === 'delete') return '#E74C3C'
  if (action === 'login_success') return '#52C9A6'
  if (action === 'logout') return '#9CA3AF'
  return '#003274'
}

// Russian label for the small navy pill in each timeline row. The
// merged endpoint mixes verbs from three sources (auth_log,
// field_changelog, activity_log) — normalize them to readable
// Russian here instead of leaking «login_success» / «edit» into
// the UI verbatim.
const ACTION_LABELS = {
  create:        'создал',
  update:        'изменил',
  edit:          'правка',
  delete:        'удалил',
  login_success: 'вход',
  logout:        'выход',
  register:      'регистр.',
}
function actionLabel(action) {
  return ACTION_LABELS[action] || action || ''
}

// Russian label for the entity column. Same idea — the backend
// stores raw table-ish names ('tape', 'electrode_cut_batch', 'auth')
// which are fine for queries but ugly in the timeline.
const ENTITY_LABELS = {
  tape:                 'лента',
  electrode_cut_batch:  'партия',
  battery:              'аккум.',
  recipe:               'рецепт',
  material:             'материал',
  project:              'проект',
  user:                 'юзер',
  separator:            'сепаратор',
  electrolyte:          'электролит',
  auth:                 'авторизация',
}
function entityLabel(e) {
  return ENTITY_LABELS[e] || e || ''
}

// Group filteredActivity by day for the timeline. Russian relative
// labels for today / yesterday, full date otherwise — matches the
// pattern the user sees in messengers / mail clients. Each group is
// sorted by created_at DESC (already true since the backend orders
// the union by created_at DESC; we just slice it into day buckets).
const RU_MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]
function dayKey(d) {
  // Local-day key (yyyy-mm-dd) — group by calendar day in user's
  // timezone, not UTC, so events near midnight don't drift across
  // headers.
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function dayLabel(d) {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (dayKey(d) === dayKey(today))     return 'Сегодня'
  if (dayKey(d) === dayKey(yesterday)) return 'Вчера'
  // «7 апреля 2026» if not current year, «7 апреля» otherwise
  const sameYear = d.getFullYear() === today.getFullYear()
  const ymd = `${d.getDate()} ${RU_MONTHS[d.getMonth()]}`
  return sameYear ? ymd : `${ymd} ${d.getFullYear()}`
}

// Time-of-day for the right-aligned column. Was previously
// `formatTime` doing «5 мин назад» / «3 ч назад» / «7 апр.» — but
// once we split by day-headers, repeating «7 апр.» on every row
// inside the «7 апреля» group is noise. Show plain HH:MM instead.
function formatTimeOfDay(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}


// ── Client-side filtering (all tabs) ─────────────────────────────────
function getDateRange() {
  const period = selectedPeriod.value
  if (period === 'custom') {
    return {
      from: customDateFrom.value ? new Date(customDateFrom.value) : null,
      to: customDateTo.value ? new Date(customDateTo.value + 'T23:59:59') : null,
    }
  }
  if (period === 'all') return { from: null, to: null }
  const days = { '7d': 7, '30d': 30, '90d': 90 }
  const d = days[period]
  return { from: d ? new Date(Date.now() - d * 86400000) : null, to: null }
}

function applyFilters(items, projectField = 'project_id', operatorField = 'created_by') {
  let filtered = items
  if (selectedProjects.value.length > 0) {
    const pset = new Set(selectedProjects.value.map(String))
    filtered = filtered.filter(i => pset.has(String(i[projectField])))
  }
  if (selectedOperators.value.length > 0) {
    const oset = new Set(selectedOperators.value.map(String))
    filtered = filtered.filter(i => oset.has(String(i[operatorField])))
  }
  const { from, to } = getDateRange()
  if (from) filtered = filtered.filter(i => new Date(i.created_at) >= from)
  if (to) filtered = filtered.filter(i => new Date(i.created_at) <= to)
  return filtered
}

const filteredTapes = computed(() => applyFilters(allTapes.value))
const filteredElectrodeBatches = computed(() => applyFilters(allElectrodeBatches.value))
const filteredBatteries = computed(() => applyFilters(allBatches.value))
const filteredActivity = computed(() => {
  const { from, to } = getDateRange()
  let items = activity.value
  if (from) items = items.filter(i => new Date(i.created_at) >= from)
  if (to) items = items.filter(i => new Date(i.created_at) <= to)
  if (selectedOperators.value.length > 0) {
    const oset = new Set(selectedOperators.value.map(String))
    items = items.filter(i => oset.has(String(i.user_id)))
  }
  return items
})

// Date-grouped view of filteredActivity for the day-headered timeline
// rendering. Returns an array of { key, label, items } — `items` is
// already in created_at DESC order (the backend ordered the union by
// created_at DESC so we just walk it sequentially and bucket by
// local-calendar day). The list keeps the day headers in the same
// DESC order as the events.
const groupedActivity = computed(() => {
  const groups = []
  let cur = null
  for (const evt of filteredActivity.value) {
    const d = new Date(evt.created_at)
    const key = dayKey(d)
    if (!cur || cur.key !== key) {
      cur = { key, label: dayLabel(d), items: [] }
      groups.push(cur)
    }
    cur.items.push(evt)
  }
  return groups
})
// ── Аналитика: воронка и тренд на клиенте ─────────────────────────────
// Раньше серверные /dashboard/funnel и /dashboard/production игнорировали
// проект/оператор (а воронка — ещё и период для рецептур), хотя фильтр-бар
// выглядел применённым. Считаем из тех же отфильтрованных списков, что и
// KPI/Pipeline — фильтры честные, смена периода мгновенная.
const clientFunnel = computed(() => {
  const ft = filteredTapes.value
  // «Рецептуры» = уникальные рецептуры, по которым отлиты попавшие в фильтр
  // ленты (конверсия «рецептура → лента»), а не все рецептуры справочника.
  const recipesUsed = new Set(ft.map(t => t.tape_recipe_id).filter(id => id != null)).size
  return [
    { stage: 'Рецептуры', count: recipesUsed },
    { stage: 'Ленты', count: ft.length },
    { stage: 'Электроды', count: filteredElectrodeBatches.value.length },
    { stage: 'Аккумуляторы', count: filteredBatteries.value.length },
  ]
})

// Понедельник недели даты — локальная полночь (как date_trunc('week')).
function mondayOf(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

const clientProduction = computed(() => {
  const lists = [
    ['tapes', filteredTapes.value],
    ['electrode_batches', filteredElectrodeBatches.value],
    ['batteries', filteredBatteries.value],
  ]
  const weeks = new Map()
  for (const [field, items] of lists) {
    for (const it of items) {
      const t = new Date(it.created_at)
      if (isNaN(t)) continue
      const wk = mondayOf(t).getTime()
      let row = weeks.get(wk)
      if (!row) {
        row = { week_start: new Date(wk).toISOString(), tapes: 0, electrode_batches: 0, batteries: 0 }
        weeks.set(wk, row)
      }
      row[field]++
    }
  }
  if (weeks.size === 0) return []
  // Пустые недели заполняем нулями, иначе линия соединит далёкие недели
  // как соседние и тренд соврёт.
  const keys = [...weeks.keys()].sort((a, b) => a - b)
  const out = []
  const cursor = new Date(keys[0])
  while (cursor.getTime() <= keys[keys.length - 1]) {
    out.push(weeks.get(cursor.getTime())
      || { week_start: cursor.toISOString(), tapes: 0, electrode_batches: 0, batteries: 0 })
    cursor.setDate(cursor.getDate() + 7)
  }
  return out
})
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
        <!-- Один сегментированный контрол периода (1 клик) — раньше были
             Select + дублирующие его чипы «Неделя/Месяц/Всё» -->
        <!-- На вкладке «Граф» период честно отключён — граф показывает
             структуру связей и по времени не фильтруется -->
        <div
          class="filter-seg"
          role="group"
          aria-label="Период"
          :title="activeTab === 'graph' ? 'К графу связей период не применяется' : ''"
        >
          <button
            v-for="p in periodOptions"
            :key="p.value"
            :class="['filter-seg-btn', { active: selectedPeriod === p.value }]"
            :disabled="activeTab === 'graph'"
            @click="setPeriod(p.value)"
          >{{ p.label }}</button>
        </div>
        <template v-if="selectedPeriod === 'custom'">
        <DateInputISO
          v-model="customDateFrom"
          class="filter-date-input"
          :disabled="activeTab === 'graph'"
          @update:model-value="onPeriodChange"
        />
        <span class="filter-date-sep">—</span>
        <DateInputISO
          v-model="customDateTo"
          class="filter-date-input"
          :disabled="activeTab === 'graph'"
          @update:model-value="onPeriodChange"
        />
        </template>
        <MultiSelect
          v-model="selectedProjects"
          :options="filterOptions.projects"
          optionLabel="name"
          optionValue="id"
          placeholder="Проекты"
          size="small"
          class="filter-project"
          :maxSelectedLabels="2"
          selectedItemsLabel="{0} проектов"
          @change="reloadGraph()"
        />
        <MultiSelect
          v-model="selectedOperators"
          :options="filterOptions.operators"
          optionLabel="name"
          optionValue="id"
          placeholder="Операторы"
          size="small"
          class="filter-operator"
          :maxSelectedLabels="2"
          selectedItemsLabel="{0} операторов"
          @change="reloadGraph()"
        />
        <button v-if="filtersDirty" class="filter-reset-btn" title="Период 30 дней, проекты и операторы — все" @click="resetFilters">
          <i class="pi pi-times"></i> Сбросить
        </button>
        <!-- Серверный граф принимает только один id — честно предупреждаем,
             что мультивыбор к нему не применяется -->
        <span
          v-if="activeTab === 'graph' && (selectedProjects.length > 1 || selectedOperators.length > 1)"
          class="filter-hint"
        >
          <i class="pi pi-info-circle"></i> Граф фильтруется только при выборе одного проекта/оператора
        </span>
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
        <div v-if="filteredActivity.length === 0" class="empty-state">Нет событий</div>
        <div v-else class="timeline-list">
          <template v-for="group in groupedActivity" :key="group.key">
            <div class="timeline-day">{{ group.label }}</div>
            <div v-for="evt in group.items" :key="evt.id" class="timeline-item">
              <div class="timeline-dot" :style="{ background: activityColor(evt.action) }"></div>
              <div class="timeline-content">
                <span class="timeline-action">{{ actionLabel(evt.action) }}</span>
                <span class="timeline-entity">
                  {{ entityLabel(evt.entity) }}<template v-if="evt.entity_id"> #{{ evt.entity_id }}</template>
                </span>
                <span class="timeline-user">{{ evt.user_name || '—' }}</span>
                <span class="timeline-time">{{ formatTimeOfDay(evt.created_at) }}</span>
              </div>
            </div>
          </template>
        </div>
      </div>

    </template><!-- /overview -->

    <!-- ════════ PIPELINE TAB ════════ -->
    <template v-if="activeTab === 'pipeline'">
      <div class="glass-card pipeline-section">
        <DashboardPipeline :tapes="filteredTapes" :electrodeBatches="filteredElectrodeBatches" :batteries="filteredBatteries" @refresh="loadDashboard()" />
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
      <DashboardAnalytics :production="clientProduction" :funnel="clientFunnel" :materialsUsage="materialsUsage" />
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
  /* Phones: the 4 tabs are wider than the viewport — scroll the strip
     itself, never the page (max-width keeps it inside .app-content). */
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.tab-switcher::-webkit-scrollbar { display: none; }
.tab-switcher .tab-btn { flex-shrink: 0; }
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
.filter-seg {
  display: inline-flex;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 7px;
  overflow: hidden;
  background: white;
  flex-shrink: 0;
}
.filter-seg-btn {
  padding: 5px 11px;
  border: none;
  border-right: 1px solid rgba(0, 50, 116, 0.1);
  background: white;
  color: rgba(0, 50, 116, 0.65);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.filter-seg-btn:last-child { border-right: none; }
.filter-seg-btn:hover:not(.active):not(:disabled) { background: rgba(0, 50, 116, 0.05); }
.filter-seg-btn.active { background: #003274; color: white; font-weight: 600; }
.filter-seg-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.filter-date-input:disabled { opacity: 0.45; cursor: not-allowed; }
.filter-hint {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: rgba(0, 50, 116, 0.55);
}
.filter-hint i { font-size: 11px; }
.filter-reset-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid rgba(231, 76, 60, 0.3);
  border-radius: 7px;
  background: white;
  color: #E74C3C;
  font-size: 12px;
  font-family: inherit;
  padding: 5px 10px;
  cursor: pointer;
}
.filter-reset-btn:hover { background: rgba(231, 76, 60, 0.08); }
.filter-reset-btn i { font-size: 10px; }
.filter-project { width: 210px; }
.filter-operator { width: 210px; }
.filter-date-input {
  width: 130px;
  height: 30px;
  padding: 2px 8px;
  border: 1px solid rgba(180, 210, 255, 0.55);
  border-radius: 6px;
  font-size: 12px;
  font-family: inherit;
  color: #333;
  background: white;
}
.filter-date-input:focus { border-color: #003274; outline: none; }
.filter-date-sep { color: #9CA3AF; font-size: 12px; }

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
/* Sticky day-headers — they stay visible at the top of the
   scrolling list as the user scrolls through events for that day,
   matching the messenger / mail-client pattern. Subtle navy tint
   on a tinted bar so it doesn't compete with the row content. */
.timeline-day {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 6px 1.25rem;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.55);
  background: rgba(241, 244, 250, 0.92);
  backdrop-filter: blur(6px);
  border-bottom: 1px solid rgba(0, 50, 116, 0.06);
}
.timeline-day:first-child {
  margin-top: -0.5rem; /* align with timeline-list's top padding */
}
.timeline-item {
  display: flex; align-items: center; gap: 0.7rem;
  padding: 0.5rem 1.25rem;
  transition: background 0.12s;
}
.timeline-item:hover { background: rgba(0, 50, 116, 0.03); }
.timeline-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
/* Was `flex-wrap: wrap` which made every span jump to its own line as
   soon as a long Russian full name landed in the row. Switched to a
   single-row grid: action pill | entity ref | user name (truncates) |
   time. `min-width: 0` on the wrapper + the name lets the name shrink
   gracefully with ellipsis instead of pushing the time off the row. */
.timeline-content {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(60px, auto) minmax(70px, auto) 1fr auto;
  gap: 0.6rem;
  align-items: baseline;
  font-size: 12px;
  color: #4b5563;
  line-height: 1.4;
}
.timeline-action {
  font-weight: 600;
  color: #003274;
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.04em;
  background: rgba(0, 50, 116, 0.06);
  padding: 2px 8px;
  border-radius: 4px;
  text-align: center;
  white-space: nowrap;
}
.timeline-entity {
  color: #6B7280;
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  font-size: 11px;
  white-space: nowrap;
}
.timeline-user {
  color: #4b5563;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.timeline-time {
  color: #9CA3AF;
  font-size: 11px;
  white-space: nowrap;
  justify-self: end;
}

/* Narrow viewports: stack the user name on a second line so neither
   the entity nor the time get squashed. Action + entity + time stay
   on the top row; the long name gets the full width below. */
@media (max-width: 540px) {
  .timeline-content {
    grid-template-columns: auto auto 1fr;
    grid-template-areas:
      "action entity time"
      "user   user   user";
    row-gap: 4px;
  }
  .timeline-action { grid-area: action; }
  .timeline-entity { grid-area: entity; }
  .timeline-time   { grid-area: time; }
  .timeline-user   { grid-area: user; }
}

/* ── Mobile ── */
@media (max-width: 768px) {
  .kpi-grid { grid-template-columns: repeat(2, 1fr); }
  .filter-bar { flex-direction: column; align-items: stretch; }
  .filter-bar-left { flex-wrap: wrap; }
  .filter-project, .filter-operator { width: 100%; }
  .filter-seg { width: 100%; }
  .filter-seg-btn { flex: 1; }
}
</style>
