<script setup>
/**
 * FieldChangelog — shows field-level change history for an entity.
 * Fetches from GET /api/activity/changelog/:entityType/:entityId.
 */
import { ref, watch } from 'vue'
import api from '@/services/api'
import { fieldLabel } from '@/utils/fieldLabels'
import { formatDateTimeMsk } from '@/utils/dateFormat'

const props = defineProps({
  entityType: { type: String, required: true },
  entityId: { type: [Number, String], required: true },
})

const changes = ref([])
const loading = ref(false)
const error = ref(false)
let _loadId = 0

async function load() {
  if (!props.entityType || !props.entityId) return
  const myId = ++_loadId
  loading.value = true
  error.value = false
  try {
    const { data } = await api.get(`/api/activity/changelog/${props.entityType}/${props.entityId}`)
    if (myId !== _loadId) return // stale response
    changes.value = data
  } catch {
    if (myId !== _loadId) return
    error.value = true
  } finally {
    if (myId === _loadId) loading.value = false
  }
}

watch(() => [props.entityType, props.entityId], load, { immediate: true })

function formatDt(iso) {
  return formatDateTimeMsk(iso)
}

function truncate(val, max = 40) {
  if (!val) return '—'
  const s = String(val)
  return s.length > max ? s.slice(0, max) + '...' : s
}
</script>

<template>
  <div class="field-changelog">
    <div v-if="loading" class="fc-loading">
      <i class="pi pi-spin pi-spinner"></i> Загрузка...
    </div>
    <div v-else-if="error" class="fc-empty">Не удалось загрузить историю</div>
    <div v-else-if="changes.length === 0" class="fc-empty">Нет изменений</div>
    <table v-else class="fc-table">
      <thead>
        <tr>
          <th>Дата</th>
          <th>Поле</th>
          <th>Было</th>
          <th>Стало</th>
          <th>Кто</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in changes" :key="c.id">
          <td class="fc-date">{{ formatDt(c.changed_at) }}</td>
          <td class="fc-field" :title="c.field_name">{{ fieldLabel(entityType, c.field_name) }}</td>
          <td class="fc-old" :title="c.old_value">{{ truncate(c.old_value) }}</td>
          <td class="fc-new" :title="c.new_value">{{ truncate(c.new_value) }}</td>
          <td class="fc-who">{{ c.changed_by_name || '—' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.field-changelog {
  max-height: 300px;
  overflow: auto;
}

.fc-loading, .fc-empty {
  padding: 16px;
  text-align: center;
  color: rgba(0, 50, 116, 0.4);
  font-size: 13px;
}

.fc-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.fc-table th {
  padding: 6px 10px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(0, 50, 116, 0.50);
  background: rgba(0, 50, 116, 0.03);
  border-bottom: 1.5px solid rgba(0, 50, 116, 0.10);
  position: sticky;
  top: 0;
}

.fc-table td {
  padding: 5px 10px;
  border-bottom: 1px solid rgba(0, 50, 116, 0.05);
  color: #1a2a3a;
  vertical-align: top;
}

.fc-date {
  white-space: nowrap;
  color: rgba(0, 50, 116, 0.5);
  font-size: 11px;
}

.fc-field {
  font-weight: 500;
  color: #003274;
}

.fc-old {
  color: rgba(200, 80, 70, 0.7);
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fc-new {
  color: #1a8a64;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fc-who {
  color: rgba(0, 50, 116, 0.5);
  white-space: nowrap;
}
</style>
