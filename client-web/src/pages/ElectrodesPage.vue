<script setup>
/**
 * ElectrodesPage — "Электроды"
 * Shows ALL electrode cut batches with optional filters (Role, Project, Tape).
 * Follows TapesPage pattern: CrudTable + TapeConstructor.
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import api from '@/services/api'
import { fmtCapacity } from '@/utils/formatCapacity'
import { toastApiError } from '@/utils/errorClassifier'
import { useBackendCache } from '@/composables/useBackendCache'
import PageHeader from '@/components/PageHeader.vue'
import CrudTable from '@/components/CrudTable.vue'
import TapeConstructor from '@/components/TapeConstructor.vue'
import ElectrodeBatchPanel from '@/components/ElectrodeBatchPanel.vue'
import CapacityHint from '@/components/CapacityHint.vue'
import PrintPreviewDialog from '@/components/PrintPreviewDialog.vue'
import BatchCreateDialog from '@/components/BatchCreateDialog.vue'
import { useAuthStore } from '@/stores/auth'
import Checkbox from 'primevue/checkbox'
import { ELECTRODE_STAGES } from '@/config/electrodeStages'
import { useElectrodeState } from '@/composables/useElectrodeState'
import TypedDeleteConfirm from '@/components/parity/TypedDeleteConfirm.vue'
import { useDeleteCheck } from '@/composables/useDeleteCheck'
import { electrodeBatchDeletePhrase, electrodeDeleteBlockers } from '@/utils/electrodeDelete'

const router = useRouter()
const route = useRoute()
const toast = useToast()
const crudTable = ref(null)

// ── Reference data ──
const allBatches = ref([])
const loading = ref(false)

// (top filter-bar removed — column-header overlay filters in CrudTable
// are the single filter source per the design code)

// ── Columns ──
// Header naming convention: avoid duplicating CrudTable's frozen row-
// number column (also "№"). Entity PK columns are renamed to "Партия"
// (with "#42" cell content) so the row-number "№" and the entity PK
// don't read as the same column. Same fix lives on AssemblyPage for
// battery_id.
const columns = [
  // Header rendered via `#header-_constructor` slot (master pill with
  // live count). The string here is the accessibility fallback only.
  { field: '_constructor', header: 'Конструктор', minWidth: '95px',  width: '110px', sortable: false, filterable: false, required: true },
  // Печать moved out of a dedicated column into the right-click context
  // menu (Dima 2026-06-02) — see openBatchPrint + CrudTable @print.
  { field: 'cut_batch_id', header: 'Партия', minWidth: '70px', width: '85px' },
  { field: 'tape_name', header: 'Лента', minWidth: '120px' },
  { field: 'project_name', header: 'Проект', minWidth: '100px' },
  // Header «Тип» (not «Роль») — cathode/anode is the electrode polarity
  // type, not a functional role. Same naming on TapesPage column 'role'
  // (header 'Тип'). The Vue field key still reads `role_display` because
  // the underlying DB column is `tape_role` (Dalia's schema, untouched).
  { field: 'role_display', header: 'Тип', minWidth: '70px', width: '95px' },
  // Test-batch marker — backend column `is_test_batch` (d039). Rendered
  // via `#col-is_test_batch` slot as a small "Тест." badge so users can
  // spot test runs at a glance.
  { field: 'is_test_batch', header: 'Тест.', minWidth: '50px', width: '60px', sortable: true },
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

// ── Computed: enriched data (filtering lives in CrudTable's column
// headers — click a header to open the Excel-style filter overlay).
const tableData = computed(() => {
  return allBatches.value.map(b => {
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

// `batchStatus` removed — replaced by the `progress` numeric column
// + the 3-segment progress-bar slot in the template. The textual
// status was redundant with this visual encoding (see TapesPage's
// 8-segment progress for the same pattern at workflow scale).

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('ru-RU')
}

// ── Create-batch flow ────────────────────────────────────────────────
// Replaces the dedicated /electrodes/new route with one inline modal:
// the dialog gathers all Step-1 fields (tape, cutting params, comments)
// and POSTs in one shot. The new batch lands in the list immediately;
// further editing (electrode masses, drying) is done by clicking the row.
const authStore = useAuthStore()
const allTapes = ref([])
const allUsers = ref([])
const allProjects = ref([])
const createDialogVisible = ref(false)
const createDialogRef = ref(null)

async function loadAllTapes() {
  try {
    const { data } = await api.get('/api/tapes')
    allTapes.value = Array.isArray(data) ? data : []
  } catch (err) {
    console.warn('Не удалось загрузить ленты для диалога создания', err)
  }
}

async function loadAllUsers() {
  try {
    const { data } = await api.get('/api/users')
    allUsers.value = Array.isArray(data) ? data : []
  } catch (err) {
    console.warn('Не удалось загрузить пользователей для селектора Оператор', err)
  }
}

async function loadAllProjects() {
  try {
    const { data } = await api.get('/api/projects')
    allProjects.value = Array.isArray(data) ? data : []
  } catch (err) {
    console.warn('Не удалось загрузить проекты для диалога создания', err)
  }
}

// Seed values for the create dialog (duplicate flow). null → blank.
const createInitialValues = ref(null)

// Make sure the dialog's reference dropdowns (tapes / users / projects)
// are loaded before we open it — shared by create + duplicate.
function ensureDialogRefs() {
  if (allTapes.value.length === 0) loadAllTapes()
  if (allUsers.value.length === 0) loadAllUsers()
  if (allProjects.value.length === 0) loadAllProjects()
}

function createBatch() {
  createInitialValues.value = null
  ensureDialogRefs()
  createDialogVisible.value = true
}

// «Дублировать» — copy the cutting setup (tape + projects + form factor /
// config / shape / dimensions) of a batch into a fresh create dialog.
// The electrodes (masses), foil masses, drying timestamps, business date,
// test flag and comments are NOT copied — the copy is a new physical
// cutting run that reuses the same target geometry.
async function duplicateBatch(row) {
  const id = row?.cut_batch_id
  if (id == null) return
  ensureDialogRefs()
  try {
    const { data: b } = await api.get(`/api/electrodes/electrode-cut-batches/${id}`)
    const projectIds = Array.isArray(b.project_ids)
      ? b.project_ids.filter((v) => v != null)
      : (b.project_id != null ? [b.project_id] : [])
    createInitialValues.value = {
      tapeId: b.tape_id ?? null,
      projectIds,
      formFactor: b.target_form_factor || '',
      configCode: b.target_config_code || '',
      configOther: b.target_config_other || '',
      shape: b.shape || '',
      diameterMm: b.diameter_mm ?? null,
      lengthMm: b.length_mm ?? null,
      widthMm: b.width_mm ?? null,
    }
    createDialogVisible.value = true
  } catch (err) {
    toastApiError(toast, err, 'Не удалось загрузить партию для копирования')
  }
}

// Inline "+ Создать проект" handler — emitted by BatchCreateDialog with
// { payload, resolve, reject }. We POST, prepend the created project so
// the Select picks it up, and resolve with the new record so the dialog
// can auto-select it.
async function onCreateProjectFromDialog({ payload, resolve, reject }) {
  try {
    const { data } = await api.post('/api/projects', payload)
    // /api/projects POST currently returns { project_id } only — reload
    // the full list so name/description/lead_name show up correctly in
    // the description card.
    await loadAllProjects()
    const fresh = allProjects.value.find(p => p.project_id === data.project_id) || data
    toast.add({ severity: 'success', summary: 'Проект создан', detail: fresh.name || `#${data.project_id}`, life: 2500 })
    resolve(fresh)
  } catch (err) {
    toastApiError(toast, err, 'Не удалось создать проект')
    reject(err)
  }
}

async function onCreateDialogSubmit(payload) {
  try {
    const body = {
      ...payload,
      created_by: Number(authStore.user?.userId),
    }
    const { data } = await api.post('/api/electrodes/electrode-cut-batches', body)
    createDialogVisible.value = false
    await loadAllBatches()
    constructorIds.value = [data.cut_batch_id]
    toast.add({
      severity: 'success',
      summary: 'Партия создана',
      detail: `#${data.cut_batch_id}`,
      life: 3000,
    })
  } catch (err) {
    toastApiError(toast, err, 'Не удалось создать партию')
    createDialogRef.value?.resetSubmitting?.()
  }
}

// ── Constructor (same pattern as TapesPage) ──
const constructorIds = ref([])
// Active batch tracking — same pattern as TapesPage `activeTapeId`. The
// inline ElectrodeBatchPanel below the constructor scopes its mass /
// foil / capacity sections to whichever batch column the user clicked
// last in the constructor.
const activeBatchId = ref(null)

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

// ── Guided delete (mirrors Batteries + vanilla 2-electrodes.js) ──
// delete-check preflight → blockers OR typed «DELETE BATCH <id>» → DELETE.
// Per-batch only; the backend enforces the dependency blockers. There is no
// electrode-disposition step — that is battery-specific.
const { check: electrodeDeleteCheck } = useDeleteCheck('electrodes', {
  checkUrl: (id) => `/api/electrodes/electrode-cut-batches/${id}/delete-check`,
})
const deleteFlow = reactive({ visible: false, batch: null, phrase: '', blockers: [], busy: false })

async function onDelete(items) {
  if (!items || items.length === 0) return
  if (items.length > 1) {
    toast.add({
      severity: 'info',
      summary: 'Удаляйте партии по одному',
      detail: 'Управляемое удаление выполняется для одной партии за раз.',
      life: 4000,
    })
    crudTable.value?.clearSelection()
    return
  }
  const batch = items[0]
  const id = batch.cut_batch_id
  try {
    const res = await electrodeDeleteCheck(id)
    deleteFlow.batch = batch
    deleteFlow.phrase = electrodeBatchDeletePhrase(id)
    deleteFlow.blockers = res.canDelete ? [] : electrodeDeleteBlockers(res.dependencies)
    deleteFlow.visible = true
  } catch (err) {
    toastApiError(toast, err, 'Не удалось проверить удаление партии')
    crudTable.value?.clearSelection()
  }
}

async function onDeleteConfirmed() {
  const batch = deleteFlow.batch
  if (!batch || deleteFlow.busy) return
  deleteFlow.busy = true
  const id = batch.cut_batch_id
  try {
    await api.delete(`/api/electrodes/electrode-cut-batches/${id}`)
    deleteFlow.visible = false
    const idx = constructorIds.value.indexOf(id)
    if (idx >= 0) constructorIds.value.splice(idx, 1)
    crudTable.value?.clearSelection()
    await loadAllBatches()
    toast.add({ severity: 'success', summary: 'Партия удалена', detail: `#${id}`, life: 3000 })
  } catch (err) {
    toastApiError(toast, err, 'Не удалось удалить партию')
  } finally {
    deleteFlow.busy = false
  }
}

function onDeleteCancelled() {
  deleteFlow.visible = false
  deleteFlow.batch = null
  crudTable.value?.clearSelection()
}

// ── Deep link: /electrodes/:id ──
onMounted(async () => {
  await loadAllBatches()

  const batchId = Number(route.params.id)
  if (batchId && Number.isInteger(batchId)) {
    constructorIds.value = [batchId]
  }
})
</script>

<template>
  <div class="electrodes-page">
    <PageHeader title="Электроды" icon="pi pi-stop-circle" />

    <!-- Filters live in column headers — click «Тип» / «Проект» / «Лента»
         in the table below to open the Excel-style filter overlay. -->

    <!-- Batch table — always visible -->
    <CrudTable
      ref="crudTable"
      :columns="columns"
      :data="tableData"
      :loading="loading"
      id-field="cut_batch_id"
      table-name="Партии нарезки"
      table-key="electrodes"
      show-add
      show-duplicate
      show-print
      row-clickable
      @add="createBatch"
      @delete="onDelete"
      @duplicate="duplicateBatch"
      @print="(item) => openBatchPrint(item.cut_batch_id)"
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
      <template #col-cut_batch_id="{ data }">
        <span class="batch-id">#{{ data.cut_batch_id }}</span>
      </template>
      <template #col-role_display="{ data }">
        <span :class="['role-badge', data.tape_role === 'cathode' ? 'role-badge--cathode' : 'role-badge--anode']">
          {{ data.role_display }}
        </span>
      </template>
      <template #col-is_test_batch="{ data }">
        <span v-if="data.is_test_batch" class="badge badge-2" title="Тестовая партия — не учитывается в средних">Тест.</span>
        <span v-else class="ep-cell-empty">—</span>
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
      @update:active-tape-id="activeBatchId = $event"
    />

    <!-- Per-batch detail panel — replaces the legacy ElectrodeFormPage.
         Mass list + foil masses + capacity summary scoped to the batch
         the user is currently editing in the constructor. See
         components/ElectrodeBatchPanel.vue header for the rationale. -->
    <ElectrodeBatchPanel
      :batch-id="activeBatchId"
      :constructor-count="constructorIds.length"
    />

    <!-- In-app print preview — replaces window.open(_blank); see
         openBatchPrint() in <script>. -->
    <PrintPreviewDialog
      v-model:visible="printDialog.visible"
      :url="printDialog.url"
      :title="printDialog.title"
    />

    <BatchCreateDialog
      ref="createDialogRef"
      v-model:visible="createDialogVisible"
      :tapes="allTapes"
      :users="allUsers"
      :projects="allProjects"
      :current-user-id="authStore.user?.userId"
      :current-user-name="authStore.user?.name || ''"
      :initial-values="createInitialValues"
      @create="onCreateDialogSubmit"
      @create-project="onCreateProjectFromDialog"
    />

    <!-- Guided delete — delete-check blockers OR typed «DELETE BATCH <id>».
         Mirrors AssemblyPage's battery delete; no electrode-disposition step. -->
    <TypedDeleteConfirm
      :visible="deleteFlow.visible"
      :phrase="deleteFlow.phrase"
      :blockers="deleteFlow.blockers"
      :title="`Удаление партии #${deleteFlow.batch?.cut_batch_id ?? ''}`"
      description="Будут удалены данные партии (нарезка, сушка, массы фольги, связи с проектами). Это действие необратимо."
      @update:visible="(v) => { if (!v) onDeleteCancelled() }"
      @confirmed="onDeleteConfirmed"
      @cancelled="onDeleteCancelled"
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

/* ── Table cells ── */
.batch-id { color: #003274; font-weight: 600; }

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
