<script setup>
/**
 * TapesPage — "Подготовка лент"
 * Unified view: CrudTable (with constructor checkboxes) + TapeConstructor.
 *
 * The old TapeFormPage is replaced by the inline Constructor.
 * Table has a checkbox column "В конструктор" to add tapes to the Constructor zone.
 */
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'
import PageHeader from '@/components/PageHeader.vue'
import SaveIndicator from '@/components/SaveIndicator.vue'
import CrudTable from '@/components/CrudTable.vue'
// StatusBadge removed — status column replaced by project/operator
import TapeConstructor from '@/components/TapeConstructor.vue'
import Checkbox from 'primevue/checkbox'
// Button removed — undo/redo now in TapeConstructor

const router = useRouter()
const toast = useToast()
const authStore = useAuthStore()
const crudTable = ref(null)
const constructorRef = ref(null)

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

onMounted(() => {
  loadTapes()
  loadRefData()
})

// ── Column config ──────────────────────────────────────────────────────
const columns = [
  { field: '_constructor',  header: '🔧',         minWidth: '45px', width: '45px', sortable: false, filterable: false },
  { field: 'name',          header: 'Название',   minWidth: '100px' },
  { field: 'project_name',  header: 'Проект',     minWidth: '80px',  width: '115px' },
  { field: 'role',          header: 'Тип',        minWidth: '80px',  width: '115px' },
  { field: 'recipe_name',   header: 'Рецепт',     minWidth: '80px',  width: '115px' },
  { field: 'progress',      header: 'Прогресс',   minWidth: '80px',  width: '100px', sortable: true },
  { field: 'operators',     header: 'Оператор',   minWidth: '80px',  width: '115px' },
  { field: 'created_at',    header: 'Создана',    minWidth: '80px',  width: '115px' },
]

// ── Create new tape ──────────────────────────────────────────────────
async function createNewTape() {
  try {
    const payload = {
      name: `Новая лента ${new Date().toLocaleDateString('ru-RU')}`,
      created_by: String(authStore.user?.userId || ''),
    }
    const { data: created } = await api.post('/api/tapes', payload)
    await loadTapes()
    // Auto-add to constructor
    if (created.tape_id) {
      constructorIds.value.push(created.tape_id)
    }
    toast.add({ severity: 'success', summary: 'Создано', detail: `Лента #${created.tape_id}`, life: 2000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: e.response?.data?.error || 'Не удалось создать ленту', life: 3000 })
  }
}

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
    // Handle delete flow (the only action requiring explicit confirmation)
    if (pendingDelete.value.length) {
      for (const item of pendingDelete.value) {
        await api.delete(`/api/tapes/${item.tape_id}`)
      }
      pendingDelete.value = []
      crudTable.value?.clearSelection()
      await loadTapes()
    }
    saveState.value = 'saved'
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => { saveState.value = 'idle' }, 2000)
  } catch {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось сохранить', life: 3000 })
  }
}

function discardChanges() {
  if (pendingDelete.value.length) {
    pendingDelete.value = []
    crudTable.value?.clearSelection()
  }
  saveState.value = 'idle'
}

onUnmounted(() => clearTimeout(saveTimer))

// ── Constructor: selected tapes ───────────────────────────────────────
const constructorIds = ref([])
const constructorDirty = ref(false)

function toggleConstructor(tapeId) {
  const idx = constructorIds.value.indexOf(tapeId)
  if (idx >= 0) {
    constructorIds.value.splice(idx, 1)
  } else {
    constructorIds.value.push(tapeId)
  }
}

function isInConstructor(tapeId) {
  return constructorIds.value.includes(tapeId)
}

// ── Reference data (shared between all tape states in constructor) ────
// NOTE: plain reactive — NO inner ref() wrappers.
// Vue auto-unwraps refs inside reactive, so .value would silently break.
const refData = reactive({
  users: [],
  projects: [],
  recipes: [],
  atmospheres: [],
  dryMixingMethods: [],
  wetMixingMethods: [],
  foils: [],
  coatingMethods: [],
})

