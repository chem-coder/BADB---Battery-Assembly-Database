<script setup>
/**
 * ElectrodeStackPanel — «Формирование стека» for ONE battery. Closes the
 * biggest Vue parity gap (2026-07-29): vanilla's battery_stack section
 * (public/js/3-batteries.js) never made it into the constructor.
 *
 * Mounted one-per-battery below the constructor on AssemblyPage (same
 * pattern as BatteryElectrochemEditor). Self-loading:
 *   1. GET /api/batteries/:id/assembly → battery context (form factor,
 *      coin mode), saved electrode SOURCES, saved stack, status.
 *   2. Per role: fan out GET /api/electrodes/electrode-cut-batches/:batchId/electrodes
 *      over the saved source batches, merge by electrode_id, keep only
 *      available electrodes (status_code === 1) — vanilla
 *      loadRoleElectrodesForSources.
 *
 * Gating (vanilla BATTERY_SECTION_UNLOCK_RULES): the stack unlocks only
 * after electrode sources are saved — «Сначала сохраните источники
 * электродов.» A stack that already existed when the battery was LOADED
 * is read-only (vanilla applySavedElectrodeState) — but a stack saved in
 * THIS session stays editable until the battery is reopened, matching
 * the vanilla confirm text («Пока эта карточка аккумулятора открыта,
 * стек можно будет исправить»).
 *
 * Save: PUT /api/batteries/battery_electrodes/:battery_id with the BARE
 * array [{electrode_id, role, position_index}] — positions 1..n in the
 * anode-first, mass-descending interleave the summary table shows. After
 * a successful save the panel attempts the vanilla auto-transition to
 * status 'assembled'; the server rejects it (400) while the assembly is
 * incomplete, and that rejection is silently expected.
 */
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import StackElectrodeTable from '@/components/StackElectrodeTable.vue'
import api from '@/services/api'
import { toastApiError } from '@/utils/errorClassifier'
import { isBatteryOpenStatus } from '@/utils/batteryStatus'
import {
  isMultiElectrodeFormFactor,
  defaultStackAnodeMode,
  normalizeStackAnodeMode,
  getStackTargetCounts,
  validateStackSelection,
  interleaveStack,
  buildStackPayload,
  sumActualCapacity,
  buildNpRecommendation,
  fmtStackCapacity,
  fmtNpRatio,
} from '@/utils/electrodeStack'

const props = defineProps({
  batteryId: { type: Number, required: true },
})

const emit = defineEmits(['saved'])

const toast = useToast()
const confirm = useConfirm()

// ── Loaded battery context ─────────────────────────────────────────
const loading = ref(true)
const loadError = ref(false)
const battery = ref(null)          // assembly.battery
const coinConfig = ref(null)       // assembly.coin_config
const sources = ref([])            // assembly.electrode_sources
const savedStack = ref([])         // assembly.electrodes (ordered by position)
// True only when the battery was loaded WITH a stack (or already
// assembled) — the vanilla read-only lock. Not re-set after in-session
// saves.
const lockedFromLoad = ref(false)

// ── Selection state (click order preserved, vanilla parity) ────────
const selectedCathodes = ref([])
const selectedAnodes = ref([])
const targetCathodeCount = ref(null)
const anodeMode = ref('same')
const excessPercent = ref(null)    // N/P helper input — advisory only
const npFeedback = ref('')
const saving = ref(false)
// Snapshot of the last saved selection for the dirty marker.
const savedSnapshot = ref('[]')

// ── Pools ──────────────────────────────────────────────────────────
const pools = reactive({ cathode: [], anode: [] })
const poolsLoading = ref(false)

const ctx = computed(() => ({
  formFactor: battery.value?.form_factor || '',
  coinCellMode: coinConfig.value?.coin_cell_mode || '',
  halfCellType: coinConfig.value?.half_cell_type || '',
  targetCathodeCount: targetCathodeCount.value,
  targetAnodeMode: anodeMode.value,
}))

const isMulti = computed(() => isMultiElectrodeFormFactor(ctx.value.formFactor))
const targets = computed(() => getStackTargetCounts(ctx.value))

// Sources saved & sufficient for the stack (vanilla
// isBatterySourceSelectionCompleteForStack): coin half-cell needs the
// relevant role only (and NOT the other); everything else needs both.
const requiredSourceRoles = computed(() => {
  const c = ctx.value
  if (c.formFactor === 'coin' && c.coinCellMode === 'half_cell') {
    if (c.halfCellType === 'cathode_vs_li') return ['cathode']
    if (c.halfCellType === 'anode_vs_li') return ['anode']
    return []
  }
  return ['cathode', 'anode']
})

