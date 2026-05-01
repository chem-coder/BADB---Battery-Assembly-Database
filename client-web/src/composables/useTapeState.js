/**
 * useTapeState — composable encapsulating the reactive state + API logic
 * for a single tape. Extracted from TapeFormPage.vue.
 *
 * Can be instantiated multiple times (one per tape in Constructor).
 *
 * Usage:
 *   const tape = useTapeState({ tapeId: 11, refs, authStore })
 *   await tape.restore()
 *   tape.steps.weighing.operator = 5
 *   await tape.saveStep('weighing')
 */
import { ref, reactive, computed, watch } from 'vue'
import api from '@/services/api'

// ── helpers ──
function parseDt(isoStr) {
  if (!isoStr) return { date: '', time: '' }
  const dt = new Date(isoStr)
  if (!Number.isFinite(dt.getTime())) return { date: '', time: '' }
  const yyyy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  const hh = String(dt.getHours()).padStart(2, '0')
  const min = String(dt.getMinutes()).padStart(2, '0')
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${min}` }
}

function buildStartedAt(date, time) {
  if (!date || !time) return null
  return `${date}T${time}`
}

function nowParts() {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const min = String(now.getMinutes()).padStart(2, '0')
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${min}` }
}

export function useTapeState({ tapeId = null, refs = {}, authStore = null } = {}) {

  // ── General info ──
  const general = reactive({
    name: '',
    createdBy: '',
    projectId: '',
    tapeNotes: '',
    tapeType: '',
    tapeRecipeId: '',
    calcMode: '',
    targetMassG: '',
    status: 'draft',
    createdAt: null,
  })

  // ── Entity metadata (created/updated) ──
  const meta = reactive({
    created_by_name: null,
    created_at: null,
    updated_by_name: null,
    updated_at: null,
  })

  const currentTapeId = ref(tapeId)
  const saving = ref(false)
  const loading = ref(false)

  // ── Steps state ──
  const steps = reactive({
    drying_am: {
      operator: '', date: '', time: '', notes: '',
      temperature: '', atmosphere: '', targetDuration: '', otherParam: '',
    },
    weighing: {
      operator: '', date: '', time: '', notes: '',
    },
    mixing: {
      operator: '', date: '', time: '', notes: '',
      slurryVolumeMl: '', dryMixingId: '', wetMixingId: '',
      dryStartDate: '', dryStartTime: '', dryDurationMin: '', dryRpm: '',
      wetStartDate: '', wetStartTime: '', wetDurationMin: '', wetRpm: '',
      viscosityCp: '',
    },
    coating: {
      operator: '', date: '', time: '', notes: '',
      foilId: '', coatingId: '', coatingSidedness: '',
    },
    drying_tape: {
      operator: '', date: '', time: '', notes: '',
      temperature: '', atmosphere: '', targetDuration: '', otherParam: '',
    },
    calendering: {
      operator: '', date: '', time: '', notes: '',
      tempC: '', pressureValue: '', pressureUnits: '',
      drawSpeedMMin: '', initThicknessMicrons: '', finalThicknessMicrons: '',
      noPasses: '', otherParams: '',
      shine: false, curl: false, dots: false, otherCheck: false, otherText: '',
    },
    drying_pressed_tape: {
      operator: '', date: '', time: '', notes: '',
      temperature: '', atmosphere: '', targetDuration: '', otherParam: '',
    },
  })

  // ── Dirty tracking ──
  const dirtySteps = reactive({
    general_info: false, recipe_materials: false,
    drying_am: false, weighing: false, mixing: false,
    coating: false, drying_tape: false, calendering: false, drying_pressed_tape: false,
  })

  const isRestoring = ref(false)

  function setDirty(step, val = true) {
    if (step === 'general_info' && isRestoring.value && val) return
    dirtySteps[step] = val
  }

  function clearAllDirty() {
    Object.keys(dirtySteps).forEach(k => { dirtySteps[k] = false })
  }

  const anyDirty = computed(() => Object.values(dirtySteps).some(Boolean))

  // ── Undo / Redo history (snapshot-based) ──
  const MAX_HISTORY = 50
  const undoStack = ref([])   // past snapshots
  const redoStack = ref([])   // future snapshots
  let _skipHistory = false     // flag to prevent recording during undo/redo/restore

  function _takeSnapshot() {
    return {
      general: JSON.parse(JSON.stringify(general)),
      steps: JSON.parse(JSON.stringify(steps)),
    }
  }

  function _applySnapshot(snap) {
    _skipHistory = true
    Object.assign(general, snap.general)
    for (const code of Object.keys(snap.steps)) {
      if (steps[code]) Object.assign(steps[code], snap.steps[code])
    }
    _skipHistory = false
  }

  function pushHistory() {
    if (_skipHistory) return
    undoStack.value.push(_takeSnapshot())
    if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift()
    redoStack.value = [] // new edit clears redo
  }

  // Debounced version — snapshots only after 400ms idle (not per keystroke)
  let _historyTimer = null
  function pushHistoryDebounced() {
    if (_skipHistory) return
    if (!_historyTimer) {
      // Take "before" snapshot immediately on first change in burst
      pushHistory()
    }
    clearTimeout(_historyTimer)
    _historyTimer = setTimeout(() => { _historyTimer = null }, 400)
  }

  // ── Auto-save (debounced per step) ──
  const _saveTimers = {}
  const _savingNow = {}   // per-step lock to prevent concurrent saves
  const AUTO_SAVE_DELAY = 800 // ms

  function _scheduleAutoSave(stageCode) {
    clearTimeout(_saveTimers[stageCode])
    _saveTimers[stageCode] = setTimeout(async () => {
      if (!dirtySteps[stageCode]) return
      if (_savingNow[stageCode]) return          // already saving — skip, next edit will re-schedule
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

  function _autoSaveAll() {
    // After undo/redo, save all steps that might have changed
    for (const code of Object.keys(dirtySteps)) {
      setDirty(code, true)
      _scheduleAutoSave(code)
    }
  }

  function undo() {
    if (!undoStack.value.length) return
    redoStack.value.push(_takeSnapshot())
    const snap = undoStack.value.pop()
    _applySnapshot(snap)
    _autoSaveAll()
  }

  function redo() {
    if (!redoStack.value.length) return
    undoStack.value.push(_takeSnapshot())
    const snap = redoStack.value.pop()
    _applySnapshot(snap)
    _autoSaveAll()
  }

  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

  // ── Recipe lines & instances ──
  const currentRecipeLines = ref([])
  const selectedInstanceByLineId = reactive({})
  const instanceCacheByMaterialId = reactive({})
  const instanceComponentsCache = reactive({})
  const slurryActuals = reactive({})
  const instancesByLineId = reactive({})

  async function fetchInstances(materialId) {
    if (!materialId) return []
    if (instanceCacheByMaterialId[materialId]) return instanceCacheByMaterialId[materialId]
    const { data } = await api.get(`/api/materials/${materialId}/instances`)
    instanceCacheByMaterialId[materialId] = data
    return data
  }

  async function fetchComponents(instanceId) {
    if (!instanceId) return []
    if (instanceComponentsCache[instanceId]) return instanceComponentsCache[instanceId]
    const { data } = await api.get(`/api/materials/instances/${instanceId}/components`)
    instanceComponentsCache[instanceId] = data
    return data
  }

  async function loadInstancesForLine(line) {
    if (instancesByLineId[line.recipe_line_id]) return
    const data = await fetchInstances(line.material_id)
    instancesByLineId[line.recipe_line_id] = data.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }

  // ── Gantt stages ──
  function findUserName(userId) {
    if (!userId) return ''
    const u = (refs.users || []).find(x => String(x.user_id) === String(userId))
    return u?.name || ''
  }

  const ganttStages = computed(() => {
    if (!currentTapeId.value) return []
    const stages = [
      {
        name: 'Общая информация',
        operator: findUserName(general.createdBy),
        startedAt: general.createdAt,
        status: currentTapeId.value ? 'done' : 'pending',
      },
      {
        name: 'Замес',
        operator: findUserName(steps.weighing.operator),
        startedAt: steps.weighing.date && steps.weighing.time ? `${steps.weighing.date}T${steps.weighing.time}` : null,
        status: steps.weighing.date && steps.weighing.time ? 'done' : 'pending',
      },
      {
        name: 'Нанесение',
        operator: findUserName(steps.coating.operator),
        startedAt: steps.coating.date && steps.coating.time ? `${steps.coating.date}T${steps.coating.time}` : null,
        status: steps.coating.date && steps.coating.time ? 'done' : 'pending',
      },
      {
        name: 'Каландрирование',
        operator: findUserName(steps.calendering.operator),
        startedAt: steps.calendering.date && steps.calendering.time ? `${steps.calendering.date}T${steps.calendering.time}` : null,
        status: steps.calendering.date && steps.calendering.time ? 'done' : 'pending',
      },
    ]
    const lastDoneIdx = stages.map(s => s.status).lastIndexOf('done')
    const nextPendingIdx = stages.findIndex((s, i) => i > lastDoneIdx && s.status === 'pending')
    if (nextPendingIdx >= 0) stages[nextPendingIdx].status = 'active'
    return stages
  })

  // ── Stage completion status (for navigator) ──
  function stageStatus(code) {
    if (code === 'general_info') return currentTapeId.value ? 'done' : 'pending'
    const s = steps[code]
    if (!s) return 'pending'
    return s.date && s.time ? 'done' : 'pending'
  }

  // ── Calendering appearance ──
  function buildCalAppearance() {
    const vals = []
    if (steps.calendering.shine) vals.push('Блеск')
    if (steps.calendering.curl) vals.push('Закрутка')
    if (steps.calendering.dots) vals.push('Точечки')
    if (steps.calendering.otherCheck && steps.calendering.otherText.trim())
      vals.push('Другое: ' + steps.calendering.otherText.trim())
    return vals.join('; ')
  }

  function parseCalAppearance(str) {
    steps.calendering.shine = (str || '').includes('Блеск')
    steps.calendering.curl = (str || '').includes('Закрутка')
    steps.calendering.dots = (str || '').includes('Точечки')
    if ((str || '').includes('Другое:')) {
      steps.calendering.otherCheck = true
      steps.calendering.otherText = (str || '').split('Другое:')[1]?.split(';')[0]?.trim() || ''
    } else {
      steps.calendering.otherCheck = false
      steps.calendering.otherText = ''
    }
  }

  // ── Save general info ──
  async function saveGeneral() {
    saving.value = true
    const data = {
      name: general.name,
      created_by: general.createdBy || (authStore?.user?.userId ? String(authStore.user.userId) : ''),
      project_id: general.projectId || null,
      notes: general.tapeNotes,
      tape_type: general.tapeType,
      tape_recipe_id: general.tapeRecipeId || null,
      calc_mode: general.calcMode,
      target_mass_g: general.targetMassG || null,
    }

    try {
      if (!currentTapeId.value) {
        const { data: created } = await api.post('/api/tapes', data)
        currentTapeId.value = created.tape_id
        await saveAllActuals()
        clearAllDirty()
        return created.tape_id
      } else {
        await api.put(`/api/tapes/${currentTapeId.value}`, data)
        await saveAllActuals()
        setDirty('general_info', false)
        setDirty('recipe_materials', false)
        return currentTapeId.value
      }
    } finally {
      saving.value = false
    }
  }

  async function saveAllActuals() {
    if (!currentTapeId.value) return
    for (const line of currentRecipeLines.value) {
      const lineId = line.recipe_line_id
      const instanceId = selectedInstanceByLineId[lineId]
      if (!instanceId) continue
      const actual = slurryActuals[lineId] || { mode: 'mass', value: '' }
      const payload = { recipe_line_id: lineId, material_instance_id: Number(instanceId) }
      const value = Number(actual.value)
      if (Number.isFinite(value) && value > 0) {
        payload.measure_mode = actual.mode
        if (actual.mode === 'mass') payload.actual_mass_g = value
        if (actual.mode === 'volume') payload.actual_volume_ml = value
      }
      try { await api.post(`/api/tapes/${currentTapeId.value}/actuals`, payload) } catch {}
    }
  }

  // ── Save a single actual line (per-row auto-save on blur) ──
  // XOR clearing: always send BOTH actual_mass_g and actual_volume_ml —
  // one of them null — so the backend overwrites the inactive column
  // instead of leaving a stale value. The backend's UPSERT only preserves
  // existing values when all three (measure_mode, mass, volume) are NULL,
  // so an explicit `measure_mode` + one-NULL value triggers an overwrite.
  async function saveActualLine(lineId) {
    if (!currentTapeId.value) return
    if (lineId == null) return
    const actual = slurryActuals[lineId] || { mode: 'mass', value: '' }
    const mode = actual.mode === 'volume' ? 'volume' : 'mass'
    const instanceId = selectedInstanceByLineId[lineId]
    const numeric = Number(actual.value)
    const hasValue = Number.isFinite(numeric) && numeric > 0

    // Nothing to persist — user tabbed through an untouched row. Skip
    // the POST to avoid spamming the DB with all-null rows on mount.
    // NB: when ANY of instance/value is present we still POST, because
    // even a bare instance assignment (with no mass/volume yet) is a
    // meaningful state to record.
    if (!instanceId && !hasValue) return

    const payload = {
      recipe_line_id: lineId,
      material_instance_id: instanceId ? Number(instanceId) : null,
      measure_mode: mode,
      actual_mass_g: mode === 'mass' && hasValue ? numeric : null,
      actual_volume_ml: mode === 'volume' && hasValue ? numeric : null,
    }

    await api.post(`/api/tapes/${currentTapeId.value}/actuals`, payload)
    setDirty('recipe_materials', false)
  }

  // ── Drop cached instances for a specific line (e.g. when material_id changes) ──
  // Exposed for future recipe-editor use; not called by the actuals editor itself
  // (the actuals editor never mutates material_id).
  function invalidateInstancesForLine(lineId) {
    if (lineId == null) return
    delete instancesByLineId[lineId]
  }

  // ── Save drying-type step ──
  async function saveDryingStep(code) {
    if (!currentTapeId.value) throw new Error('Сначала создайте ленту')
    const src = steps[code]
    const payload = {
      performed_by: Number(src.operator) || null,
      started_at: buildStartedAt(src.date, src.time),
      comments: src.notes || null,
      temperature_c: Number(src.temperature) || null,
      atmosphere: src.atmosphere || null,
      target_duration_min: Number(src.targetDuration) || null,
      other_parameters: src.otherParam || null,
    }
    await api.post(`/api/tapes/${currentTapeId.value}/steps/by-code/${code}`, payload)
    setDirty(code, false)
  }

  // ── Save weighing ──
  async function saveWeighing() {
    if (!currentTapeId.value) throw new Error('Сначала создайте ленту')
    const payload = {
      performed_by: Number(steps.weighing.operator) || null,
      started_at: buildStartedAt(steps.weighing.date, steps.weighing.time),
      comments: steps.weighing.notes || null,
    }
    await api.post(`/api/tapes/${currentTapeId.value}/steps/by-code/weighing`, payload)
    setDirty('weighing', false)
  }

  // ── Save mixing ──
  async function saveMixing() {
    if (!currentTapeId.value) throw new Error('Сначала создайте ленту')
    const m = steps.mixing
    const payload = {
      performed_by: Number(m.operator) || null,
      started_at: buildStartedAt(m.date, m.time),
      comments: m.notes || null,
      slurry_volume_ml: m.slurryVolumeMl || null,
      dry_mixing_id: m.dryMixingId || null,
      dry_start_time: buildStartedAt(m.dryStartDate, m.dryStartTime),
      dry_duration_min: m.dryDurationMin || null,
      dry_rpm: m.dryRpm || null,
      wet_mixing_id: m.wetMixingId || null,
      wet_start_time: buildStartedAt(m.wetStartDate, m.wetStartTime),
      wet_duration_min: m.wetDurationMin || null,
      wet_rpm: m.wetRpm || null,
      viscosity_cP: m.viscosityCp || null,
    }
    await api.post(`/api/tapes/${currentTapeId.value}/steps/by-code/mixing`, payload)
    setDirty('mixing', false)
  }

  // ── Save coating ──
  async function saveCoating() {
    if (!currentTapeId.value) throw new Error('Сначала создайте ленту')
    const c = steps.coating
    const payload = {
      performed_by: Number(c.operator) || null,
      started_at: buildStartedAt(c.date, c.time),
      comments: c.notes || null,
      foil_id: c.foilId || null,
      coating_id: c.coatingId || null,
      // coating_sidedness — null when blank (DB CHECK constraint accepts
      // NULL + enum values, not empty string). "'' || null" → null.
      coating_sidedness: c.coatingSidedness || null,
    }
    await api.post(`/api/tapes/${currentTapeId.value}/steps/by-code/coating`, payload)
    setDirty('coating', false)
  }

  // ── Save calendering ──
  async function saveCalendering() {
    if (!currentTapeId.value) throw new Error('Сначала создайте ленту')
    const cal = steps.calendering
    const payload = {
      performed_by: Number(cal.operator) || null,
      started_at: buildStartedAt(cal.date, cal.time),
      comments: cal.notes || null,
      temp_c: cal.tempC || null,
      pressure_value: cal.pressureValue || null,
      pressure_units: cal.pressureUnits || null,
      draw_speed_m_min: cal.drawSpeedMMin || null,
      init_thickness_microns: cal.initThicknessMicrons || null,
      final_thickness_microns: cal.finalThicknessMicrons || null,
      no_passes: cal.noPasses || null,
      other_params: cal.otherParams || null,
      appearance: buildCalAppearance(),
    }
    await api.post(`/api/tapes/${currentTapeId.value}/steps/by-code/calendering`, payload)
    setDirty('calendering', false)
  }

  // ── Unified step save ──
  async function saveStep(code) {
    switch (code) {
      case 'general_info':
      case 'recipe_materials':
        return saveGeneral()
      case 'drying_am':
      case 'drying_tape':
      case 'drying_pressed_tape':
        return saveDryingStep(code)
      case 'weighing': return saveWeighing()
      case 'mixing': return saveMixing()
      case 'coating': return saveCoating()
      case 'calendering': return saveCalendering()
    }
  }

  // ── Restore tape from API ──
  async function restore() {
    if (!currentTapeId.value) return
    loading.value = true
    isRestoring.value = true

    try {
      const { data: t } = await api.get(`/api/tapes/${currentTapeId.value}`)
      if (!t) throw new Error('Лента не найдена')

      general.name = t.name || ''
      general.createdBy = t.created_by || ''
      general.projectId = t.project_id || ''
      general.tapeNotes = t.notes || ''
      general.tapeType = t.role || ''
      general.calcMode = t.calc_mode || ''
      general.targetMassG = t.target_mass_g || ''
      general.status = t.status || 'draft'
      general.createdAt = t.created_at || null
      general.tapeRecipeId = t.tape_recipe_id || ''

      // Entity metadata
      meta.created_by_name = t.created_by_name || null
      meta.created_at = t.created_at || null
      meta.updated_by_name = t.updated_by_name || null
      meta.updated_at = t.updated_at || null

      // restore actuals + instance selections
      if (t.tape_recipe_id) {
        try {
          const { data: lines } = await api.get(`/api/recipes/${t.tape_recipe_id}/lines`)
          currentRecipeLines.value = lines
          for (const line of lines) { loadInstancesForLine(line) }
        } catch {}

        try {
          const { data: actuals } = await api.get(`/api/tapes/${t.tape_id}/actuals`)
          actuals.forEach(a => {
            if (a.material_instance_id) selectedInstanceByLineId[a.recipe_line_id] = String(a.material_instance_id)
            slurryActuals[a.recipe_line_id] = {
              mode: a.measure_mode || 'mass',
              value: a.measure_mode === 'volume' ? (a.actual_volume_ml ?? '') : (a.actual_mass_g ?? ''),
            }
          })
        } catch {}
      }

      // restore all steps
      await Promise.allSettled([
        restoreDryingStep('drying_am'),
        restoreDryingStep('drying_tape'),
        restoreDryingStep('drying_pressed_tape'),
      ])

      // weighing
      try {
        const { data: w } = await api.get(`/api/tapes/${t.tape_id}/steps/by-code/weighing`)
        if (w) {
          const dt = parseDt(w.started_at)
          steps.weighing.operator = String(w.performed_by ?? '')
          steps.weighing.date = dt.date; steps.weighing.time = dt.time
          steps.weighing.notes = w.comments || ''
        }
      } catch {}

      // mixing
      try {
        const { data: m } = await api.get(`/api/tapes/${t.tape_id}/steps/by-code/mixing`)
        if (m) {
          const dt = parseDt(m.started_at)
          steps.mixing.operator = String(m.performed_by ?? '')
          steps.mixing.date = dt.date; steps.mixing.time = dt.time
          steps.mixing.notes = m.comments || ''
          steps.mixing.slurryVolumeMl = m.slurry_volume_ml ?? ''
          steps.mixing.dryMixingId = m.dry_mixing_id ?? ''
          steps.mixing.wetMixingId = m.wet_mixing_id ?? ''
          const dryDt = parseDt(m.dry_start_time)
          steps.mixing.dryStartDate = dryDt.date; steps.mixing.dryStartTime = dryDt.time
          steps.mixing.dryDurationMin = m.dry_duration_min ?? ''
          steps.mixing.dryRpm = m.dry_rpm ?? ''
          const wetDt = parseDt(m.wet_start_time)
          steps.mixing.wetStartDate = wetDt.date; steps.mixing.wetStartTime = wetDt.time
          steps.mixing.wetDurationMin = m.wet_duration_min ?? ''
          steps.mixing.wetRpm = m.wet_rpm ?? ''
          steps.mixing.viscosityCp = m.viscosity_cp ?? ''
        }
      } catch {}

      // coating
      try {
        const { data: c } = await api.get(`/api/tapes/${t.tape_id}/steps/by-code/coating`)
        if (c) {
          const dt = parseDt(c.started_at)
          steps.coating.operator = String(c.performed_by ?? '')
          steps.coating.date = dt.date; steps.coating.time = dt.time
          steps.coating.notes = c.comments || ''
          steps.coating.foilId = c.foil_id ?? ''
          steps.coating.coatingId = c.coating_id ?? ''
          steps.coating.coatingSidedness = c.coating_sidedness ?? ''
        }
      } catch {}

      // calendering
      try {
        const { data: cal } = await api.get(`/api/tapes/${t.tape_id}/steps/by-code/calendering`)
        if (cal) {
          const dt = parseDt(cal.started_at)
          steps.calendering.operator = String(cal.performed_by ?? '')
          steps.calendering.date = dt.date; steps.calendering.time = dt.time
          steps.calendering.notes = cal.comments || ''
          steps.calendering.tempC = cal.temp_c ?? ''
          steps.calendering.pressureValue = cal.pressure_value ?? ''
          steps.calendering.pressureUnits = cal.pressure_units ?? ''
          steps.calendering.drawSpeedMMin = cal.draw_speed_m_min ?? ''
          steps.calendering.initThicknessMicrons = cal.init_thickness_microns ?? ''
          steps.calendering.finalThicknessMicrons = cal.final_thickness_microns ?? ''
          steps.calendering.noPasses = cal.no_passes ?? ''
          steps.calendering.otherParams = cal.other_params ?? ''
          parseCalAppearance(cal.appearance)
        }
      } catch {}
    } finally {
      isRestoring.value = false
      clearAllDirty()
      loading.value = false
    }
  }

  async function restoreDryingStep(code) {
    try {
      const { data } = await api.get(`/api/tapes/${currentTapeId.value}/steps/by-code/${code}`)
      if (!data) return
      const dt = parseDt(data.started_at)
      steps[code].operator = String(data.performed_by ?? '')
      steps[code].date = dt.date; steps[code].time = dt.time
      steps[code].notes = data.comments || ''
      steps[code].temperature = data.temperature_c ?? ''
      steps[code].atmosphere = data.atmosphere || ''
      steps[code].targetDuration = data.target_duration_min ?? ''
      steps[code].otherParam = data.other_parameters || ''
    } catch {}
  }

  // ── Get field value (for comparison view) ──
  function getFieldValue(stageCode, fieldKey) {
    if (stageCode === 'general_info') return general[fieldKey] ?? ''
    return steps[stageCode]?.[fieldKey] ?? ''
  }

  // ── Set field value (for comparison view) ──
  function setFieldValue(stageCode, fieldKey, value) {
    pushHistoryDebounced() // snapshot on first change, debounce subsequent keystrokes
    if (stageCode === 'general_info') {
      general[fieldKey] = value
      setDirty('general_info')
      _scheduleAutoSave('general_info')
    } else if (steps[stageCode]) {
      steps[stageCode][fieldKey] = value
      setDirty(stageCode)
      _scheduleAutoSave(stageCode)
    }
  }

  // ── Copy stage data from another tape state ──
  function copyStageFrom(stageCode, sourceTape) {
    if (stageCode === 'general_info') {
      // Copy only safe fields (not name, not tapeRecipeId)
      general.tapeType = sourceTape.general.tapeType
      general.calcMode = sourceTape.general.calcMode
      general.targetMassG = sourceTape.general.targetMassG
      setDirty('general_info')
    } else if (steps[stageCode] && sourceTape.steps[stageCode]) {
      const src = sourceTape.steps[stageCode]
      const tgt = steps[stageCode]
      for (const key of Object.keys(tgt)) {
        tgt[key] = src[key]
      }
      setDirty(stageCode)
    }
  }

  // ── Set Now helper ──
  function setNow(stageCode) {
    const { date, time } = nowParts()
    if (stageCode === 'general_info') return
    if (steps[stageCode]) {
      steps[stageCode].date = date
      steps[stageCode].time = time
      setDirty(stageCode)
    }
  }

  return {
    // State
    general,
    steps,
    meta,
    currentTapeId,
    saving,
    loading,
    dirtySteps,
    anyDirty,
    isRestoring,

    // Recipe
    currentRecipeLines,
    selectedInstanceByLineId,
    instancesByLineId,
    slurryActuals,

    // Gantt
    ganttStages,

    // Undo / Redo
    undo,
    redo,
    canUndo,
    canRedo,
    undoStack,
    redoStack,

    // Methods
    restore,
    saveStep,
    saveGeneral,
    stageStatus,
    getFieldValue,
    setFieldValue,
    copyStageFrom,
    setNow,
    setDirty,
    clearAllDirty,

    // Instance/recipe helpers
    fetchInstances,
    fetchComponents,
    loadInstancesForLine,
    saveActualLine,
    invalidateInstancesForLine,

    // Cleanup (call from onUnmounted)
    cleanup() {
      for (const code of Object.keys(_saveTimers)) {
        clearTimeout(_saveTimers[code])
      }
      clearTimeout(_historyTimer)
    },
  }
}
