<script setup>
/**
 * RecipeActualsEditor — per-line actual-mass / actual-volume editor for
 * the active tape in TapeConstructor. Closes the last 🔴 Vue parity gap
 * (tape recipe actuals — previously legacy-only via Dalia's HTML).
 *
 * 5-column table:
 *   Material (read-only) | Instance select | Mode (mass/volume) | Value | ⚠
 *
 * Data flow: reads/writes the shared useTapeState instance via prop
 *   - tapeState.currentRecipeLines  (ref<array>)
 *   - tapeState.slurryActuals[lid]  (reactive{mode, value})
 *   - tapeState.selectedInstanceByLineId[lid]  (reactive)
 *   - tapeState.instancesByLineId[lid]         (reactive cache)
 *
 * Auto-save: tapeState.saveActualLine(lid) fires on blur of the value
 * input and on change of instance / mode. Errors surface via toast.
 *
 * Warnings:
 *   - Composite instance (is_pure === false) + mode=volume → different
 *     message AND the volume radio is disabled (density-based conversion
 *     doesn't apply to composites).
 *   - Pure instance + mode=volume + no/zero density → density warning.
 */
import { computed, watchEffect } from 'vue'
import { useToast } from 'primevue/usetoast'
import { classifyAxiosError, errorMessageRu } from '@/utils/errorClassifier'
import {
  computeSlurryPlan,
  computeSolidsSummary,
  collectSolventWarning,
  deriveConversion,
  formatMass,
} from '@/utils/slurryCalc'

const props = defineProps({
  tapeState: { type: Object, default: null },
})

const toast = useToast()

// ── Gate state ──────────────────────────────────────────────────────
const lines = computed(() => props.tapeState?.currentRecipeLines?.value || [])
const hasTape = computed(() => !!props.tapeState?.currentTapeId?.value)
const hasRecipe = computed(() => !!props.tapeState?.general?.tapeRecipeId)
// d047 — the tape's chemistry for the recipe's open active-material slot.
const hasActiveMaterial = computed(() => !!props.tapeState?.general?.activeMaterialId)

const statusMessage = computed(() => {
  if (!props.tapeState) return 'Выберите ленту в конструкторе для редактирования навесок'
  // While restore() is in flight, currentRecipeLines may be empty even
  // when a recipe is assigned — show a loading notice instead of the
  // "empty recipe" one which would be misleading.
  if (props.tapeState.loading?.value) return 'Загрузка данных ленты…'
  if (!hasTape.value) return 'Сохраните ленту, прежде чем редактировать навески'
  if (!hasRecipe.value) return 'Выберите рецепт в разделе «Общая информация»'
  if (lines.value.length === 0) return 'Рецепт не содержит материалов'
  return null
})

// ── Helpers ─────────────────────────────────────────────────────────
// Default measure mode by line role — parity with vanilla
// getDefaultActualModeForLine (1-tapes.js): solvents are dispensed by
// volume, everything else is weighed. Applied only when the line has no
// existing actual — a saved measure_mode always wins (restore()).
function defaultModeForLine(lineId) {
  const line = lines.value.find(l => String(l.recipe_line_id) === String(lineId))
  return line?.recipe_role === 'solvent' ? 'volume' : 'mass'
}

// Lazy-initialise a slurryActual entry so v-model can bind to .value
// without tripping over undefined. value='' like the restore() branch
// in useTapeState; mode comes from the line's role (see above).
function ensureActual(lineId) {
  const actuals = props.tapeState.slurryActuals
  if (!actuals[lineId]) actuals[lineId] = { mode: defaultModeForLine(lineId), value: '' }
  return actuals[lineId]
}

function instancesFor(lineId) {
  const map = props.tapeState?.instancesByLineId
  if (!map) return null
  return map[lineId] ?? null
}

function selectedInstanceFor(lineId) {
  const instId = props.tapeState?.selectedInstanceByLineId?.[lineId]
  if (!instId) return null
  const all = instancesFor(lineId)
  if (!all) return null
  return all.find(x => String(x.material_instance_id) === String(instId)) || null
}

function isComposite(lineId) {
  const inst = selectedInstanceFor(lineId)
  return inst ? (inst.is_pure === false) : false
}

function hasDensity(lineId) {
  const inst = selectedInstanceFor(lineId)
  const d = Number(inst?.density_g_ml)
  return Number.isFinite(d) && d > 0
}

// d047 — recipe lines with material_id null are the open active-material
// slot: the material comes from the TAPE (general.activeMaterialId), not
// the recipe. While unset, the row shows the «x» hint and the instance
// select stays disabled (instances belong to a concrete material).
function isSlotLine(line) {
  return line.material_id == null
}

