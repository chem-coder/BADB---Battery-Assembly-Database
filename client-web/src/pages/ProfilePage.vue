<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'
import Password from 'primevue/password'
import Button from 'primevue/button'
import { useStatus } from '@/composables/useStatus'

const authStore = useAuthStore()
const { statusMsg, statusError, showStatus } = useStatus()

// --- Section 1: User info ---
const user = computed(() => authStore.user || {})

// --- Department & colleagues ---
const department = ref(null)
const colleagues = ref([])

// --- My Access (from /api/access/my) ---
const myAccess = ref(null)

async function loadDepartment() {
  const deptId = user.value.department?.id
  if (!deptId) return
  try {
    const { data } = await api.get(`/api/departments/${deptId}`)
    department.value = data
    colleagues.value = data.members || []
  } catch {}
}

async function loadMyAccess() {
  try {
    const { data } = await api.get('/api/access/my')
    myAccess.value = data
  } catch {}
}

onMounted(() => {
  loadDepartment()
  loadMyAccess()
})

// Group metadata for display
const ACCESS_GROUPS = [
  { key: 'direct_grant',      label: 'Личный доступ',       icon: 'pi pi-key',       color: '#003274' },
  { key: 'dept_head',         label: 'Как руководитель отдела', icon: 'pi pi-briefcase', color: '#8E44AD' },
  { key: 'department_grant',  label: 'Доступ отделу',       icon: 'pi pi-users',     color: '#025EA1' },
  { key: 'own_department',    label: 'Мой отдел',           icon: 'pi pi-building',  color: '#6CACE4' },
  { key: 'public',            label: 'Открытые',            icon: 'pi pi-globe',     color: '#52C9A6' },
]

const totalProjects = computed(() => {
  if (!myAccess.value) return 0
  return Object.values(myAccess.value.grouped || {}).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0)
})

function formatDaysRemaining(days) {
  const d = Math.floor(days)
  if (d < 1) return 'сегодня'
  if (d === 1) return 'завтра'
  return `через ${d} дн.`
}

const roleBadge = computed(() => {
  const map = {
    admin:    { label: 'Администратор', cls: 'badge-danger' },
    lead:     { label: 'Ведущий',       cls: 'badge-warning' },
    employee: { label: 'Сотрудник',     cls: 'badge-info' },
  }
  return map[user.value.role] || { label: user.value.role || '—', cls: 'badge-info' }
})

// --- Section 2: Change password ---
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const fieldError = ref('')
const currentPasswordError = ref('')
const loading = ref(false)

function validate() {
  fieldError.value = ''
  currentPasswordError.value = ''

  if (!currentPassword.value || !newPassword.value || !confirmPassword.value) {
    fieldError.value = 'Все поля обязательны'
    return false
  }
  if (newPassword.value.length < 6) {
    fieldError.value = 'Новый пароль — минимум 6 символов'
    return false
  }
  if (newPassword.value !== confirmPassword.value) {
    fieldError.value = 'Пароли не совпадают'
    return false
  }
  if (newPassword.value === currentPassword.value) {
    fieldError.value = 'Новый пароль должен отличаться от текущего'
    return false
  }
  return true
}

