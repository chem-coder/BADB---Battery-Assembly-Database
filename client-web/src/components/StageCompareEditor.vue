<script setup>
/**
 * StageCompareEditor — table-based layout for the Tape Constructor.
 *
 * Proper HTML table: field labels as row headers, tape columns with inputs.
 * Column headers show tape names (first = target).
 * Draggable column headers for reordering tapes with smooth animation.
 * Per-field green/grey left border on cells.
 * Copy arrows on source columns — copies current stage only.
 */
import { ref, reactive, computed, watch, nextTick, onMounted } from 'vue'
import AutoComplete from 'primevue/autocomplete'
import DSMultiSelect from '@/components/ds/DSMultiSelect.vue'
import Checkbox from 'primevue/checkbox'
import EntityMeta from '@/components/EntityMeta.vue'
import DateTimeWithNow from '@/components/parity/DateTimeWithNow.vue'
import SequentialDateField from '@/components/parity/SequentialDateField.vue'
import DateInputISO from '@/components/parity/DateInputISO.vue'
import { useNotify } from '@/composables/useNotify'
import { useAuthStore } from '@/stores/auth'

const notify = useNotify()

const props = defineProps({
  stageCode: { type: String, required: true },
  stageConfig: { type: Object, required: true },
  tapeStates: { type: Object, default: () => ({}) },
  targetTapeId: { type: [Number, String], default: null },
  activeTapeId: { type: [Number, String], default: null },
  tabOrder: { type: Array, default: () => [] },
  tapeNames: { type: Object, default: () => ({}) },
  refs: { type: Object, default: () => ({}) },
  // All stage configs (TAPE_STAGES). Used by `sequential-datetime`
  // fields to look up the label of `field.prevStageCode` for the
  // validation message — keeps the editor decoupled from the tape-
  // specific stage list while letting it format human-readable hints.
  allStages: { type: Array, default: () => [] },
})

const emit = defineEmits(['reorder', 'select-tape', 'remove-tape'])

const fields = computed(() => props.stageConfig?.fields || [])

// ── Cross-stage field visibility by form factor ──
// Fields in the stage config may carry `showIfFormFactor: 'coin'|'pouch'|...`
// (single value or array) to indicate they should only render when at least
// one tape in the current view has a matching form factor in its general
// stage. Battery uses `general.form_factor`; electrode uses
// `general.target_form_factor` (both exposed by their state composables).
// If NO tape has a form factor set, we fall back to showing ALL fields
// so a brand-new entity still gets a full editor.
const activeFormFactors = computed(() => {
  const factors = new Set()
  for (const tid of props.tabOrder) {
    const ts = props.tapeStates[String(tid)]
    const ff = ts?.general?.form_factor ?? ts?.general?.target_form_factor
    if (ff) factors.add(ff)
  }
  return factors
})

const visibleFields = computed(() => {
  if (activeFormFactors.value.size === 0) return fields.value
  return fields.value.filter(field => {
    if (!field.showIfFormFactor) return true
    const allowed = Array.isArray(field.showIfFormFactor)
      ? field.showIfFormFactor
      : [field.showIfFormFactor]
    return allowed.some(ff => activeFormFactors.value.has(ff))
  })
})

const sourceTapeIds = computed(() => props.tabOrder.filter(tid => String(tid) !== String(props.targetTapeId)))

function isActiveTape(tid) {
  return String(tid) === String(props.activeTapeId)
}

function onTapeHeaderClick(tid) {
  emit('select-tape', Number(tid))
}

// Default ref → id/name mappings (backward compat for tapeStages that don't have refConfig)
const _defaultIdFields = {
  users: 'user_id', projects: 'project_id', recipes: 'tape_recipe_id',
  atmospheres: 'code', dryMixingMethods: 'dry_mixing_id',
  wetMixingMethods: 'wet_mixing_id', foils: 'foil_id', coatingMethods: 'coating_id',
  separators: 'sep_id', electrolytes: 'electrolyte_id', tapes: 'tape_id',
  cathodeTapes: 'tape_id', anodeTapes: 'tape_id',
  electrodeBatches: 'cut_batch_id',
}
const _defaultNameFields = {
  users: 'name', projects: 'name', recipes: 'name',
  atmospheres: 'display', dryMixingMethods: 'description',
  wetMixingMethods: 'description', foils: 'type', coatingMethods: 'comments',
  separators: 'name', electrolytes: 'name', tapes: 'name',
  cathodeTapes: 'name', anodeTapes: 'name',
  electrodeBatches: 'cut_batch_id',
}

function getRefOptions(field, tapeId = null) {
  // Cascade: dependsOn + optionsByDep → filter options by parent field value
  if (field.dependsOn && field.optionsByDep && tapeId != null) {
    const parentVal = getValue(tapeId, field.dependsOn)
    if (parentVal && field.optionsByDep[parentVal]) {
      return field.optionsByDep[parentVal].map(o => ({ value: o.value, label: o.label }))
    }
    // No parent selected → fallback options (flat list) or empty
    if (field.fallbackOptions) return field.fallbackOptions.map(o => ({ value: o.value, label: o.label }))
    return []
  }
  if (field.options) return field.options.map(o => ({ value: o.value, label: o.label }))
  if (field.ref && props.refs[field.ref]?.length) {
    const items = props.refs[field.ref]
    const idKey = field.refConfig?.idField || _defaultIdFields[field.ref] || 'id'
    const nameKey = field.refConfig?.nameField || _defaultNameFields[field.ref] || 'name'
    return items.map(i => ({ value: i[idKey], label: i[nameKey] || `#${i[idKey]}` }))
  }
  return []
}

