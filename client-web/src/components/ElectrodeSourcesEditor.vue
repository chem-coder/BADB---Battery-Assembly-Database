<script setup>
/**
 * ElectrodeSourcesEditor — N electrode-source rows for ONE role
 * (cathode | anode) of ONE battery. Rendered per battery cell by the
 * `type: 'electrode-sources'` branch in StageCompareEditor.
 *
 * Vanilla parity (public/js/3-batteries.js):
 *   - row 0 = primary source, extra rows = additional batches;
 *   - «+ Добавить партию» only for pouch/prism/cylindrical cells
 *     (canUseMultipleElectrodeSources);
 *   - depleted tapes stay selectable but are suffixed « — списана»
 *     and sorted to the bottom (AutoComplete has no optgroups);
 *   - batch options are filtered client-side like
 *     getLocalCompatibleBatteryCutBatches: shape/form-factor/sidedness
 *     compatibility, narrowing by the row's tape, sibling-duplicate
 *     exclusion, and the row's saved batch is always kept selectable;
 *   - picking a batch backfills the row's tape from the batch.
 *
 * Contract with StageCompareEditor (mirrors the multiselect pattern):
 * receives the plain rows array, emits the FULL new array via
 * `update:rows` only on real change — never mutates props.rows.
 */
import { reactive, ref, computed, watch, nextTick } from 'vue'
import AutoComplete from 'primevue/autocomplete'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  role: { type: String, required: true }, // 'cathode' | 'anode'
  formFactor: { type: String, default: '' },
  // GET /api/tapes/for-electrodes rows: tape_id, name, role,
  // availability_status, coating_sidedness
  tapes: { type: Array, default: () => [] },
  // GET /api/electrodes/electrode-cut-batches rows: cut_batch_id,
  // tape_id, tape_name, tape_role, shape, target_form_factor,
  // coating_sidedness / tape_coating_sidedness, electrode_count, _label
  batches: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:rows'])

function emptyRow() {
  return { tape_id: '', cut_batch_id: '', source_notes: '' }
}

// Always render at least one (primary) row even when state is empty.
const displayRows = computed(() =>
  props.rows.length ? props.rows : [emptyRow()]
)

// Vanilla canUseMultipleElectrodeSources: pouch-like or cylindrical.
const MULTI_SOURCE_FORM_FACTORS = ['pouch', 'prism', 'cylindrical']
const canAddMore = computed(() => MULTI_SOURCE_FORM_FACTORS.includes(props.formFactor))

// ── Emitting (full-array, change-only) ──
function cloneRows() {
  return displayRows.value.map(r => ({ ...r }))
}

function emitRows(next) {
  if (JSON.stringify(next) !== JSON.stringify(displayRows.value)) {
    emit('update:rows', next)
  }
}

function patchRow(idx, patch) {
  const next = cloneRows()
  if (!next[idx]) return
  Object.assign(next[idx], patch)
  emitRows(next)
}

function addRow() {
  emitRows([...cloneRows(), emptyRow()])
}

function removeRow(idx) {
  if (idx === 0) return // primary row is fixed
  emitRows(cloneRows().filter((_, i) => i !== idx))
}

// ── Tape options (role-filtered, depleted suffixed + sorted last) ──
function isDepleted(tape) {
  return tape?.availability_status === 'depleted'
}

function tapeLabel(tape) {
  return `#${tape.tape_id} | ${tape.name || ''}${isDepleted(tape) ? ' — списана' : ''}`
}

const tapeOptions = computed(() => {
  const forRole = props.tapes.filter(t => t.role === props.role)
  const available = forRole.filter(t => !isDepleted(t))
  const depleted = forRole.filter(isDepleted)
  return [...available, ...depleted].map(t => ({
    value: t.tape_id,
    label: tapeLabel(t),
  }))
})

// Options for the row's tape select — the saved tape is always
// resolvable even if it dropped out of the reference list.
function tapeOptionsFor(row) {
  const opts = tapeOptions.value
  const sel = row?.tape_id
  if (sel && !opts.some(o => String(o.value) === String(sel))) {
    return [{ value: sel, label: `#${sel} | сохранённая лента` }, ...opts]
  }
  return opts
}

