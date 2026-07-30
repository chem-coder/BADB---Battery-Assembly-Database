/**
 * useBatteryState — state composable for one battery.
 * Same interface as useTapeState / useElectrodeState for TapeConstructor.
 */
import { ref, reactive, computed } from 'vue'
import api from '@/services/api'
import { isoToMskDateTimeInput, mskDateTimeInputToIso } from '@/utils/dateFormat'

// Coerce an input value to a finite number or null. Preserves zero —
// critical for physical measurements where 0 is a legitimate reading
// (shorted cell OCV/ESR, zero spacers, zero-thickness spacer) rather
// than "no data". `|| null` coerces 0 to null and drops the reading;
// this helper is the CLAUDE.md pitfall #1 fix applied uniformly.
function toNum(v) {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// One electrode-source row (battery_electrode_sources). Row 0 of each
// role array is the primary source; extra rows are additional batches
// (pouch/prism/cylindrical cells only). Factory — never share row
// object references between states/rows.
export function emptyElectrodeSourceRow() {
  return { tape_id: '', cut_batch_id: '', source_notes: '' }
}

// Vanilla parity (3-batteries.js getElectrodeSourcesPayloadRows): a row
// is "worth sending/keeping" when any of its fields carries a value.
function electrodeSourceRowHasValue(r) {
  return Boolean(r && (r.tape_id || r.cut_batch_id || String(r.source_notes || '').trim()))
}

export function useBatteryState({ batteryId, onSaveError } = {}) {
  const currentBatchId = ref(batteryId)
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

  // ── Reactive state per stage ──
  // `project_ids` is the source of truth for the M:N table `battery_projects`
  // (migration d030). Backend accepts `project_ids: [...]` on POST/PUT —
  // see services/batteryProjectService.js.
  const general = reactive({
    name: '',
    form_factor: '',
    project_ids: [],
    // Batch assembly start (d035 date → d054 TIMESTAMPTZ). Held as a
    // naive MSK 'YYYY-MM-DDTHH:mm:ss' string for the datetime-iso field.
    item_created_at: '',
    battery_notes: '',
    purpose: '',
  })

  const steps = reactive({
    config: {
      // Coin-cell fields
      coin_cell_mode: '',
      coin_size_code: '',
      half_cell_type: '',
      coin_layout: '',
      spacer_thickness_mm: '',
      spacer_count: '',
      spacer_notes: '',
      li_foil_notes: '',
      // Pouch-cell fields (Dalia's battery_pouch_config)
      pouch_case_size_code: '',
      pouch_case_size_other: '',
      pouch_notes: '',
      // Cylindrical-cell fields (battery_cyl_config)
      cyl_size_code: '',
      cyl_notes: '',
    },
    // Multi-source model (battery_electrode_sources supports N rows per
    // role). Arrays ALWAYS have at least one row per role — row 0 is the
    // primary source. The old 6 flat keys (cathode_tape_id, …) collapsed
    // every role to a single row and silently destroyed extra sources
    // saved from vanilla; do not reintroduce them.
    electrodes: {
      cathodeSources: [emptyElectrodeSourceRow()],
      anodeSources: [emptyElectrodeSourceRow()],
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
    // No 'assembly' step: vanilla's «Параметры сборки» maps onto config /
    // separator / electrolyte above. See batteryStages.js for the history
    // of the phantom fields (separator_layout, electrolyte_assembly_notes)
    // that used to live here.
    qc: {
      // Batch testing moment (d054 battery_qc.tested_at) — naive MSK
      // datetime string, same convention as general.item_created_at.
      tested_at: '',
      ocv_v: '',
      esr_mohm: '',
      qc_notes: '',
    },
  })

  // ── Dirty tracking ──
  const dirtySteps = reactive({
    general: false,
    config: false,
    electrodes: false,
    separator: false,
    electrolyte: false,
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
    try {
      Object.assign(general, s.general)
      for (const key of Object.keys(steps)) {
        if (s.steps[key]) Object.assign(steps[key], s.steps[key])
      }
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

  // Reset debounce so the next edit takes a fresh snapshot — without
  // this, an edit within 400ms of an undo would be folded into the
  // previous burst and the just-restored state would be unreachable
  // via undo.
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
    for (const k of Object.keys(dirtySteps)) {
      setDirty(k)
      _scheduleAutoSave(k)
    }
  }

  function redo() {
    if (!redoStack.value.length) return
    undoStack.value.push(_takeSnapshot())
    _applySnapshot(redoStack.value.pop())
    _resetHistoryDebounce()
    for (const k of Object.keys(dirtySteps)) {
      setDirty(k)
      _scheduleAutoSave(k)
    }
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
        // NEVER swallow a failed save silently — surface it to the page
        // (toast) so unsaved data is not discovered days later. Dirty flag
        // stays true, so the stage still shows as unsaved.
        console.error(`Auto-save failed for battery ${stageCode}:`, e)
        onSaveError?.(stageCode, e)
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

  // Fields that belong to each form factor's subtype config. Listed
  // explicitly (rather than introspecting steps.config) so the clear
  // stays surgical — header-level and shared fields never get wiped.
  const COIN_CONFIG_FIELDS = [
    'coin_cell_mode', 'coin_size_code', 'half_cell_type', 'coin_layout',
    'spacer_thickness_mm', 'spacer_count', 'spacer_notes', 'li_foil_notes',
  ]
  const POUCH_CONFIG_FIELDS = [
    'pouch_case_size_code', 'pouch_case_size_other', 'pouch_notes',
  ]
  const CYL_CONFIG_FIELDS = ['cyl_size_code', 'cyl_notes']

  function _clearFormFactorSiblings(newFormFactor) {
    // Wipe fields belonging to the OTHER form factors so their stale data
    // doesn't silently persist in state (and doesn't accidentally get
    // serialized to a future save if the user switches back). Matches the
    // in-stage cascade pattern already used for pouch_case_size_code →
    // pouch_case_size_other above.
    if (newFormFactor !== 'coin') {
      for (const k of COIN_CONFIG_FIELDS) steps.config[k] = ''
    }
    // Prism reuses the pouch config (d036) — pouch fields survive both.
    if (newFormFactor !== 'pouch' && newFormFactor !== 'prism') {
      for (const k of POUCH_CONFIG_FIELDS) steps.config[k] = ''
    }
    if (newFormFactor !== 'cylindrical') {
      for (const k of CYL_CONFIG_FIELDS) steps.config[k] = ''
    }
  }

  function setFieldValue(stageCode, fieldKey, value) {
    pushHistoryDebounced()
    if (stageCode === 'general') {
      const prevFormFactor = general.form_factor
      general[fieldKey] = value
      // Form factor changed → clear stale config fields from OTHER form
      // factors. Otherwise switching coin→pouch→coin preserves pouch data
      // hidden in state, which could leak into the next config save or
      // re-appear unexpectedly if the user switches back.
      if (fieldKey === 'form_factor' && value !== prevFormFactor) {
        _clearFormFactorSiblings(value)
        setDirty('config')
      }
      setDirty('general')
      _scheduleAutoSave('general')
    } else if (steps[stageCode]) {
      // Deep-copy arrays (electrode source rows, multiselects) so the
      // stored state never shares object references with the caller —
      // a shared row object would let a later edit in one battery/row
      // silently mutate another (same discipline as the multiselect
      // deep-copy in StageCompareEditor.copyField).
      steps[stageCode][fieldKey] = Array.isArray(value)
        ? JSON.parse(JSON.stringify(value))
        : value
      // Cascade: pouch_case_size_code !== 'other' → clear pouch_case_size_other
      // (mirrors backend validator in routes/batteries.js:validatePouchCaseSizeInput)
      if (stageCode === 'config' && fieldKey === 'pouch_case_size_code' && value !== 'other') {
        steps.config.pouch_case_size_other = ''
      }
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
        const pids = Array.isArray(general.project_ids)
          ? general.project_ids.map(Number).filter(Number.isFinite)
          : []
        await api.patch(`/api/batteries/${id}`, {
          // M:N — backend writes battery_projects (d030).
          project_ids: pids,
          project_id: pids[0] || undefined, // legacy echo
          form_factor: general.form_factor || undefined,
          // Naive MSK state → explicit +03:00 ISO (d054 TIMESTAMPTZ).
          // null = keep the stored value (backend PATCH semantics).
          item_created_at: mskDateTimeInputToIso(general.item_created_at),
          battery_notes: general.battery_notes || null,
          purpose: general.purpose || null,
        })
      } else if (code === 'config') {
        const c = steps.config
        // Route by form factor — ALL via POST upserts (ON CONFLICT).
        // The PATCH variants 404 while the config row does not exist,
        // which is exactly the state of a battery created in Vue (config
        // rows appear only on first save) — that 404 silently ate the
        // whole stage until 2026-07-30.
        if (general.form_factor === 'pouch' || general.form_factor === 'prism') {
          // Pouch config uses POST (upsert semantics in Dalia's backend).
          // Prism intentionally reuses battery_pouch_config (d036,
          // docs/current/batteries.md) — routing it to the coin default
          // silently saved prism configs into battery_coin_config.
          await api.post(`/api/batteries/battery_pouch_config`, {
            battery_id: id,
            pouch_case_size_code: c.pouch_case_size_code || null,
            pouch_case_size_other: c.pouch_case_size_code === 'other'
              ? (c.pouch_case_size_other || null)
              : null,
            pouch_notes: c.pouch_notes || null,
          })
        } else if (general.form_factor === 'cylindrical') {
          // Cylindrical config uses POST (upsert semantics in Dalia's backend).
          await api.post(`/api/batteries/battery_cyl_config`, {
            battery_id: id,
            cyl_size_code: c.cyl_size_code || null,
            cyl_notes: c.cyl_notes || null,
          })
        } else {
          // Coin (default) config. Numeric spacer fields go through toNum
          // so zero (no spacer / zero-thickness spacer — legitimate for
          // some half-cell recipes) is preserved instead of dropped by
          // `|| null`. Enum/text fields keep `|| null` — empty string is
          // not a meaningful "zero" for them.
          await api.post(`/api/batteries/battery_coin_config`, {
            battery_id: id,
            coin_cell_mode: c.coin_cell_mode || null,
            coin_size_code: c.coin_size_code || null,
            half_cell_type: c.half_cell_type || null,
            coin_layout: c.coin_layout || null,
            spacer_thickness_mm: toNum(c.spacer_thickness_mm),
            spacer_count: toNum(c.spacer_count),
            spacer_notes: c.spacer_notes || null,
            li_foil_notes: c.li_foil_notes || null,
          })
        }
      } else if (code === 'electrodes') {
        // ARRAY mode of the PATCH (routes/batteries.js →
        // updateBatteryElectrodeSources → replaceSourceRows). The legacy
        // flat-key payload collapsed each role to ONE row and silently
        // deleted extra sources added in vanilla — never use it here.
        // Array mode always replaces BOTH roles (requestedRoles is fixed
        // to ['cathode','anode'] server-side), so both role arrays are
        // serialized on every save; sending an empty role deletes its
        // rows, which matches the state (user cleared them). Array mode
        // never 404s on "no rows yet" — no POST fallback required.
        const e = steps.electrodes
        const serializeRole = (role, rows) => (Array.isArray(rows) ? rows : [])
          .filter(electrodeSourceRowHasValue)
          .map((r, i) => ({
            role,
            tape_id: r.tape_id || null,
            cut_batch_id: r.cut_batch_id || null,
            source_notes: String(r.source_notes || '').trim() || null,
            sort_order: i,          // per-role index, row 0 = primary
            is_primary: i === 0,
          }))
        await api.patch(`/api/batteries/battery_electrode_sources/${id}`, {
          sources: [
            ...serializeRole('cathode', e.cathodeSources),
            ...serializeRole('anode', e.anodeSources),
          ],
        })
      } else if (code === 'separator') {
        const s = steps.separator
        // POST = ON CONFLICT upsert; PATCH 404s while no row exists yet.
        await api.post(`/api/batteries/battery_sep_config`, {
          battery_id: id,
          separator_id: s.separator_id || null,
          separator_notes: s.separator_notes || null,
        })
      } else if (code === 'electrolyte') {
        const el = steps.electrolyte
        // POST = ON CONFLICT upsert; PATCH 404s while no row exists yet.
        await api.post(`/api/batteries/battery_electrolyte`, {
          battery_id: id,
          electrolyte_id: el.electrolyte_id || null,
          electrolyte_total_ul: toNum(el.electrolyte_total_ul),
          electrolyte_notes: el.electrolyte_notes || null,
        })
      } else if (code === 'qc') {
        // QC → dedicated battery_qc table. UPSERT via POST (ON CONFLICT
        // battery_id) is idempotent and safer than PATCH which 404s when
        // no row exists yet. `toNum` (module-level, above) preserves
        // legitimate zeros (shorted cell reads 0 V / 0 mΩ) while
        // mapping empty strings and non-numeric input to null.
        await api.post('/api/batteries/battery_qc', {
          battery_id: id,
          // Explicit null clears the batch-testing time; the backend only
          // preserves the stored value when the key is ABSENT (vanilla).
          tested_at: mskDateTimeInputToIso(steps.qc.tested_at),
          ocv_v: toNum(steps.qc.ocv_v),
          esr_mohm: toNum(steps.qc.esr_mohm),
          qc_notes: steps.qc.qc_notes || null,
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
      // Restore M:N project assignment. Backend GET returns `project_ids`
      // (preferred) and a legacy `project_id` echo for downward compat.
      if (Array.isArray(b.project_ids) && b.project_ids.length > 0) {
        general.project_ids = b.project_ids.map(Number).filter(Number.isFinite)
      } else if (b.project_id) {
        general.project_ids = [Number(b.project_id)]
      } else {
        general.project_ids = []
      }
      // TIMESTAMPTZ (d054) comes back as a UTC ISO instant — re-read it
      // as Moscow wall-clock for the date+time inputs. Pre-d054 rows are
      // MSK midnight, which renders as an empty-looking 00:00:00 time.
      general.item_created_at = isoToMskDateTimeInput(b.item_created_at)
      general.battery_notes = b.notes || ''
      general.purpose = b.purpose || ''

      // Entity metadata
      meta.created_by_name = b.created_by_name || null
      meta.created_at = b.created_at || null
      meta.updated_by_name = b.updated_by_name || null
      meta.updated_at = b.updated_at || null

      // Load config — route by form_factor (prism reuses pouch, d036)
      if (general.form_factor === 'pouch' || general.form_factor === 'prism') {
        try {
          const { data: pouch } = await api.get(`/api/batteries/battery_pouch_config/${id}`)
          if (pouch) {
            steps.config.pouch_case_size_code = pouch.pouch_case_size_code || ''
            steps.config.pouch_case_size_other = pouch.pouch_case_size_other || ''
            steps.config.pouch_notes = pouch.pouch_notes || ''
          }
        } catch {}
      } else if (general.form_factor === 'cylindrical') {
        try {
          const { data: cyl } = await api.get(`/api/batteries/battery_cyl_config/${id}`)
          if (cyl) {
            steps.config.cyl_size_code = cyl.cyl_size_code || ''
            steps.config.cyl_notes = cyl.cyl_notes || ''
          }
        } catch {}
      } else {
        // Coin (default)
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
      }

      // Load electrode sources — ALL rows per role (multi-source), not
      // just the first. Ordered is_primary DESC, sort_order ASC so row 0
      // is always the primary source (backend GET already orders this
      // way; the local sort is a defensive mirror).
      try {
        const { data: sources } = await api.get(`/api/batteries/battery_electrode_sources/${id}`)
        if (sources && Array.isArray(sources)) {
          const mapRole = (role) => sources
            .filter(s => s.role === role)
            .sort((a, b) =>
              (Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary))) ||
              (Number(a.sort_order || 0) - Number(b.sort_order || 0)))
            .map(s => ({
              tape_id: s.tape_id ?? '',
              cut_batch_id: s.cut_batch_id ?? '',
              source_notes: s.source_notes || '',
            }))
          const cathodeRows = mapRole('cathode')
          const anodeRows = mapRole('anode')
          steps.electrodes.cathodeSources = cathodeRows.length ? cathodeRows : [emptyElectrodeSourceRow()]
          steps.electrodes.anodeSources = anodeRows.length ? anodeRows : [emptyElectrodeSourceRow()]
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

      // Load QC (dedicated battery_qc table). GET returns null when no
      // row exists — leave steps.qc defaults in that case.
      try {
        const { data: qc } = await api.get(`/api/batteries/battery_qc/${id}`)
        if (qc) {
          steps.qc.tested_at = isoToMskDateTimeInput(qc.tested_at)
          steps.qc.ocv_v = qc.ocv_v ?? ''
          steps.qc.esr_mohm = qc.esr_mohm ?? ''
          steps.qc.qc_notes = qc.qc_notes || ''
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
    if (code === 'config') {
      if (general.form_factor === 'pouch' || general.form_factor === 'prism') {
        return steps.config.pouch_case_size_code ? 'done' : 'pending'
      }
      if (general.form_factor === 'cylindrical') {
        return steps.config.cyl_size_code ? 'done' : 'pending'
      }
      return steps.config.coin_cell_mode || steps.config.coin_size_code ? 'done' : 'pending'
    }
    if (code === 'electrodes') {
      const anySource = [...steps.electrodes.cathodeSources, ...steps.electrodes.anodeSources]
        .some(r => r.tape_id || r.cut_batch_id)
      return anySource ? 'done' : 'pending'
    }
    if (code === 'separator') return steps.separator.separator_id ? 'done' : 'pending'
    if (code === 'electrolyte') return steps.electrolyte.electrolyte_id ? 'done' : 'pending'
    if (code === 'qc') return steps.qc.ocv_v || steps.qc.esr_mohm || steps.qc.tested_at ? 'done' : 'pending'
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
