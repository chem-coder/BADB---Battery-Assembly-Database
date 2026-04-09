<script setup>
/**
 * AssemblyPage — "Аккумуляторы"
 * Shows ALL batteries with CrudTable + inline TapeConstructor (battery mode).
 * Follows TapesPage / ElectrodesPage pattern.
 */
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'
import PageHeader from '@/components/PageHeader.vue'
import SaveIndicator from '@/components/SaveIndicator.vue'
import CrudTable from '@/components/CrudTable.vue'
import TapeConstructor from '@/components/TapeConstructor.vue'
import Checkbox from 'primevue/checkbox'
import { BATTERY_STAGES } from '@/config/batteryStages'
import { useBatteryState } from '@/composables/useBatteryState'

const router = useRouter()
const route = useRoute()
const toast = useToast()
const authStore = useAuthStore()
const crudTable = ref(null)

// ── Data ──
const batteries = ref([])
const loading = ref(false)

// ── Reference data for constructor dropdowns ──
const refData = reactive({
  projects: [],
  separators: [],
  electrolytes: [],
  cathodeTapes: [],
  anodeTapes: [],
  electrodeBatches: [],
})

async function loadRefData() {
  const endpoints = [
    { key: 'projects', url: '/api/projects?project_id=0' },
    { key: 'separators', url: '/api/separators' },
    { key: 'electrolytes', url: '/api/electrolytes' },
  ]
  const results = await Promise.allSettled(endpoints.map(e => api.get(e.url)))
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') refData[endpoints[i].key] = r.value.data
  })

  // Load tapes and split by role
  try {
    const { data: tapes } = await api.get('/api/tapes')
    refData.cathodeTapes = tapes.filter(t => t.role === 'cathode')
    refData.anodeTapes = tapes.filter(t => t.role === 'anode')
  } catch {}

  // Load electrode batches with labels
  try {
    const { data: batches } = await api.get('/api/electrodes/electrode-cut-batches')
    refData.electrodeBatches = batches.map(b => ({
      ...b,
      _label: `#${b.cut_batch_id} — ${b.tape_name || ''} (${b.electrode_count || 0} шт.)`,
    }))
  } catch {}
}

const ffLabels = { coin: 'Монета', pouch: 'Пакет', cylindrical: 'Цилиндр' }
const statusLabels = { draft: 'Черновик', assembled: 'Собран', testing: 'Тест', completed: 'Готов', failed: 'Брак' }

// ── Columns ──
const columns = [
  { field: '_constructor', header: '🔧', minWidth: '45px', width: '45px', sortable: false, filterable: false },
  { field: 'battery_id', header: '№', minWidth: '55px', width: '65px' },
  { field: 'project_name', header: 'Проект', minWidth: '120px' },
  { field: 'form_factor', header: 'Форм-фактор', minWidth: '90px', width: '110px' },
  { field: 'status_display', header: 'Статус', minWidth: '80px', width: '100px' },
  { field: 'created_by_name', header: 'Оператор', minWidth: '100px' },
  { field: 'created_at', header: 'Создан', minWidth: '80px', width: '110px' },
  { field: 'notes', header: 'Заметки', minWidth: '120px', sortable: false, filterable: false },
]

// ── Computed: enriched data ──
const tableData = computed(() =>
  batteries.value.map(b => ({
    ...b,
    status_display: statusLabels[b.status] || b.status || 'Черновик',
  }))
)

// ── API ──
async function loadBatteries() {
  loading.value = true
  try {
    const { data } = await api.get('/api/batteries')
    batteries.value = data
  } catch {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось загрузить аккумуляторы', life: 3000 })
  } finally {
    loading.value = false
  }
}

async function createBattery() {
  try {
    const { data } = await api.post('/api/batteries', {
      project_id: 1,
      created_by: String(authStore.user?.userId || ''),
      form_factor: 'coin',
    })
    await loadBatteries()
    constructorIds.value = [data.battery_id]
    toast.add({ severity: 'success', summary: 'Создан', detail: `Аккумулятор #${data.battery_id}`, life: 2000 })
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: err.response?.data?.error || 'Не удалось создать', life: 3000 })
  }
}

