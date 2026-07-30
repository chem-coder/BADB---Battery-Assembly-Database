<script setup>
/**
 * EntityCreateDialog — single shared "create new X" modal used by
 * TapesPage, AssemblyPage and ElectrodesPage. Renders fields from a
 * declarative schema so all three Add flows have identical visual
 * language and behaviour.
 *
 * Fields schema (passed via :fields prop):
 *   { key, label, type, required?, options?, placeholder?, defaultValue? }
 *   type ∈ 'text' | 'select' | 'multiselect' | 'date' | 'datetime'
 *
 * Duplicate / prefill: pass `:initial-values="{ key: value, ... }"` to
 * seed the form with copied data (e.g. «Дублировать ленту» copies the
 * source project_ids + recipe). When present, initialValues override
 * each field's defaultValue on open. Omit a key → that field falls back
 * to its schema default (so the new record gets a fresh date / blank
 * name etc.). initialValues is read once per open, same as defaults.
 *
 * `multiselect` binds to an array of option values; required validation
 * checks `value.length > 0`. Used for the multi-project pickers that
 * mirror the M:N backend tables (tape_projects / electrode_cut_batch_projects /
 * battery_projects — see docs/instructions/vue-vs-backend-audit-2026-05.md).
 *
 * `date` binds to a YYYY-MM-DD string and renders the DS-canonical
 * DatePicker (dd.mm.yyyy) via DateInputISO. Used for the `item_created_at`
 * business-date field on all three entities.
 *
 * Emits:
 *   - update:visible(boolean)
 *   - create(payload)  ← keys mirror the schema, parent POSTs to its API
 *
 * Design tokens follow src/pages/DesignSystemPage.vue (eyebrow + Rosatom
 * title + glass-card body) and the brand-blue TvelAura preset from
 * main.js for PrimeVue buttons.
 */
