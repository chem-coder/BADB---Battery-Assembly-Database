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
import { fmtCapacity } from '@/utils/formatCapacity'
import { toastApiError } from '@/utils/errorClassifier'
import { useBackendCache } from '@/composables/useBackendCache'
import Select from 'primevue/select'
import PageHeader from '@/components/PageHeader.vue'
import SaveIndicator from '@/components/SaveIndicator.vue'
import CrudTable from '@/components/CrudTable.vue'
import TapeConstructor from '@/components/TapeConstructor.vue'
import CapacityHint from '@/components/CapacityHint.vue'
import PrintPreviewDialog from '@/components/PrintPreviewDialog.vue'
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
// Header naming convention: avoid duplicating CrudTable's frozen row-
// number column (also "№"). Entity PK columns are renamed to "Партия"
// (with "#42" cell content) so the row-number "№" and the entity PK
// don't read as the same column. Same fix lives on AssemblyPage for
// battery_id.
const columns = [
  // Header rendered via `#header-_constructor` slot (master pill with
  // live count). The string here is the accessibility fallback only.
  { field: '_constructor', header: 'Конструктор', minWidth: '95px',  width: '110px', sortable: false, filterable: false },
  // Synthetic column: "🖨️ Print" opens Dalia's print-friendly HTML
  // (/workflow/electrode-batch-print.html) in a new tab. Matches the
  // vanilla-JS flow she added in d1382cb but triggered from the Vue
  // electrodes table so users don't have to leave the SPA.
  // Header rendered via `#header-_print` slot (PrimeIcon, centered).
  { field: '_print', header: 'Печать', minWidth: '42px', width: '42px', sortable: false, filterable: false },
  { field: 'cut_batch_id', header: 'Партия', minWidth: '70px', width: '85px' },
  { field: 'tape_name', header: 'Лента', minWidth: '120px' },
  { field: 'project_name', header: 'Проект', minWidth: '100px' },
  // Header «Тип» (not «Роль») — cathode/anode is the electrode polarity
  // type, not a functional role. Same naming on TapesPage column 'role'
  // (header 'Тип'). The Vue field key still reads `role_display` because
  // the underlying DB column is `tape_role` (Dalia's schema, untouched).
  { field: 'role_display', header: 'Тип', minWidth: '70px', width: '95px' },
  { field: 'shape_display', header: 'Форма', minWidth: '80px', width: '120px' },
  { field: 'electrode_count', header: 'Эл-дов', minWidth: '65px', width: '75px' },
  // Capacity columns — values sourced from /api/electrodes/electrode-cut-batches/:id/report
  // (capacity_summary.average_capacity_*_mAh). Loaded lazily after the
  // batch list lands and flattened into tableData so CrudTable / PrimeVue
  // sort by the numeric field correctly (the slot only handles display).
  { field: 'avg_cap_theoretical_mAh', header: 'Ёмкость теор., мАч', minWidth: '110px', width: '130px', sortable: true, filterable: false },
  { field: 'avg_cap_actual_mAh',      header: 'Ёмкость факт., мАч', minWidth: '110px', width: '130px', sortable: true, filterable: false },
  // 'progress' column — visual 2-segment bar matching the actual
  // electrode-batch lifecycle: «Нарезка» (always done — batch exists)
  // and «Сушка» (done when drying_end is set). drying_start without
  // drying_end is "drying in progress" — the segment stays unfilled
  // until the operator records the end time. The tooltip carries the
  // finer 3-state label (В работе / Сушится / Готово) for users who
  // need precision. TapesPage uses 8 segments; the count differs per
  // entity but the visual idiom is shared.
  { field: 'progress', header: 'Прогресс', minWidth: '70px', width: '90px', sortable: true, filterable: false },
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

  return items.map(b => {
    // Pull capacity from the shared useBackendCache. Reading
    // `reports.cache.value` inside this computed registers the ref as
    // a dependency — the computed re-runs whenever any /report fetch
    // resolves and rows fill in progressively. Undefined when fetch
    // is in flight; null when the response had no capacity numbers.
    const summary = reports.cache.value[b.cut_batch_id]
    const theo = summary && Number.isFinite(Number(summary.average_capacity_theoretical_mAh))
      ? Number(summary.average_capacity_theoretical_mAh) : null
    const actual = summary && Number.isFinite(Number(summary.average_capacity_actual_mAh))
      ? Number(summary.average_capacity_actual_mAh) : null
    return {
      ...b,
      role_display: b.tape_role === 'cathode' ? 'Катод' : b.tape_role === 'anode' ? 'Анод' : '—',
      shape_display: formatShapeDisplay(b),
      // 0..2 — count of completed pipeline stages: «Нарезка» (always 1
      // — batch row exists) + «Сушка» (+1 only when drying_end is
      // set; drying_start without drying_end is in-progress). Sortable
      // numeric — done batches end up at the top with `desc` sort.
      progress: 1 + (b.drying_end ? 1 : 0),
      avg_cap_theoretical_mAh: theo,
      avg_cap_actual_mAh: actual,
    }
  })
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
    // Invalidate every cached capacity summary so stale numbers from
    // a previous visit to the page don't leak in. The background
    // refetch below re-populates.
    reports.invalidateAll()
    loadAllCapacities()
  } catch (err) {
    toastApiError(toast, err, 'Не удалось загрузить партии')
  } finally {
    loading.value = false
  }
}