function sourceBatchIds(role) {
  return [...new Set(
    sources.value
      .filter(s => s.role === role && s.cut_batch_id != null)
      .map(s => Number(s.cut_batch_id))
  )]
}

const sourcesReady = computed(() => {
  const roles = requiredSourceRoles.value
  if (!roles.length) return false
  return roles.every(r => sourceBatchIds(r).length > 0)
})

// Read-only: loaded with a saved stack, or battery already left the
// open state (assembled/testing/…).
const readOnly = computed(() =>
  lockedFromLoad.value || !isBatteryOpenStatus(battery.value?.status))

// Picker blocks hidden per role for half cells (vanilla block visibility).
const showCathodeBlock = computed(() =>
  !(ctx.value.coinCellMode === 'half_cell' && ctx.value.halfCellType === 'anode_vs_li'))
const showAnodeBlock = computed(() =>
  !(ctx.value.coinCellMode === 'half_cell' && ctx.value.halfCellType === 'cathode_vs_li'))

// ── Data loading ───────────────────────────────────────────────────
async function loadAssembly() {
  const { data } = await api.get(`/api/batteries/${props.batteryId}/assembly`)
  battery.value = data?.battery || null
  coinConfig.value = data?.coin_config || null
  sources.value = Array.isArray(data?.electrode_sources) ? data.electrode_sources : []
  savedStack.value = Array.isArray(data?.electrodes) ? data.electrodes : []
}

function applySavedStackToSelection() {
  // assembly.electrodes rows are capacity-enriched and ordered by
  // position_index — partitioning by role restores the saved physical
  // order per role (vanilla applyStackToState).
  selectedCathodes.value = savedStack.value.filter(r => r.role === 'cathode').map(r => ({ ...r }))
  selectedAnodes.value = savedStack.value.filter(r => r.role === 'anode').map(r => ({ ...r }))
  if (isMulti.value) {
    targetCathodeCount.value = selectedCathodes.value.length || null
    anodeMode.value = selectedAnodes.value.length === selectedCathodes.value.length + 1
      ? 'plus_one' : 'same'
  }
  savedSnapshot.value = selectionSnapshot()
}

async function loadPools() {
  poolsLoading.value = true
  try {
    for (const role of ['cathode', 'anode']) {
      const ids = sourceBatchIds(role)
      const results = await Promise.allSettled(
        ids.map(id => api.get(`/api/electrodes/electrode-cut-batches/${id}/electrodes`))
      )
      // Merge by electrode_id, keep available only (status_code === 1) —
      // vanilla mergeElectrodeLists + isAvailableElectrodeStatus.
      const byId = new Map()
      for (const r of results) {
        if (r.status !== 'fulfilled' || !Array.isArray(r.value.data)) continue
        for (const e of r.value.data) {
          if (e.status_code !== 1) continue
          byId.set(Number(e.electrode_id), e)
        }
      }
      pools[role] = [...byId.values()]
    }
  } finally {
    poolsLoading.value = false
  }
}

