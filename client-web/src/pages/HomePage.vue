<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import PageHeader from '@/components/PageHeader.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { workflowSections, referenceSections } from '@/config/navigation'

const router = useRouter()

// ── Data store — keyed by section.key ──────────────────────────────────
const data   = ref({})    // { tapes: [...], electrodes: [...], ... }
const errors = ref({})    // { tapes: true, ... }
const counts = ref({})    // { materials: 12, recipes: 5, ... }

// ── KPI cards — built from workflowSections ────────────────────────────
const kpis = computed(() =>
  workflowSections.map(s => ({
    key: s.key,
    label: s.shortLabel || s.label,
    icon: s.icon,
    customIcon: s.customIcon ?? null,
    route: s.path,
    total: errors.value[s.key] ? '—'
         : s.apiPath ? (data.value[s.key]?.length ?? '…')
         : '—',
    lines: errors.value[s.key] || !s.apiPath ? [] : buildKpiLines(s.key),
  }))
)

function buildKpiLines(key) {
  const items = data.value[key] ?? []
  if (!items.length) return []
  const processing = items.filter(i => i.status === 'processing').length
  const draft      = items.filter(i => !i.status || i.status === 'draft').length
  return [
    `В работе: ${processing}`,
    `Черновик: ${draft}`,
  ]
}

// ── Recent tables — only workflow sections with apiPath ─────────────────
const recentSections = computed(() =>
  workflowSections.map(s => ({
    ...s,
    label: s.shortLabel || s.label,
    recentLabel: `Последние ${(s.shortLabel || s.label).toLowerCase()}`,
    hasApi: !!s.apiPath,
    items: s.apiPath
      ? [...(data.value[s.key] ?? [])]
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .slice(0, 3)
      : [],
    hasError: !!errors.value[s.key],
  }))
)

// ── Reference counts — for quick-link badges ───────────────────────────
const refLinks = computed(() =>
  referenceSections.map(s => ({
    ...s,
    count: counts.value[s.key] ?? null,
    hasError: !!errors.value[s.key],
  }))
)

// ── Fetch data on mount ────────────────────────────────────────────────
onMounted(async () => {
  // 1. Workflow data (full arrays for KPI + recent tables)
  const workflowFetches = workflowSections
    .filter(s => s.apiPath)
    .map(async s => {
      try {
        const res = await api.get(s.apiPath)
        data.value = { ...data.value, [s.key]: res.data }
      } catch {
        errors.value = { ...errors.value, [s.key]: true }
      }
    })

  // 2. Reference data (just counts for badges)
  const refFetches = referenceSections
    .filter(s => s.apiPath)
    .map(async s => {
      try {
        const res = await api.get(s.apiPath)
        const items = Array.isArray(res.data) ? res.data : []
        counts.value = { ...counts.value, [s.key]: items.length }
      } catch {
        errors.value = { ...errors.value, [s.key]: true }
      }
    })

  await Promise.allSettled([...workflowFetches, ...refFetches])
})

function goTo(path) {
  router.push(path)
}
</script>

<template>
  <div class="home-page">
    <PageHeader title="Главная" icon="pi pi-home" />

    <!-- KPI cards — from workflowSections -->
    <div class="kpi-grid">
      <div
        v-for="kpi in kpis"
        :key="kpi.key"
        class="glass-card kpi-card"
        @click="goTo(kpi.route)"
      >
        <div class="kpi-label">
          <!-- Custom SVG: droplet -->
          <svg v-if="kpi.customIcon === 'droplet'" class="kpi-icon-svg" viewBox="0 0 18 18">
            <path d="M9 1.5 C9 1.5, 3.5 8, 3.5 11.5 C3.5 14.8, 6 16.5, 9 16.5 C12 16.5, 14.5 14.8, 14.5 11.5 C14.5 8, 9 1.5, 9 1.5Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <!-- Custom: vertical line -->
          <span v-else-if="kpi.customIcon === 'vline'" class="kpi-icon-vline"></span>
          <!-- Standard PrimeIcon -->
          <i v-else :class="kpi.icon" class="kpi-icon"></i>
          {{ kpi.label }}
        </div>
        <div class="kpi-number">{{ kpi.total }}</div>
        <div v-for="(line, i) in kpi.lines" :key="i" class="kpi-detail">{{ line }}</div>
      </div>
    </div>

    <!-- СПРАВОЧНИКИ — compact quick-links -->
    <div class="glass-card ref-card">
      <div class="ref-card-title">Справочники</div>
      <div class="ref-grid">
        <div
          v-for="r in refLinks"
          :key="r.key"
          class="ref-link"
          @click="goTo(r.path)"
        >
          <!-- Custom SVG: droplet -->
          <svg v-if="r.customIcon === 'droplet'" class="ref-icon-svg" viewBox="0 0 18 18">
            <path d="M9 1.5 C9 1.5, 3.5 8, 3.5 11.5 C3.5 14.8, 6 16.5, 9 16.5 C12 16.5, 14.5 14.8, 14.5 11.5 C14.5 8, 9 1.5, 9 1.5Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <!-- Custom: vertical line -->
          <span v-else-if="r.customIcon === 'vline'" class="ref-icon-vline"></span>
          <!-- Standard PrimeIcon -->
          <i v-else :class="r.icon" class="ref-icon"></i>
          <span class="ref-label">{{ r.label }}</span>
          <span v-if="r.count !== null" class="ref-count">{{ r.count }}</span>
          <span v-else-if="r.hasError" class="ref-count ref-count--error">—</span>
        </div>
      </div>
    </div>

    <!-- Recent records — from workflowSections with API -->
    <div class="recent-grid">
      <div
        v-for="sec in recentSections"
        :key="sec.key"
        class="glass-card recent-card"
      >
        <div class="recent-card-title">{{ sec.recentLabel }}</div>
        <div v-if="!sec.hasApi" class="empty-state empty-state--soon">
          <i class="pi pi-clock"></i>
          <span>Скоро</span>
        </div>
        <p v-else-if="!sec.items.length && !sec.hasError" class="empty-state">Нет записей</p>
        <p v-else-if="sec.hasError" class="empty-state">Не удалось загрузить</p>
        <DataTable
          v-else
          :value="sec.items"
          rowHover
          @rowClick="e => goTo(`${sec.path}/${e.data[sec.idField]}`)"
          class="recent-table"
          style="cursor: pointer"
        >
          <Column :field="sec.nameField" header="Название">
            <template #body="{ data: row }">{{ row[sec.nameField] || '— без названия —' }}</template>
          </Column>
          <Column field="status" header="Статус" style="width: 120px">
            <template #body="{ data: row }"><StatusBadge :status="row.status ?? 'draft'" /></template>
          </Column>
        </DataTable>
      </div>
    </div>
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
/* Override PageHeader margin — container gap handles spacing */
.home-page :deep(.page-header) {
  margin-bottom: 3px !important;
}

