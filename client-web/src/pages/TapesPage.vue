<script setup>
/**
 * TapesPage — "Ленты"
 * Unified view: CrudTable (with constructor checkboxes) + TapeConstructor.
 *
 * The old TapeFormPage is replaced by the inline Constructor.
 * Table has a checkbox column "В конструктор" to add tapes to the Constructor zone.
 */
import { ref, reactive, computed, onMounted, nextTick, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'
import { toastApiError } from '@/utils/errorClassifier'
import PageHeader from '@/components/PageHeader.vue'
import CrudTable from '@/components/CrudTable.vue'
// StatusBadge removed — status column replaced by project/operator
import TapeConstructor from '@/components/TapeConstructor.vue'
import RecipeActualsEditor from '@/components/RecipeActualsEditor.vue'
import TapeDryBoxPanel from '@/components/TapeDryBoxPanel.vue'
import RecordFiles from '@/components/parity/RecordFiles.vue'
import EntityCreateDialog from '@/components/EntityCreateDialog.vue'
import PrintPreviewDialog from '@/components/PrintPreviewDialog.vue'
import RecipeQuickCreateDialog from '@/components/RecipeQuickCreateDialog.vue'
import Checkbox from 'primevue/checkbox'
import { useExportTapes } from '@/composables/useExportTapes'
import { todayIsoMsk } from '@/utils/dateFormat'
import TypedDeleteConfirm from '@/components/parity/TypedDeleteConfirm.vue'
import { useDeleteCheck } from '@/composables/useDeleteCheck'
import { tapeDeletePhrase, tapeDeleteBlockers } from '@/utils/tapeDelete'
import { tapePrintUrl } from '@/utils/tapePrint'
// Button removed — undo/redo now in TapeConstructor

const router = useRouter()
const route = useRoute()
const toast = useToast()
const authStore = useAuthStore()
const crudTable = ref(null)
const constructorRef = ref(null)
const recipeActualsAnchor = ref(null)
const { exportTapes: _doExport } = useExportTapes()

// ── Data ───────────────────────────────────────────────────────────────
const tapes = ref([])
const loading = ref(false)

async function loadTapes() {
  loading.value = true
  try {
    const { data } = await api.get('/api/tapes')
    tapes.value = data
  } catch (err) {
    toastApiError(toast, err, 'Не удалось загрузить ленты')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await Promise.allSettled([loadTapes(), loadRefData()])
  // Deep-link: ?select=ID[&stage=CODE] auto-adds the tape to the
  // constructor and (optionally) jumps to a specific stage. Used by
  // AssemblyPage's clickable capacity hints — e.g. when the user
  // clicks "Открыть катодную ленту" we land here with the tape
  // already in the constructor and the «Фактические навески рецепта»
  // panel ready.
  const selectId = Number(route.query?.select)
  if (Number.isInteger(selectId) && selectId > 0) {
    if (!constructorIds.value.includes(selectId)) {
      constructorIds.value.push(selectId)
    }
    const targetStage = String(route.query?.stage || '').trim()
    // Wait two ticks so the constructor has time to instantiate the
    // tape state + render the StageNavigator. We do this even when
    // there's no targetStage so that setActiveTab + the scroll below
    // work against a fully-mounted constructor.
    await nextTick()
    await nextTick()
    constructorRef.value?.setActiveTab?.(selectId)
    if (targetStage) {
      // Note: 'recipe_actual' is not a TAPE_STAGES code (recipe-actuals
      // editing lives in the separate <RecipeActualsEditor> below the
      // constructor). setActiveStage silently ignores unknown codes,
      // and we scroll the actuals editor into view below.
      constructorRef.value?.setActiveStage?.(targetStage)
    }
    // Scroll the recipe-actuals editor into view if the deep-link
    // came from a "Фактические навески" hint. The editor is below the
    // constructor — without this the user would need to scroll
    // manually to find it.
    if (targetStage === 'recipe_actual') {
      recipeActualsAnchor.value?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    }
    // Strip the query so a manual reload doesn't re-trigger.
    router.replace({ path: route.path, query: {} })
  }
})

// ── Column config ──────────────────────────────────────────────────────
// `_constructor` column header is rendered via the
// `#header-_constructor` slot (master toggle button with reactive
// count) — the `header` text here is just a fallback for accessibility
// tools that read column metadata. `tooltip` is unused for this column
// since the slot supplies its own tooltip.
const columns = [
  { field: '_constructor',  header: 'Конструктор', minWidth: '95px',  width: '110px', sortable: false, filterable: false, required: true },
  // The tape's own id — matches «Лента #N» in headers, print reports and
  // delete confirmations, so a row can be identified unambiguously
  // (the leading № column is just the row position in the current view).
  { field: 'tape_id',       header: 'Лента №',    minWidth: '70px',  width: '85px', sortable: true },
  { field: 'name',          header: 'Название',   minWidth: '100px' },
  { field: 'project_name',  header: 'Проект',     minWidth: '80px',  width: '115px' },
  { field: 'role',          header: 'Тип',        minWidth: '80px',  width: '115px' },
  { field: 'recipe_name',   header: 'Рецепт',     minWidth: '80px',  width: '115px' },
  // d047 — the tape's chemistry for the recipe's open active-material
  // slot (tapes.active_material_id → materials.name via the API join).
  { field: 'active_material_name', header: 'Активный материал', minWidth: '90px', width: '130px' },
  // d024 — coating sidedness as a list-visible attribute. Filter via the
  // header overlay (sortable: true keeps the column predictable too).
  { field: 'coating_sidedness', header: 'Стороны', minWidth: '70px', width: '90px', sortable: true },
  // d-series — availability lifecycle. Surfaces dry-box status next to
  // the row so the user can sort/filter "in box" tapes without opening
  // each constructor.
  { field: 'availability_status', header: 'Доступность', minWidth: '95px', width: '110px', sortable: true },
  { field: 'progress',      header: 'Прогресс',   minWidth: '80px',  width: '100px', sortable: true },
  { field: 'operators',     header: 'Оператор',   minWidth: '80px',  width: '115px' },
  { field: 'created_at',    header: 'Создана',    minWidth: '80px',  width: '115px' },
]

// ── Create new tape ──────────────────────────────────────────────────
// tapes.project_id and tapes.tape_recipe_id are NOT NULL on the DB
// schema, so the server returns 500 on a bare { name, created_by }
// POST. Open the create dialog so the user picks both required FKs up
// front; the dialog emits the validated payload and we forward it to
// the API. After success the new tape is auto-added to the constructor
// below so editing continues without an extra click.
const createDialogVisible = ref(false)
const createDialogRef = ref(null)
const recipeQuickCreateVisible = ref(false)

// «+ Новая рецептура…» from inside the tape-create dialog: quick-create
// (with d047-signature duplicate detection) → reload recipes → point the
// dialog's recipe select at the result.
async function onRecipeQuickCreated(recipeId) {
  await loadRefData()
  createDialogRef.value?.setFieldValue('tape_recipe_id', recipeId)
}

// Schema for the shared EntityCreateDialog. Built as a computed so the
// Project/Recipe options stay reactive when refData loads asynchronously
// after page mount.
const tapeCreateFields = computed(() => [
  {
    key: 'name',
    label: 'Название',
    type: 'text',
    defaultValue: `Новая лента ${new Date().toLocaleDateString('ru-RU')}`,
  },
  {
    key: 'project_ids',
    label: 'Проекты',
    type: 'multiselect',
    required: true,
    options: refData.projects.map(p => ({ value: p.project_id, label: p.name })),
    placeholder: 'Выберите один или несколько',
  },
  {
    key: 'tape_recipe_id',
    label: 'Рецепт',
    type: 'select',
    required: true,
    options: refData.recipes.map(r => ({
      value: r.tape_recipe_id,
      label: r.role ? `${r.name} · ${r.role}` : r.name,
    })),
    action: { label: '+ Новая рецептура…', onClick: () => { recipeQuickCreateVisible.value = true } },
  },
  // Business date — separate from audit `created_at`. Backend column
  // `item_created_at` (d035). Defaults to today (MSK) on create; can be
  // backdated by the operator. See vue-vs-backend-audit-2026-05.md #4.
  {
    key: 'item_created_at',
    label: 'Дата создания партии',
    type: 'date',
    required: false,
    defaultValue: todayIsoMsk(),
    // Can be backdated, never future-dated (guard mirrors the
    // constructor's general_info field in tapeStages.js).
    max: todayIsoMsk(),
  },
])

// Seed values for the create dialog. null → blank create (schema
// defaults). Set by duplicateTape() to prefill a copy. Cleared on a
// plain «+ Добавить».
const createInitialValues = ref(null)

// Dialog chrome changes between create and duplicate so the user knows
// they're making a copy, not editing the original.
const isDuplicating = computed(() => createInitialValues.value !== null)
const dialogEyebrow = computed(() => isDuplicating.value ? 'Ленты · Дублирование' : 'Ленты · Создание')
const dialogTitle = computed(() => isDuplicating.value ? 'Копия ленты' : 'Новая лента')
const dialogDescription = computed(() => isDuplicating.value
  ? 'Проект и рецепт скопированы из исходной ленты. Дата — сегодняшняя, параметры процесса заполняются заново в конструкторе.'
  : 'Заполните название, проект и рецепт. Лента откроется в конструкторе для редактирования.')
const dialogSubmitLabel = computed(() => isDuplicating.value ? 'Создать копию' : 'Создать ленту')

function createNewTape() {
  createInitialValues.value = null
  createDialogVisible.value = true
}

// «Дублировать» — open the create dialog pre-filled with a copy of the
// source tape's reusable fields. We copy the RECIPE-level identity
// (projects + recipe) but NOT the per-batch facts: name gets a «(копия)»
// suffix, the business date resets to today, and all process-stage
// timestamps / actual weighings / dry-box state start empty (they're
// not part of the create dialog and belong to the new physical batch).
// Operator/creator come from the JWT on POST, so they're never copied.
async function duplicateTape(row) {
  const id = row?.tape_id
  if (id == null) return
  try {
    // Fetch the full record — the list row doesn't carry project_ids[]
    // or the recipe FK reliably, but GET /api/tapes/:id does.
    const { data: t } = await api.get(`/api/tapes/${id}`)
    const projectIds = Array.isArray(t.project_ids)
      ? t.project_ids.filter((v) => v != null)
      : (t.project_id != null ? [t.project_id] : [])
    createInitialValues.value = {
      name: `${t.name || 'Лента'} (копия)`,
      project_ids: projectIds,
      tape_recipe_id: t.tape_recipe_id || null,
      // item_created_at intentionally omitted → schema default (today).
    }
    createDialogVisible.value = true
  } catch (err) {
    toastApiError(toast, err, 'Не удалось загрузить ленту для копирования')
  }
}

async function onCreateDialogSubmit(payload) {
  try {
    const { data: created } = await api.post('/api/tapes', payload)
    await loadTapes()
    if (created.tape_id) {
      constructorIds.value.push(created.tape_id)
    }
    createDialogVisible.value = false
    toast.add({
      severity: 'success',
      summary: 'Лента создана',
      detail: `#${created.tape_id} · ${created.name || ''}`.trim(),
      life: 3000,
    })
  } catch (err) {
    toastApiError(toast, err, 'Не удалось создать ленту')
    // Leave the dialog open so the user can adjust and retry.
  }
}

// ── Guided delete (mirrors Batteries/Electrodes + vanilla 1-tapes.js) ──
// admin/lead gate → delete-check preflight → blockers OR typed «DELETE TAPE
// <id>» → DELETE. Per-tape only. The backend (requireRole admin/lead) is the
// real gate and enforces the dependency blockers; the UI pre-check just gives
// a friendly message instead of a raw 403.
const { check: tapeDeleteCheck } = useDeleteCheck('tapes')
const deleteFlow = reactive({ visible: false, tape: null, phrase: '', blockers: [], busy: false })

async function onDelete(items) {
  if (!items || items.length === 0) return
  if (!authStore.isLead) {
    toast.add({
      severity: 'warn',
      summary: 'Недостаточно прав',
      detail: 'Удаление ленты доступно администратору или руководителю.',
      life: 4000,
    })
    crudTable.value?.clearSelection()
    return
  }
  if (items.length > 1) {
    toast.add({
      severity: 'info',
      summary: 'Удаляйте ленты по одной',
      detail: 'Управляемое удаление выполняется для одной ленты за раз.',
      life: 4000,
    })
    crudTable.value?.clearSelection()
    return
  }
  const tape = items[0]
  const id = tape.tape_id
  try {
    const res = await tapeDeleteCheck(id)
    deleteFlow.tape = tape
    deleteFlow.phrase = tapeDeletePhrase(id)
    deleteFlow.blockers = res.canDelete ? [] : tapeDeleteBlockers(res.dependencies)
    deleteFlow.visible = true
  } catch (err) {
    toastApiError(toast, err, 'Не удалось проверить удаление ленты')
    crudTable.value?.clearSelection()
  }
}

async function onDeleteConfirmed() {
  const tape = deleteFlow.tape
  if (!tape || deleteFlow.busy) return
  deleteFlow.busy = true
  const id = tape.tape_id
  try {
    await api.delete(`/api/tapes/${id}`)
    deleteFlow.visible = false
    const idx = constructorIds.value.indexOf(id)
    if (idx >= 0) constructorIds.value.splice(idx, 1)
    crudTable.value?.clearSelection()
    await loadTapes()
    toast.add({ severity: 'success', summary: 'Лента удалена', detail: `#${id}`, life: 3000 })
  } catch (err) {
    toastApiError(toast, err, 'Не удалось удалить ленту')
  } finally {
    deleteFlow.busy = false
  }
}

function onDeleteCancelled() {
  deleteFlow.visible = false
  deleteFlow.tape = null
  crudTable.value?.clearSelection()
}

// ── Print report (opens vanilla /workflow/tape-print.html in-app) ──────
// Mirrors ElectrodesPage.openBatchPrint / AssemblyPage.openBatteryPrint.
const printDialog = ref({ visible: false, url: '', title: '' })
function openTapePrint(tapeId) {
  if (!tapeId) return
  printDialog.value = {
    visible: true,
    url: tapePrintUrl(tapeId),
    title: `Печать · Лента #${tapeId}`,
  }
}

// ── Constructor: selected tapes ───────────────────────────────────────
const constructorIds = ref([])
const constructorDirty = ref(false)

// Active tape in the constructor — forwarded via emit from TapeConstructor
// so TapesPage can mount the per-tape RecipeActualsEditor without reaching
// into the constructor's internals. Null when no tape is being edited.
const activeTapeId = ref(null)
const activeTapeState = computed(() => {
  const tid = activeTapeId.value
  if (tid == null) return null
  const states = constructorRef.value?.tapeStates
  return states?.[String(tid)] || null
})

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

function toggleAllConstructor() {
  if (constructorIds.value.length > 0) {
    constructorIds.value.splice(0)
  } else {
    const visible = crudTable.value?.filteredData || tapes.value
    constructorIds.value = visible.map(t => t.tape_id)
  }
}

// ── Export (context menu: selected rows + constructor checkboxes) ─────
const exportBadge = computed(() => {
  const ids = new Set(constructorIds.value)
  const sel = crudTable.value?.selectedRows
  if (sel) for (const id of sel) ids.add(id)
  return ids.size
})

function onExportTapes({ format, items }) {
  const ids = new Set(items.map(t => t.tape_id))
  for (const cid of constructorIds.value) ids.add(cid)
  const exportItems = tapes.value.filter(t => ids.has(t.tape_id))
  if (!exportItems.length) return
  _doExport({ format, items: exportItems })
}

// ── Reference data (shared between all tape states in constructor) ────
// NOTE: plain reactive — NO inner ref() wrappers.
// Vue auto-unwraps refs inside reactive, so .value would silently break.
const refData = reactive({
  users: [],
  projects: [],
  recipes: [],
  // d047 — materials feed the «Активный материал» select in the
  // constructor's general_info stage (rows carry role + family).
  materials: [],
  atmospheres: [],
  dryMixingMethods: [],
  // d048 — rows now also carry auto_min_volume_ml / auto_max_volume_ml
  // (volume → method auto-selection window) + uses_balls /
  // uses_containers capability flags. Stored as returned by the API.
  wetMixingMethods: [],
  // d048 — Vilitek mixing cups for the «Стакан/ёмкость» select in the
  // mixing stage (container_id, name, nominal/max working volume).
  mixingContainers: [],
  foils: [],
  coatingMethods: [],
})

async function loadRefData() {
  const keys = ['users', 'projects', 'recipes', 'materials', 'atmospheres', 'dryMixingMethods', 'wetMixingMethods', 'mixingContainers', 'foils', 'coatingMethods']
  const urls = [
    '/api/users', '/api/projects', '/api/recipes', '/api/materials',
    '/api/reference/drying-atmospheres', '/api/reference/dry-mixing-methods',
    '/api/reference/wet-mixing-methods', '/api/reference/mixing-containers',
    '/api/reference/foils', '/api/reference/coating-methods',
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

    <PageHeader title="Ленты" icon="pi pi-bars" />

    <!-- ── Table (collapsible via max-height) ── -->
    <CrudTable
      ref="crudTable"
      :columns="columns"
      :data="tapes"
      :loading="loading"
      id-field="tape_id"
      table-name="Ленты"
      table-key="tapes"
      :export-badge="exportBadge"
      show-add
      show-duplicate
      show-print
      row-clickable
      @add="createNewTape"
      @delete="onDelete"
      @export="onExportTapes"
      @duplicate="duplicateTape"
      @print="(item) => openTapePrint(item.tape_id)"
      @header-click="(field) => field === '_constructor' && toggleAllConstructor()"
      @row-click="(data) => toggleConstructor(data.tape_id)"
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
            :modelValue="isInConstructor(data.tape_id)"
            @update:modelValue="toggleConstructor(data.tape_id)"
            :binary="true"
            v-tooltip.right="'Добавить/убрать из конструктора'"
          />
        </div>
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

      <!-- Custom cell: Активный материал (d047) -->
      <template #col-active_material_name="{ data }">
        <span>{{ data.active_material_name || '' }}</span>
      </template>

      <!-- Custom cell: coating sidedness (audit #11) -->
      <template #col-coating_sidedness="{ data }">
        <span v-if="data.coating_sidedness === 'one_sided'" class="badge badge-5">1-стор.</span>
        <span v-else-if="data.coating_sidedness === 'two_sided'" class="badge badge-6">2-стор.</span>
        <span v-else class="ts-cell-empty">—</span>
      </template>

      <!-- Custom cell: availability (P2 2026-07-30 — closet tracking
           retired; the only meaningful split is активна/израсходована.
           Legacy in_dry_box/out_of_dry_box values display as «активна»). -->
      <template #col-availability_status="{ data }">
        <span v-if="data.availability_status === 'depleted'" class="badge badge-8">Изр.</span>
        <span v-else class="badge badge-4">Активна</span>
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
      @update:active-tape-id="activeTapeId = $event"
    />

    <!-- ── Recipe actuals editor (for the active tape in the constructor) ── -->
    <!-- Always rendered; the editor itself handles the "no tape selected"
         state with an inline notice, so the user always sees where it would
         appear rather than the section jumping in and out.
         `recipeActualsAnchor` is the smooth-scroll target used by the
         AssemblyPage capacity-hint deep-link (/tapes?select=ID) so the
         user lands directly on the masses table they came here to fill. -->
    <div ref="recipeActualsAnchor">
      <RecipeActualsEditor :tapeState="activeTapeState" />
    </div>

    <!-- Tape dry-box panel — surfaces the 6 backend endpoints
         (place-now / return-now / remove-now / deplete + GET/PUT
         /dry-box-state) that previously had no Vue UI. Mirrors the
         vanilla v1 panel from public/js/1-tapes.js:1793-1855. See
         vue-vs-backend-audit-2026-05.md #6. Mounted only when a tape
         is active in the constructor so the panel scopes to one tape
         at a time. -->
    <TapeDryBoxPanel
      :tape-id="activeTapeState?.currentTapeId?.value || null"
      :tape-state="activeTapeState"
    />

    <!-- Файлы ленты (d053): «Акт сборки», Excel и прочие документы,
         привязанные к активной ленте конструктора. -->
    <div v-if="activeTapeState?.currentTapeId?.value" class="glass-card tape-files-card">
      <h3 class="tape-files-title">Файлы ленты #{{ activeTapeState.currentTapeId.value }}</h3>
      <RecordFiles
        entity-type="tapes"
        :record-id="activeTapeState.currentTapeId.value"
        file-id-field="tape_file_id"
      />
    </div>

    <EntityCreateDialog
      ref="createDialogRef"
      v-model:visible="createDialogVisible"
      :eyebrow="dialogEyebrow"
      :title="dialogTitle"
      :description="dialogDescription"
      :fields="tapeCreateFields"
      :initial-values="createInitialValues"
      :submit-label="dialogSubmitLabel"
      @create="onCreateDialogSubmit"
    />

    <!-- Guided delete — admin/lead only; delete-check blockers OR typed
         «DELETE TAPE <id>». Mirrors Electrodes/Batteries. -->
    <TypedDeleteConfirm
      :visible="deleteFlow.visible"
      :phrase="deleteFlow.phrase"
      :blockers="deleteFlow.blockers"
      :title="`Удаление ленты #${deleteFlow.tape?.tape_id ?? ''}`"
      description="Будут удалены данные ленты и связанные шаги процесса. Это действие необратимо."
      @update:visible="(v) => { if (!v) onDeleteCancelled() }"
      @confirmed="onDeleteConfirmed"
      @cancelled="onDeleteCancelled"
    />

    <!-- Tape print report (vanilla /workflow/tape-print.html) opened in-app. -->
    <RecipeQuickCreateDialog
      v-model:visible="recipeQuickCreateVisible"
      :materials="refData.materials || []"
      @created="onRecipeQuickCreated"
    />

    <PrintPreviewDialog
      v-model:visible="printDialog.visible"
      :url="printDialog.url"
      :title="printDialog.title"
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
.ts-cell-empty { color: #6B7280; font-size: 12px; }
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
.constructor-toggle-header {
  cursor: pointer;
  opacity: 0.4;
  transition: opacity 0.15s;
  user-select: none;
}
.constructor-toggle-header--active {
  opacity: 1;
}
.constructor-toggle-header:hover {
  opacity: 0.7;
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
  background: #52C9A6;
}

.text-muted {
  color: rgba(0, 50, 116, 0.28);
  font-size: 13px;
}
.tape-files-card {
  margin-top: 16px;
  padding: 16px 20px;
}
.tape-files-title {
  margin: 0 0 10px;
  font-size: 15px;
  color: #003274;
}
</style>