function getValue(tapeId, fieldKey) {
  const ts = props.tapeStates[String(tapeId)]
  return ts ? ts.getFieldValue(props.stageCode, fieldKey) : ''
}

function setValue(tapeId, fieldKey, value) {
  const ts = props.tapeStates[String(tapeId)]
  if (ts) ts.setFieldValue(props.stageCode, fieldKey, value)
}

// Get the tape ID immediately to the left of the given tape in tabOrder
function leftNeighbor(tid) {
  const idx = props.tabOrder.indexOf(String(tid))
  return idx > 0 ? props.tabOrder[idx - 1] : null
}

// Find a field config in the active stage by key. Used when copy/has-data
// helpers need to introspect a composite field's backing keys (e.g.
// `datetime-with-now` / `sequential-datetime` carry `dateKey` + `timeKey`
// rather than their own scalar value).
function findField(fieldKey) {
  return (props.stageConfig?.fields || []).find(f => f.key === fieldKey)
}

// ── Sequential-datetime helpers ──
//
// `sequential-datetime` fields know the *previous* stage in the workflow
// via `field.prevStageCode`. The editor reads that stage's date+time
// from the tape's full state (kept in `tapeStates[tid].steps`) so the
// underlying SequentialDateField can validate "not earlier than prev"
// and (optionally) cascade values forward.
function getPrevDateTime(tapeId, prevStageCode) {
  if (!prevStageCode) return null
  const ts = props.tapeStates[String(tapeId)]
  const step = ts?.steps?.[prevStageCode]
  if (!step) return null
  // Empty strings are treated as "no value" by SequentialDateField's
  // own parser; pass them through faithfully so cascade doesn't fire on
  // partially-filled prev stages.
  return { date: step.date || '', time: step.time || '' }
}

function getPrevStageLabel(prevStageCode) {
  if (!prevStageCode) return ''
  return (props.allStages || []).find(s => s.code === prevStageCode)?.label || ''
}

// ── datetime-iso helpers ──
//
// `type: 'datetime-iso'` fields back onto a SINGLE column holding an
// ISO string like "2026-05-27T14:30:00" (electrode drying start/end).
// The primitive expects two strings (date + time), so we split on read
// and combine on write. An empty (or partial) write erases the field.
function isoToDateStr(iso) {
  if (!iso) return ''
  const m = String(iso).match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : ''
}
function isoToTimeStr(iso) {
  if (!iso) return ''
  const m = String(iso).match(/T(\d{2}:\d{2})/)
  return m ? m[1] : ''
}
function combineToIso(date, time) {
  if (!date) return ''      // time without date is undefined; clear field
  return `${date}T${time || '00:00'}:00`
}
function onIsoDateUpdate(tapeId, fieldKey, newDate) {
  const cur = getValue(tapeId, fieldKey)
  setValue(tapeId, fieldKey, combineToIso(newDate, isoToTimeStr(cur)))
}
function onIsoTimeUpdate(tapeId, fieldKey, newTime) {
  const cur = getValue(tapeId, fieldKey)
  setValue(tapeId, fieldKey, combineToIso(isoToDateStr(cur), newTime))
}

// ── Collapsible field groups ──
//
// Schema entries with `isGroupSeparator: true` introduce a group; all
// subsequent entries that carry `group: <name>` belong to that group
// until the next separator. The collapsed state for each group key is
// persisted per user in a single localStorage entry, mirroring the
// `useUserPref` pattern but flattened so we don't have to instantiate
// dozens of refs at setup time (groups can be added schema-side without
// the editor knowing about them up front).
const authStore = useAuthStore()
const groupCollapsed = ref({})

function groupsStorageKey() {
  const uid = authStore.user?.userId || 'guest'
  return `badb:pref:stage-groups:${uid}`
}

function loadGroupStates() {
  try {
    const raw = localStorage.getItem(groupsStorageKey())
    groupCollapsed.value = raw ? JSON.parse(raw) : {}
  } catch {
    groupCollapsed.value = {}
  }
}

function saveGroupStates() {
  try {
    localStorage.setItem(groupsStorageKey(), JSON.stringify(groupCollapsed.value))
  } catch {
    // quota / disabled — silent, in-memory state still works for the session
  }
}

onMounted(loadGroupStates)
watch(groupCollapsed, saveGroupStates, { deep: true })
watch(() => authStore.user?.userId, loadGroupStates)

function isGroupCollapsed(persistKey) {
  return !!groupCollapsed.value[persistKey]
}

function toggleGroup(persistKey) {
  if (!persistKey) return
  groupCollapsed.value = {
    ...groupCollapsed.value,
    [persistKey]: !groupCollapsed.value[persistKey],
  }
}

/**
 * A field belongs to a collapsed group when its `group` matches the
 * `group` of an upstream separator whose `persistKey` is collapsed.
 * Returns true when the field should be HIDDEN.
 */
function isFieldInCollapsedGroup(field, allFields, idx) {
  if (field.isGroupSeparator) return false
  if (!field.group) return false
  // Find the nearest preceding separator for this group.
  for (let i = idx - 1; i >= 0; i -= 1) {
    const f = allFields[i]
    if (f.isGroupSeparator && f.group === field.group) {
      return isGroupCollapsed(f.persistKey)
    }
  }
  return false
}