function materialName(line) {
  if (isSlotLine(line)) {
    return props.tapeState?.activeMaterialName?.value
      || 'АМ — выберите активный материал'
  }
  return line.material_name || `#${line.material_id}`
}

// Warning payload: { kind, msg } | null. Only relevant when mode=volume.
// Suppressed when no instance is selected — the empty dropdown is its
// own visual cue; a second warning there would just add noise.
function warningFor(lineId) {
  const actual = ensureActual(lineId)
  if (actual.mode !== 'volume') return null
  const inst = selectedInstanceFor(lineId)
  if (!inst) return null
  if (inst.is_pure === false) {
    return {
      kind: 'composite',
      msg: 'Составной экземпляр — измерение объёмом недоступно. Выберите однокомпонентный или переключитесь на «масса».',
    }
  }
  const d = Number(inst.density_g_ml)
  if (!Number.isFinite(d) || d <= 0) {
    return {
      kind: 'density',
      msg: 'Плотность не указана в карточке материала — перевод объёма в массу невозможен.',
    }
  }
  return null
}

// ── Slurry plan (vanilla «Расчёт состава» + actual-AM pivot) ─────────
const densityByLineId = computed(() => {
  const map = {}
  for (const l of lines.value) {
    const inst = selectedInstanceFor(l.recipe_line_id)
    const d = Number(inst?.density_g_ml)
    if (Number.isFinite(d) && d > 0) map[l.recipe_line_id] = d
  }
  return map
})

const plan = computed(() => computeSlurryPlan({
  lines: lines.value,
  selectedInstanceByLineId: props.tapeState?.selectedInstanceByLineId || {},
  componentsByInstanceId: props.tapeState?.instanceComponentsCache || {},
  actualsByLineId: props.tapeState?.slurryActuals || {},
  densityByLineId: densityByLineId.value,
  calcMode: props.tapeState?.general?.calcMode || 'from_active_mass',
  targetMass: props.tapeState?.general?.targetMassG,
  slotMaterialId: props.tapeState?.general?.activeMaterialId || null,
}))

const solids = computed(() => computeSolidsSummary({
  lines: lines.value,
  selectedInstanceByLineId: props.tapeState?.selectedInstanceByLineId || {},
  componentsByInstanceId: props.tapeState?.instanceComponentsCache || {},
  actualsByLineId: props.tapeState?.slurryActuals || {},
  densityByLineId: densityByLineId.value,
}))

const solventWarn = computed(() => collectSolventWarning({
  lines: lines.value,
  selectedInstanceByLineId: props.tapeState?.selectedInstanceByLineId || {},
  componentsByInstanceId: props.tapeState?.instanceComponentsCache || {},
}))

// Compositions load lazily: fetch every selected instance's components
// that the cache does not know yet (incl. nested ones the expansion
// reports as pending). The computeds recompute when the cache fills.
watchEffect(() => {
  const ts = props.tapeState
  if (!ts?.fetchComponents) return
  const cache = ts.instanceComponentsCache || {}
  for (const l of lines.value) {
    const instId = ts.selectedInstanceByLineId?.[l.recipe_line_id]
    if (instId && !(String(instId) in cache)) ts.fetchComponents(instId)
  }
  for (const id of plan.value.pendingInstanceIds || []) {
    if (!(String(id) in cache)) ts.fetchComponents(id)
  }
})

function percentFor(lineId) {
  const p = plan.value.percentByLineId?.[lineId]
  return p == null ? '—' : `${p}`
}

function plannedFor(lineId) {
  const v = plan.value.plannedByLineId?.[lineId]
  if (v == null) return '—'
  return formatMass(v)
}

function plannedTitle(lineId) {
  const t = plan.value.targetDryByLineId?.[lineId]
  if (t == null) return ''
  return `Целевая сухая масса материала: ${formatMass(t)} г`
}

function conversionFor(lineId) {
  const actual = ensureActual(lineId)
  const inst = selectedInstanceFor(lineId)
  return deriveConversion({
    mode: actual.mode,
    value: actual.value,
    density: Number(inst?.density_g_ml),
  })
}

const pivotNote = computed(() => {
  if (!plan.value.ready && !plan.value.pending) return ''
  if (plan.value.pivot === 'actual_am') {
    return `Цели пересчитаны от фактической массы АМ (${formatMass(plan.value.activeActualMass)} г)`
  }
  return 'Цели рассчитаны от целевой массы (факт АМ ещё не введён)'
})