// ── Capacity summary fetch (Dalia's 026efbf per-batch capacity_summary) ──
// The list endpoint is NOT enriched with capacity fields, so after the
// batch list lands we fan out /report calls per-batch to pull
// capacity_summary. /report is a pure read (no side-effects, unlike
// /assembly on batteries), but it runs several SQL joins — a 100-batch
// page would DOS the DB without throttling. useBackendCache provides
// the semaphore + dedup + race-guard we used to write inline here.
const reports = useBackendCache({
  fetchFn: async (cutBatchId) => {
    const { data } = await api.get(`/api/electrodes/electrode-cut-batches/${cutBatchId}/report`)
    return data?.capacity_summary || null
  },
  maxConcurrent: 3,
})

function loadAllCapacities() {
  for (const b of allBatches.value) {
    if (!reports.isLoaded(b.cut_batch_id)) reports.load(b.cut_batch_id)
  }
}

async function loadProjects() {
  try {
    const { data } = await api.get('/api/projects?project_id=0')
    projects.value = data
  } catch {}
}

// `batchStatus` removed — replaced by the `progress` numeric column
// + the 3-segment progress-bar slot in the template. The textual
// status was redundant with this visual encoding (see TapesPage's
// 8-segment progress for the same pattern at workflow scale).

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

// Print report — loads Dalia's print-friendly HTML inside an in-app
// modal Dialog (PrintPreviewDialog). Per user feedback the new-tab
// flow felt «как изолированная система» — losing context of which row
// they came from. The dialog keeps the table behind the dimmed mask
// and the «Печать» button inside it triggers the iframe's own
// window.print() so Dalia's @media print CSS still applies.
const printDialog = ref({ visible: false, url: '', title: '' })
function openBatchPrint(cutBatchId) {
  if (!cutBatchId) return
  printDialog.value = {
    visible: true,
    url: `/workflow/electrode-batch-print.html?cut_batch_id=${encodeURIComponent(cutBatchId)}`,
    title: `Печать · Партия #${cutBatchId}`,
  }
}