function copyField(sourceTapeId, fieldKey, destTapeId) {
  const dest = destTapeId || leftNeighbor(sourceTapeId)
  if (!dest) return
  const field = findField(fieldKey)
  if (field?.type === 'datetime-with-now' || field?.type === 'sequential-datetime') {
    // Composite field: copy both backing keys atomically.
    const dKey = field.dateKey || 'date'
    const tKey = field.timeKey || 'time'
    setValue(dest, dKey, getValue(sourceTapeId, dKey))
    setValue(dest, tKey, getValue(sourceTapeId, tKey))
  } else {
    const val = getValue(sourceTapeId, fieldKey)
    // Deep-copy arrays so the dest tape gets its own multiselect state —
    // a shared reference would mutate the source on next user edit.
    setValue(dest, fieldKey, Array.isArray(val) ? [...val] : val)
  }
  // Sync local AC models for destination tape — re-sync all currently visible
  // select fields because cascades (e.g. form_factor → config_code) may clear
  // other fields. Hidden (form-factor-filtered) fields are not touched — they
  // belong to a different form factor and would just add noise.
  for (const f of visibleFields.value) {
    if (f.type === 'select') {
      acModels[acKey(String(dest), f.key)] = resolveAcOption(dest, f)
    }
  }
  // Move focus to the destination tape so the constructor's undo/redo
  // arrows (bound to activeTapeId) operate on the entity that was just
  // modified. Without this the user sees the arrows stay disabled even
  // though the copy DID push a snapshot onto the destination's
  // undoStack — that snapshot is on a different tape than the one in
  // focus, so the visible Undo button has nothing to do.
  if (String(dest) !== String(props.activeTapeId)) {
    emit('select-tape', Number(dest))
  }
}

// Copy all fields of the CURRENT stage only (not all stages). Only visible
// fields are copied — a pouch tape should not receive coin_size_code etc.
//
// Hard guard: build the allowed keys from props.stageConfig.fields and skip
// anything not in that set. visibleFields already filters by form factor,
// but the explicit Set defends against future refactors that might
// broaden the visible scope or leak fields from other stages.
function copyAllCurrentStage(sourceTapeId) {
  const stageKeys = new Set((props.stageConfig?.fields || []).map(f => f.key))
  let copied = 0
  for (const f of visibleFields.value) {
    if (!stageKeys.has(f.key)) continue
    copyField(sourceTapeId, f.key)
    copied += 1
  }
  const destId = leftNeighbor(sourceTapeId)
  const destName = destId != null ? (props.tapeNames[String(destId)] || `#${destId}`) : '—'
  const stageLabel = props.stageConfig?.label || ''
  notify.success(
    `Скопировано ${copied} полей этапа «${stageLabel}»`,
    `→ ${destName}`
  )
}

function onSetNow(tapeId) {
  const ts = props.tapeStates[String(tapeId)]
  if (ts) ts.setNow(props.stageCode)
}

function fieldHasData(tapeId, fieldKey) {
  const field = findField(fieldKey)
  if (field?.type === 'datetime-with-now' || field?.type === 'sequential-datetime') {
    // Composite field is "filled" when either backing key has a value.
    const d = getValue(tapeId, field.dateKey || 'date')
    const t = getValue(tapeId, field.timeKey || 'time')
    return (d !== '' && d != null) || (t !== '' && t != null)
  }
  const v = getValue(tapeId, fieldKey)
  // Empty array (multiselect with no choice) is "no data".
  if (Array.isArray(v)) return v.length > 0
  return v !== '' && v !== null && v !== undefined
}

// ── Copy to ALL tapes to the left ──
function copyFieldToAllLeft(sourceTapeId, fieldKey) {
  const idx = props.tabOrder.indexOf(String(sourceTapeId))
  if (idx <= 0) return
  for (let i = 0; i < idx; i++) {
    copyField(sourceTapeId, fieldKey, props.tabOrder[i])
  }
}

function copyAllCurrentStageToAllLeft(sourceTapeId) {
  const idx = props.tabOrder.indexOf(String(sourceTapeId))
  if (idx <= 0) return
  // Same hard-scope guard as copyAllCurrentStage — explicit allow-list from
  // the active stage config so cross-stage leak is structurally impossible.
  const stageKeys = new Set((props.stageConfig?.fields || []).map(f => f.key))
  let perTapeCopied = 0
  for (const f of visibleFields.value) {
    if (!stageKeys.has(f.key)) continue
    perTapeCopied += 1
    for (let i = 0; i < idx; i++) {
      copyField(sourceTapeId, f.key, props.tabOrder[i])
    }
  }
  const stageLabel = props.stageConfig?.label || ''
  notify.success(
    `Скопировано ${perTapeCopied} полей этапа «${stageLabel}»`,
    `→ во все ${idx} записей слева`
  )
}

// ── Context menu state ──
const ctxMenu = ref({ show: false, x: 0, y: 0, action: null, tid: null, fieldKey: null })

function onCopyBtnContext(e, tid, fieldKey) {
  e.preventDefault()
  ctxMenu.value = { show: true, x: e.clientX, y: e.clientY, action: 'field', tid, fieldKey }
  document.addEventListener('click', closeCtxMenu, { once: true })
}

function onCopyAllBtnContext(e, tid) {
  e.preventDefault()
  ctxMenu.value = { show: true, x: e.clientX, y: e.clientY, action: 'all', tid, fieldKey: null }
  document.addEventListener('click', closeCtxMenu, { once: true })
}

function closeCtxMenu() {
  ctxMenu.value.show = false
}

function execCtxMenu() {
  const { action, tid, fieldKey } = ctxMenu.value
  if (action === 'field') copyFieldToAllLeft(tid, fieldKey)
  else if (action === 'all') copyAllCurrentStageToAllLeft(tid)
  ctxMenu.value.show = false
}

