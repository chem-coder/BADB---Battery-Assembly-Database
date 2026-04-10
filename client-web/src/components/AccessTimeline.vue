<script setup>
/**
 * AccessTimeline — audit log of access changes from field_changelog.
 * Grouped by day, filterable by action/user/project.
 */
import { ref, computed, onMounted } from 'vue'
import api from '@/services/api'
import Select from 'primevue/select'

const loading = ref(true)
const events = ref([])
const filterAction = ref(null)
const searchQuery = ref('')

const ACTION_LABELS = {
  grant: 'Выдан доступ',
  revoke: 'Отозван доступ',
  copy: 'Скопирован доступ',
}

const ACTION_COLORS = {
  grant: '#52C9A6',
  revoke: '#E74C3C',
  copy: '#D3A754',
}

const ACTION_ICONS = {
  grant: 'pi pi-plus-circle',
  revoke: 'pi pi-minus-circle',
  copy: 'pi pi-copy',
}
const DEFAULT_ICON = 'pi pi-circle'
const DEFAULT_COLOR = '#6B7280'

const actionOptions = [
  { label: 'Все события', value: null },
  { label: 'Выдача', value: 'grant' },
  { label: 'Отзыв', value: 'revoke' },
  { label: 'Копирование', value: 'copy' },
]

async function loadTimeline() {
  loading.value = true
  try {
    const { data } = await api.get('/api/access/timeline?limit=300')
    events.value = data
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

onMounted(loadTimeline)

const filteredEvents = computed(() => {
  let list = events.value
  if (filterAction.value) list = list.filter(e => e.action === filterAction.value)
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(e =>
      (e.project_name || '').toLowerCase().includes(q) ||
      (e.changed_by_name || '').toLowerCase().includes(q) ||
      (e.payload?.user_names || []).some(n => n.toLowerCase().includes(q)) ||
      (e.payload?.dept_names || []).some(n => n.toLowerCase().includes(q))
    )
  }
  return list
})

// Group by day
const groupedByDay = computed(() => {
  const groups = new Map()
  for (const e of filteredEvents.value) {
    const day = new Date(e.changed_at).toLocaleDateString('ru-RU', {
      day: '2-digit', month: 'long', year: 'numeric'
    })
    if (!groups.has(day)) groups.set(day, [])
    groups.get(day).push(e)
  }
  return Array.from(groups.entries()).map(([day, items]) => ({ day, items }))
})

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function describeEvent(e) {
  const p = e.payload || {}
  const users = p.user_names?.join(', ') || ''
  const depts = p.dept_names?.join(', ') || ''
  const level = p.access_level ? ` (${p.access_level})` : ''

  if (e.action === 'grant') {
    const parts = []
    if (users) parts.push(`пользователям: ${users}`)
    if (depts) parts.push(`отделам: ${depts}`)
    return parts.join('; ') + level
  }
  if (e.action === 'revoke') {
    if (users) return `у ${users}`
    if (depts) return `у отделов: ${depts}`
    return ''
  }
  if (e.action === 'copy') {
    return `из проекта #${p.source_project_id || '?'} (${p.copied_users || 0} польз., ${p.copied_departments || 0} отд.)`
  }
  return ''
}
</script>

<template>
  <div class="access-timeline">
    <!-- Filter bar -->
    <div class="filter-bar glass-card">
      <div class="filter-search">
        <i class="pi pi-search"></i>
        <input v-model="searchQuery" placeholder="Поиск по проекту, пользователю..." />
      </div>
      <Select
        v-model="filterAction"
        :options="actionOptions"
        optionLabel="label"
        optionValue="value"
        placeholder="Все события"
        class="filter-select"
      />
      <span class="filter-count">{{ filteredEvents.length }} событий</span>
    </div>

    <div v-if="loading" class="loading">
      <i class="pi pi-spin pi-spinner"></i> Загрузка...
    </div>

    <div v-else-if="!filteredEvents.length" class="empty-state">
      <i class="pi pi-info-circle"></i>
      Нет событий в журнале
    </div>

    <div v-else class="timeline-list">
      <div v-for="group in groupedByDay" :key="group.day" class="day-group">
        <div class="day-label">{{ group.day }}</div>
        <div class="day-events">
          <div v-for="e in group.items" :key="e.id" class="event-row glass-card">
            <div class="event-marker" :style="{ background: ACTION_COLORS[e.action] || DEFAULT_COLOR }">
              <i :class="ACTION_ICONS[e.action] || DEFAULT_ICON"></i>
            </div>
            <div class="event-content">
              <div class="event-header">
                <span class="event-action" :style="{ color: ACTION_COLORS[e.action] || DEFAULT_COLOR }">
                  {{ ACTION_LABELS[e.action] || e.action }}
                </span>
                <span class="event-time">{{ formatTime(e.changed_at) }}</span>
              </div>
              <div class="event-project">
                <i class="pi pi-folder"></i>
                <span>{{ e.project_name || `#${e.project_id}` }}</span>
              </div>
              <div v-if="describeEvent(e)" class="event-detail">
                {{ describeEvent(e) }}
              </div>
              <div class="event-footer">
                <span class="event-by">
                  <i class="pi pi-user"></i>
                  {{ e.changed_by_name || '—' }}
                </span>
                <span v-if="e.payload?.expires_at" class="event-expires">
                  <i class="pi pi-clock"></i>
                  до {{ new Date(e.payload.expires_at).toLocaleDateString('ru-RU') }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.access-timeline { display: flex; flex-direction: column; gap: 0.75rem; }

.filter-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  flex-wrap: wrap;
}

.filter-search {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(180, 210, 255, 0.55);
  border-radius: 7px;
  flex: 1;
  min-width: 200px;
}
.filter-search i { font-size: 11px; color: #9CA3AF; }
.filter-search input {
  border: none;
  background: transparent;
  font-size: 12px;
  flex: 1;
  outline: none;
  font-family: inherit;
  color: #333;
}

.filter-select { width: 180px; }

.filter-count {
  font-size: 11px;
  font-weight: 600;
  color: rgba(0, 50, 116, 0.5);
}

.loading, .empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 3rem;
  color: rgba(0, 50, 116, 0.4);
  font-size: 13px;
}

/* Timeline list */
.timeline-list {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.day-group { display: flex; flex-direction: column; gap: 0.5rem; }

.day-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.5);
  padding-left: 0.5rem;
}

.day-events {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.event-row {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  align-items: flex-start;
}

.event-marker {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 14px;
  flex-shrink: 0;
}

.event-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.event-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.event-action {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.event-time {
  font-size: 11px;
  color: #9CA3AF;
}

.event-project {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #003274;
  font-weight: 500;
}
.event-project i { font-size: 11px; color: rgba(0, 50, 116, 0.4); }

.event-detail {
  font-size: 12px;
  color: #4B5563;
  line-height: 1.4;
}

.event-footer {
  display: flex;
  gap: 0.75rem;
  font-size: 11px;
  color: #6B7280;
  margin-top: 2px;
}

.event-by, .event-expires {
  display: flex;
  align-items: center;
  gap: 3px;
}
.event-by i, .event-expires i { font-size: 10px; color: rgba(0, 50, 116, 0.3); }
.event-expires {
  color: #8a6d2b;
}
</style>