function formatDate(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('ru-RU')
}

// ── Constructor (same pattern as TapesPage / ElectrodesPage) ──
const constructorIds = ref([])

function toggleConstructor(batteryId) {
  const idx = constructorIds.value.indexOf(batteryId)
  if (idx >= 0) constructorIds.value.splice(idx, 1)
  else constructorIds.value.push(batteryId)
}

function isInConstructor(batteryId) {
  return constructorIds.value.includes(batteryId)
}

function toggleAllConstructor() {
  if (constructorIds.value.length > 0) {
    constructorIds.value.splice(0)
  } else {
    const visible = crudTable.value?.filteredData || tableData.value
    constructorIds.value = visible.map(b => b.battery_id)
  }
}

function batteryStateFactory(id) {
  return useBatteryState({ batteryId: id })
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
      await api.delete(`/api/batteries/${item.battery_id}`)
    }
    pendingDelete.value = []
    crudTable.value?.clearSelection()
    await loadBatteries()
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

// ── Init ──
onMounted(async () => {
  await Promise.allSettled([loadBatteries(), loadRefData()])
  const batteryId = Number(route.params.id)
  if (batteryId && Number.isInteger(batteryId)) {
    constructorIds.value = [batteryId]
  }
})
onUnmounted(() => clearTimeout(saveTimer))
</script>

<template>
  <div class="assembly-page">
    <PageHeader title="Аккумуляторы" icon="pi pi-box">
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
      :data="tableData"
      :loading="loading"
      id-field="battery_id"
      table-name="Аккумуляторы"
      show-add
      row-clickable
      @add="createBattery"
      @delete="onDelete"
      @row-click="(data) => toggleConstructor(data.battery_id)"
      @header-click="(field) => field === '_constructor' && toggleAllConstructor()"
    >
      <template #col-_constructor="{ data }">
        <Checkbox
          :modelValue="isInConstructor(data.battery_id)"
          @update:modelValue="toggleConstructor(data.battery_id)"
          :binary="true"
          v-tooltip.right="'В конструктор'"
        />
      </template>
      <template #col-battery_id="{ data }">
        <strong class="battery-id">#{{ data.battery_id }}</strong>
      </template>
      <template #col-form_factor="{ data }">
        <span v-if="data.form_factor" class="ff-badge">
          {{ ffLabels[data.form_factor] || data.form_factor }}
        </span>
        <span v-else class="text-muted">—</span>
      </template>
      <template #col-status_display="{ data }">
        <span :class="['status-badge', `status-badge--${data.status || 'draft'}`]">
          {{ data.status_display }}
        </span>
      </template>
      <template #col-created_at="{ data }">{{ formatDate(data.created_at) }}</template>
      <template #col-notes="{ data }">
        <span class="notes-text">{{ data.notes || '' }}</span>
      </template>
    </CrudTable>

    <!-- Constructor -->
    <TapeConstructor
      :selectedTapeIds="constructorIds"
      :tapeList="tableData"
      :stageConfigs="BATTERY_STAGES"
      :stateFactory="batteryStateFactory"
      :refs="refData"
      idField="battery_id"
      title="КОНСТРУКТОР АККУМУЛЯТОРОВ"
      emptyHint="Отметьте аккумуляторы в таблице для работы в конструкторе"
    />
  </div>
</template>

<style scoped>
.assembly-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.assembly-page :deep(.page-header) { margin-bottom: 3px !important; }

.battery-id { color: #003274; }
.ff-badge {
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
.status-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}
.status-badge--draft { background: rgba(107, 114, 128, 0.12); color: #6B7280; }
.status-badge--assembled { background: rgba(0, 50, 116, 0.08); color: #003274; }
.status-badge--testing { background: rgba(211, 167, 84, 0.15); color: #9a7030; }
.status-badge--completed { background: rgba(82, 201, 166, 0.15); color: #1a8a64; }
.status-badge--failed { background: rgba(231, 76, 60, 0.12); color: #c0392b; }
.text-muted { color: rgba(0, 50, 116, 0.28); font-size: 13px; }
.notes-text { font-size: 13px; color: rgba(0, 50, 116, 0.7); }
</style>
