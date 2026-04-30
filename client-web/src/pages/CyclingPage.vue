<script setup>
/**
 * CyclingPage — Battery cycling test results.
 * Upload cycling data files → view sessions → interactive charts.
 */
import { ref, computed, watch, onMounted, defineAsyncComponent } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'
import { toastApiError, classifyAxiosError, errorMessageRu } from '@/utils/errorClassifier'
import PageHeader from '@/components/PageHeader.vue'
import CrudTable from '@/components/CrudTable.vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import CyclingStylePopover from '@/components/CyclingStylePopover.vue'
import { useCyclingStyles, CHART_LABELS } from '@/composables/useCyclingStyles'
import { useBackendCache } from '@/composables/useBackendCache'

const CyclingCharts = defineAsyncComponent(() => import('@/components/CyclingCharts.vue'))

// Per-chart style + preset library for the cycling charts. Each chart
// carries its own { palette, borderWidth, pointStyle, pointRadius }
// stored in the user's active preset; the preset library is persisted
// per-user in localStorage. Built-in presets (Мои по умолчанию, Публикация
// ч/б, Colorblind-safe) ship read-only; user can clone + rename any of
// them to create an editable preset. The activePresetId drives every
// chart render in <CyclingCharts>.
const cyclingStyles = useCyclingStyles()
const {
  library: styleLibrary,
  activePreset,
  getChartStyle,
  setChartStyle,
  resetChartStyle,
  applyPreset,
  savePresetAs,
  renamePreset,
  deletePreset,
} = cyclingStyles

const router = useRouter()
const toast = useToast()
const authStore = useAuthStore()

// ── Data ──────────────────────────────────────────────────────────────
// Sessions listing (table) — all sessions in the DB the user can see.
const sessions = ref([])
const batteries = ref([])
const loading = ref(true)
// Template ref to CrudTable → lets us read its filteredData (rows visible
// after the user applies column filters). Used by "График" header click.
const tableRef = ref(null)

// ── Multi-session overlay state ──────────────────────────────────────
// A session is "active" when it appears on the charts. State is keyed by
// session_id so each session carries its own summary + cycle data and
// nothing gets clobbered when the user toggles another one on/off.
//
// activeSessionIds — ordered array of active session IDs (first-added first).
// summaryBySession[id]    — [{cycle_number, charge_cap, discharge_cap, ...}]
// cycleDataBy[id][cycle]  — [{time_s, voltage_v, current_a, ...}] (lazy)
// loadingCyclesBy[id]     — array of cycleNumbers currently being fetched
//
// selectedCycles is still a single global list — the same cycle set applies
// to every active session (user-level intent: "show me cycle 1, 5, 10 for
// whatever sessions are on the chart"). If a session doesn't have cycle 10,
// its datapoints just aren't plotted — no error.
const activeSessionIds = ref([])
const summaryBySession = ref({})
const cycleDataBySession = ref({})
const loadingCyclesBy = ref({})
const selectedCycles = ref([])

// Publication preset: user-typed experiment title appears on chart titles
// + PNG filename prefix. Empty → auto titles. publicationMode toggles the
// voltage-profile style (single color dashed, no legend) — matches how
// papers render these plots.
const experimentLabel = ref('')
const publicationMode = ref(false)

// Step filter for voltage profile + dQ/dV: 'both' | 'charge' | 'discharge'
// Standard toggle in electrochemistry software — lets the user focus on
// one half-cycle (phase-transition analysis vs. delithiation fade).
const stepFilter = ref('both')

// Capacity unit: 'Ah' (absolute) or 'mAh_per_g' (specific). mAh/g only
// works when every active session has active_mass_mg populated —
// availability is a computed guard, UI auto-falls back to 'Ah' otherwise.
const capacityUnit = ref('Ah')

// dQ/dV moving-average window. 1 = no smoothing, 5 = default, 21 = max.
// Clean data wants lower (preserves peak sharpness), noisy cells want
// higher (otherwise peaks get buried in measurement jitter). The slider
// is the fastest way to A/B compare in the UI without reloading.
const smoothingWindow = ref(5)

// Capacity chart view: 'absolute' (Ah or mAh/g) vs 'retention' (C/C1 × 100%).
// Retention is the scientific-paper standard for visualising fade — every
// session starts at 100% and the curve shows % of initial capacity at
// each cycle. Pressing the toggle re-derives the data without any refetch.
const capacityView = ref('absolute')

// Voltage hysteresis chart toggle. Off by default — useful mostly when
// user is looking for polarisation growth over many cycles (SEI, contact
// loss, dendrites). Data comes from avg_charge_voltage_v /
// avg_discharge_voltage_v (migration 019); rendered as ΔV̄ in mV.
const showHysteresis = ref(false)

// Ghost trace on the voltage profile: for every selected cycle N,
// render cycle N−1 underneath as a faded thin line. Helps the eye
// catch fade between adjacent cycles. Only works when cycle N−1 is
// already loaded into cycleDataMap — we don't auto-fetch it.
const ghostTrace = ref(false)

// Per-chart style popover state. Controlled by each chart's ⚙ button in
// <CyclingCharts> — the chart id (capacity/voltage/dqdv/hysteresis) of
// the clicked one lands here so the shared popover knows which chart's
// style in the active preset it's editing. The PrimeVue Popover itself
// uses ref-based positioning: we pass the click event through to
// .toggle(event) so it anchors under the correct ⚙.
const stylePopoverRef = ref(null)
const styleCurrentChartId = ref('')
const styleCurrentStyle = computed(() => {
  return styleCurrentChartId.value ? getChartStyle(styleCurrentChartId.value) : {}
})
const styleCurrentChartLabel = computed(() => {
  return CHART_LABELS[styleCurrentChartId.value] || ''
})
const styleActivePresetReadonly = computed(() => !!activePreset.value?.readonly)
const styleActivePresetName = computed(() => activePreset.value?.name || '')

// Event from <CyclingCharts @style-click>. Emitted when the user clicks
// the ⚙ button on any chart card.
function onChartStyleClick(chartId, event) {
  styleCurrentChartId.value = chartId
  stylePopoverRef.value?.toggle(event)
}
function onStyleUpdate(partial) {
  if (!styleCurrentChartId.value) return
  setChartStyle(styleCurrentChartId.value, partial)
}
function onStyleReset() {
  if (!styleCurrentChartId.value) return
  resetChartStyle(styleCurrentChartId.value)
}
// Read-only preset → user confirms "сохранить копию" in the popover.
// We prompt for a name, clone the active preset, make it the active one.
function onStyleClone() {
  const base = activePreset.value?.name || 'Мой пресет'
  const name = window.prompt('Имя нового пресета:', `${base} (копия)`)
  if (!name || !name.trim()) return
  savePresetAs(name.trim())
}

// ── Preset management (used by the toolbar dropdown) ────────────────────
function onApplyPreset(id) {
  if (id) applyPreset(id)
}
function onPresetSaveAs() {
  const name = window.prompt('Имя нового пресета (будут сохранены текущие настройки):', '')
  if (!name || !name.trim()) return
  savePresetAs(name.trim())
}
function onPresetRename() {
  const p = activePreset.value
  if (!p || p.readonly) return
  const name = window.prompt('Новое имя пресета:', p.name)
  if (!name || !name.trim()) return
  renamePreset(p.id, name.trim())
}
function onPresetDelete() {
  const p = activePreset.value
  if (!p || p.readonly || p.id === 'default') return
  if (!window.confirm(`Удалить пресет «${p.name}»?`)) return
  deletePreset(p.id)
}

// Mass editor dialog — opens when user clicks mAh/g while some active
// sessions lack an active_mass_mg value. Lets them fill the mass inline
// and PATCHes each session; on success the mAh/g toggle auto-unlocks.
const showMassEditor = ref(false)
const massEditorRows = ref([])  // [{ session_id, battery_id, file_name, mass }]

function openMassEditor() {
  massEditorRows.value = activeSessionIds.value.map(sid => {
    const row = sessions.value.find(s => s.session_id === sid) || {}
    return {
      session_id: sid,
      battery_id: row.battery_id,
      file_name: row.file_name,
      mass: row.active_mass_mg != null ? Number(row.active_mass_mg) : null,
    }
  })
  showMassEditor.value = true
}

// Electrode mass hint for a session — sums electrode_mass_g of every
// electrode used in the session's battery (filled by the backend join
// on related_electrodes). Returned in mg to match the active_mass_mg
// convention. Null when the session has no linked electrodes (e.g. an
// old upload before electrode tracking landed in BADB).
function electrodeMassHintMg(session) {
  const rel = Array.isArray(session?.related_electrodes) ? session.related_electrodes : []
  if (!rel.length) return null
  const totalG = rel.reduce((s, e) => s + (Number(e?.electrode_mass_g) || 0), 0)
  return totalG > 0 ? totalG * 1000 : null
}

