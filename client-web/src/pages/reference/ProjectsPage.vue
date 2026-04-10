<script setup>
/**
 * ProjectsPage — "Проекты" (справочник)
 * Uses CrudTable + SaveIndicator (from Design System).
 * Create/edit form in Dialog — CrudTable handles the list.
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import api from '@/services/api'
import PageHeader from '@/components/PageHeader.vue'
import SaveIndicator from '@/components/SaveIndicator.vue'
import CrudTable from '@/components/CrudTable.vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'

const toast = useToast()
const crudTable = ref(null)

// ── Data ───────────────────────────────────────────────────────────────
const projects = ref([])
const activeUsers = ref([])
const departments = ref([])
const loading = ref(false)

async function loadProjects() {
  loading.value = true
  try {
    const { data } = await api.get('/api/projects')
    projects.value = data
  } catch {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось загрузить проекты', life: 3000 })
  } finally {
    loading.value = false
  }
}

async function loadUsers() {
  try {
    const { data } = await api.get('/api/users')
    activeUsers.value = data.filter(u => u.active)
  } catch {}
}

async function loadDepartments() {
  try {
    const { data } = await api.get('/api/departments')
    departments.value = data
  } catch {}
}

onMounted(() => { loadProjects(); loadUsers(); loadDepartments() })

// ── Column config ──────────────────────────────────────────────────────
const columns = [
  { field: 'name',                header: 'Название',     minWidth: '120px' },
  { field: 'description',         header: 'Описание',     minWidth: '150px', sortable: false },
  { field: 'confidentiality_level', header: 'Доступ',     minWidth: '80px',  width: '150px', filterable: true },
  { field: 'start_date',          header: 'Начало',       minWidth: '80px',  width: '120px' },
  { field: 'due_date',            header: 'Окончание',    minWidth: '80px',  width: '120px' },
  { field: 'status',              header: 'Статус',       minWidth: '80px',  width: '130px' },
]

// ── Save indicator (delete flow) ──────────────────────────────────────
const pendingDelete = ref([])
const saveState = ref('idle')
let saveTimer = null

function onDelete(items) {
  pendingDelete.value = items
  saveState.value = 'idle'
}

async function confirmSave() {
  try {
    for (const item of pendingDelete.value) {
      await api.delete(`/api/projects/${item.project_id}`)
    }
    pendingDelete.value = []
    saveState.value = 'saved'
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => { saveState.value = 'idle' }, 2000)
    crudTable.value?.clearSelection()
    await loadProjects()
  } catch {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось удалить', life: 3000 })
  }
}

function discardChanges() {
  pendingDelete.value = []
  saveState.value = 'idle'
  crudTable.value?.clearSelection()
}

onUnmounted(() => clearTimeout(saveTimer))

// ── Form (Dialog) ─────────────────────────────────────────────────────
const formVisible = ref(false)
const mode = ref(null)
const currentId = ref(null)

const form = ref({
  name: '',
  created_by: '',
  lead_id: '',
  description: '',
  start_date: '',
  due_date: '',
  status: 'active',
  confidentiality_level: 'public',
  department_id: null,
})

function resetForm() {
  form.value = {
    name: '', created_by: '', lead_id: '', description: '',
    start_date: '', due_date: '', status: 'active',
    confidentiality_level: 'public', department_id: null,
  }
  mode.value = null
  currentId.value = null
  formVisible.value = false
}

function openCreate() {
  resetForm()
  mode.value = 'create'
  formVisible.value = true
}

function openEdit(proj) {
  mode.value = 'edit'
  currentId.value = proj.project_id
  form.value = {
    name: proj.name || '',
    created_by: proj.created_by || '',
    lead_id: proj.lead_id || '',
    description: proj.description || '',
    start_date: proj.start_date ? proj.start_date.slice(0, 10) : '',
    due_date: proj.due_date ? proj.due_date.slice(0, 10) : '',
    status: proj.status || 'active',
    confidentiality_level: proj.confidentiality_level || 'public',
    department_id: proj.department_id || null,
  }
  formVisible.value = true
  loadAccess(proj.project_id)
}

async function saveProject() {
  if (!mode.value) return
  if (!form.value.name?.trim()) {
    toast.add({ severity: 'warn', summary: 'Заполните название', life: 3000 })
    return
  }
  if (form.value.confidentiality_level === 'department' && !form.value.department_id) {
    toast.add({ severity: 'warn', summary: 'Выберите отдел', detail: 'Для уровня «Отдел» укажите отдел', life: 3000 })
    return
  }

  const payload = { ...form.value }

  try {
    if (mode.value === 'create') {
      await api.post('/api/projects', payload)
      toast.add({ severity: 'success', summary: 'Проект создан', life: 3000 })
    } else {
      await api.put(`/api/projects/${currentId.value}`, payload)
      toast.add({ severity: 'success', summary: 'Изменения сохранены', life: 3000 })
    }
    resetForm()
    await loadProjects()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: err.response?.data?.error || 'Ошибка сохранения', life: 3000 })
  }
}

// ── Helpers ────────────────────────────────────────────────────────────
function formatDate(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('ru-RU')
}

function statusLabel(status) {
  const map = { active: 'активный', paused: 'приостановлен', completed: 'завершён', archived: 'архивирован' }
  return map[status] || status || '—'
}

function confLabel(level) {
  const map = { public: 'Открытый', department: 'Отдельский', confidential: 'Конфиденциальный' }
  return map[level] || level || 'Открытый'
}

// ── Access management ──
const accessList = ref([])
const accessLoading = ref(false)
const grantUserId = ref('')
const grantLevel = ref('view')

async function loadAccess(projectId) {
  accessLoading.value = true
  try {
    const { data } = await api.get(`/api/projects/${projectId}/access`)
    accessList.value = data
  } catch {
    accessList.value = []
  } finally {
    accessLoading.value = false
  }
}

async function grantAccess() {
  if (!grantUserId.value || !currentId.value) return
  try {
    await api.post(`/api/projects/${currentId.value}/access`, {
      user_id: Number(grantUserId.value),
      access_level: grantLevel.value,
    })
    grantUserId.value = ''
    grantLevel.value = 'view'
    await loadAccess(currentId.value)
    toast.add({ severity: 'success', summary: 'Доступ выдан', life: 2000 })
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: err.response?.data?.error || 'Не удалось выдать доступ', life: 3000 })
  }
}

async function revokeAccess(userId) {
  if (!currentId.value) return
  if (!confirm('Отозвать доступ к проекту?')) return
  try {
    await api.delete(`/api/projects/${currentId.value}/access/${userId}`)
    await loadAccess(currentId.value)
    toast.add({ severity: 'success', summary: 'Доступ отозван', life: 2000 })
  } catch {
    toast.add({ severity: 'error', summary: 'Ошибка', life: 3000 })
  }
}
</script>

<template>
  <div class="projects-page">

    <PageHeader title="Проекты" icon="pi pi-briefcase">
      <template #actions>
        <SaveIndicator
          :visible="pendingDelete.length > 0 || saveState === 'saved'"
          :saved="saveState === 'saved'"
          @save="confirmSave"
          @cancel="discardChanges"
        />
      </template>
    </PageHeader>

    <CrudTable
      ref="crudTable"
      :columns="columns"
      :data="projects"
      :loading="loading"
      id-field="project_id"
      table-name="Проекты"
      show-add
      row-clickable
      @add="openCreate"
      @delete="onDelete"
      @row-click="(data) => openEdit(data)"
    >
      <!-- Custom cell: Название (bold) -->
      <template #col-name="{ data }">
        <strong>{{ data.name || '— без названия —' }}</strong>
      </template>

      <!-- Custom cell: Описание -->
      <template #col-description="{ data }">
        <span class="desc-text">{{ data.description || '' }}</span>
      </template>

      <!-- Custom cell: Начало -->
      <template #col-start_date="{ data }">{{ formatDate(data.start_date) }}</template>

      <!-- Custom cell: Окончание -->
      <template #col-due_date="{ data }">{{ formatDate(data.due_date) }}</template>

      <!-- Custom cell: Статус -->
      <template #col-status="{ data }">
        <span :class="['status-pill', `status-pill--${data.status || 'active'}`]">
          {{ statusLabel(data.status) }}
        </span>
      </template>

      <!-- Custom cell: Доступ (confidentiality) -->
      <template #col-confidentiality_level="{ data }">
        <span :class="['vis-pill', `vis-pill--${data.confidentiality_level || 'public'}`]" :title="data.department_name || ''">
          <i :class="data.confidentiality_level === 'public' ? 'pi pi-globe' :
                     data.confidentiality_level === 'department' ? 'pi pi-users' :
                     'pi pi-lock'"></i>
          {{ confLabel(data.confidentiality_level) }}
          <span v-if="data.confidentiality_level === 'department' && data.department_name" class="vis-pill-dept">
            · {{ data.department_name }}
          </span>
        </span>
      </template>
    </CrudTable>

    <!-- ── Create / Edit Dialog ── -->
    <Dialog
      v-model:visible="formVisible"
      :header="mode === 'create' ? 'Новый проект' : 'Редактирование проекта'"
      :style="{ width: '540px' }"
      modal
      @hide="resetForm"
    >
      <form class="form-grid" @submit.prevent="saveProject">
        <label>Название</label>
        <InputText v-model="form.name" placeholder="Название проекта" class="w-full" />

        <label>Кто добавил</label>
        <Select v-model="form.created_by" :options="activeUsers" optionLabel="name" optionValue="user_id" placeholder="— выбрать —" class="w-full" />

        <label>Руководитель</label>
        <Select v-model="form.lead_id" :options="activeUsers" optionLabel="name" optionValue="user_id" placeholder="— выбрать —" class="w-full" />

        <label>Описание</label>
        <Textarea v-model="form.description" rows="3" placeholder="Описание проекта" class="w-full" />

        <label>Дата начала</label>
        <InputText v-model="form.start_date" type="date" class="w-full" />

        <label>Дата окончания</label>
        <InputText v-model="form.due_date" type="date" class="w-full" />

        <label>Статус</label>
        <Select
          v-model="form.status"
          :options="[{ label: 'активный', value: 'active' }, { label: 'приостановлен', value: 'paused' }, { label: 'завершён', value: 'completed' }, { label: 'архивирован', value: 'archived' }]"
          optionLabel="label"
          optionValue="value"
          class="w-full"
        />

        <label>Доступ</label>
        <div class="visibility-section">
          <div class="visibility-options">
            <button
              type="button"
              :class="['vis-btn', form.confidentiality_level === 'public' ? 'active' : '']"
              @click="form.confidentiality_level = 'public'; form.department_id = null"
            >
              <i class="pi pi-globe"></i>
              <span class="vis-title">Все</span>
              <span class="vis-hint">Видят все сотрудники</span>
            </button>
            <button
              type="button"
              :class="['vis-btn', form.confidentiality_level === 'department' ? 'active' : '']"
              @click="form.confidentiality_level = 'department'"
            >
              <i class="pi pi-users"></i>
              <span class="vis-title">Отдел</span>
              <span class="vis-hint">Видит только выбранный отдел</span>
            </button>
            <button
              type="button"
              :class="['vis-btn', form.confidentiality_level === 'confidential' ? 'active' : '']"
              @click="form.confidentiality_level = 'confidential'; form.department_id = null"
            >
              <i class="pi pi-lock"></i>
              <span class="vis-title">Выборочно</span>
              <span class="vis-hint">Только явно допущенные</span>
            </button>
          </div>
          <Select
            v-if="form.confidentiality_level === 'department'"
            v-model="form.department_id"
            :options="departments"
            optionLabel="name"
            optionValue="department_id"
            placeholder="— выбрать отдел —"
            class="w-full"
            style="margin-top: 0.5rem"
          />
        </div>
      </form>

      <!-- Access management (edit mode only) -->
      <div v-if="mode === 'edit'" class="access-section">
        <div class="access-header">
          <span class="section-label">Явно допущенные пользователи</span>
        </div>
        <div v-if="form.confidentiality_level !== 'confidential'" class="access-hint">
          <i class="pi pi-info-circle"></i>
          {{ form.confidentiality_level === 'public'
            ? 'Проект открыт для всех — явный список не обязателен.'
            : 'Проект виден всему отделу — явный список добавляет доступ вне отдела.' }}
        </div>

        <!-- Grant form -->
        <div class="grant-row">
          <Select v-model="grantUserId" :options="activeUsers" optionLabel="name" optionValue="user_id" placeholder="— сотрудник —" class="grant-user" />
          <Select
            v-model="grantLevel"
            :options="[{ label: 'Просмотр', value: 'view' }, { label: 'Редактирование', value: 'edit' }, { label: 'Администратор', value: 'admin' }]"
            optionLabel="label"
            optionValue="value"
            class="grant-level"
          />
          <Button icon="pi pi-plus" size="small" @click="grantAccess" :disabled="!grantUserId" />
        </div>

        <!-- Access list -->
        <div class="access-list">
          <div v-for="a in accessList" :key="a.user_id" class="access-row">
            <span class="access-name">{{ a.name }}</span>
            <span class="access-dept">{{ a.department_name || '' }}</span>
            <span :class="['access-level', `access-level--${a.access_level}`]">
              {{ a.access_level === 'view' ? 'Просмотр' : a.access_level === 'edit' ? 'Ред.' : 'Админ' }}
            </span>
            <Button icon="pi pi-times" severity="danger" text size="small" @click="revokeAccess(a.user_id)" title="Отозвать доступ" />
          </div>
          <div v-if="!accessList.length && !accessLoading" class="access-empty">Нет явных допусков</div>
        </div>
      </div>

      <template #footer>
        <Button label="Отмена" severity="secondary" outlined @click="resetForm" />
        <Button :label="mode === 'create' ? 'Создать' : 'Сохранить'" @click="saveProject" />
      </template>
    </Dialog>

  </div>
</template>

<style scoped>
.projects-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.projects-page :deep(.page-header) {
  margin-bottom: 3px !important;
}

/* ── Form styles ── */
.form-grid {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 10px 16px;
  align-items: center;
}
.form-grid label {
  font-size: 13px;
  font-weight: 500;
  color: #003274;
}
.w-full { width: 100%; }
/* ── Page-specific cell styles ── */
.desc-text {
  font-size: 13px;
  color: rgba(0, 50, 116, 0.6);
}
.status-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}
.status-pill--active {
  background: rgba(82, 201, 166, 0.14);
  color: #1d7a5f;
  border: 0.5px solid rgba(82, 201, 166, 0.35);
}
.status-pill--paused {
  background: rgba(211, 167, 84, 0.12);
  color: #8a6d2b;
  border: 0.5px solid rgba(211, 167, 84, 0.3);
}
.status-pill--completed {
  background: rgba(0, 50, 116, 0.08);
  color: #003274;
  border: 0.5px solid rgba(0, 50, 116, 0.15);
}
.status-pill--archived {
  background: rgba(0, 50, 116, 0.06);
  color: rgba(0, 50, 116, 0.45);
  border: 0.5px solid rgba(0, 50, 116, 0.12);
}

