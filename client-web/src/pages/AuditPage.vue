<script setup>
/**
 * AuditPage — "Журнал входов"
 * Displays auth_log entries (login_success, login_failed, register, password_changed).
 */
import { ref, onMounted } from 'vue'
import api from '@/services/api'
import PageHeader from '@/components/PageHeader.vue'
import CrudTable from '@/components/CrudTable.vue'

const entries = ref([])
const loading = ref(false)

const columns = [
  { field: 'created_at',      header: 'Дата',        minWidth: '100px', width: '150px' },
  { field: 'user_name',       header: 'Сотрудник',   minWidth: '120px' },
  { field: 'login',           header: 'Логин',       minWidth: '80px',  width: '120px' },
  { field: 'event',           header: 'Событие',     minWidth: '80px',  width: '140px' },
  { field: 'department_name', header: 'Отдел',        minWidth: '80px',  width: '110px' },
  { field: 'ip_address',      header: 'IP',           minWidth: '80px',  width: '120px' },
]

const eventLabels = {
  login_success: 'Вход',
  login_failed: 'Неудачный вход',
  register: 'Регистрация',
  password_changed: 'Смена пароля',
  logout: 'Выход',
}

async function loadEntries() {
  loading.value = true
  try {
    const { data } = await api.get('/api/auth/log?limit=200')
    entries.value = data.rows || []
  } catch {
    entries.value = []
  } finally {
    loading.value = false
  }
}

function formatDate(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
}

onMounted(loadEntries)
</script>

<template>
  <div class="audit-page">
    <PageHeader title="Журнал входов" icon="pi pi-sign-in" />

    <CrudTable
      :columns="columns"
      :data="entries"
      :loading="loading"
      id-field="id"
      table-name="Журнал входов"
    >
      <template #col-created_at="{ data }">{{ formatDate(data.created_at) }}</template>
      <template #col-user_name="{ data }">
        <span class="user-name">{{ data.user_name || data.login || '—' }}</span>
      </template>
      <template #col-event="{ data }">
        <span :class="['event-badge', `event-badge--${data.event}`]">
          {{ eventLabels[data.event] || data.event }}
        </span>
      </template>
    </CrudTable>
  </div>
</template>

<style scoped>
.audit-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.audit-page :deep(.page-header) { margin-bottom: 3px !important; }
.user-name { font-weight: 600; color: #003274; }
.event-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}
.event-badge--login_success { background: rgba(82, 201, 166, 0.15); color: #1a8a64; }
.event-badge--login_failed { background: rgba(176, 0, 32, 0.1); color: #b00020; }
.event-badge--register { background: rgba(0, 50, 116, 0.08); color: #003274; }
.event-badge--password_changed { background: rgba(211, 167, 84, 0.15); color: #9a7030; }
.event-badge--logout { background: rgba(0, 50, 116, 0.06); color: rgba(0, 50, 116, 0.5); }
</style>
