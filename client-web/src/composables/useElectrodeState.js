/**
 * useElectrodeState — state composable for one electrode cut batch.
 * Follows the same interface as useTapeState so TapeConstructor can use it.
 */
import { ref, reactive, computed } from 'vue'
import api from '@/services/api'
import { shapeForFormFactor, isConfigCodeValidFor } from '@/config/electrodeStages'

export function useElectrodeState({ batchId }) {
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
  const general = reactive({
    name: '',
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
    Object.assign(general, s.general)
    Object.assign(steps.drying, s.steps.drying)
    _skipHistory = false
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

  function undo() {
    if (!undoStack.value.length) return
    redoStack.value.push(_takeSnapshot())
    _applySnapshot(undoStack.value.pop())
    setDirty('cutting'); setDirty('drying')
    _scheduleAutoSave('cutting'); _scheduleAutoSave('drying')
  }

  function redo() {
    if (!redoStack.value.length) return
    undoStack.value.push(_takeSnapshot())
    _applySnapshot(redoStack.value.pop())
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
        console.error(`Auto-save failed for ${stageCode}:`, e)
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
        await api.put(`/api/electrodes/electrode-cut-batches/${currentBatchId.value}`, {
          target_form_factor: general.target_form_factor || null,
          target_config_code: general.target_config_code || null,
          target_config_other: general.target_config_code === 'other'
            ? (general.target_config_other || null)
            : null,
          shape: general.shape || null,
          diameter_mm: general.diameter_mm || null,
          length_mm: general.length_mm || null,
          width_mm: general.width_mm || null,
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