// ── AutoComplete adapter for select fields (DS pattern) ──
// Local models allow free typing without revert (v-model two-way binding)
const acModels = reactive({})
const acSuggestions = ref({})

function acKey(tid, fieldKey) {
  return `${tid}__${fieldKey}`
}

// Resolve stored value → option object {value, label}
function resolveAcOption(tapeId, field) {
  const val = getValue(tapeId, field.key)
  if (!val && val !== 0) return null
  const opts = getRefOptions(field, tapeId)
  return opts.find(o => String(o.value) === String(val)) || null
}

// Sync local models from tape state (on stage/tab navigation)
function syncAcModels() {
  for (const tid of props.tabOrder) {
    for (const f of fields.value) {
      if (f.type === 'select') {
        acModels[acKey(tid, f.key)] = resolveAcOption(tid, f)
      }
    }
  }
}

watch([() => props.stageCode, () => props.tabOrder], syncAcModels, { immediate: true, deep: true })

function searchAc(tapeId, field, event) {
  const query = (event.query || '').toLowerCase()
  const opts = getRefOptions(field, tapeId)
  acSuggestions.value[acKey(tapeId, field.key)] = opts.filter(o => o.label.toLowerCase().includes(query))
}

function onAcItemSelect(tapeId, field, e) {
  // Commit selected option to tape state
  if (e.value && typeof e.value === 'object') {
    setValue(tapeId, field.key, e.value.value)
  }
  // Re-sync AC models for all select fields on this tape — cascade (e.g.
  // target_form_factor → target_config_code clear) may have invalidated others.
  for (const f of fields.value) {
    if (f.type === 'select' && f.key !== field.key) {
      acModels[acKey(String(tapeId), f.key)] = resolveAcOption(tapeId, f)
    }
  }
  // Blur input after selection (DS pattern — use component ref, not event target)
  setTimeout(() => {
    const comp = acRefs[acKey(tapeId, field.key)]
    comp?.$el?.querySelector('input')?.blur()
  }, 50)
}

function clearAcValue(tapeId, field) {
  setValue(tapeId, field.key, '')
  acModels[acKey(tapeId, field.key)] = null
}

// ── Template refs for AutoComplete instances ──
const acRefs = {}
function setAcRef(tid, fieldKey, el) {
  const key = acKey(tid, fieldKey)
  if (el) acRefs[key] = el; else delete acRefs[key]
}

// PrimeVue hardcodes hide() when query becomes empty (line 459-461 in AutoComplete.vue).
// @clear fires right after — re-show dropdown with all options.
function onAcClear(tid, field) {
  acSuggestions.value[acKey(tid, field.key)] = getRefOptions(field, tid)
  nextTick(() => {
    const comp = acRefs[acKey(tid, field.key)]
    if (comp?.show) comp.show()
  })
}

// ── Drag-and-drop column headers with visual feedback ──
const dragColIdx = ref(null)
const dropTargetColIdx = ref(null)

function onColDragStart(idx, e) {
  dragColIdx.value = idx
  e.dataTransfer.effectAllowed = 'move'
  // Set drag image with slight transparency
  if (e.target) {
    e.target.style.opacity = '0.4'
  }
}

function onColDragOver(idx, e) {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  if (dragColIdx.value !== null && dragColIdx.value !== idx) {
    dropTargetColIdx.value = idx
  }
}

function onColDragLeave(e) {
  // Only clear if we actually left the element (not entering a child)
  const related = e.relatedTarget
  if (!e.currentTarget.contains(related)) {
    dropTargetColIdx.value = null
  }
}

function onColDrop(idx, e) {
  e.preventDefault()
  dropTargetColIdx.value = null
  if (dragColIdx.value === null || dragColIdx.value === idx) return
  const arr = [...props.tabOrder]
  const [moved] = arr.splice(dragColIdx.value, 1)
  arr.splice(idx, 0, moved)
  emit('reorder', arr)
  dragColIdx.value = null
}

function onColDragEnd(e) {
  if (e.target) e.target.style.opacity = ''
  dragColIdx.value = null
  dropTargetColIdx.value = null
}
</script>