/* ── KPI grid ─────────────────────────────────────────────────────────── */
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

.kpi-icon-svg {
  width: 14px; height: 14px; flex-shrink: 0;
  color: rgba(0, 50, 116, 0.5);
}

.kpi-icon-vline {
  display: inline-flex; align-items: center; justify-content: center;
  width: 14px; height: 14px; flex-shrink: 0;
}
.kpi-icon-vline::after {
  content: ''; display: block;
  width: 2px; height: 12px;
  background: rgba(0, 50, 116, 0.5); border-radius: 1px;
}

.kpi-number {
  font-size: 28px;
  font-weight: 700;
  color: #003274;
  margin: 6px 0 4px;
}

.kpi-detail {
  font-size: 12px;
  color: #6B7280;
}

/* ── Reference quick-links ────────────────────────────────────────────── */
.ref-card { padding: 1.5rem; }

.ref-card-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.5);
  margin-bottom: 0.85rem;
}

.ref-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.ref-link {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0.45rem 0.85rem;
  border-radius: 8px;
  background: rgba(0, 50, 116, 0.04);
  border: 1px solid rgba(180, 210, 255, 0.25);
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease;
  font-size: 0.83rem;
  color: #333;
}
.ref-link:hover {
  background: rgba(0, 50, 116, 0.08);
  border-color: rgba(0, 50, 116, 0.2);
}

.ref-icon { font-size: 0.85rem; color: #003274; opacity: 0.7; }

.ref-icon-svg {
  width: 13px; height: 13px; flex-shrink: 0;
  color: #003274; opacity: 0.7;
}

.ref-icon-vline {
  display: inline-flex; align-items: center; justify-content: center;
  width: 13px; flex-shrink: 0;
}
.ref-icon-vline::after {
  content: ''; display: block;
  width: 2px; height: 12px;
  background: #003274; opacity: 0.7; border-radius: 1px;
}

.ref-label { font-weight: 500; }

.ref-count {
  font-size: 0.7rem;
  font-weight: 700;
  color: #003274;
  background: rgba(0, 50, 116, 0.08);
  padding: 1px 6px;
  border-radius: 10px;
  min-width: 20px;
  text-align: center;
}
.ref-count--error { color: #9CA3AF; background: rgba(0, 0, 0, 0.04); }

/* ── Recent records grid ──────────────────────────────────────────────── */
.recent-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.25rem;
}

.recent-card {
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.recent-card :deep(.p-datatable),
.recent-card .empty-state {
  flex: 1;
}

.recent-card-title {
  padding: 1rem 1.5rem 0.7rem;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.5);
  border-bottom: 1px solid rgba(180, 210, 255, 0.25);
}

.empty-state {
  text-align: center;
  padding: 2rem 1rem;
  color: #6B7280;
  font-size: 13px;
}
.empty-state--soon {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: rgba(0, 50, 116, 0.3);
}
.empty-state--soon i {
  font-size: 1.5rem;
}

/* DataTable inside glass-card — transparent background */
.recent-card :deep(.p-datatable-table-container),
.recent-card :deep(.p-datatable) {
  background: transparent;
}

.recent-card :deep(.p-datatable-thead > tr > th) {
  background: rgba(0, 50, 116, 0.055);
  color: #003274;
  font-weight: 700;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid rgba(180, 210, 255, 0.35);
}

.recent-card :deep(.p-datatable-tbody > tr) {
  background: transparent;
  border-bottom: 1px solid rgba(180, 210, 255, 0.18);
}

.recent-card :deep(.p-datatable-tbody > tr:last-child) {
  border-bottom: none;
}

.recent-card :deep(.p-datatable-tbody > tr:hover) {
  background: rgba(0, 50, 116, 0.04) !important;
}
</style>
