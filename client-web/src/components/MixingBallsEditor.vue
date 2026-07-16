<script setup>
/**
 * MixingBallsEditor — d048 agate milling balls for the mixing stage.
 *
 * Three fixed rows (d = 0,5 / 0,75 / 1,0 см), each a checkbox + integer
 * count input (disabled until checked). v-model is the mixing step's
 * `balls` array — ONLY checked rows with count>0: [{diameter_cm,
 * ball_count}]. Below the rows: a live suggestion hint (≈⅓ of the slurry
 * volume in balls) + an overfill warning against the selected container's
 * working limit. The hint is text only — it never auto-fills the inputs.
 *
 * The suggestion math lives in utils/ballSuggestion.js (unit-tested,
 * shared coefficient with vanilla) — imported, not reimplemented.
 *
 * Rendered per tape cell by StageCompareEditor (field type
 * 'mixing-balls'); parent passes slurryVolumeMl + maxWorkingVolumeMl via
 * the schema's componentProps hook. Emitting update:modelValue routes
 * through setFieldValue → dirty tracking + auto-save like any field.
 */
import { reactive, computed, watch } from 'vue'
import Checkbox from 'primevue/checkbox'
import {
  BALL_DIAMETERS_CM,
  suggestBalls,
  formatBallSuggestion,
  formatOverfillWarning,
} from '@/utils/ballSuggestion'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  slurryVolumeMl: { type: [Number, String], default: '' },
  // Container working limit (slurry + balls), ml. Null → no limit known.
  maxWorkingVolumeMl: { type: [Number, String], default: null },
})

const emit = defineEmits(['update:modelValue'])

// Local UI state: a fixed row per diameter. Kept locally (not derived on
// the fly) so a row can be CHECKED with an empty count while the user
// types — the emitted array only ever contains complete rows, and a
// derive-from-model approach would uncheck the row on its own round-trip.
const rows = reactive(
  BALL_DIAMETERS_CM.map(d => ({ diameter_cm: d, checked: false, count: '' }))
)

// Canonical form for change detection: complete rows only, sorted.
function normalize(arr) {
  return (Array.isArray(arr) ? arr : [])
    .map(b => ({ diameter_cm: Number(b.diameter_cm), ball_count: Math.trunc(Number(b.ball_count)) }))
    .filter(b => Number.isFinite(b.diameter_cm) && b.diameter_cm > 0 && b.ball_count > 0)
    .sort((a, b) => a.diameter_cm - b.diameter_cm)
}

function rowsToModel() {
  return normalize(rows.filter(r => r.checked)
    .map(r => ({ diameter_cm: r.diameter_cm, ball_count: r.count })))
}

const canon = (arr) => JSON.stringify(normalize(arr))

// External changes (restore, undo/redo, copy-from-tape) → sync rows.
// Skipped when the incoming value matches what the local rows would emit
// (i.e. the change originated here) to preserve in-progress row state.
watch(() => props.modelValue, (mv) => {
  if (canon(mv) === canon(rowsToModel())) return
  const byDiameter = new Map(normalize(mv).map(b => [b.diameter_cm, b.ball_count]))
  for (const row of rows) {
    const count = byDiameter.get(row.diameter_cm)
    row.checked = count != null
    row.count = count != null ? String(count) : ''
  }
}, { immediate: true, deep: true })

// Emit only on real change — checking a box with an empty count keeps the
// canonical array identical and must not mark the stage dirty.
function emitModel() {
  const next = rowsToModel()
  if (canon(next) !== canon(props.modelValue)) emit('update:modelValue', next)
}

function onCheck(row, checked) {
  row.checked = checked
  emitModel()
}

function onCount(row, event) {
  row.count = event.target.value
  emitModel()
}

// ── Suggestion hint (text only — never auto-fills) ──
const maxWorking = computed(() => {
  const v = Number(props.maxWorkingVolumeMl)
  return Number.isFinite(v) && v > 0 ? v : null
})

const suggestion = computed(() =>
  suggestBalls(props.slurryVolumeMl, { maxWorkingVolumeMl: maxWorking.value })
)

const hintText = computed(() =>
  suggestion.value ? formatBallSuggestion(suggestion.value, props.slurryVolumeMl) : ''
)

const warningText = computed(() =>
  formatOverfillWarning(suggestion.value, maxWorking.value)
)

function formatDiameter(d) {
  return d.toLocaleString('ru-RU')
}
</script>

<template>
  <div class="mbe">
    <div v-for="row in rows" :key="row.diameter_cm" class="mbe-row">
      <Checkbox
        :model-value="row.checked"
        :binary="true"
        @update:model-value="onCheck(row, $event)"
      />
      <span class="mbe-diameter">{{ formatDiameter(row.diameter_cm) }} см</span>
      <input
        type="number"
        class="mbe-count"
        min="1"
        step="1"
        placeholder="шт"
        :disabled="!row.checked"
        :value="row.count"
        @input="onCount(row, $event)"
      />
    </div>
    <div v-if="hintText" class="mbe-hint">{{ hintText }}</div>
    <div v-if="warningText" class="mbe-warning">
      <i class="pi pi-exclamation-triangle"></i>
      <span>{{ warningText }}</span>
    </div>
  </div>
</template>

<style scoped>
.mbe {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  min-width: 0;
  padding: 2px 0;
}

.mbe-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mbe-diameter {
  flex: 0 0 52px;
  font-size: 12.5px;
  color: #1a2a3a;
  white-space: nowrap;
}

/* Same look as .ce-input in StageCompareEditor, narrower. */
.mbe-count {
  flex: 1;
  min-width: 0;
  height: 28px;
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
.mbe-count::placeholder { color: rgba(0, 50, 116, 0.3); }
.mbe-count:disabled {
  background: rgba(0, 50, 116, 0.03);
  color: rgba(0, 50, 116, 0.35);
  cursor: not-allowed;
}
.mbe-count:hover:not(:disabled):not(:focus) {
  border-color: rgba(82, 201, 166, 0.5);
  box-shadow: 0 2px 6px rgba(82, 201, 166, 0.15);
}
.mbe-count:focus {
  border-color: #2a9d78;
  outline: none;
  box-shadow: 0 0 0 2.5px rgba(42, 157, 120, 0.12);
}

.mbe-hint {
  font-size: 11px;
  line-height: 1.4;
  color: rgba(0, 50, 116, 0.55);
  white-space: normal;
}

.mbe-warning {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  font-size: 11px;
  line-height: 1.4;
  font-weight: 500;
  color: #a05a00;
  background: rgba(240, 173, 78, 0.12);
  border: 1px solid rgba(240, 173, 78, 0.35);
  border-radius: 6px;
  padding: 4px 6px;
  white-space: normal;
}
.mbe-warning .pi {
  font-size: 11px;
  margin-top: 1px;
  flex-shrink: 0;
}
</style>
