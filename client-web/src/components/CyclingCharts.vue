<script setup>
/**
 * CyclingCharts — interactive charts for battery cycling data.
 * 1. Capacity vs Cycle (discharge capacity fade)
 * 2. Coulombic Efficiency vs Cycle
 * 3. Voltage Profile (V vs Q for one or more cycles — overlay mode)
 * 4. dQ/dV (differential capacity) — computed from voltage profile
 *
 * Features: multi-cycle overlay, PNG export, cycle toggle chips.
 */
import { ref, computed, watch } from 'vue'
import { METRICS } from '@/utils/metricsEngine'
import { perfEnabled, togglePerf } from '@/utils/chartPerf'
import { sessionShortLabel as shortLabelOf, convertCapacity as convertCap, formatPct, formatVolt } from '@/utils/cyclingChartShared'
import ProvenancePopover from '@/components/ProvenancePopover.vue'
import HysteresisChart from '@/components/cycling/HysteresisChart.vue'
import CapacityChart from '@/components/cycling/CapacityChart.vue'
import VoltageProfileChart from '@/components/cycling/VoltageProfileChart.vue'
import DqdvChart from '@/components/cycling/DqdvChart.vue'

// Multi-session props — each session carries its own summary + cycleDataMap
// + color. See CyclingPage.activeSessionViews for the shape.
const props = defineProps({
  sessions: { type: Array, default: () => [] },
  // Cycle selection is global (applies to every session on the chart). If
  // a session doesn't have a given cycle, it's silently skipped in the
  // voltage/dQdV panels — no error.
  selectedCycles: { type: Array, default: () => [] },
  maxSelected: { type: Number, default: 20 },
  // User-supplied experiment name (appears as chart titles + PNG filename
  // prefix). Empty string → fall back to auto-generated titles.
  experimentLabel: { type: String, default: '' },
  // Publication-style toggle: single color per session in voltage profile,
  // minimal legend, no tooltip hints — matches how papers render it.
  publicationMode: { type: Boolean, default: false },
  // 'Ah' | 'mAh_per_g'. When 'mAh_per_g', capacity axes are divided by
  // each session's active_mass_mg to show specific capacity. Only meaningful
  // when sessions have active_mass_mg populated — the parent toggles the
  // prop back to 'Ah' when any active session lacks mass.
  capacityUnit: { type: String, default: 'Ah' },
  // When true, render summary tables under the capacity chart showing
  // raw numbers per cycle (matches colleague's Excel output, useful for
  // paper-ready reports and for copy-pasting into other tools).
  showTables: { type: Boolean, default: true },
  // 'both' | 'charge' | 'discharge'. Standard filter in electrochemistry
  // software (BTS / NOVA / EC-Lab): you often want to look at just the
  // charge curve (phase-transition analysis on lithiation) or just the
  // discharge curve (delithiation + capacity fade). Applied to voltage
  // profile + dQ/dV. Capacity+CE chart is per-cycle summary and not
  // filterable by step.
  stepFilter: { type: String, default: 'both' },
  // Moving-average window for dQ/dV smoothing. 1 = no smoothing (raw
  // differentiated signal, every noise spike visible), 5 = our default
  // (good balance for clean ELITECH data), 11-15 = heavy smoothing
  // recommended for noisy cells where peaks get buried in measurement
  // jitter. Clamped to [1, 21] inside computeDQDV.
  smoothingWindow: { type: Number, default: 5 },
  // dQ/dV smoothing method: 'savgol' = navani-style Savitzky–Golay pipeline
  // (uniform V-grid, double SG smooth — publication-grade peak analysis);
  // 'ma' = legacy moving average over raw finite differences.
  dqdvMethod: { type: String, default: 'savgol' },
  // SG strength preset: 'light' | 'standard' | 'strong' (see SAVGOL_PRESETS)
  dqdvPreset: { type: String, default: 'standard' },
  // View of the differential chart: 'dqdv' (|dQ/dV| vs V — phase peaks) or
  // 'dvdq' (|dV/dQ| vs Q — DVA, degradation-mode localisation). dV/dQ is
  // SG-only (the MA path has no capacity-grid concept).
  dqdvView: { type: String, default: 'dqdv' },
  // Auto-annotate detected peaks (position labels) on the differential chart.
  dqdvPeaks: { type: Boolean, default: true },
  // Colour cycles along the viridis gradient (1st violet → last yellow) on
  // voltage profile + differential chart, instead of session-colour alpha fade.
  cycleGradient: { type: Boolean, default: false },
  // 'absolute' | 'retention'. Controls what the capacity chart plots:
  //   absolute  — discharge/charge capacity in Ah or mAh/g (default).
  //   retention — C(n) / C(first_valid) × 100 % per session. Scientific
  //     standard for fade visualization in Li-ion papers. First cycle of
  //     each session is the reference (100 %); if cycle 1 is a formation
  //     cycle, the user can still see the full fade curve.
  capacityView: { type: String, default: 'absolute' },
  // Voltage hysteresis chart: ΔV̄ = avg_charge_V − avg_discharge_V (in mV)
  // per cycle. A classic "how much is kinetic loss growing with cycling"
  // plot — rising hysteresis means polarisation is getting worse
  // (SEI growth, contact loss, dendrite nucleation). Gated by a toolbar
  // toggle because on first-cycle-only runs the chart is just two points.
  showHysteresis: { type: Boolean, default: false },
  // Ghost trace: render cycle (N-1) as a faded, thin line behind cycle N
  // on the voltage profile. Helps the eye catch fade between adjacent
  // cycles when the user has both loaded (the previous cycle must be
  // present in cycleDataMap — we don't auto-fetch it). Off by default.
  ghostTrace: { type: Boolean, default: false },
})

// ── Per-chart style resolution (from active preset in the user library) ──
// One style object per chart id. The style controls palette (per-session
// color rotation), borderWidth (line thickness baseline), pointStyle,
// pointRadius. The cycle-index alpha gradient + charge/discharge dash
// stay intrinsic to the chart — those are readability aids, not "style".
// Resolve a session color for a specific chart from the active preset's
// palette. Session index in the active list determines which palette slot
// it lands in (first session = palette[0], etc, rotating). This keeps
// sessions distinguishable without burning the page-level session.color.
// Convert a capacity value (Ah) to the current display unit based on
// session-specific active mass. Returns null if mode is mAh/g but mass is
// missing (we'd otherwise divide by zero/null and poison the axis).
// Тонкие обёртки над shared-конвертерами: props-зависимости (unit) живут тут.
const convertCapacity = (ah, session) => convertCap(ah, session, props.capacityUnit)
function formatCap(ah, session) {
  const v = convertCapacity(ah, session)
  if (v == null || !Number.isFinite(v)) return '—'
  return props.capacityUnit === 'mAh_per_g' ? v.toFixed(2) : v.toFixed(5)
}

