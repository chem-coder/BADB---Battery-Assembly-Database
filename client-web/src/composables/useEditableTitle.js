/**
 * useEditableTitle — state machine for the vanilla v1 "click to edit title"
 * pattern.
 *
 * Vanilla behaviour (per public/js/recipes.js title click handler):
 *   - click on title <span>: show <input> with current value pre-filled, hide title.
 *   - Enter or blur on input: commit value back to the title, hide input.
 *   - Escape: cancel (restore original value, hide input).
 *
 * This composable is presentation-agnostic — the consumer wires DOM events
 * (or component events) to start/commit/cancel.
 *
 * Usage in a page:
 *   const titleValue = ref('');
 *   const { editing, start, commit, cancel } = useEditableTitle();
 *
 *   // Template:
 *   //   <span v-if="!editing" @click="start">{{ titleValue }}</span>
 *   //   <input v-else
 *   //          :value="titleValue"
 *   //          @keydown.enter.prevent="(e) => commit(e.target.value)"
 *   //          @keydown.escape.prevent="cancel"
 *   //          @blur="(e) => commit(e.target.value)" />
 */

import { ref } from 'vue';

export function useEditableTitle() {
  const editing = ref(false);

  function start() {
    editing.value = true;
  }

  function commit(/* value handled by caller */) {
    editing.value = false;
  }

  function cancel() {
    editing.value = false;
  }

  return { editing, start, commit, cancel };
}
