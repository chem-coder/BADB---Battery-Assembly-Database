/**
 * useElectrodeState — state composable for one electrode cut batch.
 * Follows the same interface as useTapeState so TapeConstructor can use it.
 */
import { ref, reactive, computed } from 'vue'
import api from '@/services/api'
import { shapeForFormFactor, isConfigCodeValidFor } from '@/config/electrodeStages'
import { isoDateToMskInput } from '@/utils/dateFormat'

export function useElectrodeState({ batchId, onSaveError } = {}) {
  const currentBatchId = ref(batchId)
  const loading = ref(false)
  const saving = ref(false)
  const isRestoring = ref(false)

  // ── Entity metadata (created/updated) ──
  const meta = reactive({
    created_by_name: null,
    created_at: null,
    updated_by_name: null,
    updated_at: null,
  })

  // ── Reactive state ──
  // `project_ids` mirrors the M:N table `electrode_cut_batch_projects`
  // (migration d029). Backend accepts `project_ids: [...]` on POST/PUT
  // — see services/electrodeBatchProjectService.js.
  const general = reactive({
    name: '',
    project_ids: [],
    // Business date — column `item_created_at` (d035).
    item_created_at: '',
    // Test-batch flag — column `is_test_batch` (d039). Excludes the
    // batch from capacity averages; renders a marker in the list.
    is_test_batch: false,
    target_form_factor: '',
    target_config_code: '',
    target_config_other: '',
    shape: '',
    diameter_mm: '',
    length_mm: '',
    width_mm: '',
    comments: '',
  })

  const steps = reactive({
    drying: {
      temperature_c: '',
      start_time: '',
      end_time: '',
      other_parameters: '',
      comments: '',
    },
  })

  // ── Dirty tracking ──
  const dirtySteps = reactive({
    cutting: false,
    drying: false,
  })

  function setDirty(code, val = true) { dirtySteps[code] = val }
  function clearAllDirty() { for (const k of Object.keys(dirtySteps)) dirtySteps[k] = false }

  const anyDirty = computed(() => Object.values(dirtySteps).some(Boolean))

  // ── Undo / Redo (snapshot-based) ──
  const undoStack = ref([])
  const redoStack = ref([])
  const MAX_UNDO = 50
  let _skipHistory = false

  function _takeSnapshot() {
    return JSON.stringify({ general: { ...general }, steps: JSON.parse(JSON.stringify(steps)) })
  }

  function _applySnapshot(snap) {
    const s = JSON.parse(snap)
    _skipHistory = true
    try {
      Object.assign(general, s.general)
      Object.assign(steps.drying, s.steps.drying)
    } finally {
      _skipHistory = false
    }
  }

  function pushHistory() {
    if (_skipHistory || isRestoring.value) return
    undoStack.value.push(_takeSnapshot())
    if (undoStack.value.length > MAX_UNDO) undoStack.value.shift()
    redoStack.value = []
  }

  let _historyTimer = null
  function pushHistoryDebounced() {
    if (_skipHistory) return
    if (!_historyTimer) pushHistory()
    clearTimeout(_historyTimer)
    _historyTimer = setTimeout(() => { _historyTimer = null }, 400)
  }

  // Reset debounce so the very next edit takes a fresh "before"
  // snapshot — without this, an edit within 400ms of an undo would be
  // folded into the previous burst and leave the just-restored state
  // unreachable on the undo stack.
  function _resetHistoryDebounce() {
    if (_historyTimer) {
      clearTimeout(_historyTimer)
      _historyTimer = null
    }
  }

  function undo() {
    if (!undoStack.value.length) return
    redoStack.value.push(_takeSnapshot())
    _applySnapshot(undoStack.value.pop())
    _resetHistoryDebounce()
    setDirty('cutting'); setDirty('drying')
    _scheduleAutoSave('cutting'); _scheduleAutoSave('drying')
  }

  function redo() {
    if (!redoStack.value.length) return
    undoStack.value.push(_takeSnapshot())
    _applySnapshot(redoStack.value.pop())
    _resetHistoryDebounce()
    setDirty('cutting'); setDirty('drying')
    _scheduleAutoSave('cutting'); _scheduleAutoSave('drying')
  }

  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

  // ── Auto-save (debounced) ──
  const _saveTimers = {}
  const _savingNow = {}
  const AUTO_SAVE_DELAY = 800

  function _scheduleAutoSave(stageCode) {
    clearTimeout(_saveTimers[stageCode])
    _saveTimers[stageCode] = setTimeout(async () => {
      if (!dirtySteps[stageCode]) return
      if (_savingNow[stageCode]) return
      _savingNow[stageCode] = true
      try {
        await saveStep(stageCode)
        setDirty(stageCode, false)
      } catch (e) {
        // NEVER swallow a failed save silently (2026-07-30 battery
        // incident) — surface it; dirty flag stays true.
        console.error(`Auto-save failed for ${stageCode}:`, e)
        onSaveError?.(stageCode, e)
      } finally {
        _savingNow[stageCode] = false
      }
    }, AUTO_SAVE_DELAY)
  }

  // ── Field access (used by StageCompareEditor) ──
  function getFieldValue(stageCode, fieldKey) {
    if (stageCode === 'cutting') return general[fieldKey] ?? ''
    return steps[stageCode]?.[fieldKey] ?? ''
  }

  function setFieldValue(stageCode, fieldKey, value) {
    pushHistoryDebounced()
    if (stageCode === 'cutting') {
      general[fieldKey] = value

      // Cascade: target_form_factor → auto-set shape + clear invalid config_code
      if (fieldKey === 'target_form_factor') {
        const auto = shapeForFormFactor(value)
        if (auto) general.shape = auto
        if (general.target_config_code && !isConfigCodeValidFor(value, general.target_config_code)) {
          general.target_config_code = ''
          general.target_config_other = ''
        }
      }
      // Cascade: shape → drop contradictory dimensions (mirrors
      // BatchCreateDialog's null-by-shape rule: circle has no
      // length/width, rectangle has no diameter). Covers both a direct
      // shape edit and the form-factor cascade above.
      if (fieldKey === 'shape' || fieldKey === 'target_form_factor') {
        if (general.shape === 'circle') {
          general.length_mm = ''
          general.width_mm = ''
        } else if (general.shape === 'rectangle') {
          general.diameter_mm = ''
        }
      }
      // Cascade: target_config_code !== 'other' → clear target_config_other
      if (fieldKey === 'target_config_code' && value !== 'other') {
        general.target_config_other = ''
      }

      setDirty('cutting')
      _scheduleAutoSave('cutting')
    } else if (steps[stageCode]) {
      steps[stageCode][fieldKey] = value
      setDirty(stageCode)
      _scheduleAutoSave(stageCode)
    }
  }

  // ── API: Save ──
  async function saveStep(code) {
    if (!currentBatchId.value) return
    saving.value = true
    try {
      if (code === 'cutting') {
        const pids = Array.isArray(general.project_ids)
          ? general.project_ids.map(Number).filter(Number.isFinite)
          : []
        await api.put(`/api/electrodes/electrode-cut-batches/${currentBatchId.value}`, {
          // M:N — backend writes electrode_cut_batch_projects (d029).
          // When the multiselect is empty (e.g. cleared via show-clear),
          // OMIT both project keys: an omitted key keeps the existing
          // links server-side (getPayloadProjectIds → null → current),
          // while sending [] would strip every project link (data loss).
          ...(pids.length > 0
            ? { project_ids: pids, project_id: pids[0] } // legacy echo for old code paths
            : {}),
          item_created_at: general.item_created_at || null,
          is_test_batch: !!general.is_test_batch,
          target_form_factor: general.target_form_factor || null,
          target_config_code: general.target_config_code || null,
          target_config_other: general.target_config_code === 'other'
            ? (general.target_config_other || null)
            : null,
          shape: general.shape || null,
          // Null-by-shape (mirrors BatchCreateDialog): never persist a
          // diameter for a rectangle batch or length/width for a circle
          // one — a form-factor switch must not leave stale geometry.
          diameter_mm: general.shape === 'circle' ? (general.diameter_mm || null) : null,
          length_mm: general.shape === 'rectangle' ? (general.length_mm || null) : null,
          width_mm: general.shape === 'rectangle' ? (general.width_mm || null) : null,
          comments: general.comments || null,
        })
      } else if (code === 'drying') {
        const d = steps.drying
        await api.post(`/api/electrodes/electrode-cut-batches/${currentBatchId.value}/drying`, {
          start_time: d.start_time || null,
          end_time: d.end_time || null,
          temperature_c: d.temperature_c || null,
          other_parameters: d.other_parameters || null,
          comments: d.comments || null,
        })
      }
      setDirty(code, false)
    } finally {
      saving.value = false
    }
  }

  // ── API: Restore ──
  async function restore() {
    if (!currentBatchId.value) return
    loading.value = true
    isRestoring.value = true
    try {
      const { data: batch } = await api.get(`/api/electrodes/electrode-cut-batches/${currentBatchId.value}`)
      general.name = `#${batch.cut_batch_id}`
      // Restore M:N project assignment. Backend GET returns `project_ids`
      // (preferred) and a legacy `project_id` for downward compat.
      if (Array.isArray(batch.project_ids) && batch.project_ids.length > 0) {
        general.project_ids = batch.project_ids.map(Number).filter(Number.isFinite)
      } else if (batch.project_id) {
        general.project_ids = [Number(batch.project_id)]
      } else {
        general.project_ids = []
      }
      // DATE column comes back as an ISO instant at MSK midnight —
      // recover the Moscow calendar day so the picker shows the entered
      // date, not the UTC-shifted previous day. See isoDateToMskInput.
      general.item_created_at = isoDateToMskInput(batch.item_created_at)
      general.is_test_batch = !!batch.is_test_batch
      general.target_form_factor = batch.target_form_factor || ''
      general.target_config_code = batch.target_config_code || ''
      general.target_config_other = batch.target_config_other || ''
      general.shape = batch.shape || ''
      general.diameter_mm = batch.diameter_mm ?? ''
      general.length_mm = batch.length_mm ?? ''
      general.width_mm = batch.width_mm ?? ''
      general.comments = batch.comments || ''

      // Entity metadata
      meta.created_by_name = batch.created_by_name || null
      meta.created_at = batch.created_at || null
      meta.updated_by_name = batch.updated_by_name || null
      meta.updated_at = batch.updated_at || null

      try {
        const { data: drying } = await api.get(`/api/electrodes/electrode-cut-batches/${currentBatchId.value}/drying`)
        if (drying) {
          steps.drying.temperature_c = drying.temperature_c ?? ''
          steps.drying.start_time = drying.start_time || ''
          steps.drying.end_time = drying.end_time || ''
          steps.drying.other_parameters = drying.other_parameters || ''
          steps.drying.comments = drying.comments || ''
        }
      } catch {}
    } finally {
      isRestoring.value = false
      clearAllDirty()
      loading.value = false
    }
  }

  // ── Stage status (used by StageNavigator) ──
  function stageStatus(code) {
    if (code === 'cutting') return currentBatchId.value ? 'done' : 'pending'
    if (code === 'drying') {
      return steps.drying.start_time ? 'done' : 'pending'
    }
    return 'pending'
  }

  // ── Cleanup ──
  function cleanup() {
    for (const code of Object.keys(_saveTimers)) clearTimeout(_saveTimers[code])
    clearTimeout(_historyTimer)
  }

  return {
    currentBatchId,
    general,
    steps,
    meta,
    dirtySteps,
    loading,
    stageStatus,
    saving,
    anyDirty,
    getFieldValue,
    setFieldValue,
    saveStep,
    restore,
    cleanup,
    undo,
    redo,
    canUndo,
    canRedo,
    undoStack,
    redoStack,
    setDirty,
  }
}