// ── Raw datapoints viewer (inline panel, always visible) ───────────────
// Replaces the earlier modal — users missed the "click row → opens modal"
// affordance. The panel sits under the summary tables with explicit
// session + cycle pickers, filter, search, and paginated raw point view.
//
// rawSession / rawCycle track the currently-inspected (session, cycle).
// First user interaction with a summary row auto-selects it here; the
// user can then change session/cycle via the dropdowns above the table.
const rawSession = ref(null)
const rawCycle = ref(null)
const rawFilter = ref('all')        // 'all' | 'charge' | 'discharge' | 'rest' | 'cccv'
const rawSearchMin = ref(null)      // voltage range lo
const rawSearchMax = ref(null)      // voltage range hi
const rawPage = ref(0)
const RAW_PAGE_SIZE = 500

// Connect the toolbar's global step filter to the raw-points table.
// stepFilter (both/charge/discharge) and rawFilter both narrow the same
// step_type field, so two independent controls would silently contradict
// each other — exactly the "filter disconnected from the table" gripe.
// The global filter now seeds the local one; the raw panel's own buttons
// (incl. CCCV/Отдых) still refine within that until the next global change.
watch(() => props.stepFilter, (sf) => {
  rawFilter.value = sf === 'charge' ? 'charge'
    : sf === 'discharge' ? 'discharge'
    : 'all'
  rawPage.value = 0
})

function selectRawView(session, cycleNumber) {
  rawSession.value = session
  rawCycle.value = cycleNumber
  rawPage.value = 0
}

// Auto-select first active session + first cycle when none is chosen yet
// and data arrives. Keeps the panel useful out-of-the-box without a click.
const rawAutoSession = computed(() => {
  if (rawSession.value && props.sessions.some(s => s.session_id === rawSession.value.session_id)) {
    return rawSession.value
  }
  return props.sessions[0] || null
})
const rawAutoCycle = computed(() => {
  const s = rawAutoSession.value
  if (!s?.summary?.length) return null
  // Use user-chosen cycle if valid, else first cycle with data, else first
  // cycle from summary.
  if (rawCycle.value != null && s.summary.some(r => r.cycle_number === rawCycle.value)) {
    return rawCycle.value
  }
  const loaded = Object.keys(s.cycleDataMap || {}).map(Number).filter(n => !isNaN(n))
  if (loaded.length) return loaded.sort((a, b) => a - b)[0]
  return s.summary[0]?.cycle_number ?? null
})

// All cycles available for the dropdown — based on the active session's summary.
const rawCycleOptions = computed(() => {
  const s = rawAutoSession.value
  if (!s?.summary) return []
  return s.summary.map(r => {
    const hasData = !!(s.cycleDataMap?.[r.cycle_number]?.length)
    return { value: r.cycle_number, loaded: hasData }
  })
})

// Source points — filtered + paginated
const rawPoints = computed(() => {
  const s = rawAutoSession.value
  const c = rawAutoCycle.value
  if (!s || c == null) return []
  return s.cycleDataMap?.[c] || []
})

const rawFiltered = computed(() => {
  let pts = rawPoints.value
  if (rawFilter.value !== 'all') {
    pts = pts.filter(p => p.step_type === rawFilter.value)
  }
  // Range inputs: an empty field is null/''; Number(null) = 0 which
  // *is* finite, so we MUST check for "has a real value" first — otherwise
  // the filter becomes "voltage_v <= 0" and rejects every positive reading.
  const loRaw = rawSearchMin.value
  const hiRaw = rawSearchMax.value
  const hasLo = loRaw !== null && loRaw !== '' && Number.isFinite(Number(loRaw))
  const hasHi = hiRaw !== null && hiRaw !== '' && Number.isFinite(Number(hiRaw))
  if (hasLo) {
    const lo = Number(loRaw)
    pts = pts.filter(p => (p.voltage_v ?? -Infinity) >= lo)
  }
  if (hasHi) {
    const hi = Number(hiRaw)
    pts = pts.filter(p => (p.voltage_v ?? Infinity) <= hi)
  }
  return pts
})

const rawPageCount = computed(() =>
  Math.max(1, Math.ceil(rawFiltered.value.length / RAW_PAGE_SIZE))
)
const rawPagePoints = computed(() => {
  const start = rawPage.value * RAW_PAGE_SIZE
  return rawFiltered.value.slice(start, start + RAW_PAGE_SIZE)
})

// Emit when user wants to fetch a cycle that isn't cached yet — parent
// already has the fetch machinery via toggle-cycle / replace-cycles.
function requestRawCycle(cycleNumber) {
  if (cycleNumber == null) return
  rawCycle.value = cycleNumber
  rawPage.value = 0
  const s = rawAutoSession.value
  if (s && !s.cycleDataMap?.[cycleNumber]?.length) {
    emit('toggle-cycle', cycleNumber)
  }
}

// Panel "📐 Как считаем" — collapsed by default
const formulasOpen = ref(false)

// Таблицы циклов без виртуализации — 5 сессий × 1000 циклов дали бы 5000
// DOM-строк (главный источник лага на длинных реф-сессиях). Рендерим первые
// TABLE_ROW_CAP, остальное — по кнопке «показать все».
const TABLE_ROW_CAP = 100
const expandedTables = ref(new Set())
function tableRows(s) {
  if (!s.summary) return []
  if (s.summary.length <= TABLE_ROW_CAP || expandedTables.value.has(s.session_id)) return s.summary
  return s.summary.slice(0, TABLE_ROW_CAP)
}
function expandTable(sid) {
  const next = new Set(expandedTables.value)
  next.add(sid)
  expandedTables.value = next
}

// toggle-cycle — add/remove one cycle (across all active sessions)
// replace-cycles — swap the whole selection (used by quick filters)
// style-click — user clicked the ⚙ on a specific chart; parent opens the
//   style popover positioned at the click event for that chartId.
const emit = defineEmits(['toggle-cycle', 'replace-cycles', 'style-click'])