import { ref, computed, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import DSMultiSelect from '@/components/ds/DSMultiSelect.vue';
import DateInputISO from '@/components/parity/DateInputISO.vue';
import DateTimeWithNow from '@/components/parity/DateTimeWithNow.vue';

const props = defineProps({
  visible: { type: Boolean, required: true },
  /** Short eyebrow line, e.g. "Ленты · Создание". */
  eyebrow: { type: String, default: '' },
  /** Big Rosatom title, e.g. "Новая лента". */
  title: { type: String, required: true },
  /** Optional explanatory paragraph below the title. */
  description: { type: String, default: '' },
  /** Field schema — see file header. */
  fields: { type: Array, required: true },
  /** Submit button label, e.g. "Создать ленту". */
  submitLabel: { type: String, default: 'Создать' },
  /** Submit icon, defaults to plus. */
  submitIcon: { type: String, default: 'pi pi-plus' },
  /** Width of the dialog body. */
  width: { type: String, default: '480px' },
  /**
   * Optional seed values for duplicate / prefill flows. Keys matching a
   * field's `key` override that field's defaultValue when the dialog
   * opens. null → pure create with schema defaults.
   */
  initialValues: { type: Object, default: null },
});

const emit = defineEmits(['update:visible', 'create']);

const values = ref({});
const submitting = ref(false);

function resetValues() {
  const seed = props.initialValues || null;
  const next = {};
  for (const f of props.fields) {
    // Seed (duplicate/prefill) wins over the schema default when it
    // carries a value for this key. A multiselect seed is cloned so the
    // dialog can't mutate the source array.
    if (seed && Object.prototype.hasOwnProperty.call(seed, f.key) && seed[f.key] !== undefined) {
      next[f.key] = Array.isArray(seed[f.key]) ? [...seed[f.key]] : seed[f.key];
    } else if (f.defaultValue !== undefined) {
      next[f.key] = f.defaultValue;
    } else if (f.type === 'multiselect') {
      next[f.key] = [];
    } else if (f.type === 'select') {
      next[f.key] = null;
    } else {
      next[f.key] = '';
    }
  }
  values.value = next;
  submitting.value = false;
}

watch(
  () => props.visible,
  (v) => { if (v) resetValues(); }
);

const canSubmit = computed(() => {
  if (submitting.value) return false;
  for (const f of props.fields) {
    if (!f.required) continue;
    const v = values.value[f.key];
    if (v === null || v === undefined || v === '') return false;
    if (f.type === 'multiselect' && (!Array.isArray(v) || v.length === 0)) return false;
  }
  return true;
});

function onCancel() {
  if (submitting.value) return;
  emit('update:visible', false);
}

// ── `datetime` fields ──────────────────────────────────────────────
// Value convention: naive MSK string 'YYYY-MM-DDTHH:mm[:ss]' (same as
// the constructor's datetime-iso fields). Split/combine for the
// DateTimeWithNow primitive; time without date is undefined → ''.
function dtDatePart(v) {
  const m = String(v || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}
function dtTimePart(v) {
  const m = String(v || '').match(/T(\d{2}:\d{2})/);
  return m ? m[1] : '';
}
function onDtUpdate(key, date, time) {
  values.value[key] = date ? `${date}T${time || '00:00'}:00` : '';
}

// ── Overlay click-through guard ────────────────────────────────────
// PrimeVue closes an open Select/MultiSelect panel on an outside click,
// but that same click still reaches whatever it landed on. When the
// user dismissed the projects dropdown by clicking «Создать», the form
// submitted half-filled (Dalia, 2026-07-29). Track open overlays and
// swallow a submit that arrives while one is open or within the same
// click of its closing.
const overlaysOpen = ref(0);
let overlayClosedAt = 0;
function onOverlayShow() { overlaysOpen.value += 1; }
function onOverlayHide() {
  overlaysOpen.value = Math.max(0, overlaysOpen.value - 1);
  overlayClosedAt = Date.now();
}

function onCreate() {
  if (overlaysOpen.value > 0 || Date.now() - overlayClosedAt < 350) return;
  if (!canSubmit.value) return;
  submitting.value = true;
  const payload = {};
  for (const f of props.fields) {
    payload[f.key] = values.value[f.key];
    if (typeof payload[f.key] === 'string') payload[f.key] = payload[f.key].trim();
  }
  emit('create', payload);
  // Parent decides whether to close on success or keep open on error.
}

/** Allow parent to reset the dialog after an API error so user can retry,
 * and to set a field from outside (e.g. after «+ Новая рецептура…» creates
 * the record the select should now point at). */
defineExpose({
  resetSubmitting() { submitting.value = false; },
  setFieldValue(key, value) { values.value = { ...values.value, [key]: value }; },
});
</script>

<template>
  <Dialog
    :visible="visible"
    :style="{ width }"
    :pt="{ root: { class: 'ec-dialog-root' }, content: { class: 'ec-content' } }"
    modal
    :draggable="false"
    :closable="!submitting"
    :show-header="false"
    @update:visible="(v) => emit('update:visible', v)"
  >
    <div class="ec-card">
      <div v-if="eyebrow" class="ec-eyebrow">{{ eyebrow }}</div>
      <h3 class="ec-title">{{ title }}</h3>
      <p v-if="description" class="ec-hint">{{ description }}</p>

      <div
        v-for="(f, idx) in fields"
        :key="f.key"
        class="ec-field"
      >
        <label :for="`ec-${f.key}`">
          {{ f.label }}<span v-if="f.required" class="ec-req">*</span>
        </label>
        <InputText
          v-if="f.type === 'text'"
          :id="`ec-${f.key}`"
          v-model="values[f.key]"
          :placeholder="f.placeholder || ''"
          :autofocus="idx === 0"
          class="ec-input"
        />
        <Select
          v-else-if="f.type === 'select'"
          :id="`ec-${f.key}`"
          v-model="values[f.key]"
          :options="f.options"
          option-label="label"
          option-value="value"
          :placeholder="f.placeholder || '— выбрать —'"
          :filter="(f.options || []).length > 6"
          show-clear
          :autofocus="idx === 0"
          class="ec-input"
          @show="onOverlayShow"
          @hide="onOverlayHide"
        />
        <!-- DSMultiSelect encapsulates the project's MultiSelect defaults
             (no chip, counter label, show-clear, auto-filter). -->
        <DSMultiSelect
          v-else-if="f.type === 'multiselect'"
          :id="`ec-${f.key}`"
          v-model="values[f.key]"
          :options="f.options"
          :placeholder="f.placeholder || '— выбрать —'"
          class="ec-input"
          @show="onOverlayShow"
          @hide="onOverlayHide"
        />
        <DateInputISO
          v-else-if="f.type === 'date'"
          :id="`ec-${f.key}`"
          v-model="values[f.key]"
          :placeholder="f.placeholder || 'дд.мм.гггг'"
          :max="f.max || ''"
          class="ec-input"
        />
        <!-- Real date+time binding (naive MSK string) — used for the
             batch assembly start on battery creation (d054). -->
        <DateTimeWithNow
          v-else-if="f.type === 'datetime'"
          :date="dtDatePart(values[f.key])"
          :time="dtTimePart(values[f.key])"
          class="ec-input"
          @update:date="(d) => onDtUpdate(f.key, d, dtTimePart(values[f.key]))"
          @update:time="(t) => onDtUpdate(f.key, dtDatePart(values[f.key]), t)"
        />
        <!-- Optional per-field action, e.g. «+ Новая рецептура…» opening a
             quick-create flow whose result lands back in this field via
             the exposed setFieldValue(). -->
        <Button
          v-if="f.action"
          :label="f.action.label"
          text
          size="small"
          class="ec-field-action"
          @click="f.action.onClick()"
        />
      </div>
    </div>

    <template #footer>
      <Button label="Отмена" severity="secondary" outlined :disabled="submitting" @click="onCancel" />
      <Button
        :label="submitLabel"
        :icon="submitIcon"
        :disabled="!canSubmit"
        :loading="submitting"
        @click="onCreate"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.ec-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 28px 28px 8px;
  background: white;
}
.ec-eyebrow {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(0, 50, 116, 0.50);
  margin-bottom: 2px;
}
.ec-title {
  font-family: 'Rosatom', system-ui, sans-serif;
  font-size: 22px;
  font-weight: 700;
  color: #003274;
  margin: 0;
  line-height: 1.2;
  letter-spacing: -0.01em;
}
.ec-hint {
  margin: 4px 0 8px;
  font-size: 13px;
  font-weight: 400;
  color: #6B7280;
  line-height: 1.55;
}
.ec-divider {
  height: 1px;
  background: rgba(0, 50, 116, 0.08);
  margin: 4px 0 8px;
}
.ec-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ec-field + .ec-field {
  margin-top: 6px;
}
.ec-field label {
  font-size: 13px;
  font-weight: 600;
  color: #4B5563;
}
.ec-req {
  color: #E74C3C;
  margin-left: 3px;
  font-weight: 700;
}
.ec-input {
  width: 100%;
}

/* MultiSelect chips: truncate long labels with ellipsis instead of
   pushing the field wider. Keeps the form column width fixed regardless
   of how many / how long the selected items are. Same rule lives in
   StageCompareEditor for the constructor cell context. */
.ec-input :deep(.p-multiselect-chip) {
  min-width: 0;
  overflow: hidden;
  width: 100%;
}
/* The actual flex child is the wrapper SPAN — see StageCompareEditor
   counterpart for the DOM structure. */
.ec-input :deep(.p-multiselect-chip-item) {
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
}
.ec-input :deep(.p-chip-label),
.ec-input :deep(.p-multiselect-token-label),
.ec-input :deep(.p-multiselect-chip-label) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  display: block;
}
.ec-input :deep(.p-multiselect-label) {
  display: flex;
  gap: 4px;
  align-items: center;
  overflow: hidden;
  min-width: 0;
  flex-wrap: nowrap;
}
.ec-field-action {
  align-self: flex-start;
  padding: 2px 4px;
  margin-top: 2px;
}
</style>