// ── Batch options (vanilla getLocalCompatibleBatteryCutBatches) ──
function batchSidedness(b) {
  return b?.coating_sidedness || b?.tape_coating_sidedness || null
}

const expectedShape = computed(() => {
  if (props.formFactor === 'coin') return 'circle'
  if (MULTI_SOURCE_FORM_FACTORS.includes(props.formFactor)) return 'rectangle'
  return null
})

function findBatch(batchId) {
  return props.batches.find(b => String(b.cut_batch_id) === String(batchId)) || null
}

function batchLabel(b) {
  return b._label || `#${b.cut_batch_id} — ${b.tape_name || ''} (${b.electrode_count || 0} шт.)`
}

function batchOptionsFor(idx) {
  const row = displayRows.value[idx] || {}
  const selectedId = row.cut_batch_id ? String(row.cut_batch_id) : ''
  // Sibling rows of the SAME role in the SAME battery must not offer
  // an already-taken batch (backend rejects duplicates per role).
  const siblingIds = new Set(
    displayRows.value
      .filter((_, i) => i !== idx)
      .map(r => r.cut_batch_id)
      .filter(Boolean)
      .map(String)
  )

  const compatible = props.batches.filter(b => {
    const bid = String(b.cut_batch_id)
    if (bid === selectedId) return true // saved batch stays selectable
    if (siblingIds.has(bid)) return false
    if (b.tape_role && b.tape_role !== props.role) return false
    if (row.tape_id && String(b.tape_id) !== String(row.tape_id)) return false
    if (!expectedShape.value) return false // no form factor → no options
    if (b.shape !== expectedShape.value) return false
    // 2026-07-30 (Dalia): rectangle batches are interchangeable across
    // pouch/prism/cylindrical — shape is authoritative, target_form_factor
    // is a hint. Coin stays strict via the circle shape + sidedness rules.
    if (expectedShape.value !== 'rectangle' && b.target_form_factor !== props.formFactor) return false
    if (props.formFactor === 'coin' && batchSidedness(b) !== 'one_sided') return false
    return true
  })

  const opts = compatible.map(b => ({ value: b.cut_batch_id, label: batchLabel(b) }))
  if (selectedId && !opts.some(o => String(o.value) === selectedId)) {
    opts.unshift({ value: row.cut_batch_id, label: `#${selectedId} | сохранённая партия` })
  }
  return opts
}

// Explain WHY the batch list is empty instead of showing a mute blank
// dropdown (2026-07-30: user could not tell that her circle batches were
// cut from two-sided tapes, which coin cells reject).
const batchPlaceholder = computed(() => {
  if (!props.formFactor) return '— сначала выберите форм-фактор —'
  return ''
})

function emptyBatchHint(idx) {
  if (!props.formFactor) return ''
  if (batchOptionsFor(idx).length > 0) return ''
  if (props.formFactor === 'coin') {
    return 'Нет совместимых партий: для монетной ячейки нужны круглые электроды, вырубленные из ОДНОСТОРОННЕЙ ленты нужной роли.'
  }
  return 'Нет совместимых партий: нужны прямоугольные электроды с лент нужной роли (форм-фактор вырубки не важен — прямоугольники взаимозаменяемы).'
}

// ── Selection handlers ──
function onTapeSelect(idx, tapeId) {
  const row = displayRows.value[idx] || {}
  const patch = { tape_id: tapeId ?? '' }
  // Vanilla clearRoleBatchesIncompatibleWithManualFilters(checkTape):
  // a selected batch that belongs to a different tape is cleared.
  if (row.cut_batch_id) {
    const batch = findBatch(row.cut_batch_id)
    if (batch && tapeId && String(batch.tape_id) !== String(tapeId)) {
      patch.cut_batch_id = ''
    }
  }
  patchRow(idx, patch)
}

function onBatchSelect(idx, batchId) {
  const patch = { cut_batch_id: batchId ?? '' }
  // Batch → tape backfill (vanilla backfillSourceRowFromSelectedBatch).
  const batch = findBatch(batchId)
  if (batch?.tape_id) patch.tape_id = batch.tape_id
  patchRow(idx, patch)
}

