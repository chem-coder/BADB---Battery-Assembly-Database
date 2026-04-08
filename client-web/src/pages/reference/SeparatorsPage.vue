<script setup>
/**
 * SeparatorsPage — "Сепараторы" (справочник)
 * Uses CrudTable + SaveIndicator (from Design System).
 * Inline create/edit form in Dialog — CrudTable handles the list.
 */
import { ref, watch, onMounted, onUnmounted } from 'vue'
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
const separators = ref([])
const activeUsers = ref([])
const structures = ref([])
const loading = ref(false)

async function loadSeparators() {
  loading.value = true
  try {
    const { data } = await api.get('/api/separators')
    separators.value = data
  } catch {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось загрузить сепараторы', life: 3000 })
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

async function loadStructures() {
  try {
    const { data } = await api.get('/api/structures')
    structures.value = data
  } catch {}
}

onMounted(() => { loadSeparators(); loadUsers(); loadStructures() })

// ── Column config ──────────────────────────────────────────────────────
const columns = [
  { field: 'name',         header: 'Название',     minWidth: '120px' },
  { field: 'supplier',     header: 'Поставщик',    minWidth: '90px',  width: '130px' },
  { field: 'brand',        header: 'Марка',         minWidth: '70px',  width: '110px' },
  { field: 'thickness_um', header: 'Толщина, мкм',  minWidth: '80px',  width: '120px' },
  { field: 'porosity',     header: 'Пористость, %', minWidth: '80px',  width: '120px' },
  { field: 'status',       header: 'Статус',        minWidth: '80px',  width: '115px' },
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
      await api.delete(`/api/separators/${item.sep_id}`)
    }
    pendingDelete.value = []
    saveState.value = 'saved'
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => { saveState.value = 'idle' }, 2000)
    crudTable.value?.clearSelection()
    await loadSeparators()
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
  supplier: '',
  brand: '',
  batch: '',
  structure_id: '',
  air_perm: '',
  air_perm_units: '',
  thickness_um: '',
  porosity: '',
  comments: '',
  status: 'available',
  depleted_at: '',
})

function resetForm() {
  form.value = {
    name: '', created_by: '', supplier: '', brand: '', batch: '', structure_id: '',
    air_perm: '', air_perm_units: '', thickness_um: '', porosity: '',
    comments: '', status: 'available', depleted_at: '',
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

function openEdit(sep) {
  mode.value = 'edit'
  currentId.value = sep.sep_id
  form.value = {
    name: sep.name || '',
    created_by: sep.created_by || '',
    supplier: sep.supplier || '',
    brand: sep.brand || '',
    batch: sep.batch || '',
    structure_id: sep.structure_id || '',
    air_perm: sep.air_perm ?? '',
    air_perm_units: sep.air_perm_units || '',
    thickness_um: sep.thickness_um ?? '',
    porosity: sep.porosity ?? '',
    comments: sep.comments || '',
    status: sep.status || 'available',
    depleted_at: sep.depleted_at ? sep.depleted_at.slice(0, 10) : '',
  }
  formVisible.value = true
}

// Hide depleted_at when status is 'available'
watch(() => form.value.status, (val) => {
  if (val === 'available') form.value.depleted_at = ''
})

async function saveSeparator() {
  if (!mode.value) return
  if (!form.value.name?.trim()) {
    toast.add({ severity: 'warn', summary: 'Заполните название', life: 3000 })
    return
  }

  const payload = { ...form.value }

  try {
    if (mode.value === 'create') {
      await api.post('/api/separators', payload)
      toast.add({ severity: 'success', summary: 'Сепаратор создан', life: 3000 })
    } else {
      await api.put(`/api/separators/${currentId.value}`, payload)
      toast.add({ severity: 'success', summary: 'Изменения сохранены', life: 3000 })
    }
    resetForm()
    await loadSeparators()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: err.response?.data?.error || 'Ошибка сохранения', life: 3000 })
  }
}

// ── Helpers ────────────────────────────────────────────────────────────
function statusLabel(status) {
  const map = { available: 'в наличии', used: 'израсходован', scrap: 'списан' }
  return map[status] || status || '—'
}
</script>

