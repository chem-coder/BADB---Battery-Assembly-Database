<script setup>
/**
 * ProjectsPage — "Проекты" (справочник)
 * Uses CrudTable + SaveIndicator (from Design System).
 * Create/edit form in Dialog — CrudTable handles the list.
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import api from '@/services/api'
import { toastApiError } from '@/utils/errorClassifier'
import PageHeader from '@/components/PageHeader.vue'
import SaveIndicator from '@/components/SaveIndicator.vue'
import CrudTable from '@/components/CrudTable.vue'
import EntityMeta from '@/components/EntityMeta.vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import MultiSelect from 'primevue/multiselect'
import DatePicker from 'primevue/datepicker'
import SelectButton from 'primevue/selectbutton'

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
  } catch (err) {
    toastApiError(toast, err, 'Не удалось загрузить проекты')
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
  { field: 'name',                  header: 'Название',     minWidth: '120px' },
  { field: 'description',           header: 'Описание',     minWidth: '150px', sortable: false },
  { field: 'confidentiality_level', header: 'Доступ',       minWidth: '80px',  width: '150px', filterable: true },
  { field: 'start_date',            header: 'Начало',       minWidth: '80px',  width: '120px' },
  { field: 'due_date',              header: 'Окончание',    minWidth: '80px',  width: '120px' },
  { field: 'status',                header: 'Статус',       minWidth: '80px',  width: '130px' },
  { field: 'created_by_name',       header: 'Оператор',     minWidth: '90px',  width: '130px' },
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
  } catch (err) {
    toastApiError(toast, err, 'Не удалось удалить')
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
// Full row of the entity being edited — fed to EntityMeta for the
// "Создано: ФИО, дата" + "Изменено: ФИО, дата" read-only audit trail.
const currentItem = ref(null)

// `created_by` is NOT part of the form — backend forces it from the
// authenticated user (routes/projects.js:159, "SECURITY: created_by
// is always the current authenticated user"). The existing creator is
// shown read-only via EntityMeta when available. `lead_id` (project
// lead — different concept) IS user-pickable via its own Select below.
const form = ref({
  name: '',
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
    name: '', lead_id: '', description: '',
    start_date: '', due_date: '', status: 'active',
    confidentiality_level: 'public', department_id: null,
  }
  mode.value = null
  currentId.value = null
  currentItem.value = null
  formVisible.value = false
  // Clear grant form state so next open starts clean
  resetGrantForm()
  copyFromProjectId.value = null
  copyOverwrite.value = false
  presets.value = []
}

function openCreate() {
  resetForm()
  mode.value = 'create'
  formVisible.value = true
}

function openEdit(proj) {
  mode.value = 'edit'
  currentId.value = proj.project_id
  currentItem.value = proj
  form.value = {
    name: proj.name || '',
    lead_id: proj.lead_id || '',
    description: proj.description || '',
    start_date: proj.start_date ? proj.start_date.slice(0, 10) : '',
    due_date: proj.due_date ? proj.due_date.slice(0, 10) : '',
    status: proj.status || 'active',
    confidentiality_level: proj.confidentiality_level || 'public',
    department_id: proj.department_id || null,
  }
  resetGrantForm()
  copyFromProjectId.value = null
  copyOverwrite.value = false
  formVisible.value = true
  loadAccess(proj.project_id)
  loadPresets()
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
    toastApiError(toast, err, 'Ошибка сохранения')
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

// Grant form state
const grantTargetType = ref('user')         // 'user' | 'department'
const grantSelectedUsers = ref([])          // number[]
const grantSelectedDepts = ref([])          // number[]
const grantLevel = ref('view')
const grantExpiresDate = ref(null)          // Date | null
const grantExpiresPreset = ref(null)        // null | 7 | 30 | 90

// Copy access state
const copyFromProjectId = ref(null)
const copyOverwrite = ref(false)
const copyBusy = ref(false)

// Presets
const presets = ref([])

// Clear opposite selection when toggling User/Department
watch(grantTargetType, (newType) => {
  if (newType === 'user') grantSelectedDepts.value = []
  else grantSelectedUsers.value = []
})

// Min date for expiry picker (stable reference, not new Date() per render)
const todayMinDate = computed(() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
})

// Computed: users grouped by department for MultiSelect
const groupedUsers = computed(() => {
  const byDept = new Map()
  for (const u of activeUsers.value) {
    const key = u.department_id ?? 0
    const label = u.department_name || 'Без отдела'
    if (!byDept.has(key)) byDept.set(key, { label, items: [] })
    byDept.get(key).items.push({
      user_id: u.user_id,
      name: u.name,
      position: u.position || '',
      department_name: u.department_name || '',
    })
  }
  return Array.from(byDept.values())
    .sort((a, b) => a.label.localeCompare(b.label))
    .map(g => ({
      ...g,
      items: g.items.sort((a, b) => a.name.localeCompare(b.name)),
    }))
})

// Computed: projects list for "copy from" (exclude current)
const copyableProjects = computed(() =>
  projects.value.filter(p => p.project_id !== currentId.value)
)

function resetGrantForm() {
  grantTargetType.value = 'user'
  grantSelectedUsers.value = []
  grantSelectedDepts.value = []
  grantLevel.value = 'view'
  grantExpiresDate.value = null
  grantExpiresPreset.value = null
}

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

async function loadPresets() {
  if (!currentId.value) {
    presets.value = []
    return
  }
  try {
    const { data } = await api.get(`/api/projects/${currentId.value}/access/presets`)
    presets.value = data.presets || []
  } catch {
    presets.value = []
  }
}

async function grantAccess() {
  if (!currentId.value) return

  const body = { access_level: grantLevel.value }

  if (grantTargetType.value === 'user') {
    if (!grantSelectedUsers.value.length) {
      toast.add({ severity: 'warn', summary: 'Выберите пользователей', life: 2500 })
      return
    }
    body.user_ids = grantSelectedUsers.value
  } else {
    if (!grantSelectedDepts.value.length) {
      toast.add({ severity: 'warn', summary: 'Выберите отделы', life: 2500 })
      return
    }
    body.department_ids = grantSelectedDepts.value
  }

  if (grantExpiresDate.value) {
    body.expires_at = grantExpiresDate.value.toISOString()
  } else if (grantExpiresPreset.value) {
    body.expires_in_days = grantExpiresPreset.value
  }

  try {
    const { data } = await api.post(`/api/projects/${currentId.value}/access`, body)
    resetGrantForm()
    await loadAccess(currentId.value)
    toast.add({
      severity: 'success',
      summary: 'Доступ выдан',
      detail: `Пользователей: ${data.granted_users}, отделов: ${data.granted_departments}`,
      life: 2500,
    })
  } catch (err) {
    toastApiError(toast, err, 'Не удалось выдать доступ')
  }
}

async function revokeAccess(entry) {
  if (!currentId.value) return
  const label = entry.grantee_type === 'department'
    ? `Отозвать доступ у отдела "${entry.grantee_name}"?`
    : `Отозвать доступ у "${entry.grantee_name}"?`
  if (!confirm(label)) return

  const url = entry.grantee_type === 'department'
    ? `/api/projects/${currentId.value}/access/department/${entry.grantee_id}`
    : `/api/projects/${currentId.value}/access/user/${entry.grantee_id}`

  try {
    await api.delete(url)
    await loadAccess(currentId.value)
    toast.add({ severity: 'success', summary: 'Доступ отозван', life: 2000 })
  } catch (err) {
    toastApiError(toast, err, 'Не удалось отозвать доступ')
  }
}

function applyPreset(preset) {
  if (!preset.user_ids.length) {
    toast.add({
      severity: 'info',
      summary: 'Пусто',
      detail: `${preset.label}: нет пользователей`,
      life: 2500,
    })
    return
  }
  grantTargetType.value = 'user'
  grantSelectedUsers.value = [...preset.user_ids]
  toast.add({
    severity: 'info',
    summary: `Выбрано: ${preset.user_ids.length}`,
    detail: preset.label,
    life: 2000,
  })
}

async function copyAccessFromProject() {
  if (!copyFromProjectId.value || !currentId.value) return
  copyBusy.value = true
  try {
    const { data } = await api.post(`/api/projects/${currentId.value}/access/copy`, {
      source_project_id: copyFromProjectId.value,
      overwrite: copyOverwrite.value,
    })
    await loadAccess(currentId.value)
    copyFromProjectId.value = null
    copyOverwrite.value = false
    toast.add({
      severity: 'success',
      summary: 'Доступ скопирован',
      detail: `Пользователей: ${data.copied_users}, отделов: ${data.copied_departments}`,
      life: 3000,
    })
  } catch (err) {
    toastApiError(toast, err, 'Не удалось скопировать')
  } finally {
    copyBusy.value = false
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
          <div v-if="form.confidentiality_level === 'confidential'" class="vis-note">
            <i class="pi pi-info-circle"></i>
            Руководитель отдела, директор и админ видят проект всегда
          </div>
        </div>
      </form>

      <!-- Access management (edit mode only) -->
      <div v-if="mode === 'edit'" class="access-section">
        <div class="access-header">
          <span class="section-label">Явно допущенные пользователи и отделы</span>
        </div>
        <div v-if="form.confidentiality_level !== 'confidential'" class="access-hint">
          <i class="pi pi-info-circle"></i>
          {{ form.confidentiality_level === 'public'
            ? 'Проект открыт для всех — явный список не обязателен.'
            : 'Проект виден всему отделу — явный список добавляет доступ вне отдела.' }}
        </div>

        <!-- ─── Quick actions (presets + copy from project) ─── -->
        <div class="access-quick">
          <div class="access-quick-label">Быстрые действия</div>
          <div class="access-quick-buttons">
            <Button
              v-for="p in presets"
              :key="p.key"
              size="small"
              outlined
              :label="`${p.label} (${p.count})`"
              :disabled="p.count === 0"
              :title="p.description"
              @click="applyPreset(p)"
            />
          </div>
          <div class="access-copy-row">
            <Select
              v-model="copyFromProjectId"
              :options="copyableProjects"
              optionLabel="name"
              optionValue="project_id"
              placeholder="Скопировать доступ из проекта…"
              class="access-copy-select"
              filter
              showClear
            />
            <label class="access-copy-overwrite">
              <input type="checkbox" v-model="copyOverwrite" />
              Перезаписать
            </label>
            <Button
              icon="pi pi-copy"
              label="Применить"
              size="small"
              :disabled="!copyFromProjectId || copyBusy"
              @click="copyAccessFromProject"
            />
          </div>
        </div>

        <!-- ─── Grant form ─── -->
        <div class="grant-box">
          <SelectButton
            v-model="grantTargetType"
            :options="[
              { label: 'Пользователь', value: 'user' },
              { label: 'Отдел',        value: 'department' },
            ]"
            optionLabel="label"
            optionValue="value"
            :allowEmpty="false"
            class="grant-target-toggle"
          />

          <MultiSelect
            v-if="grantTargetType === 'user'"
            v-model="grantSelectedUsers"
            :options="groupedUsers"
            optionLabel="name"
            optionValue="user_id"
            optionGroupLabel="label"
            optionGroupChildren="items"
            filter
            :filterFields="['name', 'position', 'department_name']"
            placeholder="— выбрать сотрудников —"
            :maxSelectedLabels="2"
            selectedItemsLabel="Выбрано: {0}"
            :showToggleAll="true"
            class="grant-multiselect"
          >
            <template #option="slotProps">
              <div class="user-option">
                <span class="user-option-name">{{ slotProps.option.name }}</span>
                <span v-if="slotProps.option.position" class="user-option-pos">{{ slotProps.option.position }}</span>
              </div>
            </template>
          </MultiSelect>

          <MultiSelect
            v-else
            v-model="grantSelectedDepts"
            :options="departments"
            optionLabel="name"
            optionValue="department_id"
            filter
            placeholder="— выбрать отделы —"
            :maxSelectedLabels="2"
            selectedItemsLabel="Отделов: {0}"
            class="grant-multiselect"
          />

          <div class="grant-row">
            <Select
              v-model="grantLevel"
              :options="[
                { label: 'Просмотр',       value: 'view' },
                { label: 'Редактирование', value: 'edit' },
                { label: 'Администратор',  value: 'admin' },
              ]"
              optionLabel="label"
              optionValue="value"
              class="grant-level"
            />

            <div class="grant-expires">
              <span class="grant-expires-label">Истекает:</span>
              <div class="grant-expires-presets">
                <button
                  type="button"
                  v-for="d in [7, 30, 90]"
                  :key="d"
                  :class="['expires-chip', grantExpiresPreset === d && !grantExpiresDate ? 'active' : '']"
                  @click="grantExpiresPreset = (grantExpiresPreset === d ? null : d); grantExpiresDate = null"
                >{{ d }} дн.</button>
                <button
                  type="button"
                  :class="['expires-chip', !grantExpiresPreset && !grantExpiresDate ? 'active' : '']"
                  @click="grantExpiresPreset = null; grantExpiresDate = null"
                >Бессрочно</button>
              </div>
              <DatePicker
                v-model="grantExpiresDate"
                placeholder="или дата…"
                dateFormat="dd.mm.yy"
                :firstDayOfWeek="1"
                :minDate="todayMinDate"
                showButtonBar
                class="grant-expires-date"
                @update:modelValue="grantExpiresPreset = null"
              />
            </div>

            <Button
              label="Выдать"
              icon="pi pi-plus"
              size="small"
              :disabled="grantTargetType === 'user' ? !grantSelectedUsers.length : !grantSelectedDepts.length"
              @click="grantAccess"
            />
          </div>
        </div>

        <!-- ─── Access list ─── -->
        <div class="access-list">
          <div
            v-for="a in accessList"
            :key="`${a.grantee_type}-${a.grantee_id}`"
            :class="['access-row', a.is_expired ? 'access-row--expired' : '']"
          >
            <i
              :class="a.grantee_type === 'department' ? 'pi pi-users' : 'pi pi-user'"
              class="access-icon"
              :title="a.grantee_type === 'department' ? 'Отдел' : 'Пользователь'"
            ></i>
            <span class="access-name">{{ a.grantee_name }}</span>
            <span class="access-dept">{{ a.grantee_type === 'user' ? (a.department_name || '') : '' }}</span>
            <span v-if="a.expires_at" class="access-expires" :title="new Date(a.expires_at).toLocaleString('ru-RU')">
              <i class="pi pi-clock"></i>
              {{ a.is_expired ? 'истёк' : `до ${formatDate(a.expires_at)}` }}
            </span>
            <span :class="['access-level', `access-level--${a.access_level}`]">
              {{ a.access_level === 'view' ? 'Просмотр' : a.access_level === 'edit' ? 'Ред.' : 'Админ' }}
            </span>
            <Button icon="pi pi-times" severity="danger" text size="small" @click="revokeAccess(a)" title="Отозвать доступ" />
          </div>
          <div v-if="!accessList.length && !accessLoading" class="access-empty">Нет явных допусков</div>
        </div>
      </div>

      <EntityMeta
        v-if="mode === 'edit' && currentItem"
        :createdByName="currentItem.created_by_name"
        :createdAt="currentItem.created_at"
        :updatedByName="currentItem.updated_by_name"
        :updatedAt="currentItem.updated_at"
      />

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

.vis-note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 0.5rem;
  padding: 6px 10px;
  font-size: 11px;
  color: rgba(0, 50, 116, 0.55);
  background: rgba(211, 167, 84, 0.10);
  border: 1px solid rgba(211, 167, 84, 0.25);
  border-radius: 6px;
}
.vis-note .pi { font-size: 11px; color: rgba(211, 167, 84, 0.8); }

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

/* ── Quick actions (presets + copy) ── */
.access-quick {
  padding: 0.75rem;
  margin-bottom: 0.75rem;
  background: rgba(211, 167, 84, 0.08);
  border: 1px solid rgba(211, 167, 84, 0.2);
  border-radius: 8px;
}
.access-quick-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.55);
  margin-bottom: 0.5rem;
}
.access-quick-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.5rem;
}
.access-copy-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.access-copy-select { flex: 1; min-width: 200px; }
.access-copy-overwrite {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #6B7280;
  white-space: nowrap;
  cursor: pointer;
}

