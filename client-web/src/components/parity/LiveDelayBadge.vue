<!--
  LiveDelayBadge — reactive "time since X" pill.

  Third Phase A primitive. Renders a small badge showing "2 ч 15 мин"
  that updates every minute via `useLiveDuration`. Optional thresholds
  switch the colour palette to amber (warn) or red (error) so it's
  glanceable in the StageNavigator sidebar.

  Behaviour
  ---------
  - `since` accepts the same shapes as SequentialDateField's `prev`:
      • `'2026-05-27T14:30:00'` ISO-ish string
      • `{ date: 'YYYY-MM-DD', time: 'HH:MM' }`
    Anything that doesn't parse → badge renders "—" in neutral tone.
  - `warnAfterMinutes` / `errorAfterMinutes` thresholds switch tone:
      ms ≥ error → red (badge palette 8)
      ms ≥ warn  → amber (badge palette 2 — охра)
      otherwise → brand-blue neutral (badge palette 5/6)

  Props
  -----
  - `since`              ISO string OR { date, time } — source timestamp
  - `prefix`             short text prefixed to the duration ('')
  - `warnAfterMinutes`   tone → амber after this elapsed (null = never)
  - `errorAfterMinutes`  tone → red after this elapsed (null = never)
  - `icon`               PrimeIcon class to render before the text
                         (default 'pi-clock', pass null to hide)

  See also
  --------
  - `composables/useLiveDuration.js` — drives the reactive timer.
  - `docs/instructions/vue-frontend-architecture.md` §3.
-->

<template>
  <span class="ldb" :class="toneClass" :title="titleText">
    <i v-if="icon" class="pi" :class="icon" />
    <span class="ldb-text">{{ displayText }}</span>
  </span>
</template>

<script setup>
import { computed } from 'vue';
import { useLiveDuration } from '@/composables/useLiveDuration.js';

const props = defineProps({
  since: {
    type: [String, Object, null],
    default: null,
  },
  prefix: { type: String, default: '' },
  warnAfterMinutes:  { type: Number, default: null },
  errorAfterMinutes: { type: Number, default: null },
  icon:   { type: [String, null], default: 'pi-clock' },
});

/**
 * Coerce the heterogeneous `since` prop to a single string that
 * useLiveDuration can parse via `new Date()`. We accept the tape-style
 * { date, time } shape and electrode-style ISO strings transparently.
 */
const sinceIso = computed(() => {
  const v = props.since;
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v.date) {
    return `${v.date}T${v.time || '00:00'}:00`;
  }
  return null;
});

const { ms, label } = useLiveDuration(() => sinceIso.value);

const toneClass = computed(() => {
  if (ms.value == null) return 'ldb--muted';
  const minutes = ms.value / 60_000;
  if (props.errorAfterMinutes != null && minutes >= props.errorAfterMinutes) {
    return 'ldb--error';
  }
  if (props.warnAfterMinutes != null && minutes >= props.warnAfterMinutes) {
    return 'ldb--warn';
  }
  return 'ldb--ok';
});

/**
 * Title attribute = expanded ISO timestamp, useful for hover tooltips
 * where you want the precise instant instead of the rounded label.
 */
const titleText = computed(() => sinceIso.value || '');

/**
 * Bake prefix + label into a single string. Using a computed (instead
 * of template interpolation) preserves the separating whitespace that
 * Vue's compiler otherwise collapses inside <template v-if>.
 */
const displayText = computed(() => {
  if (!props.prefix) return label.value;
  return `${props.prefix} ${label.value}`;
});

// Exposed for testing without DOM mounting cost.
defineExpose({ _sinceIso: sinceIso, _label: label, _toneClass: toneClass });
</script>

<style scoped>
.ldb {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 8px;
  border-radius: 11px;
  font-size: 11.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  line-height: 1;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
  border: 1px solid transparent;
}
.ldb i {
  font-size: 10px;
  line-height: 1;
  opacity: 0.85;
}

/* ── Tone: neutral (brand blue family, badge palette 5/6) ── */
.ldb--ok {
  background: rgba(0, 50, 116, 0.06);
  color: #003274;
  border-color: rgba(0, 50, 116, 0.12);
}

/* ── Tone: warn (охра, badge palette 2) ── */
.ldb--warn {
  background: rgba(210, 145, 50, 0.12);
  color: #8E5A0F;
  border-color: rgba(210, 145, 50, 0.30);
}

/* ── Tone: error (red, badge palette 8) ── */
.ldb--error {
  background: rgba(229, 57, 53, 0.10);
  color: #C62828;
  border-color: rgba(229, 57, 53, 0.30);
}

/* ── Tone: muted (no source / "—") ── */
.ldb--muted {
  background: rgba(107, 114, 128, 0.08);
  color: #6B7280;
  border-color: rgba(107, 114, 128, 0.18);
}
.ldb--muted i { opacity: 0.5; }

.ldb-text {
  line-height: 1;
}
</style>