// Fired by each chart's ⚙ button; parent receives { chartId, event } and
// opens the shared popover positioned at the click target.
function openChartStyle(chartId, event) {
  emit('style-click', chartId, event)
}

// ── Compatibility helpers for the rest of the component ────────────────
// Aggregated "summary" across all sessions — used for cycle-filter buttons
// ("Все (N)" needs to know the full range). We take the union of cycle
// numbers seen in any session, sorted, deduped.
const mergedSummary = computed(() => {
  const seen = new Set()
  const out = []
  for (const s of props.sessions) {
    for (const row of s.summary || []) {
      if (seen.has(row.cycle_number)) continue
      seen.add(row.cycle_number)
      out.push({ cycle_number: row.cycle_number })
    }
  }
  out.sort((a, b) => a.cycle_number - b.cycle_number)
  return out
})

// Aggregated loading set across sessions — so a single spinner on a chip
// lights up regardless of which session is fetching cycle N.
const mergedLoadingSet = computed(() => {
  const all = new Set()
  for (const s of props.sessions) {
    for (const c of s.loadingCycles || []) all.add(c)
  }
  return all
})

// For the legacy "summary" variable used by filter functions, expose the
// merged list under the old name so we don't have to rename everywhere.
// (We still use props.sessions for actual chart data.)
const summary = mergedSummary

// Chart refs for PNG export
// ── Session label helper (shown in chart legends) ──
// Primary format: "Акк. №5" — battery number is the scientific anchor.
// If the user activates two cycling runs of the same cell (e.g. "Cell 5
// at 25°C" and "Cell 5 at 45°C"), they get suffixed: "Акк. №5а" /
// "Акк. №5б" — same anchor, differentiable. We use Cyrillic а-з first
// (up to 8 runs of one cell is plenty), falling back to digits beyond.
// If the session has no battery attached at all, show "№42" bare.
const sessionShortLabel = (s) => shortLabelOf(s, props.sessions)

// ── Quick filters (replace whole selection) ────────────────────────────
// All helpers clamp to maxSelected — the lazy-fetch loop in CyclingPage
// doesn't scale past ~20 cycles without noticeable lag, and the voltage
// overlay becomes unreadable past that anyway.
const allCycleNumbers = computed(() => mergedSummary.value.map(s => s.cycle_number))

// UI state for the custom-range popover
const rangeOpen = ref(false)
const rangeFrom = ref(null)
const rangeTo = ref(null)

// "Каждый N-й" — plain number input + a few preset buttons next to it.
// PrimeVue's Select kept fighting our height overrides, and users want
// to enter arbitrary values anyway (N = 50 on a 10000-cycle run is
// common), so a native <input type="number"> is both simpler and more
// scalable. `everyNStep` holds the current value.
const everyNStep = ref(null)

function onEveryNApply() {
  const n = Number(everyNStep.value)
  if (!Number.isFinite(n) || n < 1) return
  selectEveryNth(Math.round(n))
}

function clampToMax(list) {
  if (list.length <= props.maxSelected) return list
  // Prefer evenly-spaced decimation over "first N"
  const step = Math.ceil(list.length / props.maxSelected)
  const out = []
  for (let i = 0; i < list.length; i += step) out.push(list[i])
  // Ensure last cycle is always included (most interesting for fade)
  if (out[out.length - 1] !== list[list.length - 1]) out.push(list[list.length - 1])
  return out.slice(0, props.maxSelected)
}

// Per-session cycle-number lists (each sorted asc). Quick filters sample
// EACH session independently and union the result — overlaying a short
// session (e.g. a 10-cycle ELITECH cell) with a long one (250+ cycles) must
// never starve the short one. "Каждый N-й" over the global union lands
// almost no numbers inside the short session's range (every-10th of 1..253
// hits only cycle 1 of a 1..10 session); per-session it samples each at its
// own resolution so every session stays visible.
function perSessionCycleLists() {
  return props.sessions
    .map(s => (s.summary || []).map(r => r.cycle_number).filter(n => n != null).sort((a, b) => a - b))
    .filter(list => list.length)
}

// One session's own cycles, sampled: first (formation) + every n-th + last.
function everyNthOf(list, n) {
  const picked = []
  for (let i = 0; i < list.length; i += n) picked.push(list[i])
  if (list.length && picked[picked.length - 1] !== list[list.length - 1]) picked.push(list[list.length - 1])
  return picked
}

function unionSorted(lists) {
  const set = new Set()
  for (const l of lists) for (const c of l) set.add(c)
  return [...set].sort((a, b) => a - b)
}

function selectAll() {
  emit('replace-cycles', clampToMax(allCycleNumbers.value))
}

function selectEveryNth(n) {
  if (n < 1) return
  const lists = perSessionCycleLists()
  if (!lists.length) return
  const picked = unionSorted(lists.map(l => everyNthOf(l, n)))
  emit('replace-cycles', clampToMax(picked))
}

function applyRange() {
  const all = allCycleNumbers.value
  if (!all.length) return
  const min = Math.min(...all)
  const max = Math.max(...all)
  const from = Math.max(min, Number(rangeFrom.value) || min)
  const to   = Math.min(max, Number(rangeTo.value) || max)
  if (from > to) return
  const picked = all.filter(c => c >= from && c <= to)
  emit('replace-cycles', clampToMax(picked))
  rangeOpen.value = false
}

function clearSelection() {
  emit('replace-cycles', [])
}

// Dynamic labels: "Каждый 5й (3)" — preview how many the filter would pick.
// Mirrors selectEveryNth's per-session sampling so the count is honest.
function countEveryNth(n) {
  if (n < 1) return 0
  const lists = perSessionCycleLists()
  if (!lists.length) return 0
  const picked = unionSorted(lists.map(l => everyNthOf(l, n)))
  return Math.min(picked.length, props.maxSelected)
}

