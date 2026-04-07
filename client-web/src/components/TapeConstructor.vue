<script setup>
/**
 * TapeConstructor — generic entity constructor zone below CrudTable.
 *
 * Works for tapes (default), electrodes, or any entity with stage-based editing.
 * Pass stageConfigs + stateFactory to customize for different entity types.
 *
 * Features:
 *  - Manages reactive Map of entity state instances
 *  - Tabs: first (leftmost) = target, draggable to reorder
 *  - Yellow tab highlight for dirty (unsaved) entities
 *  - Expose saveAll() for parent SaveIndicator
 *  - Emits 'dirty' when any entity has unsaved changes
 */
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useTapeState } from '@/composables/useTapeState'
import { TAPE_STAGES } from '@/config/tapeStages'
import StageNavigator from '@/components/StageNavigator.vue'
import StageCompareEditor from '@/components/StageCompareEditor.vue'
import Button from 'primevue/button'

const props = defineProps({
  selectedTapeIds: { type: Array, default: () => [] },
  tapeList: { type: Array, default: () => [] },
  refs: { type: Object, default: () => ({}) },
  authStore: { type: Object, default: null },
  // Generic overrides (defaults = tape behavior)
  stageConfigs: { type: Array, default: () => TAPE_STAGES },
  stateFactory: { type: Function, default: null },   // (id, refs, authStore) => state instance
  idField: { type: String, default: 'tape_id' },
  title: { type: String, default: 'КОНСТРУКТОР ЛЕНТ' },
  emptyHint: { type: String, default: 'Отметьте ленты в таблице для работы в конструкторе' },
})

const emit = defineEmits(['dirty', 'remove-tape'])

const toast = useToast()

// ── State ──
const tapeStates = reactive({})
const activeTapeId = ref(null)
const activeStage = ref(props.stageConfigs[0]?.code || 'general_info')
const _loadingCount = ref(0)
const loadingTapes = computed(() => _loadingCount.value > 0)

// Order of tabs (first = target tape)
const tabOrder = ref([])

// Tape names
const tapeNames = computed(() => {
  const map = {}
  for (const tid of Object.keys(tapeStates)) {
    const ts = tapeStates[tid]
    map[tid] = ts?.general?.name || props.tapeList.find(t => t[props.idField] === Number(tid))?.name || `#${tid}`
  }
  return map
})

// Target tape = first in tabOrder
const targetTapeId = computed(() => tabOrder.value[0] || null)

// Active stage config
const activeStageConfig = computed(() =>
  props.stageConfigs.find(s => s.code === activeStage.value) || props.stageConfigs[0]
)

// Any dirty?
const anyDirty = computed(() =>
  Object.values(tapeStates).some(ts => ts.anyDirty?.value)
)

watch(anyDirty, (val) => emit('dirty', val))

// ── Watch selectedTapeIds ──
watch(
  () => props.selectedTapeIds,
  async (newIds, oldIds) => {
    const newSet = new Set(newIds.map(String))

    // Remove deselected
    for (const tid of Object.keys(tapeStates)) {
      if (!newSet.has(tid)) delete tapeStates[tid]
    }
    // Update tabOrder: keep existing order, add new at end
    const existing = tabOrder.value.filter(tid => newSet.has(tid))
    const added = newIds.map(String).filter(tid => !existing.includes(tid))
    tabOrder.value = [...existing, ...added]

    // Load new tapes (parallel)
    await Promise.allSettled(
      newIds
        .filter(id => !tapeStates[String(id)])
        .map(id => loadTape(Number(id)))
    )

    // Set active tape
    if (tabOrder.value.length && (!activeTapeId.value || !newSet.has(String(activeTapeId.value)))) {
      activeTapeId.value = Number(tabOrder.value[0])
    }
    if (!tabOrder.value.length) activeTapeId.value = null
  },
  { immediate: true, deep: true }
)

async function loadTape(id) {
  const tid = String(id)
  _loadingCount.value++
  try {
    const ts = props.stateFactory
      ? props.stateFactory(id, props.refs, props.authStore)
      : useTapeState({ tapeId: id, refs: props.refs, authStore: props.authStore })
    tapeStates[tid] = ts
    await ts.restore()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: `Не удалось загрузить #${id}`, life: 3000 })
    delete tapeStates[tid]
  } finally {
    _loadingCount.value--
  }
}

// ── Save ALL dirty steps across all tapes ──
async function saveAll() {
  let errors = 0
  for (const [tid, ts] of Object.entries(tapeStates)) {
    if (!ts.anyDirty?.value) continue
    for (const code of Object.keys(ts.dirtySteps)) {
      if (!ts.dirtySteps[code]) continue
      try {
        await ts.saveStep(code)
      } catch (e) {
        errors++
      }
    }
  }
  if (errors) {
    toast.add({ severity: 'warn', summary: 'Внимание', detail: `Не удалось сохранить ${errors} шаг(ов)`, life: 3000 })
  }
  return errors === 0
}

// ── Discard all changes ──
function discardAll() {
  // Re-restore all tapes
  for (const [tid, ts] of Object.entries(tapeStates)) {
    if (ts.anyDirty?.value) ts.restore()
  }
}