<template>
  <div class="compare-editor">
    <table class="ce-table" :class="{ 'ce-table--general': stageCode === 'general_info' }">
      <thead>
        <tr>
          <th class="ce-th-label">{{ stageConfig.label }}</th>
          <!-- All tape column headers from tabOrder -->
          <th
            v-for="(tid, i) in tabOrder"
            :key="tid"
            class="ce-th-tape"
            :class="{
              'ce-th-tape--active': isActiveTape(tid),
              'ce-th-tape--source': i > 0,
              'ce-th-tape--drop': dropTargetColIdx === i && dragColIdx !== null && dragColIdx !== i,
              'ce-th-tape--dragging': dragColIdx === i,
            }"
            draggable="true"
            @click="onTapeHeaderClick(tid)"
            @dragstart="onColDragStart(i, $event)"
            @dragover="onColDragOver(i, $event)"
            @dragleave="onColDragLeave"
            @drop="onColDrop(i, $event)"
            @dragend="onColDragEnd"
          >
            <div class="th-tape-top">
              <div class="th-tape-name">{{ tapeNames[tid] || `#${tid}` }}</div>
              <button
                class="th-close-btn"
                @click.stop="emit('remove-tape', Number(tid))"
                title="Убрать из конструктора"
              ><i class="pi pi-times"></i></button>
            </div>
            <div v-if="tabOrder.indexOf(String(tid)) > 0" class="th-actions">
              <button
                class="copy-all-btn"
                @click.stop="copyAllCurrentStage(tid)"
                @contextmenu.stop="onCopyAllBtnContext($event, tid)"
                title="Копировать все поля этапа"
              ><i class="pi pi-angle-double-left"></i></button>
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        <template v-for="(field, fIdx) in visibleFields" :key="field.isGroupSeparator ? `__sep__${field.group}` : field.key">
          <!-- Collapsible group separator row -->
          <tr v-if="field.isGroupSeparator" class="ce-group-row">
            <td :colspan="1 + tabOrder.length" class="ce-group-td">
              <button
                type="button"
                class="ce-group-toggle"
                :aria-expanded="!isGroupCollapsed(field.persistKey)"
                @click="toggleGroup(field.persistKey)"
              >
                <i
                  class="ce-group-chevron pi"
                  :class="isGroupCollapsed(field.persistKey) ? 'pi-chevron-right' : 'pi-chevron-down'"
                />
                <span class="ce-group-eyebrow">{{ field.label }}</span>
              </button>
            </td>
          </tr>
          <!-- Regular field row — skipped when inside a collapsed group -->
          <tr v-else-if="!isFieldInCollapsedGroup(field, visibleFields, fIdx)" class="ce-row">
          <!-- Row label -->
          <td class="ce-td-label">{{ field.label }}</td>

          <!-- Tape cells — unified loop -->
          <td
            v-for="tid in tabOrder"
            :key="tid"
            class="ce-td"
            :class="{
              'ce-td--filled': fieldHasData(tid, field.key),
              'ce-td--active': isActiveTape(tid),
              'ce-td--dimmed': activeTapeId && !isActiveTape(tid),
            }"
          >
            <div class="cell-wrap" :class="{ 'cell-wrap--source': String(tid) !== String(targetTapeId) && tabOrder.length > 1 }">
              <button
                v-if="tabOrder.indexOf(String(tid)) > 0"
                class="copy-btn"
                @click="copyField(tid, field.key)"
                @contextmenu="onCopyBtnContext($event, tid, field.key)"
                title="Копировать в целевую ленту"
              ><i class="pi pi-angle-left"></i></button>
            <textarea
              v-if="field.type === 'textarea'"
              :value="getValue(tid, field.key)"
              @input="setValue(tid, field.key, $event.target.value)"
              class="ce-input ce-textarea"
              rows="2"
            />
            <div v-else-if="field.type === 'select'" class="ce-select-wrap">
              <AutoComplete
                :ref="(el) => setAcRef(tid, field.key, el)"
                v-model="acModels[tid + '__' + field.key]"
                :suggestions="acSuggestions[tid + '__' + field.key] || []"
                @complete="searchAc(tid, field, $event)"
                @item-select="onAcItemSelect(tid, field, $event)"
                @clear="onAcClear(tid, field)"
                optionLabel="label"
                dropdown
                completeOnFocus
                :scrollHeight="'200px'"
                placeholder=""
              />
              <button
                v-if="getValue(tid, field.key)"
                class="ce-select-clear"
                @click.stop="clearAcValue(tid, field)"
                title="Очистить"
              ><i class="pi pi-times"></i></button>
            </div>
            <div v-else-if="field.type === 'multiselect'" class="ce-multiselect-wrap">
              <!-- DSMultiSelect owns the project's MultiSelect behaviour
                   (no chip, «Выбрано: N» counter, show-clear, auto-filter).
                   Defaults live in components/ds/DSMultiSelect.vue — no need
                   to re-declare them here. -->
              <DSMultiSelect
                :model-value="Array.isArray(getValue(tid, field.key)) ? getValue(tid, field.key) : []"
                :options="getRefOptions(field, tid)"
                placeholder="—"
                @update:model-value="setValue(tid, field.key, $event)"
              />
            </div>
            <div v-else-if="field.type === 'datetime-with-now'" class="datetime-cell">
              <DateTimeWithNow
                :date="getValue(tid, field.dateKey || 'date')"
                :time="getValue(tid, field.timeKey || 'time')"
                @update:date="setValue(tid, field.dateKey || 'date', $event)"
                @update:time="setValue(tid, field.timeKey || 'time', $event)"
              />
            </div>
            <div v-else-if="field.type === 'sequential-datetime'" class="datetime-cell">
              <SequentialDateField
                :date="getValue(tid, field.dateKey || 'date')"
                :time="getValue(tid, field.timeKey || 'time')"
                :prev="getPrevDateTime(tid, field.prevStageCode)"
                :prev-label="getPrevStageLabel(field.prevStageCode)"
                :cascade-from-prev="!!field.cascadeFromPrev"
                @update:date="setValue(tid, field.dateKey || 'date', $event)"
                @update:time="setValue(tid, field.timeKey || 'time', $event)"
              />
            </div>
            <div v-else-if="field.type === 'datetime-iso'" class="datetime-cell">
              <DateTimeWithNow
                :date="isoToDateStr(getValue(tid, field.key))"
                :time="isoToTimeStr(getValue(tid, field.key))"
                @update:date="onIsoDateUpdate(tid, field.key, $event)"
                @update:time="onIsoTimeUpdate(tid, field.key, $event)"
              />
            </div>
            <div v-else-if="field.type === 'time'" class="time-cell">
              <input type="time" :value="getValue(tid, field.key)" @input="setValue(tid, field.key, $event.target.value)" class="ce-input ce-input--time" />
              <button class="now-btn" @click="onSetNow(tid)" title="Сейчас"><i class="pi pi-clock"></i></button>
            </div>
            <DateInputISO
              v-else-if="field.type === 'date'"
              :model-value="getValue(tid, field.key) || ''"
              @update:model-value="setValue(tid, field.key, $event)"
            />
            <div v-else-if="field.type === 'boolean'" class="ce-bool-cell">
              <Checkbox
                :model-value="!!getValue(tid, field.key)"
                :binary="true"
                @update:model-value="setValue(tid, field.key, $event)"
              />
            </div>
            <input
              v-else
              :type="field.type"
              :value="getValue(tid, field.key)"
              @input="setValue(tid, field.key, $event.target.value)"
              class="ce-input"
              :step="field.type === 'number' ? '0.0001' : undefined"
            />
            </div><!-- /cell-wrap -->
          </td>
        </tr>
        </template>
      </tbody>
      <tfoot>
        <tr class="ce-meta-row">
          <td class="ce-td-label"></td>
          <td v-for="tid in tabOrder" :key="tid" class="ce-td ce-td-meta">
            <EntityMeta
              v-if="tapeStates[String(tid)]?.meta"
              :createdByName="tapeStates[String(tid)].meta.created_by_name"
              :createdAt="tapeStates[String(tid)].meta.created_at"
              :updatedByName="tapeStates[String(tid)].meta.updated_by_name"
              :updatedAt="tapeStates[String(tid)].meta.updated_at"
            />
          </td>
        </tr>
      </tfoot>
    </table>

    <!-- Context menu: apply to all tapes left -->
    <Teleport to="body">
      <div
        v-if="ctxMenu.show"
        class="ce-ctx-menu"
        :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
        @click="execCtxMenu"
      >
        <span class="ce-ctx-item">Применить ко всем лентам слева</span>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.compare-editor {
  flex: 1;
  min-width: 0;
  overflow: auto;
}