// ── Quick cycle buttons ──
const cycleButtons = computed(() => {
  const numbers = mergedSummary.value.map(s => s.cycle_number)
  if (!numbers.length) return []  // guard: empty summary → no buttons
  if (numbers.length <= 12) return numbers

  // Pick representative cycles: first/last 3 + evenly spaced midpoints
  const picks = new Set()
  for (let i = 0; i < Math.min(3, numbers.length); i++) picks.add(numbers[i])
  for (let i = Math.max(0, numbers.length - 3); i < numbers.length; i++) picks.add(numbers[i])
  for (const frac of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    const i = Math.floor((numbers.length - 1) * frac)
    picks.add(numbers[i])
  }
  return [...picks].sort((a, b) => a - b)
})

const selectedSet = computed(() => new Set(props.selectedCycles))
// loadingSet — union across all sessions (chip spinner is a global "is
// any session fetching this cycle?" indicator; the per-session chip above
// the charts shows which specific session is loading)
const loadingSet = mergedLoadingSet

function handleToggle(cycleNum) {
  emit('toggle-cycle', cycleNum)
}

// ── Происхождение значений (контракт метрик) ──────────────────────────
// Правый клик по значению в таблице циклов → ProvenancePopover: формула из
// contracts/metrics.v1.json, подстановка чисел, источник, «Перепроверить».
const provRef = ref(null)

// Какие входы нужны каждой метрике таблицы (для скалярного пересчёта);
// stream-пересчёт (ёмкости/энергии/средние V) идёт из загруженных точек цикла.
function provPayload(s, row, metricId) {
  const byMetric = {
    coulombic_efficiency: {
      value: row.coulombic_efficiency,
      inputs: { discharge_capacity_ah: row.discharge_capacity_ah, charge_capacity_ah: row.charge_capacity_ah },
    },
    energy_efficiency: {
      value: row.energy_efficiency,
      inputs: { discharge_energy_wh: row.discharge_energy_wh, charge_energy_wh: row.charge_energy_wh },
    },
    charge_capacity_ah: { value: row.charge_capacity_ah, inputs: null },
    discharge_capacity_ah: { value: row.discharge_capacity_ah, inputs: null },
    avg_charge_voltage_v: { value: row.avg_charge_voltage_v, inputs: null },
    avg_discharge_voltage_v: { value: row.avg_discharge_voltage_v, inputs: null },
  }
  const base = byMetric[metricId] || { value: row[metricId], inputs: null }
  return {
    metricId,
    ...base,
    points: s.cycleDataMap?.[row.cycle_number] || null,
    storedKey: metricId,
    source: {
      file_name: s.file_name,
      equipment_type: s.equipment_type,
      protocol: s.protocol,
      uploaded_at: s.uploaded_at,
      notes: s.notes,
    },
  }
}

function openProv(event, s, row, metricId) {
  provRef.value?.open(event, provPayload(s, row, metricId))
}

// Панель «Как считаются параметры» — из контракта (единый источник с
// сервером/импортёрами), вместо рукописного дубля, который уже дрейфовал
// (описывал скользящее среднее как дефолт dQ/dV после перехода на Сав-Гол).
const FORMULA_PANEL_IDS = [
  'charge_capacity_ah', 'specific_capacity_mah_g',
  'coulombic_efficiency', 'energy_efficiency',
  'avg_charge_voltage_v', 'hysteresis_mv',
  'capacity_retention_pct', 'soh_pct',
  'dqdv_savgol', 'dvdq_savgol',
]
const formulaEntries = FORMULA_PANEL_IDS
  .map(id => ({ id, ...METRICS[id] }))
  .filter(m => m.label_ru)
</script>

