/**
 * useBatteryState — state composable for one battery.
 * Same interface as useTapeState / useElectrodeState for TapeConstructor.
 */
import { ref, reactive, computed } from 'vue'
import api from '@/services/api'

export function useBatteryState({ batteryId }) {
  const currentBatchId = ref(batteryId)
  const loading = ref(false)
  const saving = ref(false)
  const isRestoring = ref(false)

  // ── Reactive state per stage ──
  const general = reactive({
    name: '',
    form_factor: '',
    project_id: '',
    battery_notes: '',
  })

  const steps = reactive({
    config: {
      coin_cell_mode: '',
      coin_size_code: '',
      half_cell_type: '',
      coin_layout: '',
      spacer_thickness_mm: '',
      spacer_count: '',
      spacer_notes: '',
      li_foil_notes: '',
    },
    electrodes: {
      cathode_tape_id: '',
      cathode_cut_batch_id: '',
      cathode_source_notes: '',
      anode_tape_id: '',
      anode_cut_batch_id: '',
      anode_source_notes: '',
    },
    separator: {
      separator_id: '',
      separator_notes: '',
    },
    electrolyte: {
      electrolyte_id: '',
      electrolyte_total_ul: '',
      electrolyte_notes: '',
    },
    assembly: {
      separator_layout: '',
      electrolyte_assembly_notes: '',
    },
    qc: {
      ocv_v: '',
      esr_mohm: '',
      qc_notes: '',
      electrochem_notes: '',
    },
  })

  // ── Dirty tracking ──
  const dirtySteps = reactive({
    general: false,
    config: false,
    electrodes: false,
    separator: false,
    electrolyte: false,
    assembly: false,
    qc: false,
  })

  function setDirty(code, val = true) { dirtySteps[code] = val }
  function clearAllDirty() { for (const k of Object.keys(dirtySteps)) dirtySteps[k] = false }

  const anyDirty = computed(() => Object.values(dirtySteps).some(Boolean))

  // ── Undo / Redo ──
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
    for (const key of Object.keys(steps)) {
      if (s.steps[key]) Object.assign(steps[key], s.steps[key])
    }
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
    for (const k of Object.keys(dirtySteps)) setDirty(k)
  }

  function redo() {
    if (!redoStack.value.length) return
    undoStack.value.push(_takeSnapshot())
    _applySnapshot(redoStack.value.pop())
    for (const k of Object.keys(dirtySteps)) setDirty(k)
  }

  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

  // ── Auto-save ──
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
        console.error(`Auto-save failed for battery ${stageCode}:`, e)
      } finally {
        _savingNow[stageCode] = false
      }
    }, AUTO_SAVE_DELAY)
  }

  // ── Field access (used by StageCompareEditor) ──
  function getFieldValue(stageCode, fieldKey) {
    if (stageCode === 'general') return general[fieldKey] ?? ''
    return steps[stageCode]?.[fieldKey] ?? ''
  }

  function setFieldValue(stageCode, fieldKey, value) {
    pushHistoryDebounced()
    if (stageCode === 'general') {
      general[fieldKey] = value
      setDirty('general')
      _scheduleAutoSave('general')
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
      const id = currentBatchId.value

      if (code === 'general') {
        await api.patch(`/api/batteries/${id}`, {
          project_id: general.project_id || undefined,
          form_factor: general.form_factor || undefined,
          battery_notes: general.battery_notes || null,
        })
      } else if (code === 'config') {
        const c = steps.config
        await api.patch(`/api/batteries/battery_coin_config/${id}`, {
          coin_cell_mode: c.coin_cell_mode || null,
          coin_size_code: c.coin_size_code || null,
          half_cell_type: c.half_cell_type || null,
          coin_layout: c.coin_layout || null,
          spacer_thickness_mm: c.spacer_thickness_mm || null,
          spacer_count: c.spacer_count || null,
          spacer_notes: c.spacer_notes || null,
          li_foil_notes: c.li_foil_notes || null,
        })
      } else if (code === 'electrodes') {
        const e = steps.electrodes
        await api.patch(`/api/batteries/battery_electrode_sources/${id}`, {
          cathode_tape_id: e.cathode_tape_id || null,
          cathode_cut_batch_id: e.cathode_cut_batch_id || null,
          cathode_source_notes: e.cathode_source_notes || null,
          anode_tape_id: e.anode_tape_id || null,
          anode_cut_batch_id: e.anode_cut_batch_id || null,
          anode_source_notes: e.anode_source_notes || null,
        })
      } else if (code === 'separator') {
        const s = steps.separator
        await api.patch(`/api/batteries/battery_sep_config/${id}`, {
          separator_id: s.separator_id || null,
          separator_notes: s.separator_notes || null,
        })
      } else if (code === 'electrolyte') {
        const el = steps.electrolyte
        await api.patch(`/api/batteries/battery_electrolyte/${id}`, {
          electrolyte_id: el.electrolyte_id || null,
          electrolyte_total_ul: el.electrolyte_total_ul || null,
          electrolyte_notes: el.electrolyte_notes || null,
        })
      } else if (code === 'assembly') {
        // Assembly params saved via coin config endpoint (spacer layout etc.)
        const a = steps.assembly
        await api.patch(`/api/batteries/battery_coin_config/${id}`, {
          coin_layout: a.separator_layout || null,
        })
      } else if (code === 'qc') {
        // QC data saved via battery header
        await api.patch(`/api/batteries/${id}`, {
          battery_notes: `OCV: ${steps.qc.ocv_v || '—'} В, ESR: ${steps.qc.esr_mohm || '—'} мОм. ${steps.qc.qc_notes || ''} ${steps.qc.electrochem_notes || ''}`.trim(),
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
      const id = currentBatchId.value

      // Load battery header
      const { data: all } = await api.get('/api/batteries')
      const b = all.find(x => x.battery_id === id)
      if (!b) throw new Error('Battery not found')

      general.name = `Акк. #${b.battery_id}`
      general.form_factor = b.form_factor || ''
      general.project_id = b.project_id ?? ''
      general.battery_notes = b.notes || ''

      // Load config (try coin first, then pouch, then cyl)
      try {
        const { data: coin } = await api.get(`/api/batteries/battery_coin_config/${id}`)
        if (coin) {
          steps.config.coin_cell_mode = coin.coin_cell_mode || ''
          steps.config.coin_size_code = coin.coin_size_code || ''
          steps.config.half_cell_type = coin.half_cell_type || ''
          steps.config.coin_layout = coin.coin_layout || ''
          steps.config.spacer_thickness_mm = coin.spacer_thickness_mm ?? ''
          steps.config.spacer_count = coin.spacer_count ?? ''
          steps.config.spacer_notes = coin.spacer_notes || ''
          steps.config.li_foil_notes = coin.li_foil_notes || ''
        }
      } catch {}

      // Load electrode sources
      try {
        const { data: sources } = await api.get(`/api/batteries/battery_electrode_sources/${id}`)
        if (sources && Array.isArray(sources)) {
          const cathode = sources.find(s => s.role === 'cathode')
          const anode = sources.find(s => s.role === 'anode')
          if (cathode) {
            steps.electrodes.cathode_tape_id = cathode.tape_id ?? ''
            steps.electrodes.cathode_cut_batch_id = cathode.cut_batch_id ?? ''
            steps.electrodes.cathode_source_notes = cathode.source_notes || ''
          }
          if (anode) {
            steps.electrodes.anode_tape_id = anode.tape_id ?? ''
            steps.electrodes.anode_cut_batch_id = anode.cut_batch_id ?? ''
            steps.electrodes.anode_source_notes = anode.source_notes || ''
          }
        }
      } catch {}

      // Load separator config
      try {
        const { data: sep } = await api.get(`/api/batteries/battery_sep_config/${id}`)
        if (sep) {
          steps.separator.separator_id = sep.separator_id ?? ''
          steps.separator.separator_notes = sep.separator_notes || ''
        }
      } catch {}

      // Load electrolyte config
      try {
        const { data: el } = await api.get(`/api/batteries/battery_electrolyte/${id}`)
        if (el) {
          steps.electrolyte.electrolyte_id = el.electrolyte_id ?? ''
          steps.electrolyte.electrolyte_total_ul = el.electrolyte_total_ul ?? ''
          steps.electrolyte.electrolyte_notes = el.electrolyte_notes || ''
        }
      } catch {}

    } finally {
      isRestoring.value = false
      clearAllDirty()
      loading.value = false
    }
  }

  // ── Stage status ──
  function stageStatus(code) {
    if (code === 'general') return currentBatchId.value ? 'done' : 'pending'
    if (code === 'config') return steps.config.coin_cell_mode || steps.config.coin_size_code ? 'done' : 'pending'
    if (code === 'electrodes') return steps.electrodes.cathode_tape_id || steps.electrodes.anode_tape_id ? 'done' : 'pending'
    if (code === 'separator') return steps.separator.separator_id ? 'done' : 'pending'
    if (code === 'electrolyte') return steps.electrolyte.electrolyte_id ? 'done' : 'pending'
    if (code === 'assembly') return steps.assembly.separator_layout ? 'done' : 'pending'
    if (code === 'qc') return steps.qc.ocv_v || steps.qc.esr_mohm ? 'done' : 'pending'
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