// ── Precise active-mass hint (Item D, design-first) ───────────────────
// Older revision of this file (commit 296aec3) used a crude "30-50 % of
// total electrode mass" heuristic for the tooltip. For foil+coating
// electrodes the foil often weighs 50-70 % of the total, so the crude
// range was systematically wrong. Replace with:
//   active_mg = Σ_electrodes (electrode_mass_g - avg_foil_mass_g) × 1000
// where avg_foil_mass_g is taken from Dalia's capacity_summary per each
// electrode's cut_batch. The per-electrode sum is mandatory — summing
// electrode_mass_g first and subtracting one "average foil" is wrong
// when electrodes come from different batches with different foil
// thicknesses (common in half-cells with custom cathode).
//
// Cache migrated from inline fetch/semaphore (~60 lines) to
// useBackendCache (Phase 0.3d). Behaviour preserved; race-guard
// against invalidate-during-fetch comes free with the composable.
// `null` cut_batch_ids are filtered at the call site below — the
// backend 400s on a null id parameter.
const batchReports = useBackendCache({
  fetchFn: async (cutBatchId) => {
    const { data } = await api.get(`/api/electrodes/electrode-cut-batches/${cutBatchId}/report`)
    return data?.capacity_summary || null
  },
  maxConcurrent: 3,
})

// Fire lazily for every unique cut_batch_id referenced by current
// sessions. Realistic load: on a 50-session page with ~3 unique
// batches per session, ~150 parallel-capped fetches at ~200–400 ms
// each → 10–15 s progressive fill in the background. Tooltip is
// reactive: formatElectrodeMassHint reads batchReports.cache.value
// inside its body, so when the cache updates Vue re-renders bindings
// that consume it.
function loadBatchReportsForCurrentSessions() {
  const ids = new Set()
  for (const s of sessions.value) {
    const rel = Array.isArray(s?.related_electrodes) ? s.related_electrodes : []
    for (const e of rel) {
      if (Number.isInteger(e?.cut_batch_id)) ids.add(e.cut_batch_id)
    }
  }
  for (const id of ids) batchReports.load(id)
}

function formatElectrodeMassHint(session) {
  const rel = Array.isArray(session?.related_electrodes) ? session.related_electrodes : []
  if (!rel.length) return null

  const totalG = rel.reduce((s, e) => s + (Number(e?.electrode_mass_g) || 0), 0)
  if (!(totalG > 0)) return null
  const totalMg = totalG * 1000
  const n = rel.length
  const label = n === 1 ? 'электрод' : 'электроды'

  // Per-electrode active mass: electrode_mass - avg_foil_for_its_batch.
  // Any missing foil data (batch not yet fetched, no foil measurements)
  // makes the whole sum null — we only report a precise number when ALL
  // electrodes have their foil data available. Partial precision would
  // be misleading.
  let activeMg = 0
  let allFoilKnown = true
  for (const e of rel) {
    const cbid = e?.cut_batch_id
    const summary = Number.isInteger(cbid) ? batchReports.cache.value[cbid] : null
    const avgFoil = summary && Number.isFinite(Number(summary.average_foil_mass_g))
      ? Number(summary.average_foil_mass_g) : null
    if (avgFoil == null) { allFoilKnown = false; break }
    const electrodeG = Number(e?.electrode_mass_g) || 0
    const netG = electrodeG - avgFoil
    if (netG > 0) activeMg += netG * 1000
  }

  if (allFoilKnown && activeMg > 0) {
    return `${n} ${label} · ${totalMg.toFixed(1)} mg всего, фольга учтена → active ≈ ${activeMg.toFixed(1)} mg`
  }
  // Fallback — admit we don't know the foil mass instead of guessing.
  // Points the user at the fix: fill foil_masses for the relevant batch.
  return `${n} ${label} · ${totalMg.toFixed(1)} mg всего · масса фольги неизвестна — заполните замеры в партии нарезки`
}

async function saveMasses() {
  const savers = massEditorRows.value
    .filter(r => Number.isFinite(Number(r.mass)) && Number(r.mass) > 0)
    .map(r => api.patch(`/api/cycling/sessions/${r.session_id}`, {
      active_mass_mg: Number(r.mass),
    }))
  if (!savers.length) {
    toast.add({ severity: 'warn', summary: 'Нет данных', detail: 'Введите массу хотя бы для одной сессии', life: 3000 })
    return
  }
  try {
    await Promise.all(savers)
    await loadData()
    showMassEditor.value = false
    capacityUnit.value = 'mAh_per_g'
    toast.add({ severity: 'success', summary: 'Масса сохранена', detail: `Обновлено: ${savers.length}`, life: 3000 })
  } catch (err) {
    toastApiError(toast, err, 'Не удалось сохранить', { life: 4000 })
  }
}
const specificAvailable = computed(() => {
  if (!activeSessionIds.value.length) return false
  return activeSessionIds.value.every(sid => {
    const row = sessions.value.find(s => s.session_id === sid)
    const m = Number(row?.active_mass_mg)
    return Number.isFinite(m) && m > 0
  })
})
// Watch: if user switched away from a session that had mass, drop back to Ah
// so the chart doesn't silently show blanks for the session without mass.
watch(specificAvailable, (has) => {
  if (!has && capacityUnit.value === 'mAh_per_g') capacityUnit.value = 'Ah'
})

// Limits. No hard cap on active sessions — use filters + compact chips +
// legend dedup to keep the UI manageable. Cycle-selection cap is 100:
// real cycling runs can be 500-10000 cycles, and 100 is the visual
// ceiling where individual voltage-profile lines still tell a story.
// For bigger studies, decimate ("каждый 50-й") rather than chart all.
const MAX_SELECTED_CYCLES = 100
const FETCH_CONCURRENCY = 4

// Stable color palette — first 8 sessions get a curated color from the
// palette (BADB blue → ochre); beyond 8, we generate additional colors
// using the golden-angle rotation in HSL space. Golden angle ≈ 137.508°
// gives maximum visual separation between consecutive indices — this is
// a well-known trick for generating N distinct colors without overlap.
const SESSION_PALETTE = [
  '#003274', // 1st — BADB blue
  '#E67E22', // 2nd — orange
  '#52C9A6', // 3rd — green
  '#8E44AD', // 4th — purple
  '#D3A754', // 5th — ochre
  '#16A085', // 6th — teal
  '#E74C3C', // 7th — red
  '#2C3E50', // 8th — slate
]
const GOLDEN_ANGLE = 137.508

function colorForSession(sessionId) {
  const idx = activeSessionIds.value.indexOf(sessionId)
  if (idx < 0) return SESSION_PALETTE[0]
  if (idx < SESSION_PALETTE.length) return SESSION_PALETTE[idx]
  // Beyond palette: distribute evenly across the hue wheel. Starting hue
  // (200°) is chosen to avoid clashing with the first palette colors.
  const hue = (200 + (idx - SESSION_PALETTE.length) * GOLDEN_ANGLE) % 360
  // Saturation + lightness alternate for secondary variation
  const alt = (idx - SESSION_PALETTE.length) % 2
  return `hsl(${hue.toFixed(0)}, ${alt ? 55 : 65}%, ${alt ? 50 : 42}%)`
}
function isSessionActive(sessionId) {
  return activeSessionIds.value.includes(sessionId)
}

// Derived: active sessions with their metadata (for chips + Charts).
// Each element is the session row (from `sessions`) merged with runtime
// state (summary, cycles, loading flags, assigned color).
const activeSessionViews = computed(() => {
  return activeSessionIds.value.map(id => {
    const meta = sessions.value.find(s => s.session_id === id) || { session_id: id }
    return {
      ...meta,
      color: colorForSession(id),
      summary: summaryBySession.value[id] || [],
      cycleDataMap: cycleDataBySession.value[id] || {},
      loadingCycles: loadingCyclesBy.value[id] || [],
    }
  })
})

// ── Upload dialog ──
// Multi-file upload model:
//   - files[] — one row per picked file, with its own battery assignment
//   - defaultBatteryId — optional "apply to all" shortcut when uploading many
//     files for the same cell; per-file Select overrides this
//   - uploadForm — metadata shared across all files in this batch
const showUpload = ref(false)
const files = ref([])  // [{ file: File, battery_id: number|null, state, error, session_id }]
const defaultBatteryId = ref(null)
const uploadForm = ref({
  equipment_type: 'auto',
  channel: null,
  protocol: '',
  notes: '',
  active_mass_mg: null,  // mass of active material in mg, for mAh/g plots
})
const uploading = ref(false)
const fileInputRef = ref(null)

