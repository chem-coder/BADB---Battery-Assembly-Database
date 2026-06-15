<script setup>
/**
 * StageNavigator — left sidebar of the Tape Constructor.
 *
 * Each stage row: number + label + graphical timeline bar below.
 * Timeline: grey track = full date range, green segment = this stage's date position.
 * Badge with date (дд.мм) sits on the green segment.
 * Bottom: date range "дд.мм.гггг — дд.мм.гггг" (earliest → latest across all stages).
 */
import { computed } from 'vue'

const props = defineProps({
  stages: { type: Array, required: true },
  activeStage: { type: String, default: '' },
  tapeStates: { type: Object, default: () => ({}) },
  activeTapeId: { type: [Number, String], default: null },
  tapeNames: { type: Object, default: () => ({}) },
  refs: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['update:activeStage'])

const activeTapeState = computed(() => {
  if (!props.activeTapeId) return null
  return props.tapeStates[String(props.activeTapeId)] || null
})

function getStatus(ts, code) {
  return ts ? ts.stageStatus(code) : 'pending'
}

function stageStatusClass(code) {
  if (!activeTapeState.value) return 'pending'
  const baseStatus = getStatus(activeTapeState.value, code)
  if (baseStatus !== 'pending') return baseStatus
  const myIdx = props.stages.findIndex(s => s.code === code)
  for (let i = myIdx + 1; i < props.stages.length; i++) {
    if (getStatus(activeTapeState.value, props.stages[i].code) === 'done') return 'warning'
  }
  return 'pending'
}

function stageNumber(code) {
  const idx = props.stages.findIndex(s => s.code === code)
  return idx >= 0 ? idx + 1 : ''
}

// ── Timeline data ──
// Returns { date, time } or { full } for full precision positioning.
// Handles both state shapes the navigator is used with:
//   - tape state: steps[code] = { date, time }
//   - electrode state: steps[code] = { start_time, end_time } (ISO)
function getStageDateTime(code) {
  const ts = activeTapeState.value
  if (!ts) return null

  // Tape "general info" — use the operator-set business date
  // (item_created_at) rather than the audit-only created_at. The
  // audit timestamp is whenever the row was inserted, which doesn't
  // reflect when the batch actually started. Item_created_at, set by
  // the operator in the «Дата создания партии» field, is the
  // workflow-meaningful anchor.
  if (code === 'general_info') {
    const date = ts.general?.itemCreatedAt
    if (!date) return null
    const time = ts.general?.itemCreatedTime || '00:00:00'
    return { date, time }
  }

  // Electrode "cutting" stage stores its fields on `general`, not in
  // `steps`. The closest meaningful timestamp is the batch's created_at,
  // which the navigator can use as the cutting marker.
  if (code === 'cutting' && !ts.steps?.cutting) {
    const ca = ts.meta?.created_at
    return ca ? { full: ca } : null
  }

  const step = ts.steps?.[code]
  if (!step) return null
  // Tape pattern: split date + time fields.
  if (step.date) return { date: step.date, time: step.time || '00:00:00' }
  // Electrode pattern: ISO timestamps. Prefer the start_time when both
  // start_time and end_time are present; fall back to end_time.
  if (step.start_time) return { full: step.start_time }
  if (step.end_time) return { full: step.end_time }
  return null
}

// For display — just the date part (дд.мм)
function getStageDate(code) {
  const dt = getStageDateTime(code)
  if (!dt) return null
  if (dt.full) return dt.full.split('T')[0]
  return dt.date
}

function parseDateTimeFull(dt) {
  if (!dt) return null
  if (dt.full) return new Date(dt.full)
  // date + time → full precision
  return new Date(dt.date + 'T' + dt.time)
}

// Stage codes that represent pure metadata (no workflow timestamp at all)
// and should be skipped when computing the timeline range / marker.
// Previously 'general_info' was here because it pointed at the audit
// `created_at` (which would always be "today" and skew the range).
// Since 2026-05-28 general_info uses the operator-set `item_created_at`
// instead, so it IS a real workflow event and belongs on the timeline
// (Dima caught this — «общая информация без диаграммы времени»).
const META_STAGE_CODES = new Set()

// Collect all dates across stages → min/max for shared time axis (full precision)
const timeRange = computed(() => {
  const ts = activeTapeState.value
  if (!ts) return null

  const dates = []
  for (const stage of props.stages) {
    if (META_STAGE_CODES.has(stage.code)) continue
    const dt = getStageDateTime(stage.code)
    if (dt) {
      const d = parseDateTimeFull(dt)
      if (d && Number.isFinite(d.getTime())) dates.push(d)
    }
  }
  if (dates.length === 0) return null

  const minMs = Math.min(...dates.map(d => d.getTime()))
  const maxMs = Math.max(...dates.map(d => d.getTime()))
  const minDate = new Date(minMs)
  const maxDate = new Date(maxMs)
  const spanMs = maxMs - minMs

  return { minDate, maxDate, minMs, maxMs, spanMs }
})

// Sort all dated stages chronologically. Each stage's marker position
// is then its slot index in this sorted list, evenly spaced across
// the bar. Result: earlier date → left, later date → right (no matter
// in what order the workflow stages are listed in the schema), and
// stages without a date are simply skipped (no marker rendered).
const sortedDatedStages = computed(() => {
  if (!activeTapeState.value) return []
  const out = []
  for (const stage of props.stages) {
    if (META_STAGE_CODES.has(stage.code)) continue
    const dt = getStageDateTime(stage.code)
    if (!dt) continue
    const d = parseDateTimeFull(dt)
    if (!d || !Number.isFinite(d.getTime())) continue
    out.push({ code: stage.code, ms: d.getTime() })
  }
  out.sort((a, b) => a.ms - b.ms)
  return out
})

// Position of a stage marker on the shared timeline (0–100%).
//
// Layout: EQUAL SPACING in CHRONOLOGICAL order. Stages without a date
// have no marker. Stages with a date get a slot whose index reflects
// where their timestamp falls relative to the others — earlier left,
// later right. This avoids the «one far-away date compresses everything
// else» problem of literal time-axis layout, while still showing the
// real chronological order to the operator (Dima 2026-05-28).
function barPosition(code) {
  if (META_STAGE_CODES.has(code)) return null
  const sorted = sortedDatedStages.value
  const idx = sorted.findIndex(s => s.code === code)
  if (idx < 0) return null
  const total = sorted.length
  if (total === 1) return 50
  // Inset 5% on each side so badges don't clip the card edges.
  return 5 + (idx / (total - 1)) * 90
}

function formatDateShort(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${d}.${m}`
}

function formatDateFull(date) {
  if (!date) return ''
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${dd}.${mm}.${yyyy}`
}

const dateRangeStart = computed(() => timeRange.value ? formatDateFull(timeRange.value.minDate) : '')
const dateRangeEnd = computed(() => timeRange.value ? formatDateFull(timeRange.value.maxDate) : '')
const isSingleDay = computed(() => timeRange.value?.spanMs === 0)
</script>

<template>
  <div class="stage-nav">
    <!-- Active tape name indicator -->
    <div v-if="activeTapeId && tapeNames[activeTapeId]" class="nav-active-tape">
      <span class="nav-active-tape-label">Этапы для:</span>
      <span class="nav-active-tape-name">{{ tapeNames[activeTapeId] }}</span>
    </div>
    <div class="stage-list">
      <button
        v-for="stage in stages"
        :key="stage.code"
        class="stage-item"
        :class="{
          'stage-item--active': activeStage === stage.code,
        }"
        @click="emit('update:activeStage', stage.code)"
      >
        <!-- Row: number + label -->
        <div class="stage-row">
          <span class="stage-number" :class="'stage-number--' + stageStatusClass(stage.code)">
            {{ stageNumber(stage.code) }}
          </span>
          <span class="stage-label">{{ stage.label }}</span>
        </div>

        <!-- Graphical timeline bar -->
        <div v-if="timeRange" class="stage-timeline">
          <!-- Grey track (full range) -->
          <div class="tl-track"></div>
          <!-- Green/yellow marker at date position -->
          <div
            v-if="barPosition(stage.code) !== null"
            class="tl-marker"
            :class="'tl-marker--' + stageStatusClass(stage.code)"
            :style="{ left: barPosition(stage.code) + '%' }"
          >
            <span class="tl-date">{{ formatDateShort(getStageDate(stage.code)) }}</span>
          </div>
        </div>
      </button>
    </div>

    <!-- Date range footer -->
    <div v-if="timeRange" class="timeline-range">
      <span>{{ dateRangeStart }}</span>
      <span v-if="!isSingleDay">{{ dateRangeEnd }}</span>
    </div>
  </div>
