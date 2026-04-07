<script setup>
/**
 * ActivityPage — "Журнал действий"
 * Displays activity_log entries (create, update, delete across all entities).
 */
import { ref, onMounted } from 'vue'
import api from '@/services/api'
import PageHeader from '@/components/PageHeader.vue'
import CrudTable from '@/components/CrudTable.vue'

const entries = ref([])
const loading = ref(false)

const columns = [
  { field: 'created_at',      header: 'Дата',       minWidth: '100px', width: '150px' },
  { field: 'user_name',       header: 'Сотрудник',  minWidth: '120px' },
  { field: 'action',          header: 'Действие',   minWidth: '70px',  width: '110px' },
  { field: 'entity',          header: 'Объект',     minWidth: '70px',  width: '110px' },
  { field: 'entity_id',       header: 'ID',         minWidth: '50px',  width: '70px' },
  { field: 'details_display', header: 'Детали',     minWidth: '150px', sortable: false },
  { field: 'department_name', header: 'Отдел',      minWidth: '80px',  width: '110px' },
]

const actionLabels = { create: 'Создание', update: 'Изменение', delete: 'Удаление' }
const entityLabels = {
  tape: 'Лента', electrode: 'Электрод', project: 'Проект',
  recipe: 'Рецепт', user: 'Пользователь', battery: 'Аккумулятор',
  material: 'Материал', separator: 'Сепаратор',
}

async function loadEntries() {
  loading.value = true
  try {
    const { data } = await api.get('/api/activity?limit=200')
    entries.value = (data.rows || []).map(r => ({
      ...r,
      details_display: r.details ? summarizeDetails(r.details) : '—',
    }))
  } catch {
    entries.value = []
  } finally {
    loading.value = false
  }
}

function summarizeDetails(d) {
  if (typeof d === 'string') try { d = JSON.parse(d) } catch { return d }
  if (d.name) return d.name
  if (d.field) return `${d.field}: ${d.old || '—'} → ${d.new || '—'}`
  return JSON.stringify(d).slice(0, 80)
}

function formatDate(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
}

onMounted(loadEntries)
</script>

<template>
  <div class="activity-page">
    <PageHeader title="Журнал действий" icon="pi pi-history" />

    <CrudTable
      :columns="columns"
      :data="entries"
      :loading="loading"
      id-field="id"
      table-name="Журнал действий"
    >
      <template #col-created_at="{ data }">{{ formatDate(data.created_at) }}</template>
      <template #col-user_name="{ data }">
        <span class="user-name">{{ data.user_name || '—' }}</span>
      </template>
      <template #col-action="{ data }">
        <span :class="['action-badge', `action-badge--${data.action}`]">
          {{ actionLabels[data.action] || data.action }}
        </span>
      </template>
      <template #col-entity="{ data }">
        {{ entityLabels[data.entity] || data.entity }}
      </template>
      <template #col-entity_id="{ data }">
        <span class="entity-id">#{{ data.entity_id || '—' }}</span>
      </template>
      <template #col-details_display="{ data }">
        <span class="details-text" :title="JSON.stringify(data.details)">{{ data.details_display }}</span>
      </template>
    </CrudTable>
  </div>
</template>

<style scoped>
.activity-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.activity-page :deep(.page-header) { margin-bottom: 3px !important; }
.user-name { font-weight: 600; color: #003274; }
.entity-id { color: #6B7280; font-size: 12px; }
.details-text {
  color: #6B7280;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
  max-width: 300px;
}
.action-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}
.action-badge--create { background: rgba(82, 201, 166, 0.15); color: #1a8a64; }
.action-badge--update { background: rgba(211, 167, 84, 0.15); color: #9a7030; }
.action-badge--delete { background: rgba(176, 0, 32, 0.1); color: #b00020; }
</style>
