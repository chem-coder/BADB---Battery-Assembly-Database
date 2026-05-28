<script setup>
/**
 * TapesPage — "Подготовка лент"
 * Unified view: CrudTable (with constructor checkboxes) + TapeConstructor.
 *
 * The old TapeFormPage is replaced by the inline Constructor.
 * Table has a checkbox column "В конструктор" to add tapes to the Constructor zone.
 */
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'
import { toastApiError } from '@/utils/errorClassifier'
import PageHeader from '@/components/PageHeader.vue'
import SaveIndicator from '@/components/SaveIndicator.vue'
import CrudTable from '@/components/CrudTable.vue'
// StatusBadge removed — status column replaced by project/operator
import TapeConstructor from '@/components/TapeConstructor.vue'
import RecipeActualsEditor from '@/components/RecipeActualsEditor.vue'
import TapeDryBoxPanel from '@/components/TapeDryBoxPanel.vue'
import EntityCreateDialog from '@/components/EntityCreateDialog.vue'
import Checkbox from 'primevue/checkbox'
import { useExportTapes } from '@/composables/useExportTapes'
import { todayIsoMsk } from '@/utils/dateFormat'
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
  { field: 'name',          header: 'Название',   minWidth: '100px' },
  { field: 'project_name',  header: 'Проект',     minWidth: '80px',  width: '115px' },
  { field: 'role',          header: 'Тип',        minWidth: '80px',  width: '115px' },
  { field: 'recipe_name',   header: 'Рецепт',     minWidth: '80px',  width: '115px' },
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
  },
])

function createNewTape() {
  createDialogVisible.value = true
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
  } catch (err) {
    toastApiError(toast, err, 'Не удалось сохранить')
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
      table-key="tapes"
      :export-badge="exportBadge"
      show-add
      row-clickable
      @add="createNewTape"
      @delete="onDelete"
      @export="onExportTapes"
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

      <!-- Custom cell: coating sidedness (audit #11) -->
      <template #col-coating_sidedness="{ data }">
        <span v-if="data.coating_sidedness === 'one_sided'" class="badge badge-5">1-стор.</span>
        <span v-else-if="data.coating_sidedness === 'two_sided'" class="badge badge-6">2-стор.</span>
        <span v-else class="ts-cell-empty">—</span>
      </template>

      <!-- Custom cell: availability status (audit #11, #14) -->
      <template #col-availability_status="{ data }">
        <span v-if="data.availability_status === 'in_dry_box'" class="badge badge-4">В шкафу</span>
        <span v-else-if="data.availability_status === 'out_of_dry_box'" class="badge badge-5">Извлечена</span>
        <span v-else-if="data.availability_status === 'depleted'" class="badge badge-8">Изр.</span>
        <span v-else class="ts-cell-empty">—</span>
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
    <TapeDryBoxPanel :tape-id="activeTapeState?.currentTapeId?.value || null" />

    <EntityCreateDialog
      v-model:visible="createDialogVisible"
      eyebrow="Ленты · Создание"
      title="Новая лента"
      description="Заполните название, проект и рецепт. Лента откроется в конструкторе для редактирования."
      :fields="tapeCreateFields"
      submit-label="Создать ленту"
      @create="onCreateDialogSubmit"
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
</style>