</template>

<style scoped>
/* ── Active tape indicator ── */
.nav-active-tape {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 4px 10px 6px;
  border-bottom: 1px solid rgba(0, 50, 116, 0.08);
  margin-bottom: 2px;
}
.nav-active-tape-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(0, 50, 116, 0.35);
}
.nav-active-tape-name {
  font-size: 12px;
  font-weight: 600;
  color: #003274;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stage-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 200px;
  max-width: 240px;
  flex-shrink: 0;
}

.stage-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.stage-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 5px 10px 4px;
  border: none;
  background: none;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: all 0.15s;
}

.stage-item:hover {
  background: rgba(0, 50, 116, 0.05);
}

.stage-item--active {
  background: rgba(0, 50, 116, 0.08);
}

.stage-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stage-label {
  font-size: 13px;
  color: rgba(0, 50, 116, 0.7);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stage-item--active .stage-label {
  color: #003274;
  font-weight: 600;
}

/* ── Stage numbers ── */
.stage-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
  border: 1.5px solid rgba(0, 50, 116, 0.2);
  color: rgba(0, 50, 116, 0.4);
  background: transparent;
  transition: all 0.2s;
}

.stage-number--done {
  background: #52C9A6;
  border-color: #52C9A6;
  color: white;
}

.stage-number--active {
  background: #F39C12;
  border-color: #F39C12;
  color: white;
}

.stage-number--warning {
  background: #F1C40F;
  border-color: #F1C40F;
  color: white;
}

.stage-item--active .stage-number {
  border-color: #003274;
  color: white;
  background: #003274;
}

/* ── Graphical timeline ── */
.stage-timeline {
  position: relative;
  height: 16px;
  margin-left: 30px; /* align with label */
  margin-right: 4px;
}

.tl-track {
  position: absolute;
  top: 7px;
  left: 0;
  right: 0;
  height: 2px;
  background: rgba(0, 50, 116, 0.08);
  border-radius: 1px;
}

.tl-marker {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  height: 16px;
  padding: 0 6px;
  border-radius: 4px;
  white-space: nowrap;
}

.tl-marker--done {
  background: rgba(82, 201, 166, 0.12);
}

.tl-marker--warning {
  background: rgba(211, 167, 84, 0.12);
}

.tl-marker--pending {
  background: transparent;
}

.tl-date {
  font-size: 9px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.tl-marker--done .tl-date {
  color: #2a9d78;
}

.tl-marker--warning .tl-date {
  color: #D3A754;
}

/* ── Date range footer ── */
.timeline-range {
  display: flex;
  justify-content: space-between;
  padding: 2px 10px 0 40px;
  font-size: 9px;
  color: rgba(0, 50, 116, 0.3);
  font-variant-numeric: tabular-nums;
}
</style>
