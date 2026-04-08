<script setup>
/**
 * ElectrolytesPage — "Электролиты" (справочник)
 * Uses CrudTable + SaveIndicator (from Design System).
 * Inline create/edit form preserved — CrudTable handles the list display.
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
const electrolytes = ref([])
const activeUsers = ref([])
const loading = ref(false)

async function loadElectrolytes() {
  loading.value = true
  try {
    const { data } = await api.get('/api/electrolytes')
    electrolytes.value = data
  } catch {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось загрузить электролиты', life: 3000 })
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

onMounted(() => { loadElectrolytes(); loadUsers() })

// ── Column config ──────────────────────────────────────────────────────
const columns = [
  { field: 'name',             header: 'Название',    minWidth: '120px' },
  { field: 'electrolyte_type', header: 'Тип',         minWidth: '80px',  width: '120px' },
  { field: 'solvent_system',   header: 'Растворители', minWidth: '100px' },
  { field: 'salts',            header: 'Соли',         minWidth: '80px',  width: '110px' },
  { field: 'concentration',    header: 'Концентрация', minWidth: '80px',  width: '120px' },
  { field: 'status',           header: 'Статус',       minWidth: '80px',  width: '115px' },
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
      await api.delete(`/api/electrolytes/${item.electrolyte_id}`)
    }
    pendingDelete.value = []
    saveState.value = 'saved'
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => { saveState.value = 'idle' }, 2000)
    crudTable.value?.clearSelection()
    await loadElectrolytes()
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
const mode = ref(null) // 'create' | 'edit'
const currentId = ref(null)

const form = ref({
  name: '',
  created_by: '',
  electrolyte_type: '',
  solvent_system: '',
  salts: '',
  concentration: '',
  additives: '',
  notes: '',
  status: 'active',
})

const typeOptions = [
  { label: 'Жидкий', value: 'liquid' },
  { label: 'Твёрдый', value: 'solid' },
  { label: 'Гелевый', value: 'gel' },
]

const statusOptions = [
  { label: 'Активный', value: 'active' },
  { label: 'Не используется', value: 'inactive' },
  { label: 'Архив', value: 'archived' },
]

function resetForm() {
  form.value = {
    name: '', created_by: '', electrolyte_type: '', solvent_system: '',
    salts: '', concentration: '', additives: '', notes: '', status: 'active',
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

function openEdit(el) {
  mode.value = 'edit'
  currentId.value = el.electrolyte_id
  form.value = {
    name: el.name || '',
    created_by: el.created_by || '',
    electrolyte_type: el.electrolyte_type || '',
    solvent_system: el.solvent_system || '',
    salts: el.salts || '',
    concentration: el.concentration || '',
    additives: el.additives || '',
    notes: el.notes || '',
    status: el.status || 'active',
  }
  formVisible.value = true
}

async function saveElectrolyte() {
  if (!mode.value) return
  if (!form.value.name?.trim()) {
    toast.add({ severity: 'warn', summary: 'Заполните название', life: 3000 })
    return
  }

  const payload = { ...form.value }
  if (payload.created_by) payload.created_by = Number(payload.created_by)

  try {
    if (mode.value === 'create') {
      await api.post('/api/electrolytes', payload)
      toast.add({ severity: 'success', summary: 'Электролит создан', life: 3000 })
    } else {
      await api.put(`/api/electrolytes/${currentId.value}`, payload)
      toast.add({ severity: 'success', summary: 'Изменения сохранены', life: 3000 })
    }
    resetForm()
    await loadElectrolytes()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: err.response?.data?.error || 'Ошибка сохранения', life: 3000 })
  }
}

// ── Helpers ────────────────────────────────────────────────────────────
function typeLabel(type) {
  const map = { liquid: 'Жидкий', solid: 'Твёрдый', gel: 'Гелевый' }
  return map[type] || type || '—'
}

function statusLabel(status) {
  const map = { active: 'активный', inactive: 'не используется', archived: 'архив' }
  return map[status] || status || '—'
}
</script>

<template>
  <div class="electrolytes-page">

    <PageHeader title="Электролиты" icon="pi pi-sparkles">
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
      :data="electrolytes"
      :loading="loading"
      id-field="electrolyte_id"
      table-name="Электролиты"
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

      <!-- Custom cell: Тип -->
      <template #col-electrolyte_type="{ data }">
        <span v-if="data.electrolyte_type" class="type-badge">
          {{ typeLabel(data.electrolyte_type) }}
        </span>
        <span v-else class="text-muted">—</span>
      </template>

      <!-- Custom cell: Статус -->
      <template #col-status="{ data }">
        <span :class="['status-pill', `status-pill--${data.status || 'active'}`]">
          {{ statusLabel(data.status) }}
        </span>
      </template>
    </CrudTable>

    <!-- ── Create / Edit Dialog ── -->
    <Dialog
      v-model:visible="formVisible"
      :header="mode === 'create' ? 'Новый электролит' : 'Редактирование электролита'"
      :style="{ width: '540px' }"
      modal
      @hide="resetForm"
    >
      <form class="form-grid" @submit.prevent="saveElectrolyte">
        <label>Название</label>
        <InputText v-model="form.name" placeholder="Название электролита" class="w-full" />

        <label>Кто добавил</label>
        <Select v-model="form.created_by" :options="activeUsers" optionLabel="name" optionValue="user_id" placeholder="— выбрать —" class="w-full" />

        <label>Тип электролита</label>
        <Select v-model="form.electrolyte_type" :options="typeOptions" optionLabel="label" optionValue="value" placeholder="— выбрать —" class="w-full" />

        <label>Растворители (система)</label>
        <InputText v-model="form.solvent_system" placeholder="EC/DMC 1:1" class="w-full" />

        <label>Соли</label>
        <InputText v-model="form.salts" placeholder="LiPF6" class="w-full" />

        <label>Концентрация</label>
        <InputText v-model="form.concentration" placeholder="1 M" class="w-full" />

        <label>Добавки</label>
        <InputText v-model="form.additives" placeholder="2% VC" class="w-full" />

        <label>Статус</label>
        <Select v-model="form.status" :options="statusOptions" optionLabel="label" optionValue="value" class="w-full" />

        <label>Примечания</label>
        <Textarea v-model="form.notes" rows="3" placeholder="Дополнительная информация" class="w-full" />
      </form>

      <template #footer>
        <Button label="Отмена" severity="secondary" outlined @click="resetForm" />
        <Button :label="mode === 'create' ? 'Создать' : 'Сохранить'" @click="saveElectrolyte" />
      </template>
    </Dialog>

  </div>
</template>

<style scoped>
.electrolytes-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.electrolytes-page :deep(.page-header) {
  margin-bottom: 3px !important;
}

/* ── Form styles ── */
.form-grid {
  display: grid;
  grid-template-columns: 160px 1fr;
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
.type-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  background: rgba(0, 50, 116, 0.08);
  color: #003274;
  border: 0.5px solid rgba(0, 50, 116, 0.15);
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
.status-pill--inactive {
  background: rgba(211, 167, 84, 0.12);
  color: #8a6d2b;
  border: 0.5px solid rgba(211, 167, 84, 0.3);
}
.status-pill--archived {
  background: rgba(0, 50, 116, 0.06);
  color: rgba(0, 50, 116, 0.45);
  border: 0.5px solid rgba(0, 50, 116, 0.12);
}
.text-muted {
  color: rgba(0, 50, 116, 0.28);
  font-size: 13px;
}
</style>
