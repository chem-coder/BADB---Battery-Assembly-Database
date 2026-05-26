<script setup>
/**
 * EditableTitle — click-to-edit title pattern from vanilla v1.
 *
 * Renders as a styled span by default; clicking enters edit mode where it
 * renders as an input. Enter and blur commit the value back via v-model.
 * Escape cancels (restores the previous value).
 *
 * Behaviour mirrors public/js/recipes.js title click handler.
 */
import { ref, watch, nextTick } from 'vue';
import { useEditableTitle } from '@/composables/useEditableTitle';

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'commit']);

const { editing, start, commit, cancel } = useEditableTitle();
const draft = ref(props.modelValue);
const inputEl = ref(null);

// When the parent updates modelValue while we're not editing, sync the draft.
watch(
  () => props.modelValue,
  (v) => {
    if (!editing.value) draft.value = v;
  }
);

async function onStart() {
  if (props.disabled) return;
  draft.value = props.modelValue;
  start();
  await nextTick();
  inputEl.value?.focus();
  inputEl.value?.select();
}

function onCommit() {
  const next = (draft.value ?? '').trim();
  if (next !== props.modelValue) {
    emit('update:modelValue', next);
    emit('commit', next);
  }
  commit();
}

function onCancel() {
  draft.value = props.modelValue;
  cancel();
}
</script>

<template>
  <span v-if="!editing" class="editable-title" :class="{ 'is-disabled': disabled }" @click="onStart">
    {{ modelValue || placeholder || '—' }}
  </span>
  <input
    v-else
    ref="inputEl"
    v-model="draft"
    type="text"
    class="editable-title-input"
    :placeholder="placeholder"
    @keydown.enter.prevent="onCommit"
    @keydown.escape.prevent="onCancel"
    @blur="onCommit"
  />
</template>

<style scoped>
.editable-title {
  cursor: text;
  user-select: text;
  display: inline-block;
  min-width: 1ch;
  padding: 1px 2px;
  border-radius: 3px;
}
.editable-title:hover {
  background: rgba(0, 50, 116, 0.05);
}
.editable-title.is-disabled {
  cursor: default;
  background: transparent;
}
.editable-title-input {
  font: inherit;
  color: inherit;
  background: white;
  border: 1px solid #003274;
  border-radius: 3px;
  padding: 1px 4px;
  min-width: 200px;
}
</style>