/* ── Access section ── */
.access-section {
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(0, 50, 116, 0.08);
}
.access-header { margin-bottom: 0.5rem; }
.section-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.5);
}
.grant-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.75rem;
}
.grant-user { flex: 1; }
.grant-level { width: 150px; }
.access-list { display: flex; flex-direction: column; gap: 0; }
.access-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.25rem;
  border-bottom: 1px solid rgba(0, 50, 116, 0.06);
  font-size: 13px;
}
.access-row:last-child { border-bottom: none; }
.access-name { font-weight: 600; color: #003274; flex: 1; }
.access-dept { color: #6B7280; font-size: 12px; min-width: 80px; }
.access-level {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 10px;
}
.access-level--view { background: rgba(0, 50, 116, 0.08); color: #003274; }
.access-level--edit { background: rgba(82, 201, 166, 0.12); color: #1a8a64; }
.access-level--admin { background: rgba(176, 0, 32, 0.1); color: #b00020; }
.access-empty { color: #6B7280; font-size: 12px; padding: 0.5rem 0; }
.access-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  margin-bottom: 0.5rem;
  font-size: 12px;
  color: rgba(0, 50, 116, 0.55);
  background: rgba(0, 50, 116, 0.04);
  border-radius: 6px;
}
.access-hint .pi { font-size: 12px; color: rgba(0, 50, 116, 0.4); }

/* ── Visibility selector ── */
.visibility-section { display: flex; flex-direction: column; }
.visibility-options {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.vis-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 10px 8px;
  border: 1.5px solid rgba(0, 50, 116, 0.12);
  border-radius: 8px;
  background: white;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
  text-align: center;
}
.vis-btn .pi { font-size: 16px; color: rgba(0, 50, 116, 0.5); }
.vis-btn .vis-title {
  font-size: 13px;
  font-weight: 600;
  color: #003274;
}
.vis-btn .vis-hint {
  font-size: 10px;
  color: #6B7280;
  line-height: 1.3;
}
.vis-btn:hover {
  border-color: rgba(0, 50, 116, 0.3);
  background: rgba(0, 50, 116, 0.02);
}
.vis-btn.active {
  border-color: #003274;
  background: rgba(0, 50, 116, 0.06);
}
.vis-btn.active .pi { color: #003274; }

/* ── Visibility pill (table) ── */
.vis-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.vis-pill .pi { font-size: 10px; }
.vis-pill-dept { color: rgba(0, 50, 116, 0.5); font-weight: 400; }
.vis-pill--public {
  background: rgba(82, 201, 166, 0.12);
  color: #1a8a64;
}
.vis-pill--department {
  background: rgba(0, 50, 116, 0.08);
  color: #003274;
}
.vis-pill--confidential {
  background: rgba(176, 0, 32, 0.1);
  color: #b00020;
}
</style>