// ── Undo / Redo on active tape ──
function undo() {
  const ts = activeTapeId.value ? tapeStates[String(activeTapeId.value)] : null
  if (ts?.canUndo?.value) ts.undo()
}

function redo() {
  const ts = activeTapeId.value ? tapeStates[String(activeTapeId.value)] : null
  if (ts?.canRedo?.value) ts.redo()
}

const canUndo = computed(() => {
  const ts = activeTapeId.value ? tapeStates[String(activeTapeId.value)] : null
  return ts?.canUndo?.value === true
})

const canRedo = computed(() => {
  const ts = activeTapeId.value ? tapeStates[String(activeTapeId.value)] : null
  return ts?.canRedo?.value === true
})

// ── Keyboard shortcuts: Ctrl+Z / Ctrl+Y ──
function onKeydown(e) {
  // Don't intercept when user is typing in a text field
  const tag = document.activeElement?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return

  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
    e.preventDefault()
    undo()
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
    e.preventDefault()
    redo()
  } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
    e.preventDefault()
    redo()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  for (const ts of Object.values(tapeStates)) {
    ts.cleanup?.()
  }
})

// Expose for parent
defineExpose({ saveAll, discardAll, tapeStates, anyDirty, undo, redo, canUndo, canRedo })

// ── Tab switching ──
function selectTape(tid) {
  activeTapeId.value = Number(tid)
}

// ── Reorder from table header drag ──
function onReorder(newOrder) {
  tabOrder.value = newOrder
}
</script>

<template>
  <div class="constructor" v-if="tabOrder.length > 0">
    <!-- Main content: sidebar + right panel -->
    <div class="constructor-body">
      <!-- Left sidebar: title + stages -->
      <div class="constructor-sidebar">
        <div class="constructor-title-row">
          <div class="constructor-title">{{ title }}</div>
          <div class="constructor-undo-redo">
            <Button
              icon="pi pi-arrow-left"
              size="small"
              severity="secondary"
              text
              rounded
              :disabled="!canUndo"
              @click="undo"
              title="Отменить (Ctrl+Z)"
              class="ct-ur-btn"
            />
            <Button
              icon="pi pi-arrow-right"
              size="small"
              severity="secondary"
              text
              rounded
              :disabled="!canRedo"
              @click="redo"
              title="Повторить (Ctrl+Y)"
              class="ct-ur-btn"
            />
          </div>
        </div>
        <StageNavigator
          :stages="stageConfigs"
          :activeStage="activeStage"
          :tapeStates="tapeStates"
          :activeTapeId="activeTapeId"
          :tapeNames="tapeNames"
          :refs="refs"
          @update:activeStage="activeStage = $event"
        />
      </div>

      <!-- Right panel: table editor (tape names are column headers) -->
      <div class="constructor-right">
        <div class="constructor-editor">
          <StageCompareEditor
            :stageCode="activeStage"
            :stageConfig="activeStageConfig"
            :tapeStates="tapeStates"
            :targetTapeId="targetTapeId"
            :activeTapeId="activeTapeId"
            :tabOrder="tabOrder.map(String)"
            :tapeNames="tapeNames"
            :refs="refs"
            @reorder="onReorder"
            @select-tape="selectTape"
            @remove-tape="(tid) => emit('remove-tape', tid)"
          />
        </div>
      </div>
    </div>

    <!-- Loading overlay -->
    <div v-if="loadingTapes" class="constructor-loading">
      <i class="pi pi-spin pi-spinner"></i> Загрузка...
    </div>
  </div>

  <!-- Empty state -->
  <div v-else class="constructor-empty">
    <i class="pi pi-info-circle"></i>
    <span>{{ emptyHint }}</span>
  </div>
</template>

<style scoped>
.constructor {
  border: 1px solid rgba(0, 50, 116, 0.12);
  border-radius: 10px;
  background: white;
  overflow: hidden;
  position: relative;
}

/* ── Body: sidebar + right panel ── */
.constructor-body {
  display: flex;
  gap: 0;
  min-height: 400px;
  max-height: 600px;
  overflow: hidden;
}

/* ── Left sidebar ── */
.constructor-sidebar {
  padding: 10px 12px;
  border-right: 1px solid rgba(0, 50, 116, 0.10);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.constructor-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.constructor-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.50);
  padding: 2px 0;
}

.constructor-undo-redo {
  display: flex;
  gap: 1px;
}

.ct-ur-btn {
  width: 26px !important;
  height: 26px !important;
  color: rgba(0, 50, 116, 0.45) !important;
}
.ct-ur-btn:enabled:hover {
  color: #003274 !important;
  background: rgba(0, 50, 116, 0.08) !important;
}
.ct-ur-btn:disabled {
  opacity: 0.2 !important;
}

/* ── Right panel: table editor ── */
.constructor-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

/* ── Editor area ── */
.constructor-editor {
  flex: 1;
  overflow: auto;
}

/* ── Loading ── */
.constructor-loading {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 14px;
  color: rgba(0, 50, 116, 0.6);
  z-index: 10;
}

/* ── Empty ── */
.constructor-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 2rem;
  border: 1px dashed rgba(0, 50, 116, 0.15);
  border-radius: 10px;
  color: rgba(0, 50, 116, 0.4);
  font-size: 14px;
}
.constructor-empty i {
  font-size: 18px;
}
</style>