function stepFor(lineId) {
  return ensureActual(lineId).mode === 'mass' ? '0.0001' : '0.001'
}

function unitFor(lineId) {
  return ensureActual(lineId).mode === 'mass' ? 'г' : 'мл'
}

// ── Save ────────────────────────────────────────────────────────────
// Snapshot tapeState at call-time so a tape swap during the in-flight
// await can't retarget the POST to a different tape (e.g. user clicks
// a different tab between blur and save). The captured `ts` closure
// keeps the original tape's `saveActualLine` bound.
async function saveLine(lineId) {
  const ts = props.tapeState
  if (!ts?.saveActualLine) return
  try {
    await ts.saveActualLine(lineId)
  } catch (e) {
    console.error('[RecipeActualsEditor] saveActualLine failed', e)
    const code = classifyAxiosError(e)
    toast.add({
      severity: 'error',
      summary: 'Не удалось сохранить',
      detail: errorMessageRu(code),
      life: 3500,
    })
  }
}

// ── Event handlers ──────────────────────────────────────────────────
function onInstanceChange(lineId, raw) {
  props.tapeState.selectedInstanceByLineId[lineId] = raw || ''
  // If the new instance is composite and the current mode is volume,
  // auto-flip to mass — the volume radio will be disabled anyway, so
  // leaving mode='volume' would produce an unfixable UI state. We write
  // the flip to state BEFORE save so the POST goes out with the right
  // XOR column.
  const actual = ensureActual(lineId)
  if (actual.mode === 'volume' && isComposite(lineId)) {
    actual.mode = 'mass'
  }
  saveLine(lineId)
}

function onModeChange(lineId, newMode) {
  // Defensive: never allow volume on a composite instance (UI also
  // disables the radio, but keeping logic here makes onModeChange safe
  // to call programmatically too).
  if (newMode === 'volume' && isComposite(lineId)) return
  ensureActual(lineId).mode = newMode
  saveLine(lineId)
}

function onValueBlur(lineId) {
  saveLine(lineId)
}
</script>

