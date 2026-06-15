/**
 * useLiveDuration — reactive elapsed-time since an ISO timestamp.
 *
 * Returns { ms, label }: ms is the elapsed milliseconds, label is the
 * human-formatted Russian string ("2 ч 15 мин" / "45 мин" / "—").
 * Updates every 60 seconds while the consumer holds the ref — granular
 * enough for "time since last step" badges, cheap on render churn.
 *
 * Pass a reactive source (ref or getter) to track changes:
 *   const { label } = useLiveDuration(() => step.start_time)
 *
 * Cleanup is automatic on unmount.
 */
import { computed, onMounted, onUnmounted, ref, watchEffect } from 'vue';

const TICK_MS = 60_000;

function format(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 1) return 'только что';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m} мин`;
  if (h < 24) return `${h} ч ${m} мин`;
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return hh > 0 ? `${d} дн ${hh} ч` : `${d} дн`;
}

export function useLiveDuration(sourceFn) {
  const now = ref(Date.now());
  let timer = null;

  onMounted(() => {
    timer = setInterval(() => { now.value = Date.now(); }, TICK_MS);
  });
  onUnmounted(() => {
    if (timer) clearInterval(timer);
  });

  // Allow either a Ref or a plain getter function.
  const sinceMs = computed(() => {
    const v = typeof sourceFn === 'function' ? sourceFn() : sourceFn?.value ?? sourceFn;
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    const t = d.getTime();
    return Number.isFinite(t) ? t : null;
  });

  const ms = computed(() => {
    if (sinceMs.value == null) return null;
    return now.value - sinceMs.value;
  });

  const label = computed(() => ms.value == null ? '—' : format(ms.value));

  return { ms, label };
}

// Exported for unit-testing of the formatter.
export const _format = format;
