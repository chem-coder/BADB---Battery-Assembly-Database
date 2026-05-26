<script setup>
/**
 * RowActionIcons — icon buttons for list row actions (print, duplicate).
 *
 * Rendered inside a CrudTable row cell. Only icons listed in `actions` are
 * shown. Each icon has `title` and `aria-label` matching the exact phrases
 * from `docs/instructions/vanilla_ui_patterns.md` §"Button Language And
 * Tooltips" (print → "Печать отчёта", duplicate → "Дублировать запись").
 *
 * Icons mirror vanilla's emoji choices: 🖨️ print, 📑 duplicate.
 */

const props = defineProps({
  rowId: { type: [Number, String], required: true },
  actions: {
    type: Array,
    required: true,
    validator: (arr) => arr.every((a) => ['print', 'duplicate'].includes(a)),
  },
});

const emit = defineEmits(['print', 'duplicate']);

function onClick(action, event) {
  event.stopPropagation(); // prevent row-click from firing
  if (action === 'print') emit('print', props.rowId);
  else if (action === 'duplicate') emit('duplicate', props.rowId);
}
</script>

<template>
  <span class="row-action-icons">
    <button
      v-if="actions.includes('print')"
      type="button"
      class="row-action-btn"
      title="Печать отчёта"
      aria-label="Печать отчёта"
      @click="(e) => onClick('print', e)"
    >
      🖨️
    </button>
    <button
      v-if="actions.includes('duplicate')"
      type="button"
      class="row-action-btn"
      title="Дублировать запись"
      aria-label="Дублировать запись"
      @click="(e) => onClick('duplicate', e)"
    >
      📑
    </button>
  </span>
</template>

<style scoped>
.row-action-icons {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}
.row-action-btn {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 3px;
  padding: 2px 6px;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}
.row-action-btn:hover {
  background: rgba(0, 50, 116, 0.06);
  border-color: rgba(0, 50, 116, 0.2);
}
</style>