<template>
  <section class="recipe-actuals glass-card">
    <div class="ra-header">
      <span class="ra-title">Фактические навески рецепта</span>
      <span v-if="!statusMessage" class="ra-hint">Сохранение — при потере фокуса</span>
    </div>

    <div v-if="statusMessage" class="ra-notice">
      <i class="pi pi-info-circle"></i>
      <span>{{ statusMessage }}</span>
    </div>

    <div v-else class="ra-table-wrap">
      <table class="ra-table">
        <thead>
          <tr>
            <th class="col-mat">Материал</th>
            <th class="col-pct">%</th>
            <th class="col-plan">К добавлению, г</th>
            <th class="col-inst">Экземпляр</th>
            <th class="col-mode">Режим</th>
            <th class="col-val">Значение</th>
            <th class="col-warn"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="line in lines" :key="line.recipe_line_id" class="ra-row">
            <!-- Material name (read-only: from recipe, or — for the d047
                 slot line — from the tape's active material) -->
            <td
              class="ra-cell-name"
              :class="{ 'ra-cell-name--slot-empty': isSlotLine(line) && !hasActiveMaterial }"
            >{{ materialName(line) }}</td>

            <!-- Recipe % (dry basis) -->
            <td class="ra-cell-pct">{{ percentFor(line.recipe_line_id) }}</td>

            <!-- Planned mass to weigh («К добавлению», vanilla parity;
                 recalculated from the ACTUAL AM mass once it is entered) -->
            <td
              class="ra-cell-plan"
              :title="plannedTitle(line.recipe_line_id)"
            >{{ plannedFor(line.recipe_line_id) }}</td>

            <!-- Instance dropdown -->
            <td>
              <template v-if="instancesFor(line.recipe_line_id) === null">
                <span class="ra-loading">…</span>
              </template>
              <select
                v-else
                :value="tapeState.selectedInstanceByLineId[line.recipe_line_id] || ''"
                :disabled="isSlotLine(line) && !hasActiveMaterial"
                :title="isSlotLine(line) && !hasActiveMaterial
                  ? 'Сначала выберите активный материал ленты (раздел «Общая информация»)'
                  : ''"
                @change="onInstanceChange(line.recipe_line_id, $event.target.value)"
                class="ra-select"
              >
                <option value="">—</option>
                <option
                  v-for="inst in instancesFor(line.recipe_line_id)"
                  :key="inst.material_instance_id"
                  :value="String(inst.material_instance_id)"
                >
                  {{ inst.name || `#${inst.material_instance_id}` }}
                </option>
              </select>
            </td>

            <!-- Mode radios -->
            <td>
              <div class="ra-mode-cell">
                <label class="ra-radio">
                  <input
                    type="radio"
                    :name="`ra-mode-${line.recipe_line_id}`"
                    value="mass"
                    :checked="ensureActual(line.recipe_line_id).mode === 'mass'"
                    @change="onModeChange(line.recipe_line_id, 'mass')"
                  >
                  <span>масса</span>
                </label>
                <label
                  class="ra-radio"
                  :class="{ 'ra-radio--disabled': isComposite(line.recipe_line_id) }"
                >
                  <input
                    type="radio"
                    :name="`ra-mode-${line.recipe_line_id}`"
                    value="volume"
                    :checked="ensureActual(line.recipe_line_id).mode === 'volume'"
                    :disabled="isComposite(line.recipe_line_id)"
                    @change="onModeChange(line.recipe_line_id, 'volume')"
                  >
                  <span>объём</span>
                </label>
              </div>
            </td>

            <!-- Numeric value input -->
            <td>
              <div class="ra-value-cell">
                <input
                  type="number"
                  :step="stepFor(line.recipe_line_id)"
                  min="0"
                  v-model.number="ensureActual(line.recipe_line_id).value"
                  @blur="onValueBlur(line.recipe_line_id)"
                  class="ra-input"
                >
                <span class="ra-unit">{{ unitFor(line.recipe_line_id) }}</span>
              </div>
              <small
                v-if="conversionFor(line.recipe_line_id).text"
                class="ra-derived"
                :class="{ 'ra-derived--warn': conversionFor(line.recipe_line_id).tone === 'warning' }"
              >{{ conversionFor(line.recipe_line_id).text }}</small>
            </td>

            <!-- Warning -->
            <td class="ra-cell-warn">
              <span
                v-if="warningFor(line.recipe_line_id)"
                class="ra-warn"
                v-tooltip.left="warningFor(line.recipe_line_id).msg"
              >
                <i class="pi pi-exclamation-triangle"></i>
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="ra-footer">
        <div v-if="pivotNote" class="ra-pivot">{{ pivotNote }}</div>
        <div class="ra-solids" :class="`ra-solids--${solids.status}`">
          <div>{{ solids.text }}</div>
          <small>{{ solids.detail }}</small>
        </div>
        <div v-if="solventWarn.mismatch" class="ra-solvent-warn">
          <i class="pi pi-exclamation-triangle"></i>
          <span>{{ solventWarn.text }}</span>
        </div>
        <details v-if="plan.expandedRows.length" class="ra-expanded">
          <summary>Расчёт состава ({{ plan.expandedRows.length }})</summary>
          <table class="ra-exp-table">
            <thead>
              <tr><th>Материал</th><th>Навеска, г</th><th>Компонент</th><th>Доля</th><th>Масса, г</th></tr>
            </thead>
            <tbody>
              <template v-for="row in plan.expandedRows" :key="row.lineId">
                <tr v-for="(c, ci) in row.components" :key="ci">
                  <td v-if="ci === 0" :rowspan="row.components.length" class="ra-exp-mat">{{ row.material }}</td>
                  <td v-if="ci === 0" :rowspan="row.components.length" class="ra-exp-mass">{{ formatMass(row.instanceMass) }}</td>
                  <td>{{ c.material_name }}</td>
                  <td>{{ (c.fraction * 100).toFixed(2) }} %</td>
                  <td>{{ formatMass(c.mass) }}</td>
                </tr>
              </template>
            </tbody>
          </table>
        </details>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Card surface — relies on the global .glass-card token (background +
   border + soft shadow + backdrop blur). The class is added at the
   <section> root via the template `class="recipe-actuals glass-card"`.
   Local rule only adds padding rhythm matching ElectrodeBatchPanel and
   TapeDryBoxPanel so the three panels read as one component family. */
.recipe-actuals {
  padding: 12px 18px 14px;
  margin-top: 8px;
}

.ra-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(0, 50, 116, 0.06);
}

.ra-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.50);
}

.ra-hint {
  font-size: 11px;
  color: rgba(0, 50, 116, 0.35);
}

.ra-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 8px;
  font-size: 13px;
  color: rgba(0, 50, 116, 0.55);
}

.ra-notice .pi {
  color: rgba(0, 50, 116, 0.35);
  font-size: 15px;
}

.ra-table-wrap {
  overflow-x: auto;
}

.ra-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