async function onSubmit() {
  if (!validate()) return

  loading.value = true
  try {
    const { data } = await api.put('/api/auth/change-password', {
      current_password: currentPassword.value,
      new_password: newPassword.value,
    })
    // Server issues fresh token after password change (old tokens revoked)
    if (data.token) {
      authStore.token = data.token
      localStorage.setItem('badb_auth_token', data.token)
    }
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    fieldError.value = ''
    currentPasswordError.value = ''
    showStatus('Пароль успешно изменён')
  } catch (err) {
    if (err.response?.status === 401) {
      currentPasswordError.value = 'Неверный текущий пароль'
    } else {
      showStatus('Ошибка сервера', true)
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="profile-wrapper">
    <h2 class="profile-title">Профиль</h2>

    <!-- Section 1: User info -->
    <div class="profile-card">
      <h3 class="card-title"><i class="pi pi-user"></i> Информация</h3>
      <table class="info-table">
        <tr>
          <td class="info-label">Имя:</td>
          <td>{{ user.name || '—' }}</td>
        </tr>
        <tr>
          <td class="info-label">Логин:</td>
          <td>{{ user.login || '—' }}</td>
        </tr>
        <tr>
          <td class="info-label">Роль:</td>
          <td><span :class="['role-badge', roleBadge.cls]">{{ roleBadge.label }}</span></td>
        </tr>
        <tr>
          <td class="info-label">Должность:</td>
          <td>{{ user.position || '—' }}</td>
        </tr>
        <tr>
          <td class="info-label">Отдел:</td>
          <td>
            <span v-if="user.department">{{ user.department.name }}</span>
            <span v-else-if="user.isDirector" class="director-tag">Директор (все отделы)</span>
            <span v-else>—</span>
            <span v-if="user.isDepartmentHead" class="head-tag">Начальник отдела</span>
          </td>
        </tr>
      </table>
    </div>

    <!-- Section: Department & colleagues -->
    <div v-if="department" class="profile-card">
      <h3 class="card-title"><i class="pi pi-users"></i> {{ department.name }}</h3>
      <div class="dept-head">
        <span class="info-label">Руководитель:</span>
        <span>{{ department.head_name }} — {{ department.head_position }}</span>
      </div>
      <div class="colleagues-list">
        <div v-for="c in colleagues" :key="c.user_id" class="colleague-row" :class="{ 'colleague-row--me': c.user_id === user.userId }">
          <span class="colleague-name">{{ c.name }}</span>
          <span class="colleague-position">{{ c.position || '' }}</span>
          <span :class="['role-badge-sm', c.role === 'admin' ? 'badge-danger' : c.role === 'lead' ? 'badge-warning' : 'badge-info']">
            {{ c.role === 'admin' ? 'Админ' : c.role === 'lead' ? 'Лид' : '' }}
          </span>
        </div>
      </div>
    </div>

    <!-- Section: Мой доступ -->
    <div class="profile-card">
      <h3 class="card-title">
        <i class="pi pi-shield"></i> Мой доступ
        <span v-if="myAccess" class="total-count">{{ totalProjects }}</span>
      </h3>

      <!-- Expiring grants warning -->
      <div v-if="myAccess?.expiring?.length" class="expiring-warning">
        <div class="warn-header">
          <i class="pi pi-exclamation-triangle"></i>
          <strong>Истекающий доступ ({{ myAccess.expiring.length }})</strong>
        </div>
        <div v-for="ex in myAccess.expiring" :key="ex.project_id" class="expiring-row">
          <span class="expiring-name">{{ ex.project_name }}</span>
          <span class="expiring-level">{{ ex.access_level }}</span>
          <span class="expiring-when">истекает {{ formatDaysRemaining(ex.days_remaining) }}</span>
        </div>
      </div>

      <div v-if="!myAccess" class="empty-text">Загрузка...</div>
      <div v-else-if="!totalProjects" class="empty-text">Нет доступных проектов</div>
      <div v-else class="access-groups">
        <div
          v-for="group in ACCESS_GROUPS"
          :key="group.key"
          v-show="myAccess.grouped[group.key]?.length"
          class="access-group"
        >
          <div class="group-header" :style="{ borderLeftColor: group.color }">
            <i :class="group.icon" :style="{ color: group.color }"></i>
            <span class="group-label">{{ group.label }}</span>
            <span class="group-count">{{ myAccess.grouped[group.key]?.length }}</span>
          </div>
          <div class="group-projects">
            <div v-for="p in myAccess.grouped[group.key]" :key="p.project_id" class="proj-row">
              <span class="proj-name">{{ p.name }}</span>
              <span v-if="p.project_dept_name" class="proj-dept">{{ p.project_dept_name }}</span>
              <span v-if="p.direct_level" :class="['access-pill', `access-pill--${p.direct_level}`]">
                {{ p.direct_level === 'view' ? 'V' : p.direct_level === 'edit' ? 'E' : 'A' }}
              </span>
              <span v-if="p.direct_expires_at" class="proj-expires" :title="new Date(p.direct_expires_at).toLocaleString('ru-RU')">
                <i class="pi pi-clock"></i>
                до {{ new Date(p.direct_expires_at).toLocaleDateString('ru-RU') }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Section 2: Change password -->
    <details class="profile-card">
      <summary class="card-title"><i class="pi pi-key"></i> Смена пароля <i class="pi pi-chevron-down chevron"></i></summary>

      <form class="pw-form" @submit.prevent="onSubmit">
        <div class="field">
          <label for="currentPw">Текущий пароль</label>
          <Password
            id="currentPw"
            v-model="currentPassword"
            placeholder="Введите текущий пароль"
            class="w-full"
            :class="{ 'p-invalid': currentPasswordError }"
            toggleMask
            :feedback="false"
            inputClass="w-full"
            autocomplete="current-password"
          />
          <small v-if="currentPasswordError" class="field-error">{{ currentPasswordError }}</small>
        </div>

        <div class="field">
          <label for="newPw">Новый пароль</label>
          <Password
            id="newPw"
            v-model="newPassword"
            placeholder="Минимум 6 символов"
            class="w-full"
            toggleMask
            :feedback="false"
            inputClass="w-full"
            autocomplete="new-password"
          />
        </div>

        <div class="field">
          <label for="confirmPw">Подтвердите новый пароль</label>
          <Password
            id="confirmPw"
            v-model="confirmPassword"
            placeholder="Повторите новый пароль"
            class="w-full"
            toggleMask
            :feedback="false"
            inputClass="w-full"
            autocomplete="new-password"
          />
        </div>

        <p v-if="fieldError" class="form-error">{{ fieldError }}</p>

        <Button
          type="submit"
          label="Сохранить пароль"
          :loading="loading"
          :disabled="loading"
        />

        <p v-if="statusMsg" :class="['status-msg', { error: statusError }]">{{ statusMsg }}</p>
      </form>

      <div class="pw-footer">
        Забыли пароль — обратитесь к администратору.
      </div>
    </details>

    <!-- Section 3: Login history placeholder -->
    <details class="profile-card">
      <summary class="card-title"><i class="pi pi-clock"></i> История входов <i class="pi pi-chevron-down chevron"></i></summary>
      <p class="placeholder-text">История входов будет доступна в следующей версии.</p>
    </details>
  </div>
</template>

<style scoped>
.profile-wrapper {
  max-width: 560px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

.profile-title {
  font-family: 'Rosatom', system-ui, sans-serif;
  font-size: 20px;
  font-weight: 700;
  color: #003274;
  margin: 0 0 1.5rem 0;
}

.profile-card {
  background: rgba(255, 255, 255, 0.62);
  border: 0.5px solid rgba(180, 210, 255, 0.55);
  border-radius: 12px;
  box-shadow: 0 4px 11px rgba(0, 50, 116, 0.03), inset 0 1px 0 rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(12px) saturate(1.4);
  -webkit-backdrop-filter: blur(12px) saturate(1.4);
  padding: 1.5rem 2rem;
  margin-bottom: 1.25rem;
}

.card-title {
  font-family: 'Rosatom', system-ui, sans-serif;
  font-size: 15px;
  font-weight: 700;
  color: #003274;
  margin: 0 0 1rem 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

summary.card-title {
  cursor: pointer;
  list-style: none;
  user-select: none;
  margin: 0;
}

.card-title::-webkit-details-marker {
  display: none;
}

.card-title i {
  font-size: 14px;
}

.chevron {
  margin-left: auto;
  font-size: 12px;
  transition: transform 0.2s;
}

details.profile-card[open] > .card-title {
  margin-bottom: 1rem;
}

details.profile-card[open] > .card-title .chevron {
  transform: rotate(180deg);
}

/* Info table */
.info-table {
  width: 100%;
  border-collapse: collapse;
}

.info-table td {
  padding: 0.4rem 0;
  font-size: 14px;
  color: #1a1a2e;
}

.info-label {
  color: #6B7280;
  font-weight: 600;
  width: 110px;
  white-space: nowrap;
}

/* Role badge */
.role-badge {
  display: inline-block;
  padding: 0.15rem 0.6rem;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
}

.badge-danger {
  background: #FEE2E2;
  color: #DC2626;
}

.badge-warning {
  background: #FEF3C7;
  color: #D97706;
}

.badge-info {
  background: #DBEAFE;
  color: #2563EB;
}

/* Password form */
.pw-form {
  text-align: left;
}

.field {
  margin-bottom: 1rem;
}

.field label {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: #4B5563;
  margin-bottom: 0.35rem;
}

.w-full {
  width: 100%;
}

.field-error {
  color: #b00020;
  font-size: 12px;
  display: block;
  margin-top: 0.25rem;
}

.form-error {
  color: #b00020;
  font-size: 13px;
  text-align: center;
  margin: 0 0 0.75rem 0;
}

.status-msg {
  text-align: center;
  font-size: 13px;
  margin: 0.75rem 0 0 0;
  color: #52C9A6;
}

.status-msg.error {
  color: #b00020;
}

:deep(.p-inputtext) {
  background: #ffffff !important;
  color: #1a1a2e;
  border-color: #D1D7DE;
}

:deep(.p-inputtext:focus) {
  border-color: #003274;
  box-shadow: 0 0 0 2px rgba(0, 51, 102, 0.15);
}

.pw-footer {
  margin-top: 1.25rem;
  padding-top: 0.75rem;
  border-top: 1px solid #D1D7DE;
  font-size: 12px;
  color: #A8B0B8;
  text-align: center;
}

/* Placeholder */
.placeholder-text {
  color: #9CA3AF;
  font-size: 13px;
  margin: 0;
}

/* ── Role badges ── */
.role-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}
.badge-danger { background: rgba(176, 0, 32, 0.1); color: #b00020; }
.badge-warning { background: rgba(211, 167, 84, 0.15); color: #9a7030; }
.badge-info { background: rgba(0, 50, 116, 0.08); color: #003274; }

.director-tag {
  color: #b00020;
  font-weight: 600;
  font-size: 13px;
}
.head-tag {
  margin-left: 0.5rem;
  font-size: 11px;
  font-weight: 600;
  color: #52C9A6;
}

/* ── Department section ── */
.dept-head {
  margin-bottom: 0.75rem;
  font-size: 13px;
}
.colleagues-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.colleague-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.35rem 0.5rem;
  border-bottom: 1px solid rgba(0, 50, 116, 0.06);
  font-size: 13px;
}
.colleague-row:last-child { border-bottom: none; }
.colleague-row--me { background: rgba(82, 201, 166, 0.06); }
.colleague-name { font-weight: 600; color: #003274; min-width: 200px; }
.colleague-position { color: #6B7280; flex: 1; }
.role-badge-sm {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 10px;
}

/* ── Projects section ── */
.projects-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.project-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.4rem 0.5rem;
  border-bottom: 1px solid rgba(0, 50, 116, 0.06);
  font-size: 13px;
}
.project-row:last-child { border-bottom: none; }
.project-name { font-weight: 600; color: #003274; flex: 1; }
.project-status { color: #6B7280; font-size: 12px; }
.conf-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
}
.conf-badge--public { background: rgba(82, 201, 166, 0.12); color: #1a8a64; }
.conf-badge--department { background: rgba(211, 167, 84, 0.12); color: #9a7030; }
.conf-badge--confidential { background: rgba(176, 0, 32, 0.1); color: #b00020; }
.empty-text { color: #6B7280; font-size: 13px; }

/* ── My Access section ── */
.total-count {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(0, 50, 116, 0.08);
  color: #003274;
}

.expiring-warning {
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: rgba(231, 76, 60, 0.06);
  border: 1px solid rgba(231, 76, 60, 0.2);
  border-radius: 8px;
}
.warn-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  color: #b00020;
  font-size: 12px;
}
.expiring-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  padding: 4px 0;
  font-size: 12px;
}
.expiring-name { flex: 1; color: #003274; font-weight: 500; }
.expiring-level {
  background: rgba(0, 50, 116, 0.1);
  color: #003274;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
}
.expiring-when { color: #b00020; font-size: 11px; }

.access-groups {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.access-group { }

.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-left: 3px solid;
  background: rgba(0, 50, 116, 0.02);
  margin-bottom: 6px;
  border-radius: 0 6px 6px 0;
}
.group-header i { font-size: 13px; }
.group-label {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #003274;
  flex: 1;
}
.group-count {
  font-size: 11px;
  font-weight: 700;
  color: rgba(0, 50, 116, 0.5);
  padding: 1px 8px;
  border-radius: 10px;
  background: rgba(0, 50, 116, 0.06);
}

.group-projects {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.proj-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px 5px 15px;
  border-bottom: 1px solid rgba(0, 50, 116, 0.04);
  font-size: 13px;
}
.proj-row:last-child { border-bottom: none; }
.proj-name {
  flex: 1;
  color: #003274;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.proj-dept {
  font-size: 11px;
  color: #6B7280;
}
.access-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  color: white;
}
.access-pill--view { background: #52C9A6; }
.access-pill--edit { background: #025EA1; }
.access-pill--admin { background: #E74C3C; }
.proj-expires {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  color: #8a6d2b;
  background: rgba(211, 167, 84, 0.1);
  border: 0.5px solid rgba(211, 167, 84, 0.25);
  padding: 1px 6px;
  border-radius: 8px;
  white-space: nowrap;
}
.proj-expires i { font-size: 9px; }
</style>