async function load() {
  loading.value = true
  loadError.value = false
  try {
    await loadAssembly()
    lockedFromLoad.value = savedStack.value.length > 0
      || !isBatteryOpenStatus(battery.value?.status)
    if (savedStack.value.length > 0) {
      applySavedStackToSelection()
    } else if (isMulti.value) {
      anodeMode.value = defaultStackAnodeMode(ctx.value.formFactor)
    }
    if (!readOnly.value && sourcesReady.value) {
      await loadPools()
    }
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

onMounted(load)

// Parent calls this after the constructor saves electrode SOURCES for
// this battery — re-evaluates the unlock gate and refetches the pools.
// NB: reload re-applies the read-only lock from persisted data, which
// is exactly the vanilla «после повторной загрузки стек будет
// заблокирован» semantics.
defineExpose({ reload: load })

// ── Selection mechanics ────────────────────────────────────────────
const selectedCathodeIds = computed(() => new Set(selectedCathodes.value.map(e => Number(e.electrode_id))))
const selectedAnodeIds = computed(() => new Set(selectedAnodes.value.map(e => Number(e.electrode_id))))

function selectionFor(role) {
  return role === 'cathode' ? selectedCathodes : selectedAnodes
}

function targetFor(role) {
  return role === 'cathode' ? targets.value.cathodes : targets.value.anodes
}

function canSelectMore(role) {
  if (!targets.value.valid) return false
  const t = targetFor(role)
  if (!Number.isInteger(t) || t <= 0) return false
  return selectionFor(role).value.length < t
}

function toggleElectrode(role, electrode) {
  if (readOnly.value) return
  const sel = selectionFor(role)
  const id = Number(electrode.electrode_id)
  const idx = sel.value.findIndex(e => Number(e.electrode_id) === id)
  if (idx >= 0) {
    sel.value = sel.value.filter((_, i) => i !== idx)
  } else {
    if (!canSelectMore(role)) return
    sel.value = [...sel.value, electrode]
  }
  npFeedback.value = ''
}

// Target shrink trims over-selection (vanilla trimStackSelectionForCurrentMode).
watch(targets, (t) => {
  if (!t.valid) return
  if (Number.isInteger(t.cathodes) && selectedCathodes.value.length > t.cathodes) {
    selectedCathodes.value = selectedCathodes.value.slice(0, t.cathodes)
  }
  if (Number.isInteger(t.anodes) && selectedAnodes.value.length > t.anodes) {
    selectedAnodes.value = selectedAnodes.value.slice(0, t.anodes)
  }
})

// ── Dirty marker ───────────────────────────────────────────────────
function selectionSnapshot() {
  return JSON.stringify([
    ...selectedCathodes.value.map(e => `c${e.electrode_id}`),
    ...selectedAnodes.value.map(e => `a${e.electrode_id}`),
  ].sort())
}
const isDirty = computed(() => !readOnly.value && selectionSnapshot() !== savedSnapshot.value)

// ── Summary (the «sandwich»: anode-first interleave, mass-descending) ──
const summaryRows = computed(() => interleaveStack(ctx.value, selectedCathodes.value, selectedAnodes.value))

const validationError = computed(() => {
  if (summaryRows.value.length === 0) return null // empty stack → no noise
  return validateStackSelection(ctx.value, selectedCathodes.value, selectedAnodes.value)
})

// ── N/P helper (advisory only — electrode_stack_rules.md) ──────────
const npVisible = computed(() => {
  const c = ctx.value
  if (c.formFactor === 'coin') return c.coinCellMode === 'full_cell'
  return isMulti.value
})

const npContext = computed(() => {
  if (!npVisible.value || readOnly.value) return null
  const excess = Number(excessPercent.value)
  if (!Number.isFinite(excess) || excess < 0) {
    return { state: 'no-excess' }
  }
  if (selectedCathodes.value.length === 0) return { state: 'no-cathodes', excess }
  const sum = sumActualCapacity(selectedCathodes.value)
  if (!sum.complete || sum.total <= 0) return { state: 'incomplete-capacity', excess }
  const targetRatio = 1 + excess / 100
  const targetAnodeTotal = sum.total * targetRatio
  const rec = buildNpRecommendation({
    anodes: pools.anode,
    targetAnodeTotal,
    targetAnodeCount: targets.value.anodes,
  })
  return {
    state: 'ready',
    excess,
    targetRatio,
    cathodeTotal: sum.total,
    targetAnodeTotal,
    perAnodeTarget: rec.perAnodeTarget,
    recommendedIds: rec.recommendedIds,
    sufficient: rec.sufficient,
  }
})

const npRecommendedIds = computed(() =>
  npContext.value?.state === 'ready' ? npContext.value.recommendedIds : new Set())
const npPerAnodeTarget = computed(() =>
  npContext.value?.state === 'ready' ? npContext.value.perAnodeTarget : null)

function selectSuggestedAnodes() {
  const ctxNp = npContext.value
  if (ctxNp?.state !== 'ready' || !ctxNp.sufficient) return
  selectedAnodes.value = pools.anode.filter(e => ctxNp.recommendedIds.has(Number(e.electrode_id)))
  npFeedback.value = 'Аноды выбраны'
  setTimeout(() => { npFeedback.value = '' }, 2500)
}

// ── Save ───────────────────────────────────────────────────────────
async function saveStack() {
  if (readOnly.value || saving.value) return
  const payload = buildStackPayload(ctx.value, selectedCathodes.value, selectedAnodes.value)
  if (payload.length === 0) {
    toast.add({ severity: 'warn', summary: 'Стек электродов пуст.', life: 3500 })
    return
  }
  const err = validateStackSelection(ctx.value, selectedCathodes.value, selectedAnodes.value)
  if (err) {
    toast.add({ severity: 'warn', summary: 'Стек не сохранён', detail: err, life: 5000 })
    return
  }
  confirm.require({
    header: 'Сохранить стек электродов?',
    message: 'Пока эта карточка аккумулятора открыта, стек можно будет исправить. После выхода и повторной загрузки аккумулятора сохранённый стек будет заблокирован.',
    acceptLabel: 'Сохранить',
    rejectLabel: 'Отмена',
    accept: () => doSave(payload),
  })
}

async function doSave(payload) {
  saving.value = true
  try {
    await api.put(`/api/batteries/battery_electrodes/${props.batteryId}`, payload)
    savedSnapshot.value = selectionSnapshot()
    toast.add({ severity: 'success', summary: 'Стек электродов сохранён.', detail: `Аккумулятор #${props.batteryId}`, life: 3000 })
    // Vanilla autoSaveAssembledStatusTransition: try to move the open
    // battery to 'assembled'; the server itself refuses (400) while the
    // required assembly records are incomplete — that's the expected
    // path, not an error.
    if (isBatteryOpenStatus(battery.value?.status)) {
      try {
        await api.patch(`/api/batteries/${props.batteryId}`, { status: 'assembled' })
        battery.value = { ...battery.value, status: 'assembled' }
      } catch { /* assembly incomplete — stays open */ }
    }
    emit('saved', props.batteryId)
  } catch (err) {
    // 409 carries the server's Russian rule message verbatim.
    toastApiError(toast, err, 'Ошибка сохранения стека')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="stack-panel glass-card">
    <div class="stack-head">
      <span class="stack-title">Формирование стека · Аккумулятор #{{ batteryId }}</span>
      <span v-if="isDirty" class="stack-dirty">Не сохранено</span>
      <span v-if="loading || poolsLoading" class="stack-loading">
        <i class="pi pi-spin pi-spinner" style="font-size:11px"></i> загрузка…
      </span>
    </div>

    <div v-if="loadError" class="stack-note stack-note--error">
      Не удалось загрузить данные сборки. Обновите страницу.
    </div>

    <template v-else-if="!loading">
      <!-- Gate: sources first (vanilla unlock rule) -->
      <div v-if="!sourcesReady && !readOnly" class="stack-note">
        Сначала сохраните источники электродов.
      </div>

      <template v-else>
        <p v-if="!readOnly" class="stack-intro">Выберите электроды для данного элемента.</p>

        <!-- Target counts -->
        <div v-if="!readOnly" class="stack-targets">
          <template v-if="isMulti">
            <span class="stack-targets-label">Укажите количество электродов в стеке:</span>
            <label class="stack-target-field">
              Катодов
              <InputNumber
                :model-value="targetCathodeCount"
                :min="1"
                :useGrouping="false"
                :allowEmpty="true"
                inputClass="stack-count-input"
                @update:model-value="targetCathodeCount = $event"
              />
            </label>
            <div class="stack-anode-mode" role="group" aria-label="Режим количества анодов">
              <button
                type="button"
                class="mode-btn"
                :class="{ 'mode-btn--active': anodeMode === 'same' }"
                title="Количество анодов равно количеству катодов"
                @click="anodeMode = 'same'"
              >= катодам</button>
              <button
                type="button"
                class="mode-btn"
                :class="{ 'mode-btn--active': anodeMode === 'plus_one' }"
                title="Количество анодов на один больше количества катодов"
                @click="anodeMode = 'plus_one'"
              >+1 анод</button>
            </div>
            <span class="stack-target-derived">
              Итого анодов: <strong>{{ targets.anodes ?? '—' }}</strong>
            </span>
            <span class="stack-target-hint">
              {{ targets.valid
                ? 'Аноды рассчитываются автоматически: столько же, сколько катодов, или на один больше.'
                : 'Укажите количество катодов и выберите режим количества анодов.' }}
            </span>
          </template>
          <span v-else class="stack-target-hint">Количество электродов задано типом элемента.</span>
        </div>

        <!-- N/P helper -->
        <div v-if="npVisible && !readOnly" class="np-assist">
          <div class="np-controls">
            <label class="stack-target-field">
              Избыток анода, %
              <InputNumber
                :model-value="excessPercent"
                :min="0"
                :step="0.1"
                :minFractionDigits="0"
                :maxFractionDigits="2"
                :allowEmpty="true"
                placeholder="10"
                inputClass="stack-count-input"
                @update:model-value="excessPercent = $event"
              />
            </label>
            <span v-if="npContext?.state === 'ready'" class="np-target-label">
              Целевой N/P: {{ fmtNpRatio(npContext.targetRatio) }}
            </span>
            <Button
              v-if="npContext?.state === 'ready'"
              label="Выбрать предложенные аноды"
              title="Выбрать предложенный набор анодов"
              size="small"
              outlined
              :disabled="!npContext.sufficient"
              @click="selectSuggestedAnodes"
            />
            <span v-if="npFeedback" class="np-feedback">{{ npFeedback }}</span>
          </div>
          <div v-if="npContext?.state === 'no-excess'" class="np-empty">
            Введите избыток, чтобы рассчитать целевую ёмкость анодов.
          </div>
          <div v-else-if="npContext?.state === 'no-cathodes'" class="np-empty">
            Выберите катоды, чтобы рассчитать целевую суммарную ёмкость анодов.
          </div>
          <div v-else-if="npContext?.state === 'incomplete-capacity'" class="np-empty">
            Для выбранных катодов не хватает расчётной ёмкости.
          </div>
          <div v-else-if="npContext?.state === 'ready'" class="np-grid">
            <span>Катоды: <strong>{{ selectedCathodes.length }} / {{ targets.cathodes ?? '—' }}</strong></span>
            <span>Σ катодов: <strong>{{ fmtStackCapacity(npContext.cathodeTotal) }}</strong></span>
            <span>Цель Σ анодов: <strong>{{ fmtStackCapacity(npContext.targetAnodeTotal) }}</strong></span>
            <span>Цель на 1 анод: <strong>{{ fmtStackCapacity(npContext.perAnodeTarget) }}</strong></span>
            <span>Рекоменд. набор:
              <strong v-if="npContext.sufficient">{{ npContext.recommendedIds.size }} шт.</strong>
              <strong v-else>недостаточно подходящих анодов</strong>
            </span>
          </div>
          <div v-if="npContext?.state === 'ready'" class="np-hint">
            Предложенные аноды подсвечены в таблице. Δ показывает ёмкость анода относительно цели на один анод.
          </div>
        </div>

        <!-- Picker tables -->
        <div v-if="!readOnly" class="stack-pickers">
          <StackElectrodeTable
            v-if="showCathodeBlock"
            role="cathode"
            :electrodes="pools.cathode"
            :selected-ids="selectedCathodeIds"
            :disabled="!targets.valid"
            :can-select-more="canSelectMore('cathode')"
            @toggle="(e) => toggleElectrode('cathode', e)"
          />
          <StackElectrodeTable
            v-if="showAnodeBlock"
            role="anode"
            :electrodes="pools.anode"
            :selected-ids="selectedAnodeIds"
            :disabled="!targets.valid"
            :can-select-more="canSelectMore('anode')"
            :np-per-anode-target="npPerAnodeTarget"
            :np-recommended-ids="npRecommendedIds"
            @toggle="(e) => toggleElectrode('anode', e)"
          />
        </div>

        <!-- Sandwich summary -->
        <div v-if="summaryRows.length > 0" class="stack-summary">
          <div class="set-title">Электроды в элементе</div>
          <table class="sum-table">
            <thead>
              <tr>
                <th class="sum-th">Позиция</th>
                <th class="sum-th">ID электрода</th>
                <th class="sum-th" title="Номер электрода в партии (как в Excel)">№</th>
                <th class="sum-th">Роль</th>
                <th class="sum-th">m, g</th>
                <th class="sum-th">Расч. ёмк., мАч</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in summaryRows"
                :key="row.electrode.electrode_id"
                class="sum-row"
                :class="row.role === 'cathode' ? 'sum-row--cathode' : 'sum-row--anode'"
              >
                <td class="sum-td">{{ row.position }}</td>
                <td class="sum-td">{{ row.electrode.electrode_id }}</td>
                <td class="sum-td">{{ row.electrode.number_in_batch ?? '—' }}</td>
                <td class="sum-td">{{ row.role === 'cathode' ? 'Катод' : 'Анод' }}</td>
                <td class="sum-td">{{ row.electrode.electrode_mass_g ?? '—' }}</td>
                <td class="sum-td">{{ fmtStackCapacity(row.electrode.capacity_actual_mAh) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="validationError && !readOnly" class="stack-note stack-note--warn">
          {{ validationError }}
        </div>

        <div v-if="readOnly" class="stack-note stack-note--muted">
          Раздел сохранён. Стек заблокирован для изменений.
        </div>

        <div v-if="!readOnly" class="stack-actions">
          <Button
            label="Сохранить стек электродов"
            icon="pi pi-save"
            :loading="saving"
            :disabled="summaryRows.length === 0"
            @click="saveStack"
          />
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.stack-panel {
  padding: 14px 16px;
}

.stack-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.stack-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(0, 50, 116, 0.65);
}

.stack-dirty {
  font-size: 11px;
  font-weight: 600;
  color: #b7791f;
  background: rgba(214, 158, 46, 0.12);
  border-radius: 999px;
  padding: 2px 8px;
}

.stack-loading {
  font-size: 11px;
  color: rgba(0, 50, 116, 0.45);
}

.stack-intro {
  font-size: 12.5px;
  color: rgba(0, 50, 116, 0.55);
  margin: 0 0 10px;
}

.stack-note {
  font-size: 12.5px;
  color: rgba(0, 50, 116, 0.55);
  padding: 8px 0;
}
.stack-note--error { color: #c05621; }
.stack-note--warn { color: #b7791f; }
.stack-note--muted { color: rgba(0, 50, 116, 0.45); }

/* ── Targets row ── */
.stack-targets {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 14px;
  margin-bottom: 10px;
}
.stack-targets-label {
  font-size: 12.5px;
  font-weight: 600;
  color: #4B5563;
}
.stack-target-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: #4B5563;
}
.stack-panel :deep(.stack-count-input) {
  width: 72px;
  height: 30px;
  font-size: 12.5px;
}
.stack-target-derived {
  font-size: 12.5px;
  color: #1a2a3a;
}
.stack-target-hint {
  flex-basis: 100%;
  font-size: 11.5px;
  color: rgba(0, 50, 116, 0.45);
}

.stack-anode-mode {
  display: inline-flex;
  border: 1.5px solid rgba(0, 50, 116, 0.12);
  border-radius: 6px;
  overflow: hidden;
}
.mode-btn {
  border: none;
  background: white;
  padding: 5px 10px;
  font-size: 12px;
  color: rgba(0, 50, 116, 0.6);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.mode-btn + .mode-btn { border-left: 1px solid rgba(0, 50, 116, 0.10); }
.mode-btn--active {
  background: rgba(0, 50, 116, 0.08);
  color: #003274;
  font-weight: 600;
}

/* ── N/P helper ── */
.np-assist {
  border: 1px dashed rgba(0, 50, 116, 0.15);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
}
.np-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 14px;
}
.np-target-label {
  font-size: 12.5px;
  font-weight: 600;
  color: #003274;
}
.np-feedback {
  font-size: 12px;
  color: #2a9d78;
  font-weight: 600;
}
.np-empty {
  margin-top: 6px;
  font-size: 12px;
  color: rgba(0, 50, 116, 0.45);
}
.np-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin-top: 8px;
  font-size: 12px;
  color: #1a2a3a;
}
.np-hint {
  margin-top: 6px;
  font-size: 11px;
  color: rgba(0, 50, 116, 0.45);
}

/* ── Picker layout: side-by-side, wraps on narrow screens ── */
.stack-pickers {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-bottom: 12px;
}

/* ── Summary table («sandwich») ── */
.stack-summary { margin-bottom: 10px; }
.set-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(0, 50, 116, 0.55);
  margin-bottom: 6px;
}
.sum-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
  border: 1px solid rgba(0, 50, 116, 0.08);
  border-radius: 8px;
  overflow: hidden;
}
.sum-th {
  background: #f2f6fa;
  padding: 6px 8px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  color: rgba(0, 50, 116, 0.6);
  border-bottom: 1.5px solid rgba(0, 50, 116, 0.10);
  white-space: nowrap;
}
.sum-td {
  padding: 5px 8px;
  color: #1a2a3a;
}
/* Role tints (vanilla battery-stack-summary-*): blue cathode, violet anode. */
.sum-row--cathode .sum-td { background: #f7fbff; }
.sum-row--anode .sum-td { background: #fbf8ff; }

.stack-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
