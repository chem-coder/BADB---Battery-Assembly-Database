<!--
  SequentialDateField — DateTimeWithNow + "cannot be earlier than previous
  stage" guard rail. Second Phase A primitive.

  Behaviour
  ---------
  - Wraps `DateTimeWithNow` and adds two pieces of cross-stage logic:
    1. **Cascade**: when `cascadeFromPrev` is on and the current value
       is empty, mount-time the field is auto-filled from `prev`.
    2. **Validation**: if the current (date + time) combo lands before
       `prev`, an inline red error message replaces the hint. The
       underlying date input also gets `min={prev.date}` so the picker
       won't even offer earlier dates.

  - `prev` accepts two shapes:
      • `{ date: 'YYYY-MM-DD', time: 'HH:MM' }`  (tape stage shape)
      • `'2026-05-27T14:30:00'` ISO-ish string   (electrode start_time)

  Props
  -----
  - `date` / `time`        v-model:date / v-model:time  (same as DateTimeWithNow)
  - `label`                inline label
  - `prev`                 previous-stage value, see shapes above
  - `prevLabel`            short name of previous stage, used in hint message
  - `cascadeFromPrev`      auto-fill empty field on mount (default false)
  - `hint`                 freeform hint shown under the row when valid
  - `disabled`, `inline`, `compact`, `showNowButton`, `minDate`, `maxDate`,
    `nowTitle`             passthrough to DateTimeWithNow

  Emits
  -----
  - `update:date`, `update:time`, `set-now`              passthrough
  - `validation-change` ({ ok, message })                fires whenever
    the (date, time, prev) combo's validity changes

  See also
  --------
  - `docs/instructions/vue-frontend-architecture.md` §3, §4.
-->

<template>
  <DateTimeWithNow
    :date="date"
    :time="time"
    :label="label"
    :disabled="disabled"
    :inline="inline"
    :compact="compact"
    :show-now-button="showNowButton"
    :min-date="effectiveMinDate"
    :max-date="maxDate"
    :now-title="nowTitle"
    @update:date="onDateChange"
    @update:time="onTimeChange"
    @set-now="onSetNow"
  >
    <template v-if="messageBlock" #hint>
      <span
        v-if="!validation.ok"
        class="sdf-error"
        role="alert"
        data-testid="sdf-error"
      >
        <i class="pi pi-exclamation-triangle" /> {{ validation.message }}
      </span>
      <span v-else class="sdf-hint" data-testid="sdf-hint">{{ messageBlock }}</span>
    </template>
  </DateTimeWithNow>
</template>

<script setup>
import { computed, onMounted, watch } from 'vue';
import DateTimeWithNow from '@/components/parity/DateTimeWithNow.vue';

const props = defineProps({
  date:           { type: String, default: '' },
  time:           { type: String, default: '' },
  label:          { type: String, default: '' },
  prev:           { type: [Object, String, null], default: null },
  prevLabel:      { type: String, default: '' },
  cascadeFromPrev:{ type: Boolean, default: false },
  hint:           { type: String, default: '' },
  disabled:       { type: Boolean, default: false },
  inline:         { type: Boolean, default: false },
  compact:        { type: Boolean, default: true },
  showNowButton:  { type: Boolean, default: true },
  minDate:        { type: String, default: undefined },
  maxDate:        { type: String, default: undefined },
  nowTitle:       { type: String, default: 'Заполнить текущим временем (МСК)' },
});

const emit = defineEmits([
  'update:date',
  'update:time',
  'set-now',
  'validation-change',
]);

/**
 * Normalize the heterogeneous `prev` prop into { date, time } | null.
 * Accepts either tape-style {date, time} or electrode-style ISO string.
 * Returns null for any input that doesn't parse cleanly.
 */
function parsePrev(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
    if (!m) return null;
    return { date: m[1], time: m[2] };
  }
  if (typeof value === 'object' && typeof value.date === 'string' && value.date) {
    return { date: value.date, time: value.time || '00:00' };
  }
  return null;
}

const parsedPrev = computed(() => parsePrev(props.prev));

/**
 * `minDate` priority:
 *   1. Explicit prop (override).
 *   2. Derived from prev (so the date picker can't go below prev's day).
 *   3. undefined.
 */
const effectiveMinDate = computed(() => {
  if (props.minDate) return props.minDate;
  return parsedPrev.value?.date || undefined;
});

/**
 * Validity check: convert (date, time) on both sides to a timestamp and
 * compare. If the user hasn't filled both fields, treat as "no opinion"
 * (validation.ok = true) — the cascade nudge handles emptiness, not this.
 */
function combine(d, t) {
  if (!d || !t) return null;
  // Build local-ish datetime: comparison is monotonic across both sides
  // so the exact timezone doesn't matter as long as we're consistent.
  const ts = Date.parse(`${d}T${t}:00`);
  return Number.isFinite(ts) ? ts : null;
}

const validation = computed(() => {
  const prev = parsedPrev.value;
  if (!prev) return { ok: true, message: '' };
  const curTs = combine(props.date, props.time);
  const prevTs = combine(prev.date, prev.time);
  if (curTs == null || prevTs == null) return { ok: true, message: '' };
  if (curTs < prevTs) {
    const label = props.prevLabel
      ? `«${props.prevLabel}»`
      : 'предыдущего этапа';
    return {
      ok: false,
      message: `Не может быть раньше ${label}`,
    };
  }
  return { ok: true, message: '' };
});

/**
 * Re-emit validation status when it changes — parent can use this to
 * disable a Save button or aggregate stage validity.
 */
watch(validation, (next) => {
  emit('validation-change', { ok: next.ok, message: next.message });
}, { immediate: true });

/**
 * The hint slot is rendered when either the validation has a message
 * (error case) or the parent passed a hint string (valid case). Empty
 * string means "no hint slot at all".
 */
const messageBlock = computed(() => {
  if (!validation.value.ok) return validation.value.message;
  return props.hint;
});

// ── Passthrough handlers ──
function onDateChange(v) { emit('update:date', v); }
function onTimeChange(v) { emit('update:time', v); }
function onSetNow(payload) { emit('set-now', payload); }

// ── Cascade on mount ──
onMounted(() => {
  if (!props.cascadeFromPrev) return;
  const prev = parsedPrev.value;
  if (!prev) return;
  // Only fill if BOTH inputs are empty — never overwrite user data.
  if (!props.date && !props.time) {
    emit('update:date', prev.date);
    emit('update:time', prev.time);
  }
});

// Exposed for unit testing without component mounting cost.
defineExpose({ _parsePrev: parsePrev, _combine: combine });
</script>

<style scoped>
.sdf-error {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #C62828; /* badge-8 red family */
}
.sdf-error i {
  font-size: 11px;
  color: #E53935;
}

.sdf-hint {
  font-size: 12px;
  font-weight: 400;
  color: #6B7280;
}
</style>
