<script setup>
/**
 * ElectrodesPage — "Электроды"
 * Shows ALL electrode cut batches with optional filters (Role, Project, Tape).
 * Follows TapesPage pattern: CrudTable + TapeConstructor.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import api from '@/services/api'
import Select from 'primevue/select'
import PageHeader from '@/components/PageHeader.vue'
import SaveIndicator from '@/components/SaveIndicator.vue'
import CrudTable from '@/components/CrudTable.vue'
import TapeConstructor from '@/components/TapeConstructor.vue'
import Checkbox from 'primevue/checkbox'
import { ELECTRODE_STAGES } from '@/config/electrodeStages'
import { useElectrodeState } from '@/composables/useElectrodeState'

const router = useRouter()
const route = useRoute()
const toast = useToast()
const crudTable = ref(null)

// ── Reference data ──
const allBatches = ref([])
const projects = ref([])
const loading = ref(false)

// ── Filters (optional, not blocking) ──
const selectedRole = ref(null)
const selectedProjectId = ref(null)
const selectedTapeId = ref(null)

// ── Columns ──
const columns = [
  { field: '_constructor', header: '🔧', minWidth: '45px', width: '45px', sortable: false, filterable: false },
  { field: 'cut_batch_id', header: '№', minWidth: '55px', width: '65px' },
  { field: 'tape_name', header: 'Лента', minWidth: '120px' },
  { field: 'project_name', header: 'Проект', minWidth: '100px' },
  { field: 'role_display', header: 'Роль', minWidth: '60px', width: '75px' },
  { field: 'shape_display', header: 'Форма', minWidth: '80px', width: '120px' },
  { field: 'electrode_count', header: 'Эл-дов', minWidth: '65px', width: '75px' },
  { field: 'status_display', header: 'Статус', minWidth: '80px', width: '100px' },
  { field: 'created_at', header: 'Дата', minWidth: '90px', width: '110px' },
  { field: 'created_by_name', header: 'Оператор', minWidth: '100px' },
]

// ── Computed: unique tapes for filter dropdown ──
const tapeOptions = computed(() => {
  const map = new Map()
  for (const b of allBatches.value) {
    if (!map.has(b.tape_id)) {
      map.set(b.tape_id, { id: b.tape_id, name: `#${b.tape_id} — ${b.tape_name || '?'}`, role: b.tape_role })
    }
  }
  let opts = [...map.values()]
  if (selectedRole.value) opts = opts.filter(t => t.role === selectedRole.value)
  if (selectedProjectId.value) opts = opts.filter(t => {
    const batch = allBatches.value.find(b => b.tape_id === t.id)
    return batch && String(batch.project_id) === String(selectedProjectId.value)
  })
  return opts
})

// ── Computed: filtered + enriched data ──
const tableData = computed(() => {
  let items = allBatches.value

  if (selectedRole.value) items = items.filter(b => b.tape_role === selectedRole.value)
  if (selectedProjectId.value) items = items.filter(b => String(b.project_id) === String(selectedProjectId.value))
  if (selectedTapeId.value) items = items.filter(b => String(b.tape_id) === String(selectedTapeId.value))

  return items.map(b => ({
    ...b,
    role_display: b.tape_role === 'cathode' ? 'К' : b.tape_role === 'anode' ? 'А' : '—',
    shape_display: formatShapeDisplay(b),
    status_display: batchStatus(b),
  }))
})

function formatShapeDisplay(b) {
  const ff = b.target_form_factor
  const cc = b.target_config_code === 'other'
    ? (b.target_config_other || 'другое')
    : b.target_config_code
  const ffLabel = ff === 'coin' ? 'Монета'
    : ff === 'pouch' ? 'Пакет'
    : ff === 'cylindrical' ? 'Цилиндр'
    : ''

  // Shape measurement (diameter or length×width)
  const dims = b.shape === 'circle'
    ? (b.diameter_mm ? `⌀${b.diameter_mm}` : '')
    : b.shape === 'rectangle'
      ? (b.length_mm && b.width_mm ? `${b.length_mm}×${b.width_mm}` : '')
      : ''

  // Combine: "Монета 2032 ⌀18" or "Пакет 103x83 50×50" or just dims if no form factor
  if (ffLabel && cc) return dims ? `${ffLabel} ${cc} ${dims}` : `${ffLabel} ${cc}`
  if (ffLabel) return dims ? `${ffLabel} ${dims}` : ffLabel
  if (dims) return dims
  return b.shape === 'circle' ? 'Круг' : b.shape === 'rectangle' ? 'Прямоуг.' : '—'
}

const roleOptions = [
  { label: 'Катоды', value: 'cathode' },
  { label: 'Аноды', value: 'anode' },
]

// ── API ──
async function loadAllBatches() {
  loading.value = true
  try {
    const { data } = await api.get('/api/electrodes/electrode-cut-batches')
    allBatches.value = data
  } catch {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось загрузить партии', life: 3000 })
  } finally {
    loading.value = false
  }
}

async function loadProjects() {
  try {
    const { data } = await api.get('/api/projects?project_id=0')
    projects.value = data
  } catch {}
}

function batchStatus(batch) {
  if (batch.drying_end) return 'готово'
  if (batch.drying_start) return 'сушится'
  return 'в работе'
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('ru-RU')
}

function onRoleChange() {
  selectedTapeId.value = null
}

function onProjectChange() {
  selectedTapeId.value = null
}

function createBatch() {
  if (selectedTapeId.value) {
    router.push(`/electrodes/new?tape=${selectedTapeId.value}`)
  } else {
    toast.add({ severity: 'warn', summary: 'Выберите ленту', detail: 'Для создания партии нужно выбрать ленту', life: 3000 })
  }
}

// ── Constructor (same pattern as TapesPage) ──
const constructorIds = ref([])

function toggleConstructor(batchId) {
  const idx = constructorIds.value.indexOf(batchId)
  if (idx >= 0) constructorIds.value.splice(idx, 1)
  else constructorIds.value.push(batchId)
}

function isInConstructor(batchId) {
  return constructorIds.value.includes(batchId)
}

function toggleAllConstructor() {
  if (constructorIds.value.length > 0) {
    constructorIds.value.splice(0)
  } else {
    const visible = crudTable.value?.filteredData || tableData.value
    constructorIds.value = visible.map(b => b.cut_batch_id)
  }
}

function electrodeStateFactory(id) {
  return useElectrodeState({ batchId: id })
}

// ── Delete flow ──
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
      await api.delete(`/api/electrodes/electrode-cut-batches/${item.cut_batch_id}`)
    }
    pendingDelete.value = []
    crudTable.value?.clearSelection()
    await loadAllBatches()
    saveState.value = 'saved'
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => { saveState.value = 'idle' }, 2000)
  } catch {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось удалить', life: 3000 })
  }
}

function discardChanges() {
  pendingDelete.value = []
  crudTable.value?.clearSelection()
  saveState.value = 'idle'
}

// ── Deep link: /electrodes/:id ──
onMounted(async () => {
  await Promise.allSettled([loadAllBatches(), loadProjects()])

  const batchId = Number(route.params.id)
  if (batchId && Number.isInteger(batchId)) {
    constructorIds.value = [batchId]
  }
})
onUnmounted(() => clearTimeout(saveTimer))
</script>

<template>
  <div class="electrodes-page">
    <PageHeader title="Электроды" icon="pi pi-stop-circle">
      <template #actions>
        <SaveIndicator
          :visible="pendingDelete.length > 0 || saveState === 'saved'"
          :saved="saveState === 'saved'"
          @save="confirmSave"
          @cancel="discardChanges"
        />
      </template>
    </PageHeader>

    <!-- Optional filters -->
    <div class="filter-bar">
      <div class="filter-group">
        <label>Тип</label>
        <Select
          v-model="selectedRole"
          :options="roleOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="Все"
          showClear
          size="small"
          class="filter-select"
          @change="onRoleChange"
        />
      </div>
      <div class="filter-group">
        <label>Проект</label>
        <Select
          v-model="selectedProjectId"
          :options="projects"
          optionLabel="name"
          optionValue="project_id"
          placeholder="Все"
          showClear
          size="small"
          class="filter-select filter-project"
          @change="onProjectChange"
        />
      </div>
      <div class="filter-group">
        <label>Лента</label>
        <Select
          v-model="selectedTapeId"
          :options="tapeOptions"
          optionLabel="name"
          optionValue="id"
          placeholder="Все"
          showClear
          size="small"
          class="filter-select filter-tape"
        />
      </div>
    </div>

    <!-- Batch table — always visible -->
    <CrudTable
      ref="crudTable"
      :columns="columns"
      :data="tableData"
      :loading="loading"
      id-field="cut_batch_id"
      table-name="Партии нарезки"
      show-add
      row-clickable
      @add="createBatch"
      @delete="onDelete"
      @row-click="(data) => toggleConstructor(data.cut_batch_id)"
      @header-click="(field) => field === '_constructor' && toggleAllConstructor()"
    >
      <template #col-_constructor="{ data }">
        <Checkbox
          :modelValue="isInConstructor(data.cut_batch_id)"
          @update:modelValue="toggleConstructor(data.cut_batch_id)"
          :binary="true"
          v-tooltip.right="'В конструктор'"
        />
      </template>
      <template #col-cut_batch_id="{ data }">
        <span class="batch-id">#{{ data.cut_batch_id }}</span>
      </template>
      <template #col-role_display="{ data }">
        <span :class="['role-badge', data.tape_role === 'cathode' ? 'role-badge--cathode' : 'role-badge--anode']">
          {{ data.role_display }}
        </span>
      </template>
      <template #col-created_at="{ data }">{{ formatDate(data.created_at) }}</template>
      <template #col-electrode_count="{ data }">{{ Number(data.electrode_count) || 0 }}</template>
      <template #col-status_display="{ data }">
        <span :class="['status-badge', `status-badge--${data.status_display === 'готово' ? 'done' : data.status_display === 'сушится' ? 'drying' : 'work'}`]">
          {{ data.status_display }}
        </span>
      </template>
    </CrudTable>

    <!-- Constructor -->
    <TapeConstructor
      :selectedTapeIds="constructorIds"
      :tapeList="tableData"
      :stageConfigs="ELECTRODE_STAGES"
      :stateFactory="electrodeStateFactory"
      idField="cut_batch_id"
      entityType="electrode_cut_batch"
      title="КОНСТРУКТОР ЭЛЕКТРОДОВ"
      emptyHint="Отметьте партии в таблице для работы в конструкторе"
    />
  </div>
</template>

<style scoped>
.electrodes-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.electrodes-page :deep(.page-header) { margin-bottom: 3px !important; }

/* ── Filter bar ── */
.filter-bar {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  align-items: flex-end;
}
.filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.filter-group label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.5);
}
.filter-select { min-width: 150px; }
.filter-project { min-width: 200px; }
.filter-tape { min-width: 250px; }

/* ── Table cells ── */
.batch-id { color: #003274; font-weight: 600; }

.role-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
}
.role-badge--cathode { background: rgba(82, 201, 166, 0.15); color: #1d7a5f; }
.role-badge--anode { background: rgba(0, 50, 116, 0.08); color: #003274; }

.status-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}
.status-badge--done { background: rgba(82, 201, 166, 0.15); color: #1a8a64; }
.status-badge--drying { background: rgba(211, 167, 84, 0.15); color: #9a7030; }
.status-badge--work { background: rgba(0, 50, 116, 0.08); color: #003274; }

@media (max-width: 768px) {
  .filter-bar { flex-direction: column; align-items: stretch; }
  .filter-select, .filter-project, .filter-tape { min-width: 100%; }
}
</style>
