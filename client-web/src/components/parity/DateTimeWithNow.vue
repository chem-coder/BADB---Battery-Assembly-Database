<!--
  DateTimeWithNow — date + time pair with «Сейчас» button.

  First Phase A primitive (May 2026). Used wherever a stage records a
  workflow timestamp (cutting end, drying start, weighing finish, ...).
  Encapsulates the date/time/now pattern that previously lived ad-hoc
  in StageCompareEditor (time-cell + now-btn for one input only).

  Behaviour
  ---------
  - PrimeVue `<DatePicker dateFormat="dd.mm.yy">` for the date side
    (locale-independent display) + native `<input type="time">` for the
    time side (24h HH:MM is consistent across browsers).
  - One «Сейчас» button → fills BOTH inputs with the current Moscow
    local time. Emits `update:date`, `update:time`, and a `set-now`
    event so the parent can chain extra business logic (e.g. mark the
    stage as completed, cascade to next stage).
  - Outward API stays string-based: `date` = `YYYY-MM-DD`, `time` =
    `HH:MM`. Conversion to DatePicker's Date object happens internally.
  - Inputs use Design System tokens: brand-blue border (#003274 family),
    focus glow rgba(0,50,116,0.12), white surface, 12.5px font.
  - Compact mode (default) shows the button as icon-only; full mode
    shows «Сейчас» text label too.

  Props
  -----
  - `date`           v-model:date  YYYY-MM-DD or ''
  - `time`           v-model:time  HH:MM or ''
  - `label`          optional inline label (rendered above row)
  - `inline`         when true, label sits left of the row instead of above
  - `disabled`       disable both inputs and button
  - `compact`        icon-only «Сейчас» button (default true)
  - `showNowButton`  hide the button (read-only-ish view)
  - `showTimeRow`    when false, only the DatePicker renders (date-only
                     fields like `item_created_at` DATE column). Same
                     visual style as the date row of a full date+time
                     field — keeps one primitive for every date input.
  - `minDate` / `maxDate`  HTML `min`/`max` constraints on the date input
  - `nowTitle`       tooltip text on the button

  Emits
  -----
  - `update:date` (newValue)
  - `update:time` (newValue)
  - `set-now`     ({ date, time })   fired after both updates

  See also
  --------
  - `SequentialDateField.vue` (planned) — wraps this with cascade-from-
    previous-stage validation.
  - `docs/instructions/vue-frontend-architecture.md` §3.
-->

<template>
  <div class="dtwn" :class="{ 'dtwn--inline': inline, 'dtwn--stacked': stacked }">
    <label v-if="label" class="dtwn-label">{{ label }}</label>
    <DatePicker
      :model-value="dateAsDate"
      :disabled="disabled"
      :min-date="minDateAsDate"
      :max-date="maxDateAsDate"
      :first-day-of-week="1"
      date-format="dd.mm.yy"
      placeholder="дд.мм.гггг"
      show-icon
      :show-on-focus="false"
      :manual-input="true"
      class="dtwn-date"
      @update:model-value="onDateUpdate"
    />
    <div v-if="showTimeRow" class="dtwn-time-row">
      <input
        type="time"
        class="dtwn-input dtwn-input--time"
        :value="time"
        :disabled="disabled"
        step="1"
        @input="onTimeInput"
      />
      <button
        v-if="showNowButton"
        type="button"
        class="dtwn-now"
        :class="{ 'dtwn-now--compact': compact }"
        :disabled="disabled"
        :title="nowTitle"
        @click="onSetNow"
      >
        <i class="pi pi-bolt" />
        <span v-if="!compact" class="dtwn-now-label">Сейчас</span>
      </button>
    </div>
    <div v-if="$slots.hint" class="dtwn-hint">
      <slot name="hint" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import DatePicker from 'primevue/datepicker';

const props = defineProps({
  date:          { type: String, default: '' },
  time:          { type: String, default: '' },
  label:         { type: String, default: '' },
  disabled:      { type: Boolean, default: false },
  inline:        { type: Boolean, default: false },
  compact:       { type: Boolean, default: true },
  // `stacked` — column layout. Default true because the primitive lives
  // mostly in narrow table cells where a single-row horizontal layout
  // gets crushed (DatePicker placeholder truncates to "дд", time input
  // shows "00:" etc.). Pass `:stacked="false"` for wide form contexts
  // (e.g. inside EntityCreateDialog) where a horizontal row reads
  // better.
  stacked:       { type: Boolean, default: true },
  // When false, hide the time row entirely — used for DATE-only fields
  // like `item_created_at` so they visually match date+time fields in
  // the same constructor without growing a useless empty time input.
  showTimeRow:   { type: Boolean, default: true },
  showNowButton: { type: Boolean, default: true },
  minDate:       { type: String, default: undefined },
  maxDate:       { type: String, default: undefined },
  nowTitle:      { type: String, default: 'Заполнить текущим временем (МСК)' },
});
const emit = defineEmits(['update:date', 'update:time', 'set-now']);

/**
 * The primitive's outward API stays string-based (`YYYY-MM-DD` for
 * easy storage and comparison) but PrimeVue DatePicker speaks Date
 * objects. These two helpers translate between the wire format and the
 * picker's internal representation. The locale-correct dd.mm.yyyy
 * display is handled by DatePicker's `dateFormat="dd.mm.yy"` prop, so
 * we never have to worry about browser-locale variance.
 */
function isoToDate(iso) {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  return Number.isFinite(d.getTime()) ? d : null;
}
function dateToIso(d) {
  if (!d) return '';
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

const dateAsDate    = computed(() => isoToDate(props.date));
const minDateAsDate = computed(() => isoToDate(props.minDate));
const maxDateAsDate = computed(() => isoToDate(props.maxDate));

function onDateUpdate(value) {
  emit('update:date', value ? dateToIso(value) : '');
}
function onTimeInput(e) {
  emit('update:time', e.target.value);
}

function onSetNow() {
  const { date, time } = nowInMsk();
  emit('update:date', date);
  emit('update:time', time);
  emit('set-now', { date, time });
}

/**
 * Return current Moscow local time as { date: 'YYYY-MM-DD', time: 'HH:MM:SS' }.
 * Seconds included (Dima 2026-05-28) — paired with the `<input type=time>
 * step="1"` above so the «Сейчас» button preserves the same precision the
 * user can pick by hand. Uses Intl with the IANA Europe/Moscow zone.
 */
function nowInMsk(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map(p => [p.type, p.value])
  );
  // Intl can return hour="24" in some implementations for midnight; normalize.
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}:${parts.minute}:${parts.second}`,
  };
}

// Exported for unit-testing the timezone formatter + ISO conversion
// without mounting.
defineExpose({ _nowInMsk: nowInMsk, _isoToDate: isoToDate, _dateToIso: dateToIso });
</script>

<style scoped>
/* The primitive lays out as a column by default:
     row 1 — DatePicker (date)
     row 2 — time input + «Сейчас» button (always horizontal pair)
   For wide form contexts pass :stacked="false" — date and time then sit
   on one row alongside the button. */
.dtwn {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.dtwn--inline {
  flex-direction: row;
  align-items: center;
  gap: 10px;
}

.dtwn-label {
  font-size: 13px;
  font-weight: 600;
  color: #4B5563;
  line-height: 1.2;
}
.dtwn--inline .dtwn-label {
  min-width: 96px;
  margin-bottom: 0;
}

/* Time row = `[time input | ⚡ button]` — one cohesive rounded box,
   same layout as the DatePicker row above and the Select / MultiSelect
   fields elsewhere on the page. No gap between input and trigger. */
.dtwn-time-row {
  display: flex;
  align-items: stretch;
  gap: 0;
  width: 100%;
  min-width: 0;
}

/* Horizontal (non-stacked) mode — flip the wrapper to a single row.
   The DatePicker keeps full natural width, time + now stay grouped. */
.dtwn:not(.dtwn--stacked) {
  flex-direction: row;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 6px;
}
.dtwn:not(.dtwn--stacked) .dtwn-date {
  flex: 1 1 140px;
  min-width: 140px;
}
.dtwn:not(.dtwn--stacked) .dtwn-time-row {
  flex: 0 1 auto;
}

.dtwn-input {
  height: 32px;
  padding: 4px 8px;
  border: 1px solid rgb(203, 213, 225);
  border-radius: 6px;
  font-size: 12.5px;
  font-family: inherit;
  background: white;
  color: #1a2a3a;
  transition: border-color 0.2s, box-shadow 0.2s;
  box-sizing: border-box;
  min-width: 0;
}
.dtwn-input--time {
  flex: 1;
  width: 100%;
  /* Pair with the ⚡ button on the right — input gets left half of the
     rounded box (right border removed, right radius zeroed); button
     gets the right half. */
  border-right: none;
  border-radius: 6px 0 0 6px;
}

/* Hide the native time picker's built-in clock indicator — it duplicates
   the «Сейчас» button visually and clutters the row in narrow cells.
   Native picker still opens via Space/Enter on focus, so functionality
   isn't lost. */
.dtwn-input--time::-webkit-calendar-picker-indicator {
  display: none;
  -webkit-appearance: none;
}

.dtwn-input:hover:not(:focus):not(:disabled) {
  border-color: rgba(0, 50, 116, 0.30);
}
.dtwn-input:focus {
  outline: none;
  border-color: #003274;
  box-shadow: 0 0 0 2.5px rgba(0, 50, 116, 0.12);
}
.dtwn-input:disabled {
  background: rgba(0, 50, 116, 0.03);
  color: rgba(0, 50, 116, 0.55);
  cursor: not-allowed;
}

/* DatePicker / time — same «one cohesive rounded box» layout as
   Select / MultiSelect / AutoComplete: input rounded LEFT, trigger
   button rounded RIGHT with grey background, no gap between them.
   Previously the two halves were separate rounded boxes with a 4px
   gap, which made the field read as «two widgets» instead of one
   (Dima 2026-05-28). */
.dtwn-date {
  display: flex !important;
  align-items: stretch !important;
  gap: 0 !important;
  width: 100%;
  min-width: 0;
}
.dtwn-date :deep(.p-datepicker-input),
.dtwn-date :deep(.p-inputtext) {
  flex: 1;
  width: auto;
  height: 32px !important;
  min-height: 32px !important;
  padding: 4px 8px !important;
  font-size: 12.5px !important;
  border: 1px solid rgb(203, 213, 225) !important;
  border-right: none !important;
  border-radius: 6px 0 0 6px !important;
  background: white !important;
  color: #1a2a3a !important;
}
.dtwn-date :deep(.p-datepicker-input:focus),
.dtwn-date :deep(.p-inputtext:focus) {
  border-color: #003274 !important;
  box-shadow: 0 0 0 2.5px rgba(0, 50, 116, 0.12) !important;
}
.dtwn-date :deep(.p-datepicker-dropdown) {
  flex: 0 0 26px;
  width: 26px !important;
  min-width: 26px !important;
  height: 32px !important;
  padding: 0 !important;
  border-top: 1px solid rgb(203, 213, 225) !important;
  border-right: 1px solid rgb(203, 213, 225) !important;
  border-bottom: 1px solid rgb(203, 213, 225) !important;
  border-left: 1px solid rgb(226, 232, 240) !important;
  border-radius: 0 6px 6px 0 !important;
  background: #E9EDF3 !important;
  color: #6B7280 !important;
}
.dtwn-date :deep(.p-datepicker-dropdown:hover) {
  background: rgba(0, 0, 0, 0.08) !important;
}
.dtwn-date :deep(.p-datepicker-dropdown-icon) {
  font-size: 12px;
}

/* Same shape as DatePicker trigger above — used by the time input row
   («Сейчас» button) so date+time rows align pixel-identical. The
   parent .dtwn-row is the flex container; the input inside it gets
   the left half of the rounded box (handled by the .dtwn-row :deep
   rule above .dtwn-date), and .dtwn-now is the right half. */
.dtwn-now {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 32px;
  padding: 0 9px;
  border-top: 1px solid rgb(203, 213, 225);
  border-right: 1px solid rgb(203, 213, 225);
  border-bottom: 1px solid rgb(203, 213, 225);
  border-left: 1px solid rgb(226, 232, 240);
  border-radius: 0 6px 6px 0;
  background: #E9EDF3;
  color: #6B7280;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
  flex-shrink: 0;
}
.dtwn-now--compact {
  width: 26px;
  min-width: 26px;
  padding: 0;
}
.dtwn-now i {
  font-size: 12px;
  line-height: 1;
}
.dtwn-now-label { line-height: 1; }

.dtwn-now:hover:not(:disabled) {
  background: rgba(0, 50, 116, 0.06);
  border-color: rgba(0, 50, 116, 0.30);
}
.dtwn-now:active:not(:disabled) {
  background: rgba(0, 50, 116, 0.10);
}
.dtwn-now:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dtwn-hint {
  font-size: 12px;
  font-weight: 400;
  color: #6B7280;
  line-height: 1.3;
}
</style>