const FILE_STATES = {
  pending: { icon: 'pi pi-file', label: 'Ожидает' },
  uploading: { icon: 'pi pi-spin pi-spinner', label: 'Загрузка...' },
  done: { icon: 'pi pi-check-circle', label: 'Готово' },
  error: { icon: 'pi pi-times-circle', label: 'Ошибка' },
}

// "Determine automatically" is the default — the parser peeks at the file
// and picks the right format. Only pick manually if autodetect fails or you
// want to force a specific interpretation.
const equipmentOptions = [
  { label: 'Определить автоматически', value: 'auto' },
  { label: 'ELITECH P-20X8 (TXT)', value: 'elitech' },
  { label: 'Generic CSV', value: 'generic' },
  { label: 'Neware BTS — скоро', value: 'neware' },
  { label: 'Arbin MITS Pro — скоро', value: 'arbin' },
  { label: 'BioLogic EC-Lab — скоро', value: 'biologic' },
]

// ── Multi-file helpers ──────────────────────────────────────────────────
function onFilesPicked(event) {
  const picked = Array.from(event.target?.files || [])
  // Dedupe by name+size against already-staged files so picking the same
  // file twice doesn't create duplicate upload rows.
  const existing = new Set(files.value.map(f => `${f.file.name}|${f.file.size}`))
  for (const file of picked) {
    const key = `${file.name}|${file.size}`
    if (existing.has(key)) continue
    files.value.push({
      file,
      battery_id: defaultBatteryId.value,
      state: 'pending',
      error: null,
      session_id: null,
    })
  }
  // Reset input so picking the same file after removing it works again.
  if (event.target) event.target.value = ''
}

function removeFileAt(idx) {
  if (files.value[idx]?.state === 'uploading') return
  files.value.splice(idx, 1)
}