<template>
  <div class="cycling-charts">
    <!-- Происхождение значений: формула из контракта + источник + пересчёт -->
    <ProvenancePopover ref="provRef" />
    <!-- Top: combined Capacity + CE chart (dual Y-axis, publication style) -->
    <CapacityChart
      :sessions="sessions"
      :selectedCycles="selectedCycles"
      :stepFilter="stepFilter"
      :capacityView="capacityView"
      :capacityUnit="capacityUnit"
      :experimentLabel="experimentLabel"
      @style-click="openChartStyle('capacity', $event)"
      @toggle-cycle="emit('toggle-cycle', $event)"
    />

    <!-- Voltage hysteresis (opt-in via toolbar toggle; self-hides when no
         session carries avg voltages — older uploads pre-migration-019). -->
    <HysteresisChart
      v-if="showHysteresis"
      :sessions="sessions"
      :experimentLabel="experimentLabel"
      @style-click="openChartStyle('hysteresis', $event)"
    />

    <!-- Per-cycle summary tables — one per active session (replicates the
         colleague's Excel tab with Chg/DChg/CE columns). Shown below the
         capacity chart so the user can see numbers + plot together. -->
    <div v-if="showTables && sessions.length" class="summary-tables">
      <div
        v-for="s in sessions"
        :key="s.session_id"
        class="summary-table-wrap"
      >
        <div class="summary-table-head" :style="{ borderColor: s.color }">
          <span class="summary-table-chip" :style="{ background: s.color }"></span>
          <strong>{{ sessionShortLabel(s) }}</strong>
          <span v-if="s.file_name" class="summary-table-sub" :title="s.file_name">
            · {{ s.file_name }}
          </span>
          <span v-if="s.active_mass_mg" class="summary-table-sub">
            · масса AM: {{ Number(s.active_mass_mg).toFixed(3) }} mg
          </span>
        </div>
        <div class="summary-table-scroll">
          <table class="summary-table">
            <thead>
              <tr>
                <th>Цикл</th>
                <th :title="capacityUnit === 'mAh_per_g' ? 'Charge specific capacity, mAh per gram of active material' : 'Charge capacity, Ah'">
                  Chg {{ capacityUnit === 'mAh_per_g' ? '(mAh/g)' : '(Ah)' }}
                </th>
                <th :title="capacityUnit === 'mAh_per_g' ? 'Discharge specific capacity' : 'Discharge capacity'">
                  DChg {{ capacityUnit === 'mAh_per_g' ? '(mAh/g)' : '(Ah)' }}
                </th>
                <th title="Coulombic efficiency: DChg / Chg × 100">CE (%)</th>
                <th title="Energy efficiency: E_dch / E_chg × 100 (round-trip)">EE (%)</th>
                <th title="Среднее напряжение заряда">V̄ chg</th>
                <th title="Среднее напряжение разряда">V̄ dch</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in tableRows(s)"
                :key="row.cycle_number"
                class="summary-row"
                :class="{ 'summary-row--active': rawAutoSession?.session_id === s.session_id && rawAutoCycle === row.cycle_number }"
                :title="'Показать сырые точки этого цикла ниже'"
                @click="selectRawView(s, row.cycle_number)"
              >
                <td class="cell-cycle">{{ row.cycle_number }}</td>
                <td @contextmenu.prevent="openProv($event, s, row, 'charge_capacity_ah')">{{ formatCap(row.charge_capacity_ah, s) }}</td>
                <td @contextmenu.prevent="openProv($event, s, row, 'discharge_capacity_ah')">{{ formatCap(row.discharge_capacity_ah, s) }}</td>
                <td @contextmenu.prevent="openProv($event, s, row, 'coulombic_efficiency')">{{ formatPct(row.coulombic_efficiency) }}</td>
                <td @contextmenu.prevent="openProv($event, s, row, 'energy_efficiency')">{{ formatPct(row.energy_efficiency) }}</td>
                <td @contextmenu.prevent="openProv($event, s, row, 'avg_charge_voltage_v')">{{ formatVolt(row.avg_charge_voltage_v) }}</td>
                <td @contextmenu.prevent="openProv($event, s, row, 'avg_discharge_voltage_v')">{{ formatVolt(row.avg_discharge_voltage_v) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <button
          v-if="(s.summary?.length || 0) > TABLE_ROW_CAP && !expandedTables.has(s.session_id)"
          class="table-expand-btn"
          @click="expandTable(s.session_id)"
        >
          показать все {{ s.summary.length }} циклов (сейчас первые {{ TABLE_ROW_CAP }})
        </button>
      </div>
      <div class="prov-hint-line">
        <i class="pi pi-info-circle"></i>
        Правый клик по значению — происхождение: формула, источник, пересчёт
        <button class="perf-toggle-btn" :class="{ 'is-on': perfEnabled }" title="Перф-метрики на графиках: сборка · отрисовка · точки" @click="togglePerf">
          ⏱ перф
        </button>
      </div>
    </div>

    <!-- 📐 Collapsible formulas panel (scientific transparency) -->
    <div v-if="sessions.length" class="formulas-panel">
      <button class="formulas-head" @click="formulasOpen = !formulasOpen">
        <i :class="formulasOpen ? 'pi pi-chevron-down' : 'pi pi-chevron-right'"></i>
        📐 Как считаются параметры
        <span class="formulas-hint">{{ formulasOpen ? 'скрыть' : 'показать формулы' }}</span>
      </button>
      <!-- Содержимое — из contracts/metrics.v1.json (единый источник с
           серверным парсером и импортёрами; рукописный дубль здесь уже успел
           дрейфовать — описывал скользящее среднее как дефолт dQ/dV). -->
      <div v-if="formulasOpen" class="formulas-body">
        <dl class="formulas-list">
          <template v-for="m in formulaEntries" :key="m.id">
            <dt>{{ m.label_ru }} <span v-if="m.unit">({{ m.unit }})</span></dt>
            <dd>
              <code>{{ m.formula }}</code>
              <small>{{ m.formula_text_ru }}</small>
            </dd>
          </template>
          <dt>Классификация step_type</dt>
          <dd>
            <code>«Гальваностат» + I̅ &gt; 0 → charge, I̅ &lt; 0 → discharge</code>
            <small>«Вольтметр» (OCV-измерение) → rest. «Потенциостат» → cccv при I ≠ 0, rest при I = 0. Для файлов без «Тип работы» (EN locale) — только по знаку среднего тока шага. (Логика парсера scripts/parse_cycling.py.)</small>
          </dd>
        </dl>
        <div class="formulas-contract-note">
          Формулы — из контракта <code>contracts/metrics.v1.json</code>; все реализации
          (сервер, импортёры, графики) проходят общие golden-тесты соответствия.
        </div>
      </div>
    </div>

    <!-- Quick filters (replace whole selection) -->
    <div v-if="summary.length" class="cycle-filters">
      <span class="cycle-label">Фильтры:</span>
      <button class="filter-btn" @click="selectAll">
        Все ({{ Math.min(allCycleNumbers.length, maxSelected) }})
      </button>
      <span class="filter-every-group">
        <span class="filter-every-prefix">каждый</span>
        <input
          v-model.number="everyNStep"
          type="number"
          min="1"
          :max="allCycleNumbers.length"
          class="filter-input"
          placeholder="N"
          :disabled="allCycleNumbers.length < 2"
          :title="'1, 1+N, 1+2N, ...'"
          @change="onEveryNApply"
          @keydown.enter="onEveryNApply"
        />
        <span class="filter-every-suffix">-й</span>
        <span
          v-if="everyNStep && countEveryNth(everyNStep) > 0"
          class="filter-every-preview"
          :title="`При применении выберется ${countEveryNth(everyNStep)} цикл(ов) из ${allCycleNumbers.length}`"
        >
          ({{ countEveryNth(everyNStep) }})
        </span>
      </span>
      <!-- Custom range popover -->
      <div class="filter-range" :class="{ 'is-open': rangeOpen }">
        <button class="filter-btn" @click="rangeOpen = !rangeOpen">
          Диапазон…
        </button>
        <div v-if="rangeOpen" class="range-popover">
          <span>от</span>
          <input v-model.number="rangeFrom" type="number" class="range-input"
                 :min="allCycleNumbers[0]" :max="allCycleNumbers[allCycleNumbers.length - 1]"
                 :placeholder="allCycleNumbers[0]" />
          <span>до</span>
          <input v-model.number="rangeTo" type="number" class="range-input"
                 :min="allCycleNumbers[0]" :max="allCycleNumbers[allCycleNumbers.length - 1]"
                 :placeholder="allCycleNumbers[allCycleNumbers.length - 1]" />
          <button class="filter-btn filter-btn--apply" @click="applyRange">Применить</button>
        </div>
      </div>
      <button
        class="filter-btn filter-btn--clear"
        :disabled="!selectedCycles.length"
        @click="clearSelection"
      >
        Очистить
      </button>
      <span class="cycle-hint">
        выбрано {{ selectedCycles.length }} из {{ allCycleNumbers.length }}
      </span>
    </div>

    <!-- Cycle selector (representative chips when many cycles) -->
    <div class="cycle-selector">
      <span class="cycle-label">Циклы:</span>
      <template v-for="(c, idx) in cycleButtons" :key="c">
        <!-- "…" between non-consecutive chip numbers so the user sees the
             selection is a sparse subset, not a complete range -->
        <span
          v-if="idx > 0 && c - cycleButtons[idx - 1] > 1"
          class="cycle-gap"
          aria-hidden="true"
        >…</span>
        <button
          :class="['cycle-btn', selectedSet.has(c) ? 'active' : '', loadingSet.has(c) ? 'loading' : '']"
          @click="handleToggle(c)"
        >
          <i v-if="loadingSet.has(c)" class="pi pi-spin pi-spinner" style="font-size:9px;margin-right:3px"></i>
          {{ c }}
        </button>
      </template>
    </div>

    <!-- Voltage profile (overlay of selected cycles) -->
    <VoltageProfileChart
      v-if="selectedCycles.length"
      :sessions="sessions"
      :selectedCycles="selectedCycles"
      :stepFilter="stepFilter"
      :capacityView="capacityView"
      :capacityUnit="capacityUnit"
      :publicationMode="publicationMode"
      :ghostTrace="ghostTrace"
      :cycleGradient="cycleGradient"
      :experimentLabel="experimentLabel"
      @style-click="openChartStyle('voltage', $event)"
    />
    <div v-else class="chart-placeholder">
      <i class="pi pi-chart-line"></i>
      Выберите цикл(ы) выше или кликните по точке на графике ёмкости
    </div>

    <!-- dQ/dV plot -->
    <DqdvChart
      v-if="selectedCycles.length"
      :sessions="sessions"
      :selectedCycles="selectedCycles"
      :stepFilter="stepFilter"
      :smoothingWindow="smoothingWindow"
      :dqdvMethod="dqdvMethod"
      :dqdvPreset="dqdvPreset"
      :dqdvView="dqdvView"
      :dqdvPeaks="dqdvPeaks"
      :cycleGradient="cycleGradient"
      :publicationMode="publicationMode"
      :experimentLabel="experimentLabel"
      @style-click="openChartStyle('dqdv', $event)"
    />

    <!-- 🔍 Raw datapoints panel — at the bottom so users scan charts
         first, then dig into the numbers for verification. Defaults to
         the first active session + first cycle with data; row click in
         the summary table above updates the selection. -->
    <div v-if="sessions.length" class="raw-panel">
      <div class="raw-panel-head">
        <span class="raw-panel-title">🔍 Сырые точки</span>

        <!-- Session picker (only shown when > 1 active) -->
        <template v-if="sessions.length > 1">
          <label class="raw-label">Измерение:</label>
          <select
            class="raw-select"
            :value="rawAutoSession?.session_id"
            @change="e => selectRawView(sessions.find(x => x.session_id === Number(e.target.value)), rawAutoCycle)"
          >
            <option v-for="s in sessions" :key="s.session_id" :value="s.session_id">
              {{ sessionShortLabel(s) }}
            </option>
          </select>
        </template>

        <label class="raw-label">Цикл:</label>
        <select
          class="raw-select"
          :value="rawAutoCycle"
          @change="e => requestRawCycle(Number(e.target.value))"
        >
          <option v-for="opt in rawCycleOptions" :key="opt.value" :value="opt.value">
            Ц{{ opt.value }}{{ opt.loaded ? '' : ' (не загружен)' }}
          </option>
        </select>

        <label class="raw-label">Шаг:</label>
        <div class="raw-filter-btns">
          <button
            v-for="opt in [
              { v: 'all',       l: 'Все' },
              { v: 'charge',    l: 'Заряд' },
              { v: 'discharge', l: 'Разряд' },
              { v: 'cccv',      l: 'CCCV' },
              { v: 'rest',      l: 'Отдых' },
            ]"
            :key="opt.v"
            class="raw-filter-btn"
            :class="{ 'is-active': rawFilter === opt.v }"
            @click="rawFilter = opt.v; rawPage = 0"
          >{{ opt.l }}</button>
        </div>

        <label class="raw-label">V от</label>
        <input v-model.number="rawSearchMin" type="number" step="0.01" class="raw-range" placeholder="—"
               @input="rawPage = 0" />
        <label class="raw-label">до</label>
        <input v-model.number="rawSearchMax" type="number" step="0.01" class="raw-range" placeholder="—"
               @input="rawPage = 0" />

        <span class="raw-count">
          <strong>{{ rawFiltered.length }}</strong>
          <span class="raw-count-total">/ {{ rawPoints.length }} точек</span>
        </span>
      </div>

      <!-- Points table or hint to pick a cycle -->
      <div v-if="rawPoints.length" class="raw-table-scroll">
        <table class="raw-table">
          <thead>
            <tr>
              <th class="c-idx">#</th>
              <th>t (с)</th>
              <th>V</th>
              <th>I (A)</th>
              <th>Q (Ah)</th>
              <th>step</th>
              <th>type</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(p, idx) in rawPagePoints" :key="rawPage * 500 + idx">
              <td class="c-idx">{{ rawPage * 500 + idx + 1 }}</td>
              <td>{{ p.time_s == null ? '—' : p.time_s.toFixed(2) }}</td>
              <td>{{ p.voltage_v == null ? '—' : p.voltage_v.toFixed(5) }}</td>
              <td>{{ p.current_a == null ? '—' : p.current_a.toExponential(4) }}</td>
              <td>{{ p.capacity_ah == null ? '—' : p.capacity_ah.toExponential(4) }}</td>
              <td>{{ p.step_number ?? '—' }}</td>
              <td>
                <span class="raw-type-chip" :data-type="p.step_type">{{ p.step_type || '—' }}</span>
              </td>
            </tr>
            <tr v-if="!rawPagePoints.length">
              <td colspan="7" class="raw-empty">Нет точек под фильтр</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="raw-empty-panel">
        Цикл не загружен. Выберите цикл выше или в блоке «Циклы» — данные
        подгрузятся и появятся здесь.
      </div>

      <!-- Pagination -->
      <div v-if="rawPageCount > 1" class="raw-pagination">
        <button class="raw-pg-btn" :disabled="rawPage === 0" @click="rawPage = 0">« первая</button>
        <button class="raw-pg-btn" :disabled="rawPage === 0" @click="rawPage--">‹ назад</button>
        <span class="raw-pg-info">Страница {{ rawPage + 1 }} из {{ rawPageCount }}</span>
        <button class="raw-pg-btn" :disabled="rawPage >= rawPageCount - 1" @click="rawPage++">вперёд ›</button>
        <button class="raw-pg-btn" :disabled="rawPage >= rawPageCount - 1" @click="rawPage = rawPageCount - 1">последняя »</button>
      </div>
    </div>

  </div>
</template>

<style scoped>
.cycling-charts { display: flex; flex-direction: column; gap: 1rem; }

.charts-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.chart-axis-lock button:not(.is-active):hover { background: rgba(0, 50, 116, 0.08); }

/* ── Cycle filters (quick-select) ── */
.cycle-filters {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
  padding: 0.35rem 0;
}
.filter-btn {
  padding: 3px 10px;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 6px;
  background: white;
  font-size: 12px;
  font-weight: 500;
  color: #003274;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}
.filter-btn:hover:not(:disabled) {
  background: #003274;
  color: white;
  border-color: #003274;
}
.filter-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.filter-btn--clear {
  margin-left: auto;
  background: transparent;
  color: #E74C3C;
  border-color: rgba(231, 76, 60, 0.25);
}
.filter-btn--clear:hover:not(:disabled) {
  background: #E74C3C;
  color: white;
  border-color: #E74C3C;
}
.filter-btn--apply {
  background: #003274;
  color: white;
  border-color: #003274;
}

/* "каждый N-й" — plain inline group: label text + number input + "-й" text.
   Native <input> sizes naturally to match the filter-btn pills (same
   padding, border, font), so there's nothing to fight. */
.filter-every-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 6px;
  background: white;
  font-size: 12px;
  color: #003274;
}
.filter-every-prefix,
.filter-every-suffix {
  font-weight: 500;
  color: rgba(0, 50, 116, 0.6);
}
.filter-every-preview {
  font-size: 11px;
  color: rgba(0, 50, 116, 0.45);
  font-variant-numeric: tabular-nums;
  margin-left: 2px;
  cursor: help;
}
.filter-input {
  width: 60px;
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  color: #003274;
  font-family: inherit;
  padding: 0 2px;
  outline: none;
  text-align: center;
  /* Hide browser default number spinners for a cleaner inline look */
  -moz-appearance: textfield;
}
.filter-input::-webkit-outer-spin-button,
.filter-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.filter-input:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.filter-every-group:focus-within {
  border-color: #003274;
  box-shadow: 0 0 0 2px rgba(0, 50, 116, 0.12);
}

/* Range popover — inline bubble */
.filter-range { position: relative; }
.range-popover {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  background: white;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  z-index: 10;
  font-size: 12px;
  color: #4B5563;
}
.range-input {
  width: 60px;
  padding: 3px 6px;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 4px;
  font-size: 12px;
  font-family: inherit;
  text-align: center;
}
.range-input:focus { outline: none; border-color: #003274; }

/* ── Cycle selector ── */
.cycle-selector {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}
.cycle-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(0, 50, 116, 0.4);
  margin-right: 4px;
}
.cycle-btn {
  padding: 3px 10px;
  border: 1px solid rgba(0, 50, 116, 0.1);
  border-radius: 6px;
  background: white;
  font-size: 12px;
  font-weight: 500;
  color: #003274;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
  display: inline-flex;
  align-items: center;
}
.cycle-btn:hover { background: rgba(0, 50, 116, 0.06); }
.cycle-btn.active {
  background: #003274;
  color: white;
  border-color: #003274;
}
.cycle-btn.loading {
  opacity: 0.7;
}
.cycle-hint {
  font-size: 10px;
  color: rgba(0, 50, 116, 0.4);
  margin-left: 6px;
}
.cycle-gap {
  color: rgba(0, 50, 116, 0.35);
  font-size: 11px;
  padding: 0 1px;
  user-select: none;
}

/* ── Per-session summary tables (mimics colleague's Excel layout) ── */
.summary-tables {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.summary-table-wrap {
  border: 1px solid rgba(0, 50, 116, 0.08);
  border-radius: 8px;
  background: white;
  overflow: hidden;
}
.summary-table-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-size: 12px;
  color: #1F2937;
  background: rgba(0, 50, 116, 0.02);
  border-bottom: 2px solid;   /* color set inline via :style */
}
.summary-table-head strong { color: #003274; font-weight: 700; }
.summary-table-chip {
  width: 10px; height: 10px; border-radius: 50%;
  flex-shrink: 0;
}
.summary-table-sub {
  color: #6B7280;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.summary-table-scroll {
  overflow-x: auto;
  max-height: 260px;
  overflow-y: auto;
}
.summary-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}
.summary-table thead th {
  background: rgba(0, 50, 116, 0.04);
  color: #003274;
  font-weight: 600;
  text-align: right;
  padding: 4px 10px;
  border-bottom: 1px solid rgba(0, 50, 116, 0.1);
  position: sticky;
  top: 0;
  z-index: 1;
  white-space: nowrap;
}
.summary-table thead th:first-child {
  text-align: center;
}
.summary-table tbody td {
  padding: 3px 10px;
  text-align: right;
  border-bottom: 1px solid rgba(0, 50, 116, 0.04);
  color: #1F2937;
}
.summary-table tbody tr:last-child td { border-bottom: none; }
.summary-table tbody tr:hover td { background: rgba(0, 50, 116, 0.03); }
.cell-cycle {
  text-align: center !important;
  font-weight: 600;
  color: #003274 !important;
}
.summary-row { cursor: pointer; transition: background 0.08s; }
.summary-row:hover td { background: rgba(211, 167, 84, 0.08); }

/* ── Formulas panel ── */
/* Происхождение значений */
.prov-hint-line {
  display: flex; align-items: center; gap: 6px;
  margin-top: 6px; font-size: 11px; color: rgba(0, 50, 116, 0.45);
}
.prov-hint-line i { font-size: 11px; }
.summary-table td { cursor: context-menu; }
.formulas-contract-note {
  margin-top: 10px; padding-top: 8px;
  border-top: 1px dashed rgba(0, 50, 116, 0.12);
  font-size: 11px; color: rgba(0, 50, 116, 0.5);
}
.formulas-contract-note code { font-size: 10.5px; }
.table-expand-btn {
  margin-top: 4px; border: 1px dashed rgba(0, 50, 116, 0.25);
  background: transparent; color: #003274; border-radius: 6px;
  padding: 3px 10px; font-size: 11px; font-family: inherit; cursor: pointer;
}
.table-expand-btn:hover { background: rgba(0, 50, 116, 0.05); }
.perf-toggle-btn {
  margin-left: auto; border: 1px solid rgba(0, 50, 116, 0.2);
  background: white; color: rgba(0, 50, 116, 0.6); border-radius: 5px;
  padding: 1px 8px; font-size: 10.5px; font-family: inherit; cursor: pointer;
}
.perf-toggle-btn.is-on { background: #003274; color: white; }

.formulas-panel {
  border: 1px solid rgba(0, 50, 116, 0.08);
  border-radius: 8px;
  background: white;
  overflow: hidden;
}
.formulas-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: rgba(0, 50, 116, 0.02);
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  color: #003274;
  text-align: left;
  transition: background 0.12s;
}
.formulas-head:hover { background: rgba(0, 50, 116, 0.05); }
.formulas-hint {
  margin-left: auto;
  font-weight: 400;
  font-size: 11px;
  color: rgba(0, 50, 116, 0.45);
}
.formulas-body { padding: 10px 16px 14px; }
.formulas-list { margin: 0; }
.formulas-list dt {
  font-size: 12px;
  font-weight: 700;
  color: #003274;
  margin-top: 10px;
}
.formulas-list dt:first-child { margin-top: 0; }
.formulas-list dd {
  margin: 3px 0 0;
  font-size: 12px;
  line-height: 1.4;
}
.formulas-list code {
  display: inline-block;
  background: rgba(0, 50, 116, 0.06);
  padding: 2px 8px;
  border-radius: 4px;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 12px;
  color: #003274;
}
.formulas-list small {
  display: block;
  margin-top: 3px;
  color: #6B7280;
  font-size: 11px;
}

/* ── Raw datapoints panel (inline, always visible) ── */
.raw-panel {
  border: 1px solid rgba(0, 50, 116, 0.08);
  border-radius: 8px;
  background: white;
  overflow: hidden;
}
.raw-panel-head {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  padding: 8px 14px;
  background: rgba(0, 50, 116, 0.02);
  border-bottom: 1px solid rgba(0, 50, 116, 0.06);
}
.raw-panel-title {
  font-size: 13px;
  font-weight: 700;
  color: #003274;
  margin-right: 4px;
}
.raw-label {
  font-size: 11px;
  font-weight: 600;
  color: rgba(0, 50, 116, 0.55);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.raw-select {
  padding: 3px 8px;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 4px;
  background: white;
  font-size: 12px;
  font-family: inherit;
  color: #003274;
  cursor: pointer;
}
.raw-select:focus { outline: none; border-color: #003274; box-shadow: 0 0 0 2px rgba(0, 50, 116, 0.12); }

.raw-empty-panel {
  padding: 2rem;
  text-align: center;
  color: rgba(0, 50, 116, 0.5);
  font-size: 12px;
}
.raw-filter-btns {
  display: inline-flex;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 6px;
  overflow: hidden;
}
.raw-filter-btn {
  padding: 3px 8px;
  border: none;
  background: white;
  font-size: 11px;
  font-family: inherit;
  color: rgba(0, 50, 116, 0.7);
  cursor: pointer;
  border-right: 1px solid rgba(0, 50, 116, 0.1);
  transition: all 0.12s;
}
.raw-filter-btn:last-child { border-right: none; }
.raw-filter-btn:hover:not(.is-active) { background: rgba(0, 50, 116, 0.04); color: #003274; }
.raw-filter-btn.is-active { background: #003274; color: white; }
.raw-range {
  width: 70px;
  padding: 3px 6px;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 4px;
  font-size: 11px;
  font-family: inherit;
  text-align: center;
}
.raw-count { margin-left: auto; font-size: 11px; color: rgba(0, 50, 116, 0.55); }
.raw-count strong { color: #003274; }

.raw-table-scroll {
  max-height: 420px;
  overflow-y: auto;
  border: 1px solid rgba(0, 50, 116, 0.06);
  border-radius: 6px;
}
.raw-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}
.raw-table thead th {
  position: sticky;
  top: 0;
  background: rgba(0, 50, 116, 0.04);
  padding: 4px 8px;
  text-align: right;
  font-weight: 600;
  color: #003274;
  border-bottom: 1px solid rgba(0, 50, 116, 0.1);
  white-space: nowrap;
  z-index: 1;
}
.raw-table thead th.c-idx { text-align: center; width: 40px; }
.raw-table tbody td {
  padding: 2px 8px;
  text-align: right;
  border-bottom: 1px solid rgba(0, 50, 116, 0.03);
  color: #1F2937;
}
.raw-table tbody td.c-idx { text-align: center; color: rgba(0, 50, 116, 0.45); }
.raw-table tbody tr:hover td { background: rgba(0, 50, 116, 0.02); }
.raw-type-chip {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  background: rgba(0, 50, 116, 0.06);
  color: rgba(0, 50, 116, 0.7);
}
.raw-type-chip[data-type="charge"] { background: rgba(82, 201, 166, 0.15); color: #0E6B50; }
.raw-type-chip[data-type="discharge"] { background: rgba(0, 50, 116, 0.15); color: #003274; }
.raw-type-chip[data-type="cccv"] { background: rgba(211, 167, 84, 0.2); color: #8B6914; }
.raw-type-chip[data-type="rest"] { background: rgba(107, 114, 128, 0.12); color: #4B5563; }
.raw-empty { text-align: center; padding: 2rem; color: rgba(0, 50, 116, 0.4); }

.raw-pagination {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: center;
  padding-top: 6px;
}
.raw-pg-btn {
  padding: 3px 10px;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 4px;
  background: white;
  font-size: 11px;
  font-family: inherit;
  color: #003274;
  cursor: pointer;
}
.raw-pg-btn:hover:not(:disabled) { background: #003274; color: white; }
.raw-pg-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.raw-pg-info { font-size: 11px; color: rgba(0, 50, 116, 0.55); min-width: 180px; text-align: center; }

.chart-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 2.5rem 1rem;
  font-size: 12px;
  color: rgba(0, 50, 116, 0.4);
  border: 1px dashed rgba(0, 50, 116, 0.1);
  border-radius: 8px;
}

@media (max-width: 768px) {
  .charts-row { grid-template-columns: 1fr; }
}
</style>
