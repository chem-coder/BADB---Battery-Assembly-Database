<script setup>
/**
 * TapeDryBoxPanel — UI surface for the tape dry-box workflow.
 *
 * Surfaces 6 backend endpoints (routes/tapes.js:353-461) that previously
 * had no Vue UI:
 *   GET  /api/tapes/:id/dry-box-state            — current state
 *   PUT  /api/tapes/:id/dry-box-state            — save parameters
 *   POST /api/tapes/:id/dry-box-state/place-now  — first placement
 *   POST /api/tapes/:id/dry-box-state/return-now — re-place after taking out
 *   POST /api/tapes/:id/dry-box-state/remove-now — take out for use
 *   POST /api/tapes/:id/dry-box-state/deplete    — terminal: used up
 *
 * The `availability_status` field on `tapes` drives which actions are
 * available:
 *   - null               → tape never placed. Show "Поместить в шкаф"
 *                          (disabled until `drying_pressed_tape` step has
 *                          `ended_at` per backend constraint).
 *   - 'in_dry_box'       → currently stored. Show "Извлечь" + parameter
 *                          editor (PUT).
 *   - 'out_of_dry_box'   → taken out for use. Show "Вернуть" + "Списать".
 *   - 'depleted'         → terminal. Read-only.
 *
 * Mirrors vanilla v1 (`public/js/1-tapes.js:1793-1855`) but laid out as
 * a panel below the constructor (next to RecipeActualsEditor) so all
 * tape-level state lives in one column.
 *
 * Audit reference: docs/instructions/vue-vs-backend-audit-2026-05.md #6.
 */
import { ref, computed, watch } from 'vue';
import api from '@/services/api';
import { useToast } from 'primevue/usetoast';
import { toastApiError } from '@/utils/errorClassifier';
import Button from 'primevue/button';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import { formatDateTimeMsk } from '@/utils/dateFormat';
import { useNotify } from '@/composables/useNotify';

const props = defineProps({
  tapeId: { type: [Number, String, null], default: null },
});

const toast = useToast();
const notify = useNotify();

// ── Server state ──
const loading = ref(false);
const saving = ref(false);
const state = ref(null); // { started_at, removed_at, temperature_c, atmosphere, other_parameters, comments, availability_status, has_final_dry_box_storage, ... }

// ── Local editable parameters (decoupled from state for unsaved edits) ──
const form = ref({
  temperature_c: null,
  atmosphere: '',
  other_parameters: '',
  comments: '',
});

const status = computed(() => state.value?.availability_status || null);

const canPlace = computed(() => {
  // place-now itself has no backend precondition; vanilla allows it
  // before final drying for early-stage workflows. Keep enabled when
  // tape never was in box.
  return status.value == null;
});
const canRemove = computed(() => {
  // remove-now requires `drying_pressed_tape.ended_at` per backend
  // (services/tapeDryBoxService.js:320). Surface via `has_final_dry_box_storage`.
  return status.value === 'in_dry_box' && !!state.value?.has_final_dry_box_storage;
});
const canReturn = computed(() => status.value === 'out_of_dry_box');
const canDeplete = computed(() => status.value && status.value !== 'depleted');

const statusBadge = computed(() => {
  const map = {
    in_dry_box:     { label: 'В шкафу',       cls: 'badge-4' }, // mint
    out_of_dry_box: { label: 'Извлечена',     cls: 'badge-5' }, // blue
    depleted:       { label: 'Израсходована', cls: 'badge-8' }, // red
  };
  if (!status.value) return { label: 'Не помещалась', cls: 'badge-mute' };
  return map[status.value] || { label: status.value, cls: 'badge-mute' };
});

// ── Fetch on tapeId change ──
async function load() {
  if (!props.tapeId) { state.value = null; return; }
  loading.value = true;
  try {
    const { data } = await api.get(`/api/tapes/${props.tapeId}/dry-box-state`);
    state.value = data;
    form.value = {
      temperature_c: data.temperature_c ?? null,
      atmosphere: data.atmosphere || '',
      other_parameters: data.other_parameters || '',
      comments: data.comments || '',
    };
  } catch (err) {
    toastApiError(toast, err, 'Ошибка загрузки состояния шкафа');
    state.value = null;
  } finally {
    loading.value = false;
  }
}

watch(() => props.tapeId, load, { immediate: true });

// ── Helper to share payload + reload pattern across actions ──
async function withAction(label, fn) {
  if (!props.tapeId) return;
  saving.value = true;
  try {
    const data = await fn();
    state.value = data;
    // Keep form synced after a server-side change.
    form.value = {
      temperature_c: data.temperature_c ?? null,
      atmosphere: data.atmosphere || '',
      other_parameters: data.other_parameters || '',
      comments: data.comments || '',
    };
    notify.success(label);
  } catch (err) {
    toastApiError(toast, err, label);
  } finally {
    saving.value = false;
  }
}

function paramsPayload() {
  return {
    temperature_c: form.value.temperature_c,
    atmosphere: form.value.atmosphere || null,
    other_parameters: form.value.other_parameters || null,
    comments: form.value.comments || null,
  };
}

async function saveParams() {
  await withAction('Параметры сохранены', async () => {
    const { data } = await api.put(`/api/tapes/${props.tapeId}/dry-box-state`, paramsPayload());
    return data;
  });
}

async function placeNow() {
  await withAction('Лента помещена в шкаф', async () => {
    const { data } = await api.post(`/api/tapes/${props.tapeId}/dry-box-state/place-now`, paramsPayload());
    return data;
  });
}

async function returnNow() {
  await withAction('Лента возвращена в шкаф', async () => {
    const { data } = await api.post(`/api/tapes/${props.tapeId}/dry-box-state/return-now`, paramsPayload());
    return data;
  });
}

