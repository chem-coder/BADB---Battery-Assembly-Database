<script setup>
/**
 * TapesPage — "Подготовка лент"
 * Uses CrudTable + SaveIndicator (from Design System).
 * Only page-specific logic remains here: data loading, column config, custom cell renderers.
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import api from '@/services/api'
import PageHeader from '@/components/PageHeader.vue'
import SaveIndicator from '@/components/SaveIndicator.vue'
import CrudTable from '@/components/CrudTable.vue'
import StatusBadge from '@/components/StatusBadge.vue'

const router = useRouter()
const toast = useToast()
const crudTable = ref(null)

// ── Data ───────────────────────────────────────────────────────────────
const tapes = ref([])
const loading = ref(false)

async function loadTapes() {
  loading.value = true
  try {
    const { data } = await api.get('/api/tapes')
    tapes.value = data
  } catch {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось загрузить ленты', life: 3000 })
  } finally {
    loading.value = false
  }
}

onMounted(loadTapes)

// ── Column config — the ONLY thing that varies per page ────────────────
const columns = [
  { field: 'name',        header: 'Название',  minWidth: '100px' },
  { field: 'role',        header: 'Тип',       minWidth: '80px', width: '110px' },
  { field: 'recipe_name', header: 'Рецепт',    minWidth: '80px' },
  { field: 'created_at',  header: 'Создана',   minWidth: '80px', width: '110px' },
  { field: 'updated_at',  header: 'Обновлена', minWidth: '80px', width: '110px' },
  { field: 'operators',   header: 'Операторы', minWidth: '70px', width: '110px', sortable: false, filterable: false },
  { field: 'status',      header: 'Статус',    minWidth: '80px', width: '115px' },
]

// ── Save indicator (delete flow) ──────────────────────────────────────
const pendingDelete = ref([])
const saveState = ref('idle')
let saveTimer = null

const showIndicator = pendingDelete.value?.length > 0 || saveState.value === 'saved'

async function onDelete(items) {
  pendingDelete.value = items
  saveState.value = 'idle'
}

async function confirmSave() {
  try {
    for (const item of pendingDelete.value) {
      await api.delete(`/api/tapes/${item.tape_id}`)
    }
    pendingDelete.value = []
    saveState.value = 'saved'
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => { saveState.value = 'idle' }, 2000)
    crudTable.value?.clearSelection()
    await loadTapes()
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
  <div class="tapes-page">

    <PageHeader title="Подготовка лент" icon="pi pi-bars">
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
      :data="tapes"
      :loading="loading"
      id-field="tape_id"
      table-name="Ленты"
      show-add
      row-clickable
      @add="router.push('/tapes/new')"
      @delete="onDelete"
      @row-click="(data) => router.push(`/tapes/${data.tape_id}`)"
    >
      <!-- Custom cell: Название (bold) -->
      <template #col-name="{ data }">
        <strong>{{ data.name || '— без названия —' }}</strong>
      </template>

      <!-- Custom cell: Тип (cathode/anode badge) -->
      <template #col-role="{ data }">
        <span v-if="data.role"
          :class="['type-badge', data.role === 'cathode' ? 'type-badge--cathode' : 'type-badge--anode']">
          {{ data.role === 'cathode' ? 'Катод' : data.role === 'anode' ? 'Анод' : data.role }}
        </span>
        <span v-else class="text-muted">—</span>
      </template>

      <!-- Custom cell: Создана -->
      <template #col-created_at="{ data }">{{ formatDate(data.created_at) }}</template>

      <!-- Custom cell: Обновлена -->
      <template #col-updated_at="{ data }">{{ formatDate(data.updated_at) }}</template>

      <!-- Custom cell: Операторы (placeholder) -->
      <template #col-operators><span class="text-muted">—</span></template>

      <!-- Custom cell: Статус (StatusBadge component) -->
      <template #col-status="{ data }">
        <StatusBadge :status="data.status ?? 'draft'" />
      </template>
    </CrudTable>

  </div>
</template>

<style scoped>
.tapes-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.tapes-page :deep(.page-header) {
  margin-bottom: 3px !important;
}

/* ── Page-specific cell styles only ── */
.type-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.01em;
}
.type-badge--cathode {
  background: rgba(0, 50, 116, 0.10);
  color: #003274;
  border: 0.5px solid rgba(0, 50, 116, 0.18);
}
.type-badge--anode {
  background: rgba(82, 201, 166, 0.14);
  color: #1d7a5f;
  border: 0.5px solid rgba(82, 201, 166, 0.35);
}
.text-muted {
  color: rgba(0, 50, 116, 0.28);
  font-size: 13px;
}
</style>