// Click handler for CapacityHint actions in the «Емкость (факт)»
// column. The summary the helper sees lacks tape_id by default, so
// we enrich it from the row (`tape_id`, `cut_batch_id`) before the
// hint resolves.
function handleHintGo(action) {
  if (!action) return
  if (action.kind === 'open-tape-recipe') {
    const tapeId = action.payload?.tapeId
    const query = tapeId ? { select: String(tapeId), stage: 'recipe_actual' } : {}
    router.push({ path: '/tapes', query })
  } else if (action.kind === 'open-electrode-batch') {
    const cutBatchId = action.payload?.cutBatchId
    if (cutBatchId) router.push(`/electrodes/${cutBatchId}`)
  } else if (action.kind === 'open-materials') {
    router.push('/reference/materials')
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
  } catch (err) {
    toastApiError(toast, err, 'Не удалось удалить')
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
      <!-- Constructor column — clickable header text + per-row
           checkbox. Header click toggles select-all-on-page. Both
           header and body cells are centered via `.ct-cons-cell`. -->
      <template #header-_constructor>
        <button
          type="button"
          class="ct-cons-header"
          :class="{ 'is-active': constructorIds.length > 0 }"
          @click.stop="toggleAllConstructor"
        >
          Конструктор<span v-if="constructorIds.length > 0" class="ct-cons-count">({{ constructorIds.length }})</span>
        </button>
      </template>
      <template #col-_constructor="{ data }">
        <div class="ct-cons-cell">
          <Checkbox
            :modelValue="isInConstructor(data.cut_batch_id)"
            @update:modelValue="toggleConstructor(data.cut_batch_id)"
            :binary="true"
            v-tooltip.right="'Добавить/убрать из конструктора'"
          />
        </div>
      </template>
      <template #header-_print>
        <span class="ct-print-header" title="Печать отчёта">
          <i class="pi pi-print"></i>
        </span>
      </template>
      <template #col-_print="{ data }">
        <div class="ct-print-cell">
          <button
            class="print-btn"
            title="Печать отчёта по партии"
            @click.stop="openBatchPrint(data.cut_batch_id)"
          >
            <i class="pi pi-print"></i>
          </button>
        </div>
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
      <template #col-avg_cap_theoretical_mAh="{ data }">
        <span class="cap-cell">
          <template v-if="reports.loading.value[data.cut_batch_id]">…</template>
          <template v-else>{{ fmtCapacity(data.avg_cap_theoretical_mAh) }}</template>
        </span>
      </template>
      <template #col-avg_cap_actual_mAh="{ data }">
        <span class="cap-cell">
          <template v-if="reports.loading.value[data.cut_batch_id]">…</template>
          <template v-else-if="data.avg_cap_actual_mAh == null">
            <span class="cap-cell-missing">
              —
              <CapacityHint
                :summary="reports.cache.value[data.cut_batch_id]"
                context="electrode"
                :extra="{ tapeId: data.tape_id, cutBatchId: data.cut_batch_id }"
                @go="handleHintGo"
              />
            </span>
          </template>
          <template v-else>{{ fmtCapacity(data.avg_cap_actual_mAh) }}</template>
        </span>
      </template>
      <!-- Progress bar (2 segments — «Нарезка» / «Сушка»).
           Same visual idiom as TapesPage 'progress' column (8 segments)
           — the count differs per entity but the encoding is shared.
           Title carries the finer textual stage so the user can read
           «Сушится» (drying in progress: start logged but not end)
           apart from «В работе» (no drying yet). -->
      <template #col-progress="{ data }">
        <div
          class="progress-segments"
          :title="data.progress >= 2 ? 'Готово' : (data.drying_start ? 'Сушится' : 'В работе')"
        >
          <div
            v-for="i in 2"
            :key="i"
            class="progress-seg"
            :class="{ 'progress-seg--done': i <= data.progress }"
          ></div>
        </div>
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

    <!-- In-app print preview — replaces window.open(_blank); see
         openBatchPrint() in <script>. -->
    <PrintPreviewDialog
      v-model:visible="printDialog.visible"
      :url="printDialog.url"
      :title="printDialog.title"
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

/* Print button in its own narrow column — same visual language as the
   constructor checkbox (small, borderless, hover fills with brand color). */
.print-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  color: rgba(0, 50, 116, 0.55);
  cursor: pointer;
  border-radius: 5px;
  transition: all 0.15s;
}
.print-btn:hover {
  background: rgba(0, 50, 116, 0.08);
  color: #003274;
}
.print-btn i { font-size: 13px; }

/* Capacity cells — monospace so three decimals align vertically down
   the column, matching Dalia's print-report typography. */
.cap-cell {
  font-family: monospace;
  font-size: 12px;
  color: #003274;
  font-variant-numeric: tabular-nums;
}
.cap-cell-missing {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: rgba(0, 50, 116, 0.45);
  cursor: help;
}
.cap-cell-hint-icon {
  font-size: 11px;
  color: rgba(212, 164, 65, 0.75);
}

.role-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
}
.role-badge--cathode { background: rgba(82, 201, 166, 0.15); color: #1d7a5f; }
.role-badge--anode { background: rgba(0, 50, 116, 0.08); color: #003274; }

/* ── Progress segments (3 stages — created / drying_start / drying_end) ──
   Mirrors TapesPage 'progress' column for visual consistency across
   the workflow tables. Tooltip on the parent surfaces the textual
   stage for users who don't read the bar by itself. */
.progress-segments {
  display: flex;
  gap: 2px;
  cursor: help;
}
.progress-seg {
  flex: 1;
  height: 6px;
  border-radius: 2px;
  background: rgba(0, 50, 116, 0.08);
  transition: background 0.3s;
}
.progress-seg--done {
  background: #52C9A6;
}

@media (max-width: 768px) {
  .filter-bar { flex-direction: column; align-items: stretch; }
  .filter-select, .filter-project, .filter-tape { min-width: 100%; }
}
</style>
