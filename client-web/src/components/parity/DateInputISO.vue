<!--
  DateInputISO — date-only wrapper over DateTimeWithNow.

  Single primitive for ALL date-only inputs in the SPA — HomePage filter
  range, ProjectsPage start/due dates, MaterialsPage order/received
  dates — sharing the EXACT styling of date+time fields in the
  constructor (same DatePicker rendering, same brand-blue border, same
  dropdown trigger, same 32px height).

  NO time row. It used to render a decorative time input "for visual
  consistency" whose value was silently discarded — Dalia hit exactly
  that trap on the battery form (filled the time, tabbed away, gone) on
  2026-07-29. A control that eats input is worse than an asymmetric
  layout; fields that genuinely need a time must use a real datetime
  binding (`datetime-iso` in the constructor, `datetime` in
  EntityCreateDialog), never this wrapper.

  Outward API stays simple: string v-model in `YYYY-MM-DD`.

  Props (passthrough)
  -------------------
  - `modelValue`     YYYY-MM-DD string (or '' for empty)
  - `placeholder`    rendered when empty (default 'дд.мм.гггг')
  - `disabled`       lock the input
  - `min` / `max`    YYYY-MM-DD constraints

  Emits
  -----
  - `update:modelValue` (newIsoString | '')
-->

<template>
  <DateTimeWithNow
    :date="modelValue"
    time=""
    :show-time-row="false"
    :show-now-button="false"
    :disabled="disabled"
    :min-date="min || undefined"
    :max-date="max || undefined"
    @update:date="onUpdate"
  />
</template>

<script setup>
import DateTimeWithNow from '@/components/parity/DateTimeWithNow.vue';

defineProps({
  modelValue:  { type: String, default: '' },
  placeholder: { type: String, default: 'дд.мм.гггг' },
  disabled:    { type: Boolean, default: false },
  min:         { type: String, default: '' },
  max:         { type: String, default: '' },
  showIcon:    { type: Boolean, default: true }, // legacy prop, ignored
});

const emit = defineEmits(['update:modelValue']);

function onUpdate(v) {
  emit('update:modelValue', v || '');
}
</script>
