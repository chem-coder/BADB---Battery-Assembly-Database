<script setup>
/**
 * PageFilterBar — text search + zero-or-more selects + reset + count summary.
 *
 * Filter definitions are passed via the `filters` prop. State is internal to
 * this component and emitted on every change via `update:state`. The parent
 * applies state to the loaded list (client-side filtering) and passes back
 * `shown` and `total` for the count line.
 *
 * Count line is placed BELOW the filter controls per
 * `docs/instructions/vanilla_ui_patterns.md` §"Filter Layout".
 *
 * filter shape:
 *   { field: 'name',   type: 'text',   placeholder: 'Поиск...', label?: 'Поиск' }
 *   { field: 'role',   type: 'select', label: 'Роль',
 *     options: [{ value: 'cathode', label: 'катод' }, ...],
 *     emptyOption?: 'Все роли' }
 */
import { ref, watch } from 'vue';

const props = defineProps({
  filters: { type: Array, required: true },
  total: { type: Number, required: true },
  shown: { type: Number, required: true },
});

const emit = defineEmits(['update:state', 'reset']);

// Internal state, keyed by filter.field.
const state = ref(Object.fromEntries(props.filters.map((f) => [f.field, ''])));

watch(
  state,
  (s) => emit('update:state', { ...s }),
  { deep: true, immediate: true }
);

function resetAll() {
  for (const f of props.filters) state.value[f.field] = '';
  emit('reset');
}

const isFiltered = () => Object.values(state.value).some((v) => v !== '' && v != null);
</script>

<template>
  <div class="page-filter-bar" aria-label="Фильтры списка">
    <div class="filter-controls">
      <template v-for="f in filters" :key="f.field">
        <label v-if="f.type === 'text'" class="filter-field">
          <span v-if="f.label" class="filter-label">{{ f.label }}</span>
          <input
            v-model="state[f.field]"
            type="search"
            class="filter-input"
            :placeholder="f.placeholder || ''"
            autocomplete="off"
          />
        </label>

        <label v-else-if="f.type === 'select'" class="filter-field">
          <span class="filter-label">{{ f.label }}</span>
          <select v-model="state[f.field]" class="filter-select">
            <option value="">{{ f.emptyOption || 'Все' }}</option>
            <option v-for="opt in f.options" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </label>
      </template>

      <button
        type="button"
        class="filter-reset"
        title="Сбросить фильтры"
        aria-label="Сбросить фильтры"
        @click="resetAll"
      >
        Сбросить
      </button>
    </div>

    <div class="filter-count" aria-live="polite">
      <template v-if="isFiltered() && shown !== total">
        Показано {{ shown }} из {{ total }}
      </template>
      <template v-else>
        Всего: {{ total }}
      </template>
    </div>
  </div>
</template>

<style scoped>
.page-filter-bar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 12px 0;
}
.filter-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-end;
}
.filter-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}
.filter-label {
  color: rgba(0, 50, 116, 0.7);
  font-weight: 500;
}
.filter-input,
.filter-select {
  font: inherit;
  padding: 4px 8px;
  border: 1px solid rgba(0, 50, 116, 0.3);
  border-radius: 3px;
  background: white;
  min-width: 200px;
}
.filter-input {
  min-width: 260px;
}
.filter-reset {
  padding: 5px 12px;
  border: 1px solid rgba(0, 50, 116, 0.4);
  border-radius: 3px;
  background: white;
  cursor: pointer;
  font: inherit;
}
.filter-reset:hover {
  background: rgba(0, 50, 116, 0.05);
}
.filter-count {
  font-size: 12px;
  color: #6B7280;
}
</style>