function applyDefaultBatteryToAll() {
  if (!defaultBatteryId.value) return
  for (const f of files.value) {
    // Don't override rows that already uploaded successfully.
    if (f.state !== 'done') f.battery_id = defaultBatteryId.value
  }
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

function resetUploadDialog() {
  files.value = []
  defaultBatteryId.value = null
  uploadForm.value = { equipment_type: 'auto', channel: null, protocol: '', notes: '', active_mass_mg: null }
}

// Progress helpers for the dynamic "Загрузить (N)" / "Загрузка... (K/N)" button
const uploadStats = computed(() => {
  const total = files.value.length
  const done = files.value.filter(f => f.state === 'done').length
  const err  = files.value.filter(f => f.state === 'error').length
  const pend = files.value.filter(f => f.state === 'pending').length
  return { total, done, err, pend }
})

const columns = [
  // Synthetic column "active" — a colored dot toggle that adds/removes the
  // row from the charts overlay. Field name `active` doesn't exist in the
  // API row, we render it via #col-active slot. filterable:false disables
  // the default column filter popover and makes the header itself click-
  // able (emits header-click → onTableHeaderClick toggles all visible).
  { field: 'active', header: 'График', width: 80, sortable: false, filterable: false },
  { field: 'battery_id', header: 'Аккумулятор', width: 130, sortable: true },
  { field: 'equipment_type', header: 'Оборудование', width: 130, sortable: true, filterable: true },
  { field: 'total_cycles', header: 'Циклов', width: 80, sortable: true },
  // Synthetic column: total electrode mass in this battery (mg). Sourced
  // from the GET /api/cycling/sessions join on electrodes.used_in_battery_id.
  // The cell shows the raw sum; the tooltip (formatElectrodeMassHint) does
  // the precise active-mass calculation per electrode using Dalia's
  // capacity_summary.average_foil_mass_g (Item D, design-first flow).
  // When foil data isn't yet loaded or is missing, the tooltip reports
  // "масса фольги неизвестна" rather than guessing.
  { field: 'electrode_mass_info', header: 'Электроды, мг', width: 110, sortable: false, filterable: false },
  { field: 'file_name', header: 'Файл', width: 200 },
  { field: 'uploader_name', header: 'Загрузил', width: 130, filterable: true },
  { field: 'uploaded_at', header: 'Дата', width: 140, sortable: true },
]

// ── Load ──
async function loadData() {
  loading.value = true
  try {
    const [sessionsRes, batteriesRes] = await Promise.allSettled([
      api.get('/api/cycling/sessions'),
      api.get('/api/batteries'),
    ])
    if (sessionsRes.status === 'fulfilled') sessions.value = sessionsRes.value.data
    if (batteriesRes.status === 'fulfilled') batteries.value = batteriesRes.value.data
    // Kick off the /report fetches for every unique cut_batch_id
    // referenced by current sessions — feeds the precise active-mass
    // hint tooltip (Item D). Background, capped at 3 concurrent.
    loadBatchReportsForCurrentSessions()
  } catch { /* silent */ }
  loading.value = false
}

onMounted(loadData)

// ── Session activation ─────────────────────────────────────────────────
// Add/remove a session from the active overlay. First call also fetches the
// session's per-cycle summary (the data that feeds capacity/CE charts).
//
// Row-click on the table routes here, as does the [●] toggle button in the
// leftmost column. If a session is already active, clicking it again
// deactivates it (remove from activeSessionIds; cached data is kept so a
// re-add is instant).
async function toggleSession(row) {
  if (!row || row.status !== 'ready') {
    if (row?.status === 'processing') {
      toast.add({ severity: 'info', summary: 'Данные обрабатываются', life: 2500 })
    } else if (row?.status === 'error') {
      toast.add({ severity: 'error', summary: 'Ошибка обработки', detail: row.error_message || '', life: 3500 })
    }
    return
  }
  const sid = row.session_id
  if (activeSessionIds.value.includes(sid)) {
    activeSessionIds.value = activeSessionIds.value.filter(x => x !== sid)
    // Also drop any selected cycles that were only relevant to this
    // session's length — but since selectedCycles is a global list, we
    // leave it. Empty cycles for a session just don't plot.
    return
  }

  // Activate: push ID first so color assignment is stable before fetch.
  activeSessionIds.value = [...activeSessionIds.value, sid]

  // Skip fetch if already cached (user toggled off then on).
  if (summaryBySession.value[sid]) return

  try {
    const { data } = await api.get(`/api/cycling/sessions/${sid}/summary`)
    summaryBySession.value = { ...summaryBySession.value, [sid]: data }
  } catch (err) {
    // Rollback on failure so the user can retry.
    activeSessionIds.value = activeSessionIds.value.filter(x => x !== sid)
    toastApiError(toast, err, 'Не удалось загрузить данные')
  }
}

// Header click on the "График" column — toggle all visible sessions
// on/off. "Visible" = rows left after any column filters the user applied
// (we read filteredData off the CrudTable ref). If everything visible is
// already on, we turn them all off; otherwise we activate up to
// MAX_ACTIVE_SESSIONS of the ready ones (in table order). Respects
// status=='ready' (skips processing + error rows).
async function onTableHeaderClick(field) {
  if (field !== 'active') return
  // Pull filtered rows from CrudTable (post-filter view). Fallback to all
  // sessions if the ref isn't ready yet (first render edge case).
  const visibleSessions = (tableRef.value?.filteredData ?? sessions.value)
    .filter(s => s.status === 'ready')
  if (!visibleSessions.length) return

  // If every visible ready session is already active → clear all.
  const allVisibleActive = visibleSessions.every(s => isSessionActive(s.session_id))
  if (allVisibleActive) {
    // Deactivate only the visible ones (keep any active sessions that were
    // hidden by filter — otherwise user loses context when they clear the
    // filter later).
    const visibleIds = new Set(visibleSessions.map(s => s.session_id))
    activeSessionIds.value = activeSessionIds.value.filter(id => !visibleIds.has(id))
    if (!activeSessionIds.value.length) selectedCycles.value = []
    return
  }

  // Activate all visible rows that aren't yet active. No cap — if the user
  // filtered the table to "40 visible sessions" and hits this, they get 40
  // active. The legend dedup + compact chips + golden-angle palette handle
  // crowding gracefully.
  const toAdd = visibleSessions.filter(s => !isSessionActive(s.session_id))
  if (!toAdd.length) return

  activeSessionIds.value = [...activeSessionIds.value, ...toAdd.map(s => s.session_id)]
  await Promise.all(toAdd.map(async s => {
    if (summaryBySession.value[s.session_id]) return
    try {
      const { data } = await api.get(`/api/cycling/sessions/${s.session_id}/summary`)
      summaryBySession.value = { ...summaryBySession.value, [s.session_id]: data }
    } catch {
      activeSessionIds.value = activeSessionIds.value.filter(id => id !== s.session_id)
    }
  }))
}


// Toggle a cycle across ALL active sessions. selectedCycles is a single
// global list — the user's intent is "show cycle N on every session on the
// chart". If a session doesn't have that cycle, it just isn't drawn.
// Fetches missing per-session datapoints in parallel (across sessions).
async function toggleCycle(cycleNum) {
  if (!activeSessionIds.value.length) return

  const idx = selectedCycles.value.indexOf(cycleNum)
  if (idx >= 0) {
    selectedCycles.value = selectedCycles.value.filter(c => c !== cycleNum)
    return
  }

  if (selectedCycles.value.length >= MAX_SELECTED_CYCLES) {
    toast.add({
      severity: 'warn',
      summary: 'Лимит циклов',
      detail: `Можно сравнивать до ${MAX_SELECTED_CYCLES} циклов одновременно`,
      life: 3000,
    })
    return
  }

  // Capture active list to detect session changes mid-flight.
  const capturedActiveIds = [...activeSessionIds.value]
  selectedCycles.value = [...selectedCycles.value, cycleNum]

  // Fetch for every currently-active session that doesn't have this cycle yet.
  await Promise.all(capturedActiveIds.map(sid => fetchCycleForSession(sid, cycleNum)))
}

// Replace the whole cycle selection across ALL active sessions (the quick
// filters: "Все / Каждый N / Диапазон"). Fetches missing cycle datapoints
// in parallel with a small concurrency cap per session.
async function replaceCycles(newList) {
  if (!activeSessionIds.value.length) return
  const clamped = (newList || []).slice(0, MAX_SELECTED_CYCLES)
  selectedCycles.value = clamped
  if (!clamped.length) return

  // For each active session, find its missing cycles and fetch them.
  const capturedActiveIds = [...activeSessionIds.value]
  await Promise.all(capturedActiveIds.map(async sid => {
    const have = cycleDataBySession.value[sid] || {}
    const missing = clamped.filter(c => !have[c])
    if (!missing.length) return
    await fetchCyclesBatched(sid, missing)
  }))
}

// Fetch datapoints for one (sid, cycleNum) pair. Used by toggleCycle.
async function fetchCycleForSession(sid, cycleNum) {
  const existing = cycleDataBySession.value[sid] || {}
  if (existing[cycleNum]) return  // cached

  // Mark loading.
  loadingCyclesBy.value = {
    ...loadingCyclesBy.value,
    [sid]: [...(loadingCyclesBy.value[sid] || []), cycleNum],
  }
  try {
    const { data } = await api.get(`/api/cycling/sessions/${sid}/cycles/${cycleNum}`)
    // Still active? (User could have deactivated during fetch.)
    if (!activeSessionIds.value.includes(sid)) return
    cycleDataBySession.value = {
      ...cycleDataBySession.value,
      [sid]: { ...(cycleDataBySession.value[sid] || {}), [cycleNum]: data },
    }
  } catch {
    // Silent — user can retry by clicking the chip.
  } finally {
    const list = loadingCyclesBy.value[sid] || []
    loadingCyclesBy.value = {
      ...loadingCyclesBy.value,
      [sid]: list.filter(c => c !== cycleNum),
    }
  }
}

// Batched fetch with concurrency limit, for a single session fetching many
// cycles at once (called from replaceCycles per active session).
async function fetchCyclesBatched(sid, cycleNums) {
  loadingCyclesBy.value = {
    ...loadingCyclesBy.value,
    [sid]: [...new Set([...(loadingCyclesBy.value[sid] || []), ...cycleNums])],
  }
  const queue = [...cycleNums]
  const workers = Array.from(
    { length: Math.min(FETCH_CONCURRENCY, queue.length) },
    async () => {
      while (queue.length) {
        const c = queue.shift()
        try {
          const { data } = await api.get(`/api/cycling/sessions/${sid}/cycles/${c}`)
          if (!activeSessionIds.value.includes(sid)) return
          cycleDataBySession.value = {
            ...cycleDataBySession.value,
            [sid]: { ...(cycleDataBySession.value[sid] || {}), [c]: data },
          }
        } catch { /* silent per-cycle */ }
        finally {
          const list = loadingCyclesBy.value[sid] || []
          loadingCyclesBy.value = {
            ...loadingCyclesBy.value,
            [sid]: list.filter(x => x !== c),
          }
        }
      }
    }
  )
  await Promise.all(workers)
}

// ── Upload ──────────────────────────────────────────────────────────────
// Sequential upload — each file becomes its own cycling_sessions row. We
// don't parallelize because:
//   (a) parser spawns a python subprocess (CPU) — parallel slams the server
//   (b) UX: clear per-file progress + stable ordering
// Files that already succeeded (state='done') are skipped on retry, so the
// user can fix a battery_id for the failed row and re-click "Загрузить".
async function doUpload() {
  if (files.value.length === 0) {
    toast.add({ severity: 'warn', summary: 'Нет файлов', detail: 'Выберите хотя бы один файл', life: 3000 })
    return
  }
  // Validate: every pending file must have a battery assigned.
  const missing = files.value.filter(f => f.state !== 'done' && !f.battery_id)
  if (missing.length) {
    toast.add({
      severity: 'warn',
      summary: 'Не все аккумуляторы выбраны',
      detail: `Осталось выбрать: ${missing.length} файл(ов)`,
      life: 4000,
    })
    return
  }

  uploading.value = true
  for (const f of files.value) {
    if (f.state === 'done') continue
    f.state = 'uploading'
    f.error = null

    const formData = new FormData()
    formData.append('file', f.file)
    formData.append('battery_id', f.battery_id)
    formData.append('equipment_type', uploadForm.value.equipment_type)
    if (uploadForm.value.channel) formData.append('channel', uploadForm.value.channel)
    if (uploadForm.value.protocol) formData.append('protocol', uploadForm.value.protocol)
    if (uploadForm.value.notes) formData.append('notes', uploadForm.value.notes)
    if (uploadForm.value.active_mass_mg) formData.append('active_mass_mg', uploadForm.value.active_mass_mg)

    try {
      const { data } = await api.post('/api/cycling/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      f.state = 'done'
      f.session_id = data.session_id
      f.duplicate = !!data.duplicate
    } catch (err) {
      f.state = 'error'
      // Per-file inline error (NOT a toast — shown next to the file row in
      // the upload queue). Still routes through the classifier so auth /
      // network / server states get a specific Russian message instead of
      // the bare "Не удалось загрузить файл" fallback. Caught-but-not-
      // toasted twin of `toastApiError`.
      f.error = err?.response?.data?.error
             || errorMessageRu(classifyAxiosError(err))
             || 'Не удалось загрузить файл'
    }
  }
  uploading.value = false

  const { done, err } = uploadStats.value
  if (err === 0) {
    toast.add({
      severity: 'success',
      summary: 'Загрузка завершена',
      detail: `Загружено файлов: ${done}`,
      life: 4000,
    })
    showUpload.value = false
    resetUploadDialog()
  } else {
    toast.add({
      severity: 'warn',
      summary: 'Загрузка с ошибками',
      detail: `Готово: ${done}, ошибок: ${err}. Проверьте файлы в списке.`,
      life: 6000,
    })
    // Keep dialog open so user can see per-file errors and retry.
  }
  // Reload sessions list so newly processed ones show up (parser is async).
  setTimeout(loadData, 2000)
  setTimeout(loadData, 6000)
}

// ── Excel export ────────────────────────────────────────────────────────
// Calls GET /api/cycling/export/xlsx with the current active sessions +
// toolbar state. Uses axios responseType:'blob' so the JWT interceptor
// still attaches the Authorization header — a plain anchor download would
// skip auth. Filename is resolved from the Content-Disposition header
// when present (RFC 5987 encoded), otherwise we fall back to a sensible
// default derived from the experiment label.
const excelDownloading = ref(false)

async function downloadExcel() {
  if (!activeSessionIds.value.length) return
  excelDownloading.value = true
  try {
    const params = {
      session_ids: activeSessionIds.value.join(','),
      cycles: selectedCycles.value.join(','),
      unit: capacityUnit.value,
      label: experimentLabel.value,
      step_filter: stepFilter.value,
      smoothing: smoothingWindow.value,
    }
    const response = await api.get('/api/cycling/export/xlsx', {
      params,
      responseType: 'blob',
    })
    // Resolve filename from Content-Disposition (supports RFC 5987 UTF-8).
    let filename = 'cycling_export.xlsx'
    const cd = response.headers['content-disposition'] || ''
    const mStar = cd.match(/filename\*=UTF-8''([^;]+)/i)
    const mPlain = cd.match(/filename="([^"]+)"/)
    if (mStar) filename = decodeURIComponent(mStar[1])
    else if (mPlain) filename = decodeURIComponent(mPlain[1])

    const blob = new Blob([response.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast.add({ severity: 'success', summary: 'Экспорт готов', detail: filename, life: 3000 })
  } catch (err) {
    toastApiError(toast, err, 'Ошибка экспорта', { life: 4000 })
  } finally {
    excelDownloading.value = false
  }
}

async function deleteSession(items) {
  const deletedIds = []
  for (const item of items) {
    const id = item.session_id ?? item
    try {
      await api.delete(`/api/cycling/sessions/${id}`)
      deletedIds.push(id)
    } catch { /* silent */ }
  }
  await loadData()
  // Purge any deleted session from the active overlay + per-session caches.
  if (deletedIds.length) {
    activeSessionIds.value = activeSessionIds.value.filter(id => !deletedIds.includes(id))
    for (const id of deletedIds) {
      delete summaryBySession.value[id]
      delete cycleDataBySession.value[id]
      delete loadingCyclesBy.value[id]
    }
    // Trigger reactivity after delete-in-place
    summaryBySession.value = { ...summaryBySession.value }
    cycleDataBySession.value = { ...cycleDataBySession.value }
    loadingCyclesBy.value = { ...loadingCyclesBy.value }
    // If no active sessions remain, clear cycle selection too.
    if (!activeSessionIds.value.length) selectedCycles.value = []
  }
}

function formatDate(dt) {
  if (!dt) return ''
  return new Date(dt).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const batteryOptions = computed(() =>
  batteries.value.map(b => ({
    label: `№${b.battery_id} ${b.form_factor || ''} ${b.project_name || ''}`.trim(),
    value: b.battery_id,
  }))
)
</script>

<template>
  <div class="cycling-page">
    <PageHeader title="Циклирование" icon="pi pi-sync" />

    <!-- Sessions table -->
    <CrudTable
      ref="tableRef"
      :columns="columns"
      :data="sessions"
      id-field="session_id"
      table-name="Сессии циклирования"
      @row-click="toggleSession"
      @delete="deleteSession"
      @header-click="onTableHeaderClick"
    >
      <template #toolbar-end>
        <Button label="Загрузить файл" icon="pi pi-upload" size="small" @click="showUpload = true" />
      </template>
      <template #col-active="{ data }">
        <div class="active-cell">
          <button
            class="active-toggle"
            :class="{ 'is-active': isSessionActive(data.session_id), 'is-disabled': data.status !== 'ready' }"
            :title="data.status === 'ready'
              ? (isSessionActive(data.session_id) ? 'Убрать с графиков' : 'Показать на графиках')
              : (data.status === 'processing' ? 'Ещё обрабатывается' : 'Ошибка обработки')"
            @click.stop="toggleSession(data)"
          >
            <span
              class="active-dot"
              :style="isSessionActive(data.session_id)
                ? { background: colorForSession(data.session_id), borderColor: colorForSession(data.session_id) }
                : {}"
            ></span>
            <i v-if="data.status === 'processing'" class="pi pi-spin pi-spinner" style="font-size:10px"></i>
            <i v-else-if="data.status === 'error'" class="pi pi-exclamation-circle" style="font-size:10px;color:#E74C3C"></i>
          </button>
        </div>
      </template>
      <template #col-battery_id="{ data }">
        <span class="battery-link" @click.stop="router.push(`/assembly/${data.battery_id}`)">
          Акк. №{{ data.battery_id }}
        </span>
      </template>
      <template #col-electrode_mass_info="{ data }">
        <span
          v-if="electrodeMassHintMg(data) != null"
          class="electrode-mass-hint"
          :title="formatElectrodeMassHint(data)"
        >
          {{ electrodeMassHintMg(data).toFixed(1) }}
          <i class="pi pi-info-circle" style="font-size:10px;margin-left:3px;opacity:0.5"></i>
        </span>
        <span v-else class="electrode-mass-hint electrode-mass-hint--empty">—</span>
      </template>
      <template #col-uploaded_at="{ data }">
        {{ formatDate(data.uploaded_at) }}
      </template>
      <template #col-file_name="{ data }">
        <span :title="data.file_name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;max-width:200px;">
          {{ data.file_name }}
        </span>
      </template>
    </CrudTable>

    <!-- Charts area (multi-session) -->
    <div v-if="activeSessionViews.length" class="charts-area glass-card">
      <!-- Toolbar: experiment title + publication-mode toggle -->
      <div class="charts-toolbar">
        <div class="toolbar-field">
          <label class="toolbar-label">Название эксперимента</label>
          <input
            v-model="experimentLabel"
            type="text"
            class="toolbar-input"
            placeholder="например: NCM (M2C2_RT)_fresh gel"
            maxlength="120"
          />
        </div>
        <div class="toolbar-pubmode">
          <label class="toolbar-label" title="Фильтр применяется к профилю напряжения и dQ/dV ниже">Показать ↓</label>
          <div class="pubmode-row">
            <button
              class="pubmode-btn"
              :class="{ 'is-active': stepFilter === 'both' }"
              @click="stepFilter = 'both'"
            >
              Оба
            </button>
            <button
              class="pubmode-btn"
              :class="{ 'is-active': stepFilter === 'charge' }"
              @click="stepFilter = 'charge'"
              title="Только заряд (пунктир)"
            >
              Заряд
            </button>
            <button
              class="pubmode-btn"
              :class="{ 'is-active': stepFilter === 'discharge' }"
              @click="stepFilter = 'discharge'"
              title="Только разряд (сплошная)"
            >
              Разряд
            </button>
          </div>
        </div>
        <div class="toolbar-pubmode">
          <label class="toolbar-label">Единицы ёмкости</label>
          <div class="pubmode-row">
            <button
              class="pubmode-btn"
              :class="{ 'is-active': capacityUnit === 'Ah' }"
              @click="capacityUnit = 'Ah'"
            >
              Ah
            </button>
            <button
              class="pubmode-btn"
              :class="{ 'is-active': capacityUnit === 'mAh_per_g' }"
              :title="specificAvailable
                ? 'Удельная ёмкость — нормирована на массу активного материала'
                : 'Кликните, чтобы ввести массу активного материала'"
              @click="specificAvailable ? (capacityUnit = 'mAh_per_g') : openMassEditor()"
            >
              mAh/g
              <i v-if="!specificAvailable" class="pi pi-pencil" style="font-size:10px;margin-left:4px"></i>
            </button>
          </div>
        </div>
        <div class="toolbar-pubmode" title="Абсолютная ёмкость ↔ нормированная C/C₁ (scientific standard for fade)">
          <label class="toolbar-label">Вид графика ёмкости</label>
          <div class="pubmode-row">
            <button
              class="pubmode-btn"
              :class="{ 'is-active': capacityView === 'absolute' }"
              @click="capacityView = 'absolute'"
              title="Абсолютная ёмкость (Ah или mAh/g)"
            >
              Абсолют
            </button>
            <button
              class="pubmode-btn"
              :class="{ 'is-active': capacityView === 'retention' }"
              @click="capacityView = 'retention'"
              title="Удержание: C(n)/C(1) × 100% — стандарт для публикаций"
            >
              Ретенция, %
            </button>
          </div>
        </div>
        <div class="toolbar-pubmode" title="Рост ΔV̄ = avg_charge − avg_discharge показывает полиризацию (SEI, контакт, дендриты)">
          <label class="toolbar-label">Гистерезис V̄</label>
          <div class="pubmode-row">
            <button
              class="pubmode-btn"
              :class="{ 'is-active': !showHysteresis }"
              @click="showHysteresis = false"
            >
              Скрыт
            </button>
            <button
              class="pubmode-btn"
              :class="{ 'is-active': showHysteresis }"
              @click="showHysteresis = true"
            >
              Показать
            </button>
          </div>
        </div>
        <div class="toolbar-pubmode" title="Предыдущий цикл (N-1) в профиле V как призрак — видно fade между соседними циклами">
          <label class="toolbar-label">Ghost trace</label>
          <div class="pubmode-row">
            <button
              class="pubmode-btn"
              :class="{ 'is-active': !ghostTrace }"
              @click="ghostTrace = false"
            >
              Выкл
            </button>
            <button
              class="pubmode-btn"
              :class="{ 'is-active': ghostTrace }"
              @click="ghostTrace = true"
            >
              Вкл
            </button>
          </div>
        </div>
        <div class="toolbar-pubmode">
          <label class="toolbar-label">Стиль</label>
          <div class="pubmode-row">
            <button
              class="pubmode-btn"
              :class="{ 'is-active': !publicationMode }"
              @click="publicationMode = false"
            >
              <i class="pi pi-cog"></i> Интерактив
            </button>
            <button
              class="pubmode-btn"
              :class="{ 'is-active': publicationMode }"
              @click="publicationMode = true"
            >
              <i class="pi pi-file-pdf"></i> Статья
            </button>
          </div>
        </div>
        <!-- Style preset library (per-user, persisted in localStorage).
             Dropdown = active preset (Mine, Publication B/W, Colorblind,
             or any user-saved clone). 💾 saves current settings as a new
             named preset; ✏️ renames; 🗑 deletes (only for user presets). -->
        <div class="toolbar-pubmode" title="Библиотека пресетов стилей — по одному на пользователя, сохраняется в браузере">
          <label class="toolbar-label">Пресет стилей</label>
          <div class="pubmode-row preset-row">
            <select
              class="preset-select"
              :value="activePreset?.id"
              @change="onApplyPreset($event.target.value)"
            >
              <option
                v-for="p in styleLibrary.presets"
                :key="p.id"
                :value="p.id"
              >
                {{ p.name }}{{ p.readonly ? ' 🔒' : '' }}
              </option>
            </select>
            <button
              class="pubmode-btn preset-icon-btn"
              title="Сохранить как новый пресет"
              @click="onPresetSaveAs"
            ><i class="pi pi-save"></i></button>
            <button
              class="pubmode-btn preset-icon-btn"
              :disabled="!activePreset || activePreset.readonly"
              :title="activePreset?.readonly ? 'Встроенный пресет нельзя переименовать' : 'Переименовать активный пресет'"
              @click="onPresetRename"
            ><i class="pi pi-pencil"></i></button>
            <button
              class="pubmode-btn preset-icon-btn preset-icon-btn--danger"
              :disabled="!activePreset || activePreset.readonly || activePreset.id === 'default'"
              :title="activePreset?.readonly || activePreset?.id === 'default'
                ? 'Этот пресет нельзя удалить'
                : 'Удалить активный пресет'"
              @click="onPresetDelete"
            ><i class="pi pi-trash"></i></button>
          </div>
        </div>
        <div class="toolbar-smoothing" title="Окно скользящего среднего для dQ/dV. 1 = без сглаживания, 21 = максимум.">
          <label class="toolbar-label">
            Сглаживание dQ/dV
            <span class="toolbar-smoothing__val">{{ smoothingWindow }}</span>
          </label>
          <div class="toolbar-smoothing__row">
            <span class="toolbar-smoothing__edge">1</span>
            <input
              v-model.number="smoothingWindow"
              type="range"
              min="1"
              max="21"
              step="1"
              class="toolbar-smoothing__slider"
              :aria-label="`Окно сглаживания dQ/dV: ${smoothingWindow}`"
            />
            <span class="toolbar-smoothing__edge">21</span>
          </div>
        </div>
        <div class="toolbar-pubmode">
          <label class="toolbar-label">Экспорт</label>
          <div class="pubmode-row">
            <button
              class="pubmode-btn export-xlsx-btn"
              :disabled="excelDownloading || !activeSessionIds.length"
              :title="selectedCycles.length
                ? `Скачать Excel: ${activeSessionIds.length} сессий, ${selectedCycles.length} циклов (с данными)`
                : `Скачать Excel: ${activeSessionIds.length} сессий (только сводка, без сырых данных)`"
              @click="downloadExcel"
            >
              <i v-if="excelDownloading" class="pi pi-spin pi-spinner"></i>
              <i v-else class="pi pi-file-excel"></i>
              Excel
            </button>
          </div>
        </div>
      </div>
      <CyclingCharts
        :sessions="activeSessionViews"
        :selectedCycles="selectedCycles"
        :maxSelected="MAX_SELECTED_CYCLES"
        :experimentLabel="experimentLabel"
        :publicationMode="publicationMode"
        :capacityUnit="capacityUnit"
        :stepFilter="stepFilter"
        :smoothingWindow="smoothingWindow"
        :capacityView="capacityView"
        :showHysteresis="showHysteresis"
        :ghostTrace="ghostTrace"
        @toggle-cycle="toggleCycle"
        @replace-cycles="replaceCycles"
        @style-click="onChartStyleClick"
      />
    </div>
    <div v-else class="charts-placeholder glass-card">
      <i class="pi pi-chart-line" style="font-size:24px;opacity:0.3"></i>
      <div>Выберите одно или несколько измерений в таблице — графики появятся здесь.</div>
    </div>

    <!-- Per-chart style popover (shared, positions at clicked ⚙ button) -->
    <CyclingStylePopover
      ref="stylePopoverRef"
      :chartId="styleCurrentChartId"
      :chartLabel="styleCurrentChartLabel"
      :style="styleCurrentStyle"
      :readonly="styleActivePresetReadonly"
      :presetName="styleActivePresetName"
      @update="onStyleUpdate"
      @reset="onStyleReset"
      @clone="onStyleClone"
    />

    <!-- Upload dialog — multi-file -->
    <Dialog v-model:visible="showUpload" header="Загрузить файлы циклирования"
            :modal="true" style="width: 760px" :closable="!uploading">
      <div class="upload-form">

        <!-- File picker: hidden native <input>, custom Button triggers it -->
        <div class="upload-field">
          <div class="file-picker-row">
            <input
              ref="fileInputRef"
              type="file"
              multiple
              accept=".csv,.xlsx,.xls,.txt"
              @change="onFilesPicked"
              style="display:none"
            />
            <Button
              label="Выбрать файлы"
              icon="pi pi-folder-open"
              outlined
              :disabled="uploading"
              @click="fileInputRef?.click()"
            />
            <span v-if="files.length" class="file-picker-count">
              {{ files.length }} файл(ов) выбрано
              <span v-if="uploadStats.done > 0" class="file-picker-done">· {{ uploadStats.done }} готово</span>
              <span v-if="uploadStats.err > 0"  class="file-picker-err">· {{ uploadStats.err }} с ошибкой</span>
            </span>
          </div>
        </div>

        <!-- Per-file list with per-file battery Select -->
        <div v-if="files.length" class="file-list">
          <div v-for="(f, idx) in files" :key="f.file.name + '|' + f.file.size"
               class="file-row" :class="`file-row--${f.state}`">
            <i class="file-row-icon" :class="FILE_STATES[f.state].icon" :title="FILE_STATES[f.state].label"></i>
            <div class="file-row-name">
              <div class="file-row-title" :title="f.file.name">{{ f.file.name }}</div>
              <div class="file-row-sub">
                {{ formatFileSize(f.file.size) }}
                <span v-if="f.session_id" class="file-row-session">· №{{ f.session_id }}</span>
                <span v-if="f.duplicate" class="file-row-dup">· дубликат</span>
                <span v-if="f.error" class="file-row-error">· {{ f.error }}</span>
              </div>
            </div>
            <Select
              v-model="f.battery_id"
              :options="batteryOptions"
              optionLabel="label"
              optionValue="value"
              placeholder="Акк."
              :filter="true"
              size="small"
              style="width: 200px; flex-shrink: 0"
              :disabled="uploading || f.state === 'done'"
            />
            <Button
              icon="pi pi-times"
              severity="secondary"
              text
              rounded
              size="small"
              :disabled="uploading && f.state === 'uploading'"
              @click="removeFileAt(idx)"
            />
          </div>
        </div>

        <!-- Shared settings: apply to every file in this batch -->
        <fieldset class="upload-shared">
          <legend>Общие параметры</legend>

          <div class="upload-field">
            <label>Аккумулятор по умолчанию</label>
            <div class="default-battery-row">
              <Select
                v-model="defaultBatteryId"
                :options="batteryOptions"
                optionLabel="label"
                optionValue="value"
                placeholder="Новым файлам — этот аккумулятор..."
                :filter="true"
                size="small"
                :disabled="uploading"
                style="flex: 1"
              />
              <Button
                label="Применить ко всем"
                size="small"
                severity="secondary"
                :disabled="!defaultBatteryId || !files.length || uploading"
                @click="applyDefaultBatteryToAll"
              />
            </div>
          </div>

          <div class="upload-field">
            <label>Формат</label>
            <Select
              v-model="uploadForm.equipment_type"
              :options="equipmentOptions"
              optionLabel="label"
              optionValue="value"
              size="small"
              :disabled="uploading"
              style="width: 100%"
            />
          </div>

          <div class="upload-row">
            <div class="upload-field">
              <label>Канал</label>
              <InputNumber
                v-model="uploadForm.channel"
                :useGrouping="false"
                :min="0"
                placeholder="—"
                :disabled="uploading"
                size="small"
                fluid
              />
            </div>
            <div class="upload-field">
              <label>Протокол</label>
              <InputText
                v-model="uploadForm.protocol"
                placeholder="—"
                :disabled="uploading"
                size="small"
                fluid
              />
            </div>
            <div class="upload-field">
              <label title="Масса активного материала в рабочем электроде. Нужна для графиков в mAh/g. Можно заполнить позже.">Масса акт. материала (mg)</label>
              <InputNumber
                v-model="uploadForm.active_mass_mg"
                :minFractionDigits="0"
                :maxFractionDigits="3"
                :min="0"
                placeholder="—"
                :disabled="uploading"
                size="small"
                fluid
              />
            </div>
          </div>

          <div class="upload-field">
            <label>Заметки</label>
            <Textarea
              v-model="uploadForm.notes"
              :rows="2"
              placeholder="—"
              :disabled="uploading"
              autoResize
              style="width: 100%"
            />
          </div>
        </fieldset>

      </div>
      <template #footer>
        <Button label="Отмена" severity="secondary" text :disabled="uploading" @click="showUpload = false" />
        <Button
          :label="uploading
            ? `Загрузка... (${uploadStats.done + uploadStats.err}/${uploadStats.total})`
            : (uploadStats.err > 0 ? `Повторить (${uploadStats.err})` : `Загрузить${files.length ? ' (' + files.length + ')' : ''}`)"
          icon="pi pi-upload"
          :loading="uploading"
          :disabled="uploading || files.length === 0"
          @click="doUpload"
        />
      </template>
    </Dialog>

    <!-- Mass editor dialog — opened by clicking the disabled mAh/g
         button when at least one active session lacks active_mass_mg.
         The script logic (openMassEditor / saveMasses) was merged in
         commit 6508738 but the template block was dropped on the way
         in, so clicking the button was a silent no-op until now. -->
    <Dialog
      v-model:visible="showMassEditor"
      header="Масса активного материала"
      :modal="true"
      style="width: 760px"
    >
      <div class="mass-editor">
        <p class="mass-editor-hint">
          Удельная ёмкость <strong>mAh/g</strong> и энергия нормированы на массу активного
          материала. Введите значение в миллиграммах для каждой активной сессии. Пустые
          строки будут пропущены при сохранении.
        </p>
        <table class="mass-table">
          <thead>
            <tr>
              <th style="width:70px">Сессия</th>
              <th>Аккумулятор</th>
              <th>Файл</th>
              <th style="width:160px">Масса, мг</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in massEditorRows" :key="row.session_id">
              <td class="mass-cell-sid">#{{ row.session_id }}</td>
              <td>{{ row.battery_id ? `Акк. №${row.battery_id}` : '—' }}</td>
              <td class="mass-cell-file" :title="row.file_name">{{ row.file_name || '' }}</td>
              <td>
                <div class="mass-input-cell">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    v-model.number="row.mass"
                    placeholder="—"
                    class="mass-input"
                  />
                  <button
                    v-if="electrodeMassHintMg(sessions.find(s => s.session_id === row.session_id))"
                    type="button"
                    class="mass-hint-btn"
                    :title="`Подставить сумму масс электродов: ${Number(electrodeMassHintMg(sessions.find(s => s.session_id === row.session_id))).toFixed(1)} мг (без учёта массы фольги)`"
                    @click="row.mass = Number(Number(electrodeMassHintMg(sessions.find(s => s.session_id === row.session_id))).toFixed(3))"
                  >
                    <i class="pi pi-bolt"></i>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <p
          v-if="massEditorRows.some(r => electrodeMassHintMg(sessions.find(s => s.session_id === r.session_id)))"
          class="mass-footer-hint"
        >
          <i class="pi pi-info-circle"></i>
          <span>
            <strong><i class="pi pi-bolt" style="font-size:10px"></i></strong> — подставить суммарную массу электродов (без вычета фольги).
            Точная оценка с учётом фольги показана в подсказке колонки «Масса активного материала» основной таблицы.
          </span>
        </p>
      </div>
      <template #footer>
        <Button label="Отмена" severity="secondary" text @click="showMassEditor = false" />
        <Button label="Сохранить" icon="pi pi-check" @click="saveMasses" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.cycling-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.battery-link {
  color: #003274;
  font-weight: 600;
  cursor: pointer;
}
.battery-link:hover { text-decoration: underline; }

/* Electrode-mass-hint cell — small right-aligned numeric, hovered tooltip
   explains the breakdown (electrode count → sum in mg → expected active
   mass range at 30-50 % loading). Keeps the table compact. */
.electrode-mass-hint {
  display: inline-flex;
  align-items: center;
  color: #003274;
  font-family: monospace;
  font-size: 12px;
  cursor: help;
}
.electrode-mass-hint--empty {
  color: rgba(0, 50, 116, 0.35);
  cursor: default;
}

/* ── Mass editor dialog ─────────────────────────────────────────── */
.mass-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.mass-editor-hint {
  margin: 0;
  font-size: 13px;
  color: rgba(0, 50, 116, 0.65);
  line-height: 1.45;
}
.mass-editor-hint strong {
  color: #003274;
}
.mass-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.mass-table thead th {
  text-align: left;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(0, 50, 116, 0.12);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: rgba(0, 50, 116, 0.55);
}
.mass-table tbody td {
  padding: 6px 10px;
  border-bottom: 1px solid rgba(0, 50, 116, 0.05);
  vertical-align: middle;
}
.mass-cell-sid {
  color: rgba(0, 50, 116, 0.6);
  font-family: monospace;
  font-size: 12px;
}
.mass-cell-file {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(0, 50, 116, 0.7);
}
.mass-input-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mass-input {
  flex: 1;
  min-width: 0;
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
.mass-input:focus {
  outline: none;
  border-color: rgba(0, 50, 116, 0.5);
  background: rgba(0, 50, 116, 0.02);
}
.mass-hint-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid rgba(212, 164, 65, 0.35);
  border-radius: 5px;
  background: rgba(212, 164, 65, 0.10);
  color: #b58b2c;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.mass-hint-btn:hover {
  background: rgba(212, 164, 65, 0.22);
  border-color: rgba(212, 164, 65, 0.55);
}
.mass-hint-btn .pi {
  font-size: 13px;
}
.mass-footer-hint {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12px;
  color: rgba(0, 50, 116, 0.55);
  margin: 0;
  padding-top: 2px;
  border-top: 1px dashed rgba(0, 50, 116, 0.08);
}
.mass-footer-hint > .pi {
  color: rgba(0, 50, 116, 0.35);
  font-size: 13px;
  margin-top: 2px;
  flex-shrink: 0;
}

/* ── Active toggle (colored dot in table column) ── */
/* Wrapper centers the button horizontally inside the td (PrimeVue defaults
   td text-align: left, so the 32px button hugs the left edge otherwise). */
.active-cell {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
}
.active-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 32px;
  height: 26px;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0;
  transition: transform 0.12s ease;
}
.active-toggle:hover:not(.is-disabled) { transform: scale(1.1); }
.active-toggle.is-disabled { cursor: not-allowed; opacity: 0.5; }
.active-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid rgba(0, 50, 116, 0.3);
  background: transparent;
  transition: all 0.15s ease;
}
.active-toggle.is-active .active-dot {
  transform: scale(1.1);
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 1), 0 0 0 3px currentColor;
}

/* ── Active sessions chips bar ── */
.active-sessions-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0.6rem 1rem;
}
.active-sessions-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.active-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(0, 50, 116, 0.55);
}
.active-label strong {
  color: #003274;
  font-size: 14px;
  font-weight: 800;
  margin: 0 2px;
}
.active-label i { font-size: 12px; }
.active-hint {
  text-transform: none;
  font-weight: 400;
  font-size: 10px;
  color: rgba(0, 50, 116, 0.35);
  letter-spacing: 0;
}