/* ══ Table ══ */
.ce-table {
  width: auto;
  border-collapse: collapse;
  table-layout: fixed;
}

/* ── Header ── */
.ce-table thead {
  position: sticky;
  top: 0;
  z-index: 2;
}

.ce-th-label {
  width: 140px;
  padding: 8px 10px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(0, 50, 116, 0.50);
  /* Sticky first column: the label column stays visible while the tape
     columns scroll horizontally (.compare-editor has overflow:auto).
     Background must be OPAQUE (not the old 3% navy tint) or the
     scrolling tape cells show through underneath. z-index 3 keeps the
     corner cell above both the sticky header row (z 2) and body cells. */
  position: sticky;
  left: 0;
  z-index: 3;
  background: #f2f6fa;
  border-bottom: 1.5px solid rgba(0, 50, 116, 0.10);
  border-right: 1px solid rgba(0, 50, 116, 0.06);
}

/* Phones: narrower label column — the tape columns keep their width and
   scroll; the sticky label eats less of a 375px viewport. */
@media (max-width: 768px) {
  .ce-th-label { width: 108px; min-width: 108px; }
}

/* Tape columns — ALL variants (default / active / source) use the same
   hard width. Previously active had only `width: 190px` while source
   had `width: 211px`; with table-layout: fixed but width: auto on the
   parent table, long content (like project name «Импортозамещение
   сепараторов») was still able to stretch active wider than source.
   Locking width + min-width + max-width to a single value forces the
   browser to lay them out identically regardless of content. */
.ce-th-tape {
  padding: 7px 10px;
  text-align: left;
  vertical-align: top;
  font-size: 12px;
  font-weight: 600;
  color: rgba(0, 50, 116, 0.65);
  background: rgba(0, 50, 116, 0.03);
  border-bottom: 1.5px solid rgba(0, 50, 116, 0.10);
  border-right: 1px solid rgba(0, 50, 116, 0.06);
  cursor: grab;
  user-select: none;
  white-space: nowrap;
  width: 220px;
  min-width: 220px;
  max-width: 220px;
  transition: background 0.2s, box-shadow 0.2s;
  position: relative;
}

/* Data cells under each tape column share the same hard width so the
   column lays out identically across rows. Combined with overflow:
   hidden on .cell-wrap below, this forces wide content (MultiSelect
   selected-label, long select labels) to truncate INSIDE the cell. */
.ce-td:not(.ce-td-label) {
  width: 220px;
  min-width: 220px;
  max-width: 220px;
}
.cell-wrap {
  overflow: hidden;
  min-width: 0;
}
.ce-th-tape:active { cursor: grabbing; }
.ce-th-tape:last-child { border-right: none; }

/* Source columns — same width as active. Earlier they were 211px to
   fit the copy-< button, but the button sits inside the cell anyway
   and 220px gives uniform layout. */
.ce-th-tape--source {
  width: 220px;
  min-width: 220px;
  max-width: 220px;
}

/* Active tape header */
.ce-th-tape--active {
  background: rgba(0, 50, 116, 0.08) !important;
  color: #003274;
}

/* Drag states */
.ce-th-tape--dragging {
  opacity: 0.4;
}

.ce-th-tape--drop {
  background: rgba(82, 201, 166, 0.12) !important;
  box-shadow: inset 0 -2.5px 0 0 #2a9d78;
}
.ce-th-tape--drop::before {
  content: '';
  position: absolute;
  left: -1px;
  top: 4px;
  bottom: 4px;
  width: 2.5px;
  background: #2a9d78;
  border-radius: 1px;
}

/* ── Tape header: top row (name + close) ── */
.th-tape-top {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.th-tape-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Actions row below tape name ── */
.th-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-top: 3px;
}