// ── AutoComplete adapter (DS pattern from StageCompareEditor) ──
const acModels = reactive({})
const acSuggestions = ref({})
const acRefs = {}

function acKey(idx, kind) {
  return `${idx}__${kind}`
}

function optionsFor(idx, kind) {
  return kind === 'tape'
    ? tapeOptionsFor(displayRows.value[idx])
    : batchOptionsFor(idx)
}

function resolveAcOption(idx, kind) {
  const row = displayRows.value[idx] || {}
  const val = kind === 'tape' ? row.tape_id : row.cut_batch_id
  if (!val && val !== 0) return null
  return optionsFor(idx, kind).find(o => String(o.value) === String(val)) || null
}

function syncAcModels() {
  // Drop models of removed rows so stale keys don't linger.
  for (const key of Object.keys(acModels)) {
    const idx = Number(key.split('__')[0])
    if (idx >= displayRows.value.length) delete acModels[key]
  }
  displayRows.value.forEach((_, idx) => {
    acModels[acKey(idx, 'tape')] = resolveAcOption(idx, 'tape')
    acModels[acKey(idx, 'batch')] = resolveAcOption(idx, 'batch')
  })
}

watch(
  [() => props.rows, () => props.tapes, () => props.batches, () => props.formFactor],
  syncAcModels,
  { immediate: true, deep: true }
)

function searchAc(idx, kind, event) {
  const query = (event.query || '').toLowerCase()
  acSuggestions.value[acKey(idx, kind)] = optionsFor(idx, kind)
    .filter(o => o.label.toLowerCase().includes(query))
}

function onAcItemSelect(idx, kind, e) {
  if (!e.value || typeof e.value !== 'object') return
  if (kind === 'tape') onTapeSelect(idx, e.value.value)
  else onBatchSelect(idx, e.value.value)
  setTimeout(() => {
    acRefs[acKey(idx, kind)]?.$el?.querySelector('input')?.blur()
  }, 50)
}

function clearAcValue(idx, kind) {
  if (kind === 'tape') onTapeSelect(idx, '')
  else onBatchSelect(idx, '')
  acModels[acKey(idx, kind)] = null
}

function setAcRef(idx, kind, el) {
  const key = acKey(idx, kind)
  if (el) acRefs[key] = el; else delete acRefs[key]
}

// PrimeVue hides the panel when the query becomes empty; @clear fires
// right after — re-show the dropdown with the full option list.
function onAcClear(idx, kind) {
  acSuggestions.value[acKey(idx, kind)] = optionsFor(idx, kind)
  nextTick(() => {
    const comp = acRefs[acKey(idx, kind)]
    if (comp?.show) comp.show()
  })
}

const roleLabel = computed(() => (props.role === 'cathode' ? 'Катодная' : 'Анодная'))
</script>