.clear-all-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border: 1px solid rgba(231, 76, 60, 0.3);
  border-radius: 6px;
  background: transparent;
  color: #E74C3C;
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
}
.clear-all-btn:hover:not(:disabled) { background: #E74C3C; color: white; }
.clear-all-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* Wrap chips. Scrollable vertical area prevents the bar from taking over
   the viewport when user has many sessions active. */
.chips-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 140px;
  overflow-y: auto;
  padding: 2px;
}
/* Dense mode (9+ active) — tighter chip padding + hide battery text for
   per-chip economy. Full info is in the tooltip. */
.chips-wrap--dense .session-chip {
  padding: 2px 4px 2px 8px;
  font-size: 11px;
  max-width: 90px;
}
.chips-wrap--dense .chip-label { font-size: 11px; }
.chips-wrap--dense .chip-dot { width: 6px; height: 6px; }

.session-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px 3px 10px;
  border: 1.5px solid;
  border-radius: 8px;
  background: white;
  font-size: 12px;
  color: #1F2937;
  max-width: 240px;
  transition: max-width 0.15s ease;
}
.chip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.chip-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex: 1;
}
.chip-label strong { color: #003274; font-weight: 700; }
.chip-loading {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  color: #F39C12;
}
.chip-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  background: rgba(0, 50, 116, 0.06);
  color: rgba(0, 50, 116, 0.6);
  border-radius: 4px;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
}
.chip-close:hover { background: #E74C3C; color: white; }

/* ── Charts toolbar ── Applies to the charts below (V profile + dQ/dV).
   Keeps all controls on a single row when the viewport allows; the
   title field shrinks first, toggle groups never wrap into columns. */
.charts-toolbar {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  padding: 0.4rem 0 0.9rem;
  border-bottom: 1px solid rgba(0, 50, 116, 0.06);
  margin-bottom: 0.9rem;
  flex-wrap: wrap;
}
.toolbar-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 220px;
  min-width: 180px;
  max-width: 420px;
}
.toolbar-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(0, 50, 116, 0.5);
}
.toolbar-input {
  width: 100%;
  padding: 5px 10px;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  color: #003274;
  background: white;
}
.toolbar-input:focus {
  outline: none;
  border-color: #003274;
  box-shadow: 0 0 0 2px rgba(0, 50, 116, 0.1);
}