/* ── Copy All button << (matches copy-btn < exactly) ── */
.copy-all-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  color: rgba(0, 50, 116, 0.35);
  transition: all 0.2s;
  padding: 0;
  flex-shrink: 0;
  font-size: 9px;
}
.copy-all-btn .pi {
  font-size: 15px;
}
.copy-all-btn:hover {
  background: rgba(82, 201, 166, 0.15);
  color: #2a9d78;
}

/* ── Close button × (matches copy-btn < exactly) ── */
.th-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  color: rgba(0, 50, 116, 0.25);
  transition: all 0.2s;
  padding: 0;
  flex-shrink: 0;
}
.th-close-btn .pi {
  font-size: 11px;
}
.th-close-btn:hover {
  background: rgba(200, 80, 70, 0.12);
  color: rgba(200, 80, 70, 0.7);
}

/* ── Body rows ── */
.ce-row:hover .ce-td-label,
.ce-row:hover .ce-td {
  background: rgba(82, 201, 166, 0.03);
}

.ce-td-label {
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 500;
  color: rgba(0, 50, 116, 0.55);
  border-bottom: 1px solid rgba(0, 50, 116, 0.05);
  border-right: 1px solid rgba(0, 50, 116, 0.06);
  /* Sticky first column (see .ce-th-label). Background already opaque
     white; z-index 1 sits under the sticky header but over tape cells. */
  position: sticky;
  left: 0;
  z-index: 1;
  background: white;
  vertical-align: middle;
}

.ce-td {
  padding: 4px 8px;
  border-bottom: 1px solid rgba(0, 50, 116, 0.05);
  border-right: 1px solid rgba(0, 50, 116, 0.06);
  background: white;
  vertical-align: middle;
  transition: border-left-color 0.2s;
  border-left: 2.5px solid rgba(0, 50, 116, 0.06);
}
.ce-td:last-child { border-right: none; }

/* Per-field fill indicator */
.ce-td--filled {
  border-left-color: #2a9d78;
}

/* Active tape column — subtle highlight */
.ce-td--active {
  background: rgba(0, 50, 116, 0.025);
}

/* Dimmed (non-active) columns when there IS an active selection */
.ce-td--dimmed {
  opacity: 0.55;
}
.ce-td--dimmed:hover {
  opacity: 0.85;
}

/* ── Source cell: copy button + input ── */
.source-cell {
  display: flex;
  align-items: flex-start;
  gap: 3px;
}
.source-input-wrap {
  flex: 1;
  min-width: 0;
}

.copy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  color: rgba(0, 50, 116, 0.35);
  flex-shrink: 0;
  margin-top: 4px;
  transition: all 0.2s;
  font-size: 9px;
}
.copy-btn:hover {
  background: rgba(82, 201, 166, 0.15);
  color: #2a9d78;
}

/* ── Inputs (Design System style) ── */
.ce-input,
.ce-textarea {
  width: 100%;
  height: 32px;
  padding: 4px 8px;
  border: 1.5px solid rgba(0, 50, 116, 0.12);
  border-radius: 6px;
  font-size: 12.5px;
  font-family: inherit;
  background: white;
  color: #1a2a3a;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
  box-sizing: border-box;
}

.ce-input::placeholder {
  color: rgba(0, 50, 116, 0.3);
}

.ce-input:hover:not(:focus),
.ce-textarea:hover:not(:focus) {
  border-color: rgba(82, 201, 166, 0.5);
  box-shadow: 0 2px 6px rgba(82, 201, 166, 0.15);
}

.ce-input:focus,
.ce-textarea:focus {
  border-color: #2a9d78;
  outline: none;
  box-shadow: 0 0 0 2.5px rgba(42, 157, 120, 0.12);
}

/* ── General info stage: row labels use DS "Метка поля" 13px 600 #4B5563 ── */
.ce-table--general .ce-td-label {
  font-size: 13px;
  font-weight: 600;
  color: #4B5563;
}

.ce-textarea {
  resize: vertical;
  height: auto;
  min-height: 48px;
}

.time-cell {
  display: flex;
  gap: 3px;
  align-items: center;
}
.datetime-cell {
  /* DateTimeWithNow primitive ships its own DS styling — the wrapper
     only needs to participate in the flex layout of the cell. */
  flex: 1;
  min-width: 0;
}

/* ── Collapsible group separator rows ──────────────────────────────
   Renders inside <tbody> as a full-width row with an eyebrow + chevron.
   Brand-blue tinted background distinguishes it from data rows.
   Per-user collapse state is stored in localStorage by the editor. */
.ce-group-row { background: rgba(0, 50, 116, 0.025); }
.ce-group-td {
  padding: 0;
  border-top: 1px solid rgba(0, 50, 116, 0.10);
  border-bottom: 1px solid rgba(0, 50, 116, 0.06);
}
.ce-group-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 7px 12px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
  transition: background 0.12s;
}
.ce-group-toggle:hover { background: rgba(0, 50, 116, 0.05); }
.ce-group-toggle:focus-visible {
  outline: 2px solid rgba(0, 50, 116, 0.30);
  outline-offset: -2px;
}
.ce-group-chevron {
  font-size: 10px;
  color: rgba(0, 50, 116, 0.50);
  transition: color 0.15s;
}
.ce-group-toggle:hover .ce-group-chevron { color: #003274; }
.ce-group-eyebrow {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.55);
  line-height: 1.2;
}
.ce-input--time {
  flex: 1;
}
.now-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 1px solid rgba(0, 50, 116, 0.08);
  border-radius: 5px;
  background: transparent;
  cursor: pointer;
  color: rgba(0, 50, 116, 0.30);
  flex-shrink: 0;
  transition: all 0.2s;
  font-size: 11px;
}
.now-btn:hover {
  background: rgba(82, 201, 166, 0.10);
  color: #2a9d78;
}

