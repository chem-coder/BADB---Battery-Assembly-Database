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
import { ref, reactive, computed, watch, nextTick } from 'vue'
import AutoComplete from 'primevue/autocomplete'
import EntityMeta from '@/components/EntityMeta.vue'

const props = defineProps({
  stageCode: { type: String, required: true },
  stageConfig: { type: Object, required: true },
  tapeStates: { type: Object, default: () => ({}) },
  targetTapeId: { type: [Number, String], default: null },
  activeTapeId: { type: [Number, String], default: null },
  tabOrder: { type: Array, default: () => [] },
  tapeNames: { type: Object, default: () => ({}) },
  refs: { type: Object, default: () => ({}) },
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

function copyField(sourceTapeId, fieldKey, destTapeId) {
  const dest = destTapeId || leftNeighbor(sourceTapeId)
  if (!dest) return
  const val = getValue(sourceTapeId, fieldKey)
  setValue(dest, fieldKey, val)
  // Sync local AC models for destination tape — re-sync all currently visible
  // select fields because cascades (e.g. form_factor → config_code) may clear
  // other fields. Hidden (form-factor-filtered) fields are not touched — they
  // belong to a different form factor and would just add noise.
  for (const f of visibleFields.value) {
    if (f.type === 'select') {
      acModels[acKey(String(dest), f.key)] = resolveAcOption(dest, f)
    }
  }
}

// Copy all fields of the CURRENT stage only (not all stages). Only visible
// fields are copied — a pouch tape should not receive coin_size_code etc.
function copyAllCurrentStage(sourceTapeId) {
  for (const f of visibleFields.value) {
    copyField(sourceTapeId, f.key)
  }
}

function onSetNow(tapeId) {
  const ts = props.tapeStates[String(tapeId)]
  if (ts) ts.setNow(props.stageCode)
}

function fieldHasData(tapeId, fieldKey) {
  const v = getValue(tapeId, fieldKey)
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
  // Only copy currently visible fields — hidden fields belong to a different
  // form factor and should not leak into tapes that don't use them.
  for (const f of visibleFields.value) {
    for (let i = 0; i < idx; i++) {
      copyField(sourceTapeId, f.key, props.tabOrder[i])
    }
  }
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
        <tr v-for="field in visibleFields" :key="field.key" class="ce-row">
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
            <div v-else-if="field.type === 'time'" class="time-cell">
              <input type="time" :value="getValue(tid, field.key)" @input="setValue(tid, field.key, $event.target.value)" class="ce-input ce-input--time" />
              <button class="now-btn" @click="onSetNow(tid)" title="Сейчас"><i class="pi pi-clock"></i></button>
            </div>
            <input
              v-else
              :type="field.type === 'date' ? 'date' : field.type"
              :value="getValue(tid, field.key)"
              @input="setValue(tid, field.key, $event.target.value)"
              class="ce-input"
              :step="field.type === 'number' ? '0.0001' : undefined"
            />
            </div><!-- /cell-wrap -->
          </td>
        </tr>
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
  background: rgba(0, 50, 116, 0.03);
  border-bottom: 1.5px solid rgba(0, 50, 116, 0.10);
  border-right: 1px solid rgba(0, 50, 116, 0.06);
}

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
  width: 190px;
  min-width: 140px;
  transition: background 0.2s, box-shadow 0.2s;
  position: relative;
}
.ce-th-tape:active { cursor: grabbing; }
.ce-th-tape:last-child { border-right: none; }

/* Source columns wider to fit copy-btn < */
.ce-th-tape--source {
  width: 211px;
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
.cell-wrap > .time-cell {
  flex: 1;
  min-width: 0;
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