.toolbar-pubmode {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;  /* toggle groups stay compact, never stack */
}
.pubmode-row {
  display: inline-flex;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 6px;
  overflow: hidden;
  background: white;
}
.pubmode-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border: none;
  background: white;
  color: rgba(0, 50, 116, 0.6);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.12s;
  border-right: 1px solid rgba(0, 50, 116, 0.1);
}
.pubmode-btn:last-child { border-right: none; }
.pubmode-btn:hover:not(.is-active) { background: rgba(0, 50, 116, 0.04); color: #003274; }
.pubmode-btn.is-active {
  background: #003274;
  color: white;
  font-weight: 600;
}
.pubmode-btn i { font-size: 11px; }
.pubmode-btn:disabled { opacity: 0.4; cursor: not-allowed; color: rgba(0, 50, 116, 0.35); }
.pubmode-btn:disabled:hover { background: white; color: rgba(0, 50, 116, 0.35); }

/* ── Preset library row ── */
.preset-row { align-items: stretch; }
.preset-select {
  border: none;
  padding: 5px 10px;
  background: white;
  color: #003274;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  border-right: 1px solid rgba(0, 50, 116, 0.1);
  min-width: 170px;
  max-width: 220px;
  outline: none;
}
.preset-select:hover { background: rgba(0, 50, 116, 0.04); }
.preset-icon-btn {
  padding: 5px 8px;
}
.preset-icon-btn--danger { color: rgba(231, 76, 60, 0.75); }
.preset-icon-btn--danger:hover:not(:disabled) {
  background: rgba(231, 76, 60, 0.08);
  color: #E74C3C;
}

/* ── dQ/dV smoothing slider ──
   Sits in the charts toolbar next to the style toggles. Same flex-shrink:0
   rule as .toolbar-pubmode so it never gets stretched or pushed to a new
   row when the title field steals horizontal space. Width is fixed so the
   track length is predictable regardless of the slider's current value. */
.toolbar-smoothing {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
  min-width: 180px;
}
.toolbar-smoothing__val {
  display: inline-block;
  min-width: 22px;
  padding: 0 6px;
  margin-left: 6px;
  border-radius: 4px;
  background: rgba(0, 50, 116, 0.08);
  color: #003274;
  font-weight: 600;
  font-size: 11px;
  text-align: center;
  letter-spacing: 0;
  text-transform: none;
}
.toolbar-smoothing__row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 6px;
  background: white;
  height: 24px;
  box-sizing: border-box;
}
.toolbar-smoothing__edge {
  font-size: 10px;
  color: rgba(0, 50, 116, 0.45);
  font-variant-numeric: tabular-nums;
}
.toolbar-smoothing__slider {
  flex: 1;
  height: 14px;
  margin: 0;
  padding: 0;
  background: transparent;
  accent-color: #003274;  /* native-native — modern browsers honour this */
  cursor: pointer;
}
/* Make the track slightly thicker and more visible than the browser default
   so the slider reads as a control at a glance, not a stray line. */
