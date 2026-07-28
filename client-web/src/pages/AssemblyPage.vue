<script setup>
/**
 * AssemblyPage — "Аккумуляторы"
 * Shows ALL batteries with CrudTable + inline TapeConstructor (battery mode).
 * Follows TapesPage / ElectrodesPage pattern.
 */
import { ref, reactive, computed, watch, nextTick, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'
import PageHeader from '@/components/PageHeader.vue'
import CrudTable from '@/components/CrudTable.vue'
import TapeConstructor from '@/components/TapeConstructor.vue'
import BatteryElectrochemEditor from '@/components/BatteryElectrochemEditor.vue'
import EntityCreateDialog from '@/components/EntityCreateDialog.vue'
import TypedDeleteConfirm from '@/components/parity/TypedDeleteConfirm.vue'
import { todayIsoMsk } from '@/utils/dateFormat'
import CapacityHint from '@/components/CapacityHint.vue'
import PrintPreviewDialog from '@/components/PrintPreviewDialog.vue'
import Checkbox from 'primevue/checkbox'
import RadioButton from 'primevue/radiobutton'
import InputText from 'primevue/inputtext'
import { BATTERY_STAGES } from '@/config/batteryStages'
import { useBatteryState } from '@/composables/useBatteryState'
import { useBackendCache } from '@/composables/useBackendCache'
import { useDeleteCheck } from '@/composables/useDeleteCheck'
import { errorMessageRu, toastApiError } from '@/utils/errorClassifier'
import { fmtCapacity } from '@/utils/formatCapacity'
import { BATTERY_OPEN_STATUS_LABEL, isBatteryOpenStatus, batteryStatusCode } from '@/utils/batteryStatus'
import {
  batteryDeletePhrase,
  mapBatteryDeleteCheck,
  batteryDeleteConfirmEnabled,
  buildBatteryDeletePayload,
} from '@/utils/batteryDelete'

const router = useRouter()
const route = useRoute()
const toast = useToast()
const authStore = useAuthStore()
const crudTable = ref(null)
const tapeConstructorRef = ref(null)
const constructorAnchor = ref(null)

// ── Data ──
const batteries = ref([])
const loading = ref(false)

// ── Reference data for constructor dropdowns ──
const refData = reactive({
  projects: [],
  separators: [],
  electrolytes: [],
  // Full tape list from /api/tapes/for-electrodes (vanilla parity):
  // carries role, availability_status (depleted tapes stay listed for
  // saved references) and coating_sidedness. ElectrodeSourcesEditor
  // filters by role per field.
  electrodeTapes: [],
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

  // Tapes for electrode-source selects — the dedicated endpoint (same
  // one vanilla uses) returns role + availability_status +
  // coating_sidedness and keeps depleted tapes that still have cut
  // batches, so saved sources on written-off tapes remain resolvable.
  try {
    const { data: tapes } = await api.get('/api/tapes/for-electrodes')
    refData.electrodeTapes = tapes
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

// Compact labels for the post-assembly selectable statuses (the «Статус»
// column is narrow). The blank/NULL/`disassembled` → «Открыт» normalization
// lives in @/utils/batteryStatus — `draft`/«Черновик» is NOT a battery
// status (docs/rules/battery_lifecycle_rules.md).
const activeStatusLabels = { assembled: 'Собран', testing: 'Тест', completed: 'Готов', failed: 'Брак' }
function batteryStatusLabel(status) {
  if (isBatteryOpenStatus(status)) return BATTERY_OPEN_STATUS_LABEL
  return activeStatusLabels[status] || status || BATTERY_OPEN_STATUS_LABEL
}

// ── Columns ──
const columns = [
  // Header rendered via `#header-_constructor` slot (master pill with
  // live count). The string here is the accessibility fallback only.
  { field: '_constructor', header: 'Конструктор', minWidth: '95px',  width: '110px', sortable: false, filterable: false, required: true },
  // Печать moved out of a dedicated column into the right-click context
  // menu (Dima 2026-06-02) — see openBatteryPrint + CrudTable @print.
  // 'Аккум.' not '№' — CrudTable already shows a frozen row-number
  // column with header '№' on the left, two columns named the same
  // would read as duplicate. Cell renders as '#42' so the header
  // word + '#' prefix together carry the meaning ("Аккум. #42").
  { field: 'battery_id', header: 'Аккум.', minWidth: '70px', width: '85px' },
  // Identification block, kept together directly after the id: chemistry
  // pair + who + when is how a user recognises their own cell while
  // scanning. The id stays first because a same-day series of identical
  // chemistry made by one person is otherwise indistinguishable.
  // audit #15 — backend returns the joined active-material strings; show
  // them as compact columns so the user can scan electrochemistry at a
  // glance without opening the constructor.
  { field: 'cathode_active_materials', header: 'Катод AM', minWidth: '100px', width: '130px', sortable: true },
  { field: 'anode_active_materials',   header: 'Анод AM',  minWidth: '100px', width: '130px', sortable: true },
  { field: 'created_by_name', header: 'Оператор', minWidth: '100px' },
  { field: 'created_at', header: 'Создан', minWidth: '80px', width: '110px' },
  // Grouping / filtering context after the identity block.
  { field: 'project_name', header: 'Проект', minWidth: '120px' },
  { field: 'form_factor', header: 'Форм-фактор', minWidth: '90px', width: '110px' },
  { field: 'status_display', header: 'Статус', minWidth: '80px', width: '100px' },
  { field: 'notes', header: 'Заметки', minWidth: '120px', sortable: false, filterable: false },
]

// ── Computed: enriched data ──
const tableData = computed(() =>
  batteries.value.map(b => ({
    ...b,
    status_display: batteryStatusLabel(b.status),
  }))
)

// ── API ──
async function loadBatteries() {
  loading.value = true
  try {
    const { data } = await api.get('/api/batteries')
    batteries.value = data
  } catch (err) {
    toastApiError(toast, err, 'Не удалось загрузить аккумуляторы')
  } finally {
    loading.value = false
  }
}

// Previously this POSTed { project_id: 1, form_factor: 'coin' }
// blindly — project_id=1 might not exist for every user, and the
// hard-coded form factor pre-committed the user to coin cells before
// they even saw the form. Open a brand-toned create dialog instead so
// both required fields come from an explicit user choice.
const createDialogVisible = ref(false)

// Schema for the shared EntityCreateDialog. Project list comes from
// refData.projects which is filled by loadRefData on mount.
const batteryCreateFields = computed(() => [
  {
    key: 'project_ids',
    label: 'Проекты',
    type: 'multiselect',
    required: true,
    options: refData.projects.map(p => ({ value: p.project_id, label: p.name })),
    placeholder: 'Выберите один или несколько',
  },
  {
    key: 'form_factor',
    label: 'Форм-фактор',
    type: 'select',
    required: true,
    defaultValue: 'coin',
    options: [
      { value: 'coin', label: 'Монеточный' },
      { value: 'pouch', label: 'Пакетный' },
      { value: 'cylindrical', label: 'Цилиндрический' },
    ],
  },
  // Business date (vue-vs-backend-audit-2026-05.md #4). Backend column
  // `item_created_at` (d035) — defaults to today, operator can backdate.
  {
    key: 'item_created_at',
    label: 'Дата создания партии',
    type: 'date',
    required: false,
    defaultValue: todayIsoMsk(),
  },
  // audit #13 — battery_notes was only collected later in the general-info
  // edit. Vanilla collects it up-front; the create dialog now mirrors that.
  {
    key: 'battery_notes',
    label: 'Заметки',
    type: 'text',
    required: false,
    placeholder: 'Краткое описание / цель сборки',
  },
])

// Seed values for the create dialog (duplicate flow). null → blank.
const createInitialValues = ref(null)
const isDuplicating = computed(() => createInitialValues.value !== null)
const dialogEyebrow = computed(() => isDuplicating.value ? 'Аккумуляторы · Дублирование' : 'Аккумуляторы · Создание')
const dialogTitle = computed(() => isDuplicating.value ? 'Копия аккумулятора' : 'Новый аккумулятор')
const dialogDescription = computed(() => isDuplicating.value
  ? 'Проект и форм-фактор скопированы из исходной сборки. Дата — сегодняшняя, состав электродов набирается заново в конструкторе.'
  : 'Выберите проект и форм-фактор. Аккумулятор откроется в конструкторе для редактирования.')
const dialogSubmitLabel = computed(() => isDuplicating.value ? 'Создать копию' : 'Создать')

function createBattery() {
  createInitialValues.value = null
  createDialogVisible.value = true
}

// «Дублировать» — copy the reusable setup (projects + form factor) of a
// battery into a fresh create dialog. The electrode stack, assembly
// timestamps, electrochem data and per-build notes are NOT copied — the
// copy is a new physical cell sharing only its project + form factor.
async function duplicateBattery(row) {
  const id = row?.battery_id
  if (id == null) return
  try {
    const { data: b } = await api.get(`/api/batteries/${id}`)
    const projectIds = Array.isArray(b.project_ids)
      ? b.project_ids.filter((v) => v != null)
      : (b.project_id != null ? [b.project_id] : [])
    createInitialValues.value = {
      project_ids: projectIds,
      form_factor: b.form_factor || 'coin',
      // item_created_at omitted → today; battery_notes omitted → blank.
    }
    createDialogVisible.value = true
  } catch (err) {
    toastApiError(toast, err, 'Не удалось загрузить аккумулятор для копирования')
  }
}

async function onCreateDialogSubmit(payload) {
  try {
    const { data } = await api.post('/api/batteries', payload)
    await loadBatteries()
    constructorIds.value = [data.battery_id]
    createDialogVisible.value = false
    toast.add({
      severity: 'success',
      summary: 'Аккумулятор создан',
      detail: `#${data.battery_id}`,
      life: 3000,
    })
  } catch (err) {
    toastApiError(toast, err, 'Не удалось создать аккумулятор')
    // Leave the dialog open for retry.
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

// Battery print — opens Dalia's /workflow/battery-print.html inside
// a modal Dialog overlay (PrintPreviewDialog) instead of in a new
// tab. Per user feedback: «открытие страницы печати не в отдельной
// странице а в виде доп окна поверх — чтобы не было ощущения
// изолированной системы и потери что за данные я открыл». Same
// pattern as the in-app electrochem PDF preview (commit 352dc03).
// Auth note: her battery-print.js still lacks the Bearer token (works
// in dev via config.authBypass). Production needs the same two-line
// patch precedented by commit 2cca4b4 — pending separate commit.
const printDialog = ref({ visible: false, url: '', title: '' })
function openBatteryPrint(batteryId) {
  if (!batteryId) return
  printDialog.value = {
    visible: true,
    url: `/workflow/battery-print.html?battery_id=${encodeURIComponent(batteryId)}`,
    title: `Печать · Аккумулятор #${batteryId}`,
  }
}

// ── Capacity summary (Dalia's commit 026efbf) ─────────────────────
// Fetched lazily via /api/batteries/:id/assembly when a battery is in
// the constructor. The /assembly endpoint is a heavy read — 9 subqueries
// + a hidden side-effect UPDATE on batteries.status inside
// ensureBatteryAssembledStatus. A lighter /capacity_summary endpoint
// would make the concurrency cap unnecessary; that's tracked in the
// Dalia-PR backlog (drawer_BADB_decisions_3de8b01e).
//
// Migrated from an inline fetch/cache/semaphore (commits 93d9471,
// c24890e era) to useBackendCache (Phase 0.1). Behavior preserved:
// load on toggle-in, invalidate on toggle-out for free retry on
// transient failures. Error classification now flows through the
// shared errorClassifier util.
const capacity = useBackendCache({
  fetchFn: async (batteryId) => {
    const { data } = await api.get(`/api/batteries/${batteryId}/assembly`)
    return data?.capacity_summary || null
  },
  // "Empty" = draft battery, no cathode + no anode. UI shows the "fill
  // recipe masses" hint; classifier picks 'empty' over HTTP-error codes.
  isEmpty: (summary) =>
    !summary || (summary.cathode_count === 0 && summary.anode_count === 0),
  maxConcurrent: 3,
})

// Re-load summaries when constructorIds changes (user opens/closes a
// battery). Getter form `() => [...constructorIds.value]` is critical:
// a deep-watch on the ref directly receives `oldValue === newValue`
// when the array is mutated in-place via splice/push (Vue 3 reuses
// the same reference — no pre-change snapshot). Spreading into a new
// array on each call means the watcher compares two distinct arrays
// and delivers a real `oldIds` we can diff against. Without this, the
// cache-clear block below would be a no-op on every toggle-close
// (the common path: user unchecks a battery from the table).
watch(() => [...constructorIds.value], (ids, oldIds) => {
  const now = new Set(ids)
  for (const old of (oldIds || [])) {
    if (!now.has(old)) capacity.invalidate(old)
  }
  for (const id of ids) {
    if (!capacity.isLoaded(id)) capacity.load(id)
  }
})

// Capacity values use the shared `fmtCapacity` from utils (same 3-decimal
// "X.XXX мАч" format as Dalia's print-report — single source of truth).
// Only `fmtRatio` stays local — it's dimensionless and not in the util.
function fmtRatio(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return n.toFixed(3)
}

// Context 'capacity' is interpreted by errorMessageRu — 'empty' becomes
// "заполните массы…", the other codes get generic auth/server/network
// messages. One line vs the old 10-line inline function.
function capacityErrorMessage(id) {
  return errorMessageRu(capacity.errors.value[id], 'capacity')
}

// Pull cathode/anode tape ids from the constructor's loaded battery
// state for a given battery — used to enrich the capacity-hint
// descriptor so "Открыть катодную ленту" can deep-link to the
// specific tape (`/tapes?select=<id>&stage=recipe_actual`). Returns
// nulls if the state hasn't been loaded yet (race during initial
// render) or if the tape isn't connected — useBatteryState stores
// these as empty strings, NOT null, so a bare `?? null` would leak
// `''` into the URL. Normalize to a numeric id or null.
function hintExtra(batteryId) {
  const ts = tapeConstructorRef.value?.tapeStates?.[String(batteryId)]
  // Electrode sources are multi-row arrays; row 0 is the primary source.
  const c = ts?.steps?.electrodes?.cathodeSources?.[0]?.tape_id
  const a = ts?.steps?.electrodes?.anodeSources?.[0]?.tape_id
  const toId = (v) => {
    const n = Number(v)
    return Number.isInteger(n) && n > 0 ? n : null
  }
  return {
    batteryId,
    cathodeTapeId: toId(c),
    anodeTapeId:   toId(a),
  }
}

// Click handler for CapacityHint's "Перейти" button. Routes the
// click to the right page / constructor stage based on the action
// kind. For battery-stage actions we stay on this page, force the
// constructor open (auto-add to constructorIds if not present),
// switch the constructor's active tab to this battery, and jump to
// the target stage. For tape-recipe actions we router.push to
// /tapes with `?select=<id>&stage=recipe_actual` — TapesPage's
// onMounted picks up those params and opens the matching tape in
// its own constructor.
async function handleHintGo(action) {
  if (!action) return
  if (action.kind === 'open-battery-stage') {
    const id = Number(action.payload?.batteryId)
    if (!Number.isInteger(id)) return
    if (!constructorIds.value.includes(id)) {
      // Auto-open the constructor for this battery (per user request:
      // "так если конструктор не открыт - пусть автоматически
      // откроется!"). Wait two ticks so TapeConstructor instantiates
      // its state before we try to switch the active tab.
      constructorIds.value.push(id)
    }
    await nextTick()
    await nextTick()
    tapeConstructorRef.value?.setActiveTab?.(id)
    if (action.payload?.stage) {
      tapeConstructorRef.value?.setActiveStage?.(action.payload.stage)
    }
    // Scroll to the constructor zone so the user actually sees the
    // stage they were sent to. Smooth so the jump is obvious.
    constructorAnchor.value?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  } else if (action.kind === 'open-tape-recipe') {
    const tapeId = action.payload?.tapeId
    const query = tapeId ? { select: String(tapeId), stage: 'recipe_actual' } : {}
    router.push({ path: '/tapes', query })
  } else if (action.kind === 'open-electrode-batch') {
    const cutBatchId = action.payload?.cutBatchId
    if (cutBatchId) {
      router.push(`/electrodes/${cutBatchId}`)
    } else {
      router.push('/electrodes')
    }
  } else if (action.kind === 'open-materials') {
    router.push('/reference/materials')
  }
}

// ── Electrochem file attachments (G2 — Phase γ) ────────────────────
// Per-battery list of uploaded electrochem files. Same useBackendCache
// pattern as `capacity` above, one fetch per battery-in-constructor.
// No isEmpty — the editor treats "loaded with zero files" as a normal
// "Файлы не прикреплены" state rather than an error, so 'empty' code
// isn't needed.
const electrochemFiles = useBackendCache({
  fetchFn: async (batteryId) => {
    const { data } = await api.get(`/api/batteries/battery_electrochem/${batteryId}`)
    return Array.isArray(data) ? data : []
  },
  maxConcurrent: 3,
})

watch(() => [...constructorIds.value], (ids, oldIds) => {
  const now = new Set(ids)
  for (const old of (oldIds || [])) {
    if (!now.has(old)) electrochemFiles.invalidate(old)
  }
  for (const id of ids) {
    if (!electrochemFiles.isLoaded(id)) electrochemFiles.load(id)
  }
})

// ── Guided delete flow ──────────────────────────────────────────────
// Mirrors vanilla 3-batteries.js (docs/rules/battery_lifecycle_rules.md):
// preflight delete-check → blockers OR (electrode disposition + typed
// `DELETE BATTERY <id>` confirmation). The dialog and its contract logic
// reuse the shared parity primitives (TypedDeleteConfirm, useDeleteCheck)
// and @/utils/batteryDelete so the exact request body is single-sourced.
const { check: runBatteryDeleteCheck } = useDeleteCheck('batteries')
const deleteFlow = reactive({
  visible: false,
  battery: null,
  phrase: '',
  blockers: [],
  ownedData: [],
  linkedElectrodes: [],
  disposition: 'available',
  scrappedReason: '',
  busy: false,
})

// The «Удалить» context-menu action. Guided delete is per-battery (the typed
// phrase and electrode disposition are per record), so a multi-selection is
// declined with a hint rather than silently deleting the wrong thing.
async function onDelete(items) {
  if (!items || items.length === 0) return
  if (items.length > 1) {
    toast.add({
      severity: 'info',
      summary: 'Удаляйте аккумуляторы по одному',
      detail: 'Управляемое удаление выполняется для одного аккумулятора за раз.',
      life: 4000,
    })
    crudTable.value?.clearSelection()
    return
  }
  const battery = items[0]
  const id = battery.battery_id
  try {
    const { raw } = await runBatteryDeleteCheck(id)
    const mapped = mapBatteryDeleteCheck(raw)
    deleteFlow.battery = battery
    deleteFlow.phrase = batteryDeletePhrase(id)
    deleteFlow.blockers = mapped.blockers
    deleteFlow.ownedData = mapped.ownedData
    deleteFlow.linkedElectrodes = mapped.linkedElectrodes
    deleteFlow.disposition = 'available'
    deleteFlow.scrappedReason = ''
    deleteFlow.visible = true
  } catch (err) {
    toastApiError(toast, err, 'Не удалось проверить удаление аккумулятора')
    crudTable.value?.clearSelection()
  }
}

const deleteConfirmEnabled = computed(() =>
  batteryDeleteConfirmEnabled(deleteFlow.linkedElectrodes, deleteFlow.disposition)
)

async function onDeleteConfirmed() {
  const battery = deleteFlow.battery
  if (!battery || deleteFlow.busy) return
  const id = battery.battery_id
  deleteFlow.busy = true
  try {
    const body = buildBatteryDeletePayload({
      batteryId: id,
      linkedElectrodes: deleteFlow.linkedElectrodes,
      disposition: deleteFlow.disposition,
      scrappedReason: deleteFlow.scrappedReason,
    })
    // axios DELETE carries a body via the `data` option.
    await api.delete(`/api/batteries/${id}`, { data: body })
    deleteFlow.visible = false
    // Close the deleted battery in the constructor if it was open.
    const idx = constructorIds.value.indexOf(id)
    if (idx >= 0) constructorIds.value.splice(idx, 1)
    crudTable.value?.clearSelection()
    await loadBatteries()
    toast.add({ severity: 'success', summary: 'Аккумулятор удалён', detail: `#${id}`, life: 3000 })
  } catch (err) {
    // Backend re-runs blockers/electrode checks inside the txn and may 409.
    toastApiError(toast, err, 'Не удалось удалить аккумулятор')
  } finally {
    deleteFlow.busy = false
  }
}

function onDeleteCancelled() {
  deleteFlow.visible = false
  deleteFlow.battery = null
  crudTable.value?.clearSelection()
}

// ── Init ──
onMounted(async () => {
  await Promise.allSettled([loadBatteries(), loadRefData()])
  const batteryId = Number(route.params.id)
  if (batteryId && Number.isInteger(batteryId)) {
    constructorIds.value = [batteryId]
  }
})
</script>

<template>
  <div class="assembly-page">
    <PageHeader title="Аккумуляторы" icon="pi pi-box" />

    <CrudTable
      ref="crudTable"
      :columns="columns"
      :data="tableData"
      :loading="loading"
      id-field="battery_id"
      table-name="Аккумуляторы"
      table-key="assembly"
      show-add
      show-duplicate
      show-print
      row-clickable
      @add="createBattery"
      @delete="onDelete"
      @duplicate="duplicateBattery"
      @print="(item) => openBatteryPrint(item.battery_id)"
      @row-click="(data) => toggleConstructor(data.battery_id)"
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
            :modelValue="isInConstructor(data.battery_id)"
            @update:modelValue="toggleConstructor(data.battery_id)"
            :binary="true"
            v-tooltip.right="'Добавить/убрать из конструктора'"
          />
        </div>
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
        <span :class="['status-badge', `status-badge--${batteryStatusCode(data.status)}`]">
          {{ data.status_display }}
        </span>
      </template>
      <template #col-created_at="{ data }">{{ formatDate(data.created_at) }}</template>
      <template #col-notes="{ data }">
        <span class="notes-text">{{ data.notes || '' }}</span>
      </template>
    </CrudTable>

    <!-- Capacity summary (Dalia's commit 026efbf) — one card per
         battery currently in the constructor. Shows cathode/anode
         capacity (theor + actual), limiting cell capacity, and N/P
         ratio. Computed live on the backend via enrichBatteryElectrodesWithCapacity
         + buildBatteryCapacitySummary. Lets the user see the numbers
         without having to open the print page. -->
    <div v-if="constructorIds.length > 0" class="capacity-panels">
      <div
        v-for="id in constructorIds"
        :key="`cap-${id}`"
        class="capacity-card glass-card"
      >
        <div class="capacity-head">
          <span class="capacity-title">Ёмкость · Аккумулятор #{{ id }}</span>
          <span v-if="capacity.loading.value[id]" class="capacity-loading">
            <i class="pi pi-spin pi-spinner" style="font-size:11px"></i> расчёт…
          </span>
        </div>

        <template v-if="capacity.cache.value[id]">
          <div class="capacity-grid">
            <!-- Vanilla wording scheme (3-batteries.js:3846-3869, 3852-3857):
                 primary line = «Расчётная ёмкость» по фактически введённым
                 массам (NOT a measured post-cycling capacity), secondary
                 line = «по рецепту». Numbers/computations untouched. -->
            <div class="capacity-cell" title="Расчёт по фактически введённым массам электродов. Это не измеренная ёмкость после циклирования.">
              <div class="capacity-label">Катод ({{ capacity.cache.value[id].cathode_count }} шт.)</div>
              <div class="capacity-value">
                <div class="capacity-actual-row">
                  расч. (по факт. массам): <strong>{{ fmtCapacity(capacity.cache.value[id].cathode_capacity_actual_mAh) }}</strong>
                  <CapacityHint
                    v-if="capacity.cache.value[id].cathode_capacity_actual_mAh == null"
                    :summary="capacity.cache.value[id]"
                    context="battery-cathode"
                    :extra="hintExtra(id)"
                    @go="handleHintGo"
                  />
                </div>
                <div class="capacity-secondary">по рецепту: {{ fmtCapacity(capacity.cache.value[id].cathode_capacity_theoretical_mAh) }}</div>
              </div>
            </div>
            <div class="capacity-cell" title="Расчёт по фактически введённым массам электродов. Это не измеренная ёмкость после циклирования.">
              <div class="capacity-label">Анод ({{ capacity.cache.value[id].anode_count }} шт.)</div>
              <div class="capacity-value">
                <div class="capacity-actual-row">
                  расч. (по факт. массам): <strong>{{ fmtCapacity(capacity.cache.value[id].anode_capacity_actual_mAh) }}</strong>
                  <CapacityHint
                    v-if="capacity.cache.value[id].anode_capacity_actual_mAh == null"
                    :summary="capacity.cache.value[id]"
                    context="battery-anode"
                    :extra="hintExtra(id)"
                    @go="handleHintGo"
                  />
                </div>
                <div class="capacity-secondary">по рецепту: {{ fmtCapacity(capacity.cache.value[id].anode_capacity_theoretical_mAh) }}</div>
              </div>
            </div>
            <!-- Vanilla calls this limiting metric «Расчётная ёмкость»
                 (3-batteries.js:3852-3857) with the same tooltip. -->
            <div class="capacity-cell capacity-cell--primary" title="Расчёт по фактически введённым массам электродов. Это не измеренная ёмкость после циклирования.">
              <div class="capacity-label" title="Ограничивающая ёмкость ячейки — min(катод, анод)">Расчётная ёмкость ячейки</div>
              <div class="capacity-value">
                <div class="capacity-actual-row">
                  расч. (по факт. массам): <strong>{{ fmtCapacity(capacity.cache.value[id].limiting_capacity_actual_mAh) }}</strong>
                  <CapacityHint
                    v-if="capacity.cache.value[id].limiting_capacity_actual_mAh == null"
                    :summary="capacity.cache.value[id]"
                    context="battery-np"
                    :extra="hintExtra(id)"
                    @go="handleHintGo"
                  />
                </div>
                <div class="capacity-secondary">по рецепту: {{ fmtCapacity(capacity.cache.value[id].limiting_capacity_theoretical_mAh) }}</div>
              </div>
            </div>
            <!-- N/P tooltip verbatim from vanilla (3-batteries.js:3874). -->
            <div class="capacity-cell" title="N/P по расчётной ёмкости из фактически введённых масс электродов. Вторичная строка — расчётное отношение по рецепту.">
              <div class="capacity-label">N/P соотношение</div>
              <div class="capacity-value">
                <div class="capacity-actual-row">
                  расч. (по факт. массам): <strong>{{ fmtRatio(capacity.cache.value[id].np_actual) }}</strong>
                  <CapacityHint
                    v-if="!Number.isFinite(Number(capacity.cache.value[id].np_actual))"
                    :summary="capacity.cache.value[id]"
                    context="battery-np"
                    :extra="hintExtra(id)"
                    @go="handleHintGo"
                  />
                </div>
                <div class="capacity-secondary">по рецепту: {{ fmtRatio(capacity.cache.value[id].np_theoretical) }}</div>
              </div>
            </div>
          </div>
        </template>
        <template v-else-if="!capacity.loading.value[id]">
          <div
            class="capacity-empty"
            :class="{
              'capacity-empty--auth':    capacity.errors.value[id] === 'auth',
              'capacity-empty--server':  capacity.errors.value[id] === 'server' || capacity.errors.value[id] === 'network',
              'capacity-empty--missing': capacity.errors.value[id] === 'missing',
            }"
          >
            {{ capacityErrorMessage(id) }}
          </div>
        </template>
      </div>
    </div>

    <!-- Constructor — `tapeConstructorRef` exposes setActiveStage /
         setActiveTab so capacity-hint clicks can jump straight to
         «Электроды». `constructorAnchor` is the smooth-scroll target. -->
    <div ref="constructorAnchor">
      <TapeConstructor
        ref="tapeConstructorRef"
        :selectedTapeIds="constructorIds"
        :tapeList="tableData"
        :stageConfigs="BATTERY_STAGES"
        :stateFactory="batteryStateFactory"
        :refs="refData"
        idField="battery_id"
        entityType="battery"
        title="КОНСТРУКТОР АККУМУЛЯТОРОВ"
        emptyHint="Отметьте аккумуляторы в таблице для работы в конструкторе"
      />
    </div>

    <!-- Electrochem file uploads (G2) — one card per battery in the
         constructor. Follows the capacity-panels layout pattern above.
         The editor component manages its own staged upload queue and
         reads the cached file list from the shared useBackendCache
         handle passed via `:cache`. -->
    <div v-if="constructorIds.length > 0" class="electrochem-panels">
      <BatteryElectrochemEditor
        v-for="id in constructorIds"
        :key="`ec-${id}`"
        :batteryId="id"
        :cache="electrochemFiles"
      />
    </div>

    <!-- Print overlay — modal Dialog with the legacy /workflow/battery-print.html
         loaded inside an iframe. Stays mounted but hidden when no print
         is active; iframe `v-if` inside the component unloads the URL
         on close. -->
    <PrintPreviewDialog
      v-model:visible="printDialog.visible"
      :url="printDialog.url"
      :title="printDialog.title"
    />

    <EntityCreateDialog
      v-model:visible="createDialogVisible"
      :eyebrow="dialogEyebrow"
      :title="dialogTitle"
      :description="dialogDescription"
      :fields="batteryCreateFields"
      :initial-values="createInitialValues"
      :submit-label="dialogSubmitLabel"
      @create="onCreateDialogSubmit"
    />

    <!-- Guided battery delete (battery_lifecycle_rules.md). When the
         preflight finds hard blockers, TypedDeleteConfirm shows them and
         hides the confirm button. Otherwise the #extra-fields slot carries
         the owned-data summary and, when electrodes are linked, the
         disposition choice; the typed «DELETE BATTERY <id>» phrase gates
         the actual delete. -->
    <TypedDeleteConfirm
      :visible="deleteFlow.visible"
      :phrase="deleteFlow.phrase"
      :blockers="deleteFlow.blockers"
      :confirm-enabled="deleteConfirmEnabled"
      :title="`Удаление аккумулятора #${deleteFlow.battery?.battery_id ?? ''}`"
      description="Будут удалены только данные, принадлежащие записи аккумулятора. Это действие необратимо."
      @update:visible="(v) => { if (!v) onDeleteCancelled() }"
      @confirmed="onDeleteConfirmed"
      @cancelled="onDeleteCancelled"
    >
      <template #extra-fields>
        <div v-if="deleteFlow.ownedData.length" class="bd-owned">
          <p class="bd-owned-intro">Будут удалены данные аккумулятора:</p>
          <ul>
            <li v-for="(d, i) in deleteFlow.ownedData" :key="i">
              {{ d.label }}<span v-if="d.count"> — {{ d.count }}</span>
            </li>
          </ul>
        </div>

        <div v-if="deleteFlow.linkedElectrodes.length" class="bd-disposition">
          <p class="bd-disposition-intro">
            Связанные электроды: {{ deleteFlow.linkedElectrodes.length }} шт. Выберите, что с ними сделать:
          </p>
          <label class="bd-radio">
            <RadioButton v-model="deleteFlow.disposition" inputId="bd-disp-available" value="available" />
            <span>Вернуть электроды в партию как доступные</span>
          </label>
          <label class="bd-radio">
            <RadioButton v-model="deleteFlow.disposition" inputId="bd-disp-scrapped" value="scrapped" />
            <span>Вернуть электроды в партию как списанные</span>
          </label>
          <div v-if="deleteFlow.disposition === 'scrapped'" class="bd-reason">
            <label for="bd-scrap-reason">Причина списания</label>
            <InputText
              id="bd-scrap-reason"
              v-model="deleteFlow.scrappedReason"
              :placeholder="`возвращен из аккумулятора #${deleteFlow.battery?.battery_id ?? ''} при удалении записи`"
            />
          </div>
        </div>
      </template>
    </TypedDeleteConfirm>
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

/* ── Electrochem panels (G2): one card per battery, stacked
   vertically — same flex-column pattern as .capacity-panels. ── */
.electrochem-panels {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

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
.status-badge--open { background: rgba(107, 114, 128, 0.12); color: #6B7280; }

/* ── Guided-delete dialog (#extra-fields slot) ── */
.bd-owned {
  font-size: 13px;
  color: #4B5563;
}
.bd-owned-intro {
  margin: 0 0 4px;
  font-weight: 500;
}
.bd-owned ul {
  margin: 0;
  padding-left: 20px;
}
.bd-disposition {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 4px;
  border-top: 0.5px solid rgba(0, 50, 116, 0.1);
}
.bd-disposition-intro {
  margin: 0;
  font-size: 14px;
  color: #4B5563;
}
.bd-radio {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  cursor: pointer;
}
.bd-reason {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #4B5563;
}
.bd-reason :deep(.p-inputtext) {
  width: 100%;
}
.status-badge--assembled { background: rgba(0, 50, 116, 0.08); color: #003274; }
.status-badge--testing { background: rgba(211, 167, 84, 0.15); color: #9a7030; }
.status-badge--completed { background: rgba(82, 201, 166, 0.15); color: #1a8a64; }
.status-badge--failed { background: rgba(231, 76, 60, 0.12); color: #c0392b; }
.text-muted { color: rgba(0, 50, 116, 0.28); font-size: 13px; }
.notes-text { font-size: 13px; color: rgba(0, 50, 116, 0.7); }

/* Capacity summary panel — one card per battery currently in the
   constructor. Sits between the table and the TapeConstructor. */
.capacity-panels {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.capacity-card {
  padding: 0.9rem 1.1rem;
}
.capacity-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.6rem;
  padding-bottom: 0.4rem;
  border-bottom: 0.5px solid rgba(0, 50, 116, 0.08);
}
.capacity-title {
  font-size: 13px;
  font-weight: 600;
  color: #003274;
  letter-spacing: 0.01em;
}
.capacity-loading {
  font-size: 11px;
  color: rgba(0, 50, 116, 0.55);
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.capacity-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.75rem;
}
.capacity-cell {
  padding: 0.45rem 0.6rem;
  border: 0.5px solid rgba(0, 50, 116, 0.08);
  border-radius: 6px;
  background: rgba(0, 50, 116, 0.02);
}
.capacity-cell--primary {
  background: rgba(82, 201, 166, 0.06);
  border-color: rgba(82, 201, 166, 0.25);
}
.capacity-label {
  font-size: 11px;
  font-weight: 600;
  color: #6B7280;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-bottom: 4px;
}
.capacity-value {
  font-size: 13px;
  color: #003274;
  font-variant-numeric: tabular-nums;
  line-height: 1.5;
}
.capacity-value strong { font-weight: 600; }
/* Secondary «по рецепту» line — mirrors vanilla's
   .battery-electrode-capacity-secondary (muted, under the primary
   расчётная value). */
.capacity-secondary {
  font-size: 12px;
  color: rgba(0, 50, 116, 0.55);
}
.capacity-actual-row {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.capacity-hint-icon {
  font-size: 12px;
  color: rgba(212, 164, 65, 0.80);
  cursor: help;
}
.capacity-empty {
  font-size: 12px;
  color: rgba(0, 50, 116, 0.55);
  padding: 0.5rem 0;
  font-style: italic;
}
/* Error-specific tinting: auth/server errors are red, missing is muted
   orange, default "empty draft" keeps the subtle blue tone above. */
.capacity-empty--auth,
.capacity-empty--server {
  color: #c0392b;
  font-style: normal;
}
.capacity-empty--missing {
  color: #9a7030;
  font-style: normal;
}
</style>
