<script setup>
/**
 * DSMultiSelect — the one true MultiSelect for BADB forms.
 *
 * Wraps PrimeVue's MultiSelect with the project's agreed behaviour so
 * every multi-pick field looks and behaves identically without each
 * call-site re-declaring the same six props (which had already drifted
 * across StageCompareEditor / BatchCreateDialog / EntityCreateDialog
 * and caused the repeated «chips stretch the field» / «× looks wrong»
 * fixes — Dima 2026-06-02).
 *
 * Encapsulated defaults:
 *   - NO `display="chip"` — chips stretch the field and clip labels at a
 *     fixed column width. Instead: 1 selected → its name (CSS-truncated),
 *     2+ → «Выбрано: N» via maxSelectedLabels=1 + selectedItemsLabel.
 *   - `showClear` — the small × matching regular Select fields (styled
 *     once in global.css under `.p-multiselect-clear-icon`).
 *   - `filter` auto-enabled once the option list is long enough to need
 *     search (default threshold 6).
 *   - optionLabel/optionValue default to the project convention
 *     ({ label, value }).
 *
 * The visual styling still lives in global.css on the `.p-multiselect`
 * class — this wrapper owns BEHAVIOUR (props), not a second copy of the
 * CSS, so there's a single source for each concern.
 *
 * Usage:
 *   <DSMultiSelect v-model="projectIds" :options="projectOptions"
 *                  placeholder="Выберите проекты" />
 */
import { computed, ref } from 'vue';
import MultiSelect from 'primevue/multiselect';
import Button from 'primevue/button';

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  options: { type: Array, default: () => [] },
  optionLabel: { type: String, default: 'label' },
  optionValue: { type: String, default: 'value' },
  placeholder: { type: String, default: '— выбрать —' },
  /** Auto-enable the search box once options exceed this count. */
  filterThreshold: { type: Number, default: 6 },
  /** Pass-through id for label association. */
  id: { type: String, default: undefined },
  disabled: { type: Boolean, default: false },
  /** Dropdown panel max height (e.g. inside a dense constructor cell). */
  scrollHeight: { type: String, default: '200px' },
});

const emit = defineEmits(['update:modelValue']);

// Guard: always hand MultiSelect an array even if a parent passes null.
const value = computed({
  get: () => (Array.isArray(props.modelValue) ? props.modelValue : []),
  set: (v) => emit('update:modelValue', v),
});

const showFilter = computed(() => (props.options || []).length > props.filterThreshold);

// «Готово» in the panel footer — an explicit, discoverable way to close
// the dropdown after picking. Without it users dismiss the panel by
// clicking elsewhere in the form, and whatever that click lands on ALSO
// fires (Dalia hit this in the battery create dialog: the dismissing
// click hit «Создать» and submitted a half-filled form).
const msRef = ref(null);
function closePanel() {
  msRef.value?.hide?.();
}
</script>

<template>
  <MultiSelect
    :id="id"
    ref="msRef"
    v-model="value"
    :options="options"
    :option-label="optionLabel"
    :option-value="optionValue"
    :placeholder="placeholder"
    :filter="showFilter"
    :disabled="disabled"
    :scroll-height="scrollHeight"
    :max-selected-labels="1"
    selected-items-label="Выбрано: {0}"
    show-clear
    class="ds-multiselect"
  >
    <template #footer>
      <div class="ds-ms-footer">
        <span class="ds-ms-count">Выбрано: {{ value.length }}</span>
        <Button label="Готово" size="small" @click="closePanel" />
      </div>
    </template>
  </MultiSelect>
</template>

<style scoped>
/* Footer lives in the teleported overlay panel, but scoped styles still
   apply because the slot content is compiled in this component's scope. */
.ds-ms-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 10px;
  border-top: 1px solid rgba(0, 50, 116, 0.08);
}
.ds-ms-count {
  font-size: 12px;
  color: rgba(0, 50, 116, 0.55);
}
</style>
