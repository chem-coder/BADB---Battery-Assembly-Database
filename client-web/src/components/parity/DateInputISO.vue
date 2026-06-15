<!--
  DateInputISO — date-only wrapper over DateTimeWithNow.

  Single primitive for ALL date inputs in the SPA. Consumers that need
  only a date (no time) — HomePage filter range, ProjectsPage start/due
  dates, MaterialsPage order/received dates, `item_created_at` business
  date on all entities — go through this wrapper so they share the EXACT
  styling of date+time fields in the constructor (same DatePicker
  rendering, same brand-blue border, same dropdown trigger, same 32px
  height). The only visual difference is the absence of the time row.

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
  <!-- Use the SAME DateTimeWithNow primitive even for date-only fields,
       to keep the constructor visually unified — every "date" cell in
       the SPA renders as the identical two-row composite (date row +
       time row). The time row is decorative when the backing column is
       DATE: user-typed time isn't persisted (backend truncates).
       Tracked as a backend ask to upgrade `item_created_at` to
       TIMESTAMPTZ — see vue-vs-backend-audit-2026-05.md item #4. -->
  <DateTimeWithNow
    :date="modelValue"
    :time="localTime"
    :disabled="disabled"
    :min-date="min || undefined"
    :max-date="max || undefined"
    @update:date="onUpdate"
    @update:time="(v) => (localTime = v)"
  />
</template>

<script setup>
import { ref } from 'vue';
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

// Local-only time for visual consistency — never emitted upstream
// because the backing column is DATE. Reset to empty each mount.
const localTime = ref('');

function onUpdate(v) {
  emit('update:modelValue', v || '');
}
</script>