async function loadRefData() {
  const keys = ['users', 'projects', 'recipes', 'atmospheres', 'dryMixingMethods', 'wetMixingMethods', 'foils', 'coatingMethods']
  const urls = [
    '/api/users', '/api/projects', '/api/recipes',
    '/api/reference/drying-atmospheres', '/api/reference/dry-mixing-methods',
    '/api/reference/wet-mixing-methods', '/api/reference/foils', '/api/reference/coating-methods',
  ]
  const results = await Promise.allSettled(urls.map(u => api.get(u)))
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') refData[keys[i]] = r.value.data
  })
}

// (Undo/redo now handled inside TapeConstructor with Ctrl+Z/Y)

// ── Helpers ────────────────────────────────────────────────────────────
function formatDate(dt) {
  if (!dt) return ''
  return new Date(dt).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
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

    <!-- ── Table (collapsible via max-height) ── -->
    <CrudTable
      ref="crudTable"
      :columns="columns"
      :data="tapes"
      :loading="loading"
      id-field="tape_id"
      table-name="Ленты"
      :show-rename="false"
      :export-end="true"
      show-add
      row-clickable
      @add="createNewTape"
      @delete="onDelete"
      @row-click="(data) => toggleConstructor(data.tape_id)"
    >
      <!-- Constructor checkbox column -->
      <template #col-_constructor="{ data }">
        <Checkbox
          :modelValue="isInConstructor(data.tape_id)"
          @update:modelValue="toggleConstructor(data.tape_id)"
          :binary="true"
          v-tooltip.right="'В конструктор'"
        />
      </template>

      <!-- Custom cell: Название (semibold per DS "Метка поля" 13px 600) -->
      <template #col-name="{ data }">
        <span class="tape-name">{{ data.name || '' }}</span>
      </template>

      <!-- Custom cell: Тип (cathode/anode badge) -->
      <template #col-role="{ data }">
        <span v-if="data.role"
          :class="['type-badge', data.role === 'cathode' ? 'type-badge--cathode' : 'type-badge--anode']">
          {{ data.role === 'cathode' ? 'Катод' : data.role === 'anode' ? 'Анод' : data.role }}
        </span>
        <span v-else class="text-muted"></span>
      </template>

      <!-- Custom cell: Проект -->
      <template #col-project_name="{ data }">
        <span>{{ data.project_name || '' }}</span>
      </template>

      <!-- Custom cell: Рецепт -->
      <template #col-recipe_name="{ data }">
        <span>{{ data.recipe_name || '' }}</span>
      </template>

      <!-- Custom cell: Прогресс (8 сегментов = 8 этапов) -->
      <template #col-progress="{ data }">
        <div class="progress-segments">
          <div
            v-for="i in 8"
            :key="i"
            class="progress-seg"
            :class="{ 'progress-seg--done': i <= (1 + (Number(data.completed_steps) || 0)) }"
          ></div>
        </div>
      </template>

      <!-- Custom cell: Создана -->
      <template #col-created_at="{ data }">{{ formatDate(data.created_at) }}</template>

      <!-- Custom cell: Оператор (может быть длинным) -->
      <template #col-operators="{ data }">
        <span :title="data.operators || ''" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;">{{ data.operators || '' }}</span>
      </template>
    </CrudTable>

    <!-- ── Constructor zone ── -->
    <TapeConstructor
      ref="constructorRef"
      :selectedTapeIds="constructorIds"
      :tapeList="tapes"
      :refs="refData"
      :authStore="authStore"
      @dirty="constructorDirty = $event"
      @remove-tape="toggleConstructor"
    />

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
.tape-name {
  color: #003274;
}
/* ── Progress segments (8 stages) ── */
.progress-segments {
  display: flex;
  gap: 2px;
}
.progress-seg {
  flex: 1;
  height: 6px;
  border-radius: 2px;
  background: rgba(0, 50, 116, 0.08);
  transition: background 0.3s;
}
.progress-seg--done {
  background: #2ECC94;
}

.text-muted {
  color: rgba(0, 50, 116, 0.28);
  font-size: 13px;
}
</style>