/* Header rhythm matches CrudTable's .p-datatable-thead — brand-blue
   tint background, brand-blue text, normal case (not uppercase), thin
   vertical separators between columns. Same rule lives in
   ElectrodeBatchPanel.vue so the three table surfaces read identically. */
.ra-table thead th {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #003274;
  background: rgba(0, 50, 116, 0.12);
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(0, 50, 116, 0.18);
  border-right: 1px solid rgba(0, 50, 116, 0.15);
  white-space: nowrap;
}
.ra-table thead th:last-child {
  border-right: none;
}

.col-mat  { min-width: 150px; }
.col-inst { min-width: 180px; }
.col-mode { min-width: 140px; }
.col-val  { min-width: 140px; }
.col-warn { width: 32px; }

.ra-row {
  transition: background 0.12s;
  border-bottom: 1px solid rgba(180, 210, 255, 0.18);
}
.ra-row:hover {
  background: rgba(0, 50, 116, 0.04);
}
.ra-row:last-child {
  border-bottom: none;
}
.ra-row td {
  padding: 6px 10px;
  border-right: 1px solid rgba(0, 50, 116, 0.08);
  vertical-align: middle;
}
.ra-row td:last-child {
  border-right: none;
}

.ra-cell-name {
  color: #003274;
  font-weight: 500;
}

/* d047 — slot line without a chosen active material: muted hint text. */
.ra-cell-name--slot-empty {
  color: rgba(0, 50, 116, 0.45);
  font-weight: 400;
  font-style: italic;
}

.ra-select:disabled {
  background: rgba(0, 50, 116, 0.04);
  color: rgba(0, 50, 116, 0.4);
  cursor: not-allowed;
}

.ra-select,
.ra-input {
  width: 100%;
  height: 30px;
  padding: 4px 8px;
  border: 1px solid rgba(0, 50, 116, 0.20);
  border-radius: 6px;
  background: white;
  color: #003274;
  font: inherit;
  font-size: 13px;
  transition: border-color 0.15s, background 0.15s;
}

.ra-select:focus,
.ra-input:focus {
  outline: none;
  border-color: rgba(0, 50, 116, 0.5);
  background: rgba(0, 50, 116, 0.02);
}

.ra-mode-cell {
  display: flex;
  gap: 10px;
  align-items: center;
}

.ra-radio {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: rgba(0, 50, 116, 0.7);
  cursor: pointer;
  user-select: none;
}

.ra-radio input {
  margin: 0;
  cursor: pointer;
}

.ra-radio--disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.ra-radio--disabled input {
  cursor: not-allowed;
}

.ra-value-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ra-unit {
  font-size: 11px;
  color: rgba(0, 50, 116, 0.5);
  min-width: 18px;
}

.ra-cell-warn {
  text-align: center;
}

.ra-warn {
  color: #d4a441;
  cursor: help;
  display: inline-flex;
  align-items: center;
}

.ra-warn .pi {
  font-size: 16px;
}

.ra-loading {
  color: rgba(0, 50, 116, 0.4);
  padding: 0 8px;
}

.col-pct  { width: 46px; }
.col-plan { min-width: 110px; }

.ra-cell-pct {
  color: rgba(0, 50, 116, 0.6);
  text-align: right;
  white-space: nowrap;
}

.ra-cell-plan {
  color: #003274;
  font-weight: 600;
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.ra-derived {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: rgba(0, 50, 116, 0.5);
}

.ra-derived--warn {
  color: #b3540e;
}

.ra-footer {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ra-pivot {
  font-size: 12px;
  color: rgba(0, 50, 116, 0.6);
  font-style: italic;
}

.ra-solids {
  font-size: 13px;
  color: #003274;
}
.ra-solids small {
  color: rgba(0, 50, 116, 0.5);
}
.ra-solids--empty,
.ra-solids--incomplete {
  color: rgba(0, 50, 116, 0.5);
}

.ra-solvent-warn {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 12px;
  color: #b3540e;
}

.ra-expanded summary {
  cursor: pointer;
  font-size: 12px;
  color: rgba(0, 50, 116, 0.65);
  user-select: none;
}

.ra-exp-table {
  margin-top: 6px;
  border-collapse: collapse;
  font-size: 12px;
}
.ra-exp-table th,
.ra-exp-table td {
  padding: 4px 10px;
  border: 1px solid rgba(0, 50, 116, 0.12);
  text-align: left;
}
.ra-exp-table th {
  background: rgba(0, 50, 116, 0.08);
  color: #003274;
}
.ra-exp-mat { font-weight: 600; color: #003274; }
.ra-exp-mass { font-weight: 600; font-variant-numeric: tabular-nums; }
</style>