/* ── Grant box ── */
.grant-box {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.75rem;
  margin-bottom: 0.75rem;
  background: rgba(0, 50, 116, 0.03);
  border: 1px solid rgba(0, 50, 116, 0.08);
  border-radius: 8px;
}
.grant-target-toggle { align-self: flex-start; }
.grant-multiselect { width: 100%; }
.grant-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 0;
}
.grant-level { width: 170px; }

.user-option {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.user-option-name { font-size: 13px; font-weight: 500; color: #003274; }
.user-option-pos { font-size: 11px; color: #6B7280; }

/* ── Expiry row ── */
.grant-expires {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  flex: 1;
  min-width: 280px;
}
.grant-expires-label {
  font-size: 11px;
  color: #6B7280;
  font-weight: 500;
}
.grant-expires-presets { display: flex; gap: 3px; }
.expires-chip {
  padding: 3px 10px;
  border: 1px solid rgba(0, 50, 116, 0.15);
  background: white;
  border-radius: 12px;
  font-size: 11px;
  color: #003274;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}
.expires-chip:hover { border-color: rgba(0, 50, 116, 0.35); }
.expires-chip.active {
  background: #003274;
  color: white;
  border-color: #003274;
}
.grant-expires-date :deep(.p-datepicker-input) {
  width: 130px !important;
  font-size: 12px;
}

/* ── Access list ── */
.access-icon {
  color: rgba(0, 50, 116, 0.45);
  font-size: 14px;
  width: 16px;
  text-align: center;
  flex-shrink: 0;
}
.access-expires {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  color: #8a6d2b;
  background: rgba(211, 167, 84, 0.12);
  border: 0.5px solid rgba(211, 167, 84, 0.3);
  padding: 1px 6px;
  border-radius: 8px;
  white-space: nowrap;
}
.access-expires .pi { font-size: 9px; }
.access-row--expired { opacity: 0.55; }
.access-row--expired .access-name { text-decoration: line-through; }
.access-row--expired .access-expires {
  color: #b00020;
  background: rgba(176, 0, 32, 0.08);
  border-color: rgba(176, 0, 32, 0.25);
}
</style>
