<script setup>
/**
 * TopAddInput — input above the list. Enter creates a new record with the
 * entered name pre-filled. After emitting `create`, the input clears.
 *
 * Mirrors vanilla v1 pattern: <input id="recipe-name" placeholder="+ Добавить рецепт">
 * with Enter handler that opens a new record.
 */
import { ref } from 'vue';

const props = defineProps({
  placeholder: { type: String, required: true },
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(['create']);

const value = ref('');

function onEnter() {
  const trimmed = value.value.trim();
  if (!trimmed) return;
  emit('create', trimmed);
  value.value = '';
}
</script>

<template>
  <input
    v-model="value"
    type="text"
    class="top-add-input"
    :placeholder="placeholder"
    :disabled="disabled"
    autocomplete="off"
    @keydown.enter.prevent="onEnter"
  />
</template>

<style scoped>
.top-add-input {
  width: 100%;
  padding: 8px 12px;
  font-size: 14px;
  border: 1px dashed rgba(0, 50, 116, 0.3);
  border-radius: 4px;
  background: rgba(0, 50, 116, 0.02);
  color: #003274;
}
.top-add-input::placeholder {
  color: rgba(0, 50, 116, 0.5);
}
.top-add-input:focus {
  outline: none;
  border-style: solid;
  border-color: #003274;
  background: white;
}
.top-add-input:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
</style>
