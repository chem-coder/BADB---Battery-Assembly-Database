<script setup>
/**
 * TapeDryBoxPanel → «Хранение ленты» (P2, 2026-07-30, approved plan
 * docs/future/drybox_removal_plan.md).
 *
 * The dry-box closet workflow (place-now / remove-now / return-now +
 * parameter editor + the final-drying gate) is RETIRED. This card now
 * holds exactly three things:
 *   1. free-form storage log (tapes.storage_notes, saved via the tape
 *      composable's saveGeneral — the field piggybacks on the general
 *      PUT with preserve-on-absent backend semantics);
 *   2. the terminal «Лента израсходована» action (POST deplete stays);
 *   3. a read-only archive line for historical dry-box records (the
 *      tape_dry_box_state table is kept forward-only).
 *
 * Old workflow reference (for history): vanilla public/js/1-tapes.js
 * §III.1; audit docs/instructions/vue-vs-backend-audit-2026-05.md #6.
 */
import { ref, computed, watch } from 'vue';
import api from '@/services/api';
import { useToast } from 'primevue/usetoast';
import { toastApiError } from '@/utils/errorClassifier';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import { formatDateTimeMsk } from '@/utils/dateFormat';

const props = defineProps({
  tapeId: { type: [Number, String, null], default: null },
  // The active tape's useTapeState instance — owns storage_notes state
  // and its save path (state-connection rule: no second synced copy).
  tapeState: { type: Object, default: null },
});

const toast = useToast();

// ── Historical dry-box state (read-only archive) ──
const state = ref(null);
const loading = ref(false);
const saving = ref(false);

async function load() {
  if (!props.tapeId) { state.value = null; return; }
  loading.value = true;
  try {
    const { data } = await api.get(`/api/tapes/${props.tapeId}/dry-box-state`);
    state.value = data || null;
  } catch (err) {
    state.value = null; // архив недоступен — карточку не блокируем
  } finally {
    loading.value = false;
  }
}
watch(() => props.tapeId, load, { immediate: true });

const isDepleted = computed(() =>
  state.value?.availability_status === 'depleted');

const archiveLine = computed(() => {
  const s = state.value;
  if (!s || (!s.started_at && !s.removed_at)) return '';
  const parts = [];
  if (s.started_at) parts.push(`помещена ${formatDateTimeMsk(s.started_at)}`);
  if (s.removed_at) parts.push(`извлечена ${formatDateTimeMsk(s.removed_at)}`);
  if (s.temperature_c != null) parts.push(`${s.temperature_c} °C`);
  if (s.atmosphere) parts.push(s.atmosphere);
  return parts.join(' · ');
});

// ── Storage notes (tapes.storage_notes via the composable) ──
const notes = computed({
  get: () => props.tapeState?.general?.storageNotes ?? '',
  set: (v) => { if (props.tapeState?.general) props.tapeState.general.storageNotes = v; },
});

async function saveNotes() {
  const ts = props.tapeState;
  if (!ts?.saveGeneral || !props.tapeId) return;
  saving.value = true;
  try {
    await ts.saveGeneral();
  } catch (err) {
    toastApiError(toast, err, 'Не сохранился журнал хранения');
  } finally {
    saving.value = false;
  }
}

// ── Deplete (terminal, stays) ──
async function deplete() {
  if (!props.tapeId) return;
  if (!window.confirm('Отметить ленту израсходованной? Действие финальное.')) return;
  saving.value = true;
  try {
    await api.post(`/api/tapes/${props.tapeId}/dry-box-state/deplete`);
    await load();
    toast.add({ severity: 'success', summary: 'Лента отмечена израсходованной', life: 3000 });
  } catch (err) {
    toastApiError(toast, err, 'Не удалось отметить ленту израсходованной');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section v-if="tapeId" class="storage-card glass-card">
    <div class="sc-header">
      <span class="sc-title">Хранение ленты</span>
      <span v-if="isDepleted" class="sc-depleted">израсходована</span>
      <span v-else-if="saving" class="sc-status">сохранение…</span>
    </div>

    <label class="sc-label" :for="`storage-notes-${tapeId}`">
      Журнал хранения (свободный текст)
    </label>
    <Textarea
      :id="`storage-notes-${tapeId}`"
      v-model="notes"
      :rows="2"
      auto-resize
      class="sc-notes"
      placeholder="напр.: вынута из шкафа на 30 мин 30.07, вернула И.И."
      :disabled="isDepleted"
      @blur="saveNotes"
    />

    <div v-if="archiveLine" class="sc-archive" title="Архив старого учёта сухого шкафа (только чтение)">
      <i class="pi pi-history"></i>
      <span>{{ archiveLine }}</span>
    </div>

    <div class="sc-actions">
      <Button
        v-if="!isDepleted"
        label="Лента израсходована"
        icon="pi pi-flag-fill"
        severity="danger"
        outlined
        size="small"
        :disabled="saving || loading"
        @click="deplete"
      />
    </div>
  </section>
</template>

<style scoped>
.storage-card {
  padding: 12px 18px 14px;
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sc-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(0, 50, 116, 0.06);
}

.sc-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.5);
}

.sc-depleted {
  font-size: 11px;
  font-weight: 700;
  color: #b3261e;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.sc-status {
  font-size: 11px;
  color: rgba(0, 50, 116, 0.35);
}

.sc-label {
  font-size: 12px;
  color: rgba(0, 50, 116, 0.65);
}

.sc-notes {
  width: 100%;
  font-size: 13px;
}

.sc-archive {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  color: rgba(0, 50, 116, 0.45);
}

.sc-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