<template>
  <div class="es-editor">
    <div
      v-for="(row, idx) in displayRows"
      :key="idx"
      class="es-row"
      :class="{ 'es-row--extra': idx > 0 }"
    >
      <div v-if="idx > 0" class="es-row-head">
        <span class="es-row-title">{{ roleLabel }} партия {{ idx + 1 }}</span>
        <button
          type="button"
          class="es-remove-btn"
          title="Удалить источник"
          @click="removeRow(idx)"
        ><i class="pi pi-times"></i></button>
      </div>

      <div class="es-select-wrap">
        <AutoComplete
          :ref="(el) => setAcRef(idx, 'tape', el)"
          v-model="acModels[idx + '__tape']"
          :suggestions="acSuggestions[idx + '__tape'] || []"
          @complete="searchAc(idx, 'tape', $event)"
          @item-select="onAcItemSelect(idx, 'tape', $event)"
          @clear="onAcClear(idx, 'tape')"
          optionLabel="label"
          dropdown
          completeOnFocus
          :scrollHeight="'200px'"
          placeholder="— лента —"
        />
        <button
          v-if="row.tape_id"
          class="es-select-clear"
          title="Очистить"
          @click.stop="clearAcValue(idx, 'tape')"
        ><i class="pi pi-times"></i></button>
      </div>

      <div class="es-select-wrap">
        <AutoComplete
          :ref="(el) => setAcRef(idx, 'batch', el)"
          v-model="acModels[idx + '__batch']"
          :suggestions="acSuggestions[idx + '__batch'] || []"
          @complete="searchAc(idx, 'batch', $event)"
          @item-select="onAcItemSelect(idx, 'batch', $event)"
          @clear="onAcClear(idx, 'batch')"
          optionLabel="label"
          dropdown
          completeOnFocus
          :scrollHeight="'200px'"
          :placeholder="batchPlaceholder || '— партия —'"
        />
        <button
          v-if="row.cut_batch_id"
          class="es-select-clear"
          title="Очистить"
          @click.stop="clearAcValue(idx, 'batch')"
        ><i class="pi pi-times"></i></button>
      </div>
      <small
        v-if="emptyBatchHint(idx)"
        class="es-empty-hint"
        style="display:block; color:var(--p-orange-600, #c77700); margin-top:2px;"
      >{{ emptyBatchHint(idx) }}</small>

      <textarea
        class="es-notes"
        rows="1"
        placeholder="Заметки"
        :value="row.source_notes"
        @input="patchRow(idx, { source_notes: $event.target.value })"
      />
    </div>

    <button
      v-if="canAddMore"
      type="button"
      class="es-add-btn"
      @click="addRow"
    ><i class="pi pi-plus"></i> Добавить партию</button>
  </div>
</template>

<style scoped>
.es-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  min-width: 0;
}

.es-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.es-row--extra {
  padding-top: 5px;
  border-top: 1px dashed rgba(0, 50, 116, 0.14);
}

.es-row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.es-row-title {
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: rgba(0, 50, 116, 0.45);
}

.es-remove-btn {
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
  padding: 0;
  flex-shrink: 0;
  transition: all 0.2s;
}
.es-remove-btn .pi { font-size: 10px; }
.es-remove-btn:hover {
  background: rgba(200, 80, 70, 0.12);
  color: rgba(200, 80, 70, 0.7);
}

/* AutoComplete wrapper — same sizing as StageCompareEditor's
   .ce-select-wrap so cells align with neighbouring stages. */
.es-select-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 100%;
  min-width: 0;
}
.es-select-wrap :deep(.p-autocomplete) { width: 100%; }
.es-select-wrap :deep(.p-autocomplete-input) {
  height: 32px !important;
  min-height: 32px !important;
  padding: 4px 32px 4px 8px !important;
  font-size: 12.5px !important;
}
.es-select-wrap :deep(.p-autocomplete-dropdown) {
  width: 26px !important;
  padding: 0 !important;
}

.es-select-clear {
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
.es-select-clear :deep(.pi) { font-size: 10px !important; }
.es-select-clear:hover {
  color: #666;
  background: rgba(0, 0, 0, 0.06);
}

.es-notes {
  width: 100%;
  min-height: 30px;
  padding: 4px 8px;
  border: 1.5px solid rgba(0, 50, 116, 0.12);
  border-radius: 6px;
  font-size: 12.5px;
  font-family: inherit;
  background: white;
  color: #1a2a3a;
  resize: vertical;
  box-sizing: border-box;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.es-notes::placeholder { color: rgba(0, 50, 116, 0.3); }
.es-notes:hover:not(:focus) {
  border-color: rgba(82, 201, 166, 0.5);
  box-shadow: 0 2px 6px rgba(82, 201, 166, 0.15);
}
.es-notes:focus {
  border-color: #2a9d78;
  outline: none;
  box-shadow: 0 0 0 2.5px rgba(42, 157, 120, 0.12);
}

.es-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  align-self: flex-start;
  padding: 3px 8px;
  border: 1px dashed rgba(0, 50, 116, 0.25);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: 11.5px;
  font-weight: 500;
  color: rgba(0, 50, 116, 0.6);
  transition: all 0.2s;
}
.es-add-btn .pi { font-size: 10px; }
.es-add-btn:hover {
  border-color: #2a9d78;
  color: #2a9d78;
  background: rgba(82, 201, 166, 0.08);
}
</style>