<style>
/* PrimeVue Aura's --p-dialog-background renders a tinted-glass background
   that conflicts with the design-code "card" pattern (white surface, brand
   border, brand shadow). Override the whole dialog wrapper + body explicitly. */
.p-dialog.ec-dialog-root {
  border: 1px solid rgba(0, 50, 116, 0.14);
  border-radius: 14px;
  background: white !important;
  background-color: white !important;
  box-shadow:
    0 24px 60px rgba(0, 50, 116, 0.22),
    0 4px 12px rgba(0, 50, 116, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.85);
  overflow: hidden;
  backdrop-filter: none !important;
}
.p-dialog.ec-dialog-root .p-dialog-content,
.p-dialog.ec-dialog-root .ec-content {
  background: white !important;
  background-color: white !important;
  padding: 0 !important;
}
.p-dialog.ec-dialog-root .p-dialog-footer {
  background: white !important;
  background-color: white !important;
  border-top: 1px solid rgba(0, 50, 116, 0.08);
  padding: 14px 28px 18px !important;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}
/* Make the modal mask gentler and the dialog centred with breathing room. */
.p-dialog-mask:has(.ec-dialog-root) {
  background: rgba(0, 50, 116, 0.28);
  backdrop-filter: blur(2px);
}
.ec-field-action {
  align-self: flex-start;
  padding: 2px 4px;
  margin-top: 2px;
}
</style>
