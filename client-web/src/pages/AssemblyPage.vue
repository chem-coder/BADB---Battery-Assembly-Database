<script setup>
/**
 * AssemblyPage — "Сборка аккумуляторов"
 * Uses CrudTable + SaveIndicator (from Design System).
 * Only page-specific logic: data loading, column config, custom cell renderers.
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import api from '@/services/api'
import PageHeader from '@/components/PageHeader.vue'
import SaveIndicator from '@/components/SaveIndicator.vue'
import CrudTable from '@/components/CrudTable.vue'

const router = useRouter()
const toast = useToast()
const crudTable = ref(null)

// ── Data ───────────────────────────────────────────────────────────────
const batteries = ref([])
const loading = ref(false)

const ffLabels = { coin: 'Монеточный', pouch: 'Пакетный', cylindrical: 'Цилиндрический' }

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

onMounted(loadBatteries)

// ── Column config ──────────────────────────────────────────────────────
const columns = [
  { field: 'battery_id',  header: 'ID',           minWidth: '60px',  width: '80px' },
  { field: 'form_factor', header: 'Форм-фактор',  minWidth: '100px' },
  { field: 'created_at',  header: 'Создан',        minWidth: '80px',  width: '120px' },
  { field: 'notes',       header: 'Заметки',       minWidth: '120px', sortable: false, filterable: false },
]

// ── Save indicator (delete flow) ──────────────────────────────────────
const pendingDelete = ref([])
const saveState = ref('idle')
let saveTimer = null

async function onDelete(items) {
  pendingDelete.value = items
  saveState.value = 'idle'
}

async function confirmSave() {
  try {
    for (const item of pendingDelete.value) {
      await api.delete(`/api/batteries/${item.battery_id}`)
    }
    pendingDelete.value = []
    saveState.value = 'saved'
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => { saveState.value = 'idle' }, 2000)
    crudTable.value?.clearSelection()
    await loadBatteries()
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

// ── Helpers ────────────────────────────────────────────────────────────
function formatDate(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('ru-RU')
}
</script>

<template>
  <div class="assembly-page">

    <PageHeader title="Сборка" icon="pi pi-box">
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
      :data="batteries"
      :loading="loading"
      id-field="battery_id"
      table-name="Аккумуляторы"
      show-add
      row-clickable
      @add="router.push('/assembly/new')"
      @delete="onDelete"
      @row-click="(data) => router.push(`/assembly/${data.battery_id}`)"
    >
      <!-- Custom cell: ID -->
      <template #col-battery_id="{ data }">
        <strong>#{{ data.battery_id }}</strong>
      </template>

      <!-- Custom cell: Форм-фактор -->
      <template #col-form_factor="{ data }">
        <span v-if="data.form_factor" class="ff-badge">
          {{ ffLabels[data.form_factor] || data.form_factor }}
        </span>
        <span v-else class="text-muted">—</span>
      </template>

      <!-- Custom cell: Создан -->
      <template #col-created_at="{ data }">{{ formatDate(data.created_at) }}</template>

      <!-- Custom cell: Заметки -->
      <template #col-notes="{ data }">
        <span class="notes-text">{{ data.notes || '' }}</span>
      </template>
    </CrudTable>

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
.assembly-page :deep(.page-header) {
  margin-bottom: 3px !important;
}

/* ── Page-specific cell styles only ── */
.ff-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.01em;
  background: rgba(0, 50, 116, 0.08);
  color: #003274;
  border: 0.5px solid rgba(0, 50, 116, 0.15);
}
.text-muted {
  color: rgba(0, 50, 116, 0.28);
  font-size: 13px;
}
.notes-text {
  font-size: 13px;
  color: rgba(0, 50, 116, 0.7);
}
</style>