<template>
  <div class="separators-page">

    <PageHeader title="Сепараторы" icon="pi pi-minus">
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
      :data="separators"
      :loading="loading"
      id-field="sep_id"
      table-name="Сепараторы"
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

      <!-- Custom cell: Толщина -->
      <template #col-thickness_um="{ data }">
        {{ data.thickness_um != null ? data.thickness_um : '—' }}
      </template>

      <!-- Custom cell: Пористость -->
      <template #col-porosity="{ data }">
        {{ data.porosity != null ? data.porosity : '—' }}
      </template>

      <!-- Custom cell: Статус -->
      <template #col-status="{ data }">
        <span :class="['status-pill', `status-pill--${data.status || 'available'}`]">
          {{ statusLabel(data.status) }}
        </span>
      </template>
    </CrudTable>

    <!-- ── Create / Edit Dialog ── -->
    <Dialog
      v-model:visible="formVisible"
      :header="mode === 'create' ? 'Новый сепаратор' : 'Редактирование сепаратора'"
      :style="{ width: '560px' }"
      modal
      @hide="resetForm"
    >
      <form class="form-grid" @submit.prevent="saveSeparator">
        <label>Название</label>
        <InputText v-model="form.name" placeholder="Название сепаратора" class="w-full" />

        <label>Кто добавил</label>
        <Select v-model="form.created_by" :options="activeUsers" optionLabel="name" optionValue="user_id" placeholder="— выбрать —" class="w-full" />

        <label>Поставщик</label>
        <InputText v-model="form.supplier" placeholder="Celgard" class="w-full" />

        <label>Марка</label>
        <InputText v-model="form.brand" placeholder="2320" class="w-full" />

        <label>Партия</label>
        <InputText v-model="form.batch" placeholder="A1" class="w-full" />

        <label>Тип структуры</label>
        <Select v-model="form.structure_id" :options="structures" optionLabel="name" optionValue="sep_str_id" placeholder="— выбрать —" class="w-full" />

        <label>Воздушная проницаемость</label>
        <InputText v-model="form.air_perm" placeholder="20" class="w-full" />

        <label>Ед. измерения</label>
        <InputText v-model="form.air_perm_units" placeholder="s/100 мл" class="w-full" />

        <label>Толщина, мкм</label>
        <InputText v-model="form.thickness_um" placeholder="20" class="w-full" />

        <label>Пористость, %</label>
        <InputText v-model="form.porosity" placeholder="40" class="w-full" />

        <label>Статус</label>
        <Select
          v-model="form.status"
          :options="[{ label: 'в наличии', value: 'available' }, { label: 'израсходован', value: 'used' }, { label: 'списан', value: 'scrap' }]"
          optionLabel="label"
          optionValue="value"
          class="w-full"
        />

        <template v-if="form.status !== 'available'">
          <label>Дата списания</label>
          <InputText v-model="form.depleted_at" type="date" class="w-full" />
        </template>

        <label>Комментарии</label>
        <Textarea v-model="form.comments" rows="3" placeholder="Замечания, методики" class="w-full" />
      </form>

      <template #footer>
        <Button label="Отмена" severity="secondary" outlined @click="resetForm" />
        <Button :label="mode === 'create' ? 'Создать' : 'Сохранить'" @click="saveSeparator" />
      </template>
    </Dialog>

  </div>
</template>

<style scoped>
.separators-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.separators-page :deep(.page-header) {
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
.status-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}
.status-pill--available {
  background: rgba(82, 201, 166, 0.14);
  color: #1d7a5f;
  border: 0.5px solid rgba(82, 201, 166, 0.35);
}
.status-pill--used {
  background: rgba(211, 167, 84, 0.12);
  color: #8a6d2b;
  border: 0.5px solid rgba(211, 167, 84, 0.3);
}
.status-pill--scrap {
  background: rgba(176, 0, 32, 0.08);
  color: #b00020;
  border: 0.5px solid rgba(176, 0, 32, 0.15);
}
</style>