.toolbar-smoothing__slider::-webkit-slider-runnable-track {
  height: 3px;
  background: rgba(0, 50, 116, 0.2);
  border-radius: 2px;
}
.toolbar-smoothing__slider::-moz-range-track {
  height: 3px;
  background: rgba(0, 50, 116, 0.2);
  border-radius: 2px;
}

/* ── Charts placeholder ── */
.charts-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 3rem 1.5rem;
  text-align: center;
  color: rgba(0, 50, 116, 0.6);
  font-size: 13px;
}
.placeholder-hint {
  font-size: 11px;
  color: rgba(0, 50, 116, 0.35);
  max-width: 400px;
}

/* ── Charts ── */
.charts-area { padding: 1.25rem; }
.charts-header { margin-bottom: 1rem; }
.charts-title {
  font-size: 14px;
  font-weight: 700;
  color: #003274;
}
.charts-project {
  font-size: 12px;
  font-weight: 500;
  color: #6B7280;
  margin-left: 6px;
}
.charts-meta {
  font-size: 12px;
  color: #6B7280;
  margin-top: 2px;
}

.charts-loading, .charts-error, .charts-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 2rem;
  font-size: 13px;
  color: rgba(0, 50, 116, 0.4);
}
.charts-error { color: #E74C3C; }

/* ── Upload form ── */
.upload-form { display: flex; flex-direction: column; gap: 0.85rem; }
.upload-field { display: flex; flex-direction: column; gap: 4px; }
.upload-field label {
  font-size: 12px;
  font-weight: 600;
  color: #4B5563;
}
.upload-row { display: flex; gap: 0.75rem; }
.upload-row .upload-field { flex: 1; }
.upload-input {
  width: 100%;
  padding: 6px 10px;
  border: 1.5px solid rgba(0, 50, 116, 0.12);
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  color: #333;
  background: white;
}
.upload-input:focus { border-color: #003274; outline: none; }
.upload-textarea { resize: vertical; min-height: 48px; }

/* ── Multi-file upload ── */
.file-picker-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.file-picker-count {
  font-size: 12px;
  color: #4B5563;
  font-weight: 500;
}
.file-picker-done { color: #27AE60; margin-left: 4px; }
.file-picker-err  { color: #E74C3C; margin-left: 4px; }

.file-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 260px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid rgba(0, 50, 116, 0.08);
  border-radius: 8px;
  background: rgba(0, 50, 116, 0.02);
}
.file-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 6px;
  background: white;
  border: 1px solid rgba(0, 50, 116, 0.06);
  transition: background 0.15s;
}
.file-row-icon {
  width: 1.1rem;
  font-size: 0.95rem;
  text-align: center;
  flex-shrink: 0;
  color: #6B7280;
}
.file-row--uploading { background: #fff8e1; border-color: rgba(241, 196, 15, 0.4); }
.file-row--uploading .file-row-icon { color: #F39C12; }
.file-row--done      { background: #e8f5e9; border-color: rgba(39, 174, 96, 0.4); }
.file-row--done .file-row-icon { color: #27AE60; }
.file-row--error     { background: #fdecea; border-color: rgba(231, 76, 60, 0.4); }
.file-row--error .file-row-icon { color: #E74C3C; }

.file-row-name {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.file-row-title {
  font-size: 13px;
  font-weight: 600;
  color: #1F2937;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.file-row-sub {
  font-size: 11px;
  color: #6B7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.file-row-session { color: #003274; font-weight: 500; }
.file-row-dup     { color: #F39C12; }
.file-row-error   { color: #E74C3C; font-weight: 500; }

/* ── Shared settings block ── */
.upload-shared {
  border: 1px solid rgba(0, 50, 116, 0.1);
  border-radius: 8px;
  padding: 0.75rem 1rem 1rem;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: rgba(0, 50, 116, 0.015);
}
.upload-shared legend {
  padding: 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: #4B5563;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.default-battery-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.default-battery-row > :first-child { flex: 1; min-width: 0; }

/* ── Style bar (per-session style overrides) ── */

/* ── Excel export button (in toolbar) ── */
.export-xlsx-btn {
  display: inline-flex !important;
  align-items: center;
  gap: 6px;
  color: #16A085;
}
.export-xlsx-btn:hover:not(:disabled) {
  background: #16A085 !important;
  color: white !important;
  border-color: #16A085 !important;
}
.export-xlsx-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