async function removeNow() {
  await withAction('Лента извлечена из шкафа', async () => {
    const { data } = await api.post(`/api/tapes/${props.tapeId}/dry-box-state/remove-now`, {});
    return data;
  });
}

async function depleteNow() {
  if (!window.confirm('Отметить ленту как израсходованную? Это терминальное состояние.')) return;
  await withAction('Лента отмечена как израсходованная', async () => {
    const { data } = await api.post(`/api/tapes/${props.tapeId}/dry-box-state/deplete`, {});
    return data;
  });
}
</script>

<template>
  <section v-if="tapeId" class="glass-card tdb-card">
    <div class="tdb-head">
      <span class="tdb-eyebrow">Сушильный шкаф</span>
      <span :class="['badge', statusBadge.cls, 'tdb-status']">{{ statusBadge.label }}</span>
    </div>

    <div v-if="loading" class="tdb-hint">Загрузка…</div>

    <div v-else class="tdb-body">
      <!-- Timestamps row -->
      <div class="tdb-meta">
        <div v-if="state?.started_at" class="tdb-meta-item">
          <span class="tdb-meta-label">Помещена:</span>
          <span class="tdb-meta-value">{{ formatDateTimeMsk(state.started_at) }} <small class="tdb-msk">МСК</small></span>
        </div>
        <div v-if="state?.removed_at" class="tdb-meta-item">
          <span class="tdb-meta-label">Извлечена:</span>
          <span class="tdb-meta-value">{{ formatDateTimeMsk(state.removed_at) }} <small class="tdb-msk">МСК</small></span>
        </div>
        <div v-if="!state?.started_at && !state?.removed_at" class="tdb-meta-item tdb-meta-empty">
          Лента не помещалась в сушильный шкаф.
        </div>
      </div>

      <!-- Parameters editor — visible whenever the panel can write any state -->
      <div v-if="status !== 'depleted'" class="tdb-form">
        <div class="tdb-row">
          <label class="tdb-label">Температура, °C</label>
          <InputNumber
            v-model="form.temperature_c"
            :max-fraction-digits="2"
            class="tdb-input"
            :disabled="saving"
          />
        </div>
        <div class="tdb-row">
          <label class="tdb-label">Атмосфера</label>
          <InputText
            v-model="form.atmosphere"
            class="tdb-input"
            :disabled="saving"
          />
        </div>
        <div class="tdb-row">
          <label class="tdb-label">Доп. параметры</label>
          <Textarea
            v-model="form.other_parameters"
            class="tdb-input"
            :disabled="saving"
            rows="2"
          />
        </div>
        <div class="tdb-row">
          <label class="tdb-label">Комментарии</label>
          <Textarea
            v-model="form.comments"
            class="tdb-input"
            :disabled="saving"
            rows="2"
          />
        </div>
      </div>

      <!-- Actions — only the buttons valid for the current status are enabled -->
      <div class="tdb-actions">
        <Button
          v-if="canPlace"
          label="Поместить в шкаф"
          icon="pi pi-box"
          :loading="saving"
          @click="placeNow"
        />
        <Button
          v-if="status === 'in_dry_box' || status === 'out_of_dry_box'"
          label="Сохранить параметры"
          icon="pi pi-save"
          severity="secondary"
          outlined
          :loading="saving"
          @click="saveParams"
        />
        <Button
          v-if="canRemove"
          label="Извлечь"
          icon="pi pi-sign-out"
          severity="secondary"
          :loading="saving"
          @click="removeNow"
        />
        <Button
          v-if="canReturn"
          label="Вернуть в шкаф"
          icon="pi pi-replay"
          :loading="saving"
          @click="returnNow"
        />
        <Button
          v-if="canDeplete"
          label="Списать"
          icon="pi pi-times-circle"
          severity="danger"
          text
          :loading="saving"
          @click="depleteNow"
        />
      </div>

      <!-- Disabled-action hints -->
      <p
        v-if="status == null && !state?.has_final_dry_box_storage"
        class="tdb-hint"
      >
        Сначала завершите этап «Сушка готовой ленты» (II.4), чтобы потом
        можно было извлечь ленту.
      </p>
    </div>
  </section>
</template>

<style scoped>
/* Same rhythm as ElectrodeBatchPanel / RecipeActualsEditor — three
   panels on the same page should read as one component family. */
.tdb-card {
  padding: 12px 18px 14px;
  margin-top: 8px;
}
.tdb-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.tdb-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgba(0, 50, 116, 0.55);
}
.tdb-status {
  font-size: 11px;
  padding: 2px 8px;
}
.badge-mute {
  background: rgba(0, 50, 116, 0.06);
  color: #6B7280;
  border-radius: 9px;
  padding: 2px 8px;
  font-weight: 600;
}

.tdb-hint {
  font-size: 12px;
  color: #6B7280;
  margin: 8px 0 0;
  line-height: 1.4;
}

.tdb-meta {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  font-size: 13px;
}
.tdb-meta-item {
  color: #333;
}
.tdb-meta-empty {
  color: #6B7280;
  font-style: italic;
}
.tdb-meta-label {
  font-weight: 600;
  color: #4B5563;
  margin-right: 4px;
}
.tdb-msk {
  font-size: 10px;
  color: #6B7280;
  margin-left: 2px;
}

.tdb-form {
  display: grid;
  grid-template-columns: minmax(160px, 200px) 1fr;
  gap: 8px 12px;
  margin-bottom: 14px;
}
.tdb-row {
  display: contents;
}
.tdb-label {
  font-size: 13px;
  font-weight: 600;
  color: #4B5563;
  padding-top: 6px;
}
.tdb-input {
  width: 100%;
}

.tdb-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
</style>