/* ── Cell wrap (copy button + input for source columns) ── */
.cell-wrap {
  display: flex;
  align-items: center;
  gap: 0;
  width: 100%;
}
.cell-wrap--source {
  gap: 3px;
}
.cell-wrap > .ce-input,
.cell-wrap > .ce-textarea,
.cell-wrap > .ce-select-wrap,
.cell-wrap > .ce-multiselect-wrap,
.cell-wrap > .time-cell,
.cell-wrap > .datetime-cell,
.cell-wrap > .ce-bool-cell,
/* `.dtwn` is the root of DateTimeWithNow / DateInputISO when used
   directly (no wrapper). Without this it sizes to content (183.5px) and
   leaves the right side of the cell empty — visual inconsistency vs
   neighbouring AutoComplete/MultiSelect rows which fill the full
   265px cell. */
.cell-wrap > .dtwn {
  flex: 1;
  min-width: 0;
}

/* Boolean cell — Checkbox left-aligned with a 32px height to match the
   other inputs in the same column, so a row of mixed types stays
   vertically aligned. */
.ce-bool-cell {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 4px;
}

/* MultiSelect wrapper — matches AutoComplete (.ce-select-wrap) sizing
   so a `multiselect` cell aligns vertically with select / text rows. */
.ce-multiselect-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 100%;
}
.ce-multiselect-wrap :deep(.p-multiselect) {
  width: 100%;
  min-height: 32px !important;
  height: auto !important;
  font-size: 12.5px !important;
}
/* Label padding: left 8px (normal), right 30px to reserve room for the
   absolute-positioned clear-icon defined in global.css. Without the
   right-side reserve, long names like «Импортозамещение сепараторов»
   render ellipsis that overlaps the × icon visually. */
.ce-multiselect-wrap :deep(.p-multiselect-label) {
  padding: 4px 30px 4px 8px !important;
  font-size: 12.5px !important;
  line-height: 1.4 !important;
}
.ce-multiselect-wrap :deep(.p-multiselect-chip) {
  font-size: 11.5px;
  padding: 1px 6px;
  margin: 1px 2px;
  min-width: 0;
  overflow: hidden;
  /* The chip itself fills its wrapper span so the ellipsis on the label
     has the wrapper's width to work with. */
  width: 100%;
}
/* PrimeVue 4 wraps each chip in a `.p-multiselect-chip-item` <span>.
   THAT span is the direct flex child of `.p-multiselect-label`, not the
   chip itself. So flex sizing must target the wrapper, not the chip. */
.ce-multiselect-wrap :deep(.p-multiselect-chip-item) {
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
}
/* PrimeVue 4 renders chip label as `.p-chip-label` (the chip itself
   is `.p-chip.p-multiselect-chip`). Older docs say `*-token-label` —
   real DOM uses `p-chip-label`. */
.ce-multiselect-wrap :deep(.p-chip-label),
.ce-multiselect-wrap :deep(.p-multiselect-token-label),
.ce-multiselect-wrap :deep(.p-multiselect-chip-label) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  display: block;
}
/* Constrain the label container so chips can't push out the dropdown
   arrow — keeps field width fixed regardless of selection count.
   Both modes covered:
   - non-chip (current default after Dima 2026-05-28 feedback): one
     selected → name with ellipsis; 2+ → "Выбрано: N" counter via
     :max-selected-labels="1" + selected-items-label.
   - chip mode (rare, legacy): chips share-and-truncate via
     .p-multiselect-chip-item flex rules above. */
.ce-multiselect-wrap :deep(.p-multiselect-label) {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  max-width: 100%;
}
.ce-multiselect-wrap :deep(.p-multiselect-dropdown) {
  width: 26px !important;
}

/* ── Select wrapper (DS select-ac-wrap pattern) ── */
/* NO custom :deep() overrides — global.css handles all PrimeVue styling */
.ce-select-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 100%;
}
.ce-select-wrap :deep(.p-autocomplete) {
  width: 100%;
}
.ce-select-wrap :deep(.p-autocomplete-input) {
  height: 32px !important;
  min-height: 32px !important;
  padding: 4px 32px 4px 8px !important;
  font-size: 12.5px !important;
}
.ce-select-wrap :deep(.p-autocomplete-dropdown) {
  width: 26px !important;
  padding: 0 !important;
}
/* Clear button — compact, positioned before dropdown arrow */
.ce-select-clear {
  position: absolute;
  right: 30px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: #b0b5be;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 50%;
  transition: color 0.15s, background 0.15s;
  z-index: 2;
}
.ce-select-clear :deep(.pi) {
  font-size: 10px !important;
}
.ce-select-clear:hover {
  color: #666;
  background: rgba(0, 0, 0, 0.06);
}

/* ── Entity meta footer ── */
.ce-meta-row .ce-td-meta {
  padding: 0;
  border-left: none;
  vertical-align: top;
}
.ce-meta-row .ce-td-meta :deep(.entity-meta) {
  border-top: none;
  padding: 6px 8px;
}
</style>

<!-- Non-scoped for teleported context menu -->
<style>
.ce-ctx-menu {
  position: fixed;
  z-index: 9999;
  background: white;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 50, 116, 0.12);
  padding: 4px 0;
  min-width: 200px;
}
.ce-ctx-item {
  display: block;
  padding: 7px 14px;
  font-size: 12px;
  font-weight: 500;
  color: #003274;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}
.ce-ctx-item:hover {
  background: rgba(82, 201, 166, 0.10);
}
</style>
