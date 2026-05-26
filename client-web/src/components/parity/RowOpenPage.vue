<script setup>
/**
 * RowOpenPage — page-level wrapper for the vanilla v1 "row-open" pattern.
 *
 * Composes:
 *   - PageHeader (existing Design-System component) for page title/icon.
 *   - TopAddInput for the "+ Добавить ..." Enter-to-create input.
 *   - opened-record slot for the surface-specific form area (which the
 *     surface fills with OpenedRecordHeader + its own form fields).
 *   - PageFilterBar for the client-side filter strip.
 *   - A lightweight list table built from `columns` + `list` + filtered state.
 *
 * Filtering is performed inside this component over the loaded `list`
 * payload. Filter rules are derived from the `filters` prop shape:
 *   - type: 'text' → case-insensitive substring match in the row's
 *     stringified content (uses the surface-supplied `textHaystack`
 *     function or all string fields if absent).
 *   - type: 'select' → exact match against the row's value for filter.field.
 *
 * When a row is clicked, `row-click` is emitted; when a row's icon button
 * is clicked, `row-print` / `row-duplicate` is emitted. The page does not
 * own the opened-record state — it just emits and lets the surface or
 * `useRowOpenForm` handle it.
 *
 * Scrolling: when `currentId` transitions from null → non-null, the
 * document scrolls to top (vanilla's BADB_UI.scrollToTop equivalent).
 */
import { ref, computed, watch } from 'vue';
import PageHeader from '@/components/PageHeader.vue';
import TopAddInput from './TopAddInput.vue';
import PageFilterBar from './PageFilterBar.vue';
import RowActionIcons from './RowActionIcons.vue';

const props = defineProps({
  title: { type: String, required: true },
  icon: { type: String, default: '' },
  addPlaceholder: { type: String, default: '' },
  list: { type: Array, required: true },
  columns: { type: Array, required: true },
  filters: { type: Array, default: () => [] },
  rowActions: { type: Array, default: () => [] },
  currentId: { type: [Number, String, null], default: null },
  idField: { type: String, required: true },
  loading: { type: Boolean, default: false },
  emptyMessage: { type: String, default: 'Список пуст' },
  // Optional: surface-supplied function returning a string for text search.
  textHaystack: { type: Function, default: null },
});

const emit = defineEmits([
  'create',
  'row-click',
  'row-print',
  'row-duplicate',
  'filters-changed',
]);

const filterState = ref({});

function rowMatchesFilter(row, state) {
  for (const f of props.filters) {
    const v = state[f.field];
    if (v == null || v === '') continue;

    if (f.type === 'select') {
      if (row[f.field] !== v) return false;
      continue;
    }

    if (f.type === 'text') {
      const needle = String(v).toLowerCase();
      const haystack = props.textHaystack
        ? props.textHaystack(row).toLowerCase()
        : Object.values(row)
            .filter((x) => typeof x === 'string' || typeof x === 'number')
            .join(' ')
            .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
  }
  return true;
}

const filteredList = computed(() => {
  if (Object.values(filterState.value).every((v) => v === '' || v == null)) {
    return props.list;
  }
  return props.list.filter((row) => rowMatchesFilter(row, filterState.value));
});

function onFilterState(s) {
  filterState.value = s;
  emit('filters-changed', { state: s, shown: filteredList.value.length, total: props.list.length });
}

function onCreate(name) {
  emit('create', name);
}

function onRowClick(row) {
  emit('row-click', row);
}

function onRowPrint(id) {
  emit('row-print', id);
}

function onRowDuplicate(id) {
  // Find the full row and emit it (surfaces need the row data to seed a copy).
  const row = props.list.find((r) => r[props.idField] === id);
  emit('row-duplicate', row ?? { [props.idField]: id });
}

// Scroll to top when a record is opened.
watch(
  () => props.currentId,
  (next, prev) => {
    if (next != null && prev == null) {
      // Match vanilla BADB_UI.scrollToTop(): use document.scrollingElement
      // with immediate behaviour for destructive/guided flows. Smooth is
      // fine for ordinary opening.
      const scroller = document.scrollingElement || document.documentElement || document.body;
      if (scroller) scroller.scrollTo({ top: 0, behavior: 'smooth' });
      else window.scrollTo(0, 0);
    }
  }
);

function getCellValue(row, column) {
  return row[column.field];
}
</script>

<template>
  <div class="row-open-page">
    <PageHeader :title="title" :icon="icon" />

    <TopAddInput
      v-if="addPlaceholder"
      :placeholder="addPlaceholder"
      @create="onCreate"
    />

    <!-- opened-record area: hidden when no record is open -->
    <div v-if="currentId != null" class="opened-record-area">
      <slot name="opened-record" :current-id="currentId" />
    </div>

    <PageFilterBar
      v-if="filters.length > 0"
      :filters="filters"
      :total="list.length"
      :shown="filteredList.length"
      @update:state="onFilterState"
    />

    <slot name="list-extra" />

    <div class="list-wrap">
      <table v-if="filteredList.length > 0" class="parity-list-table">
        <thead>
          <tr>
            <th
              v-for="col in columns"
              :key="col.field"
              :style="col.width ? { width: col.width } : null"
            >
              {{ col.header }}
            </th>
            <th v-if="rowActions.length > 0" class="row-actions-col"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in filteredList"
            :key="row[idField]"
            :class="{ 'is-current': row[idField] === currentId }"
            @click="onRowClick(row)"
          >
            <td v-for="col in columns" :key="col.field">
              <slot
                :name="`col-${col.field}`"
                :data="row"
                :value="getCellValue(row, col)"
              >
                {{ getCellValue(row, col) ?? '' }}
              </slot>
            </td>
            <td v-if="rowActions.length > 0" class="row-actions-cell">
              <RowActionIcons
                :row-id="row[idField]"
                :actions="rowActions"
                @print="onRowPrint"
                @duplicate="onRowDuplicate"
              />
            </td>
          </tr>
        </tbody>
      </table>

      <div v-else class="empty-state">
        <template v-if="loading">Загрузка…</template>
        <template v-else>{{ emptyMessage }}</template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.row-open-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.opened-record-area {
  display: flex;
  flex-direction: column;
}
.list-wrap {
  border: 1px solid rgba(0, 50, 116, 0.1);
  border-radius: 4px;
  background: white;
  overflow: auto;
}
.parity-list-table {
  width: 100%;
  border-collapse: collapse;
}
.parity-list-table th {
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: #4B5563;
  padding: 8px 10px;
  background: #f9fafb;
  border-bottom: 1px solid rgba(0, 50, 116, 0.1);
  position: sticky;
  top: 0;
  z-index: 1;
}
.parity-list-table td {
  padding: 6px 10px;
  border-bottom: 1px solid rgba(0, 50, 116, 0.05);
  font-size: 13px;
  vertical-align: middle;
}
.parity-list-table tr {
  cursor: pointer;
}
.parity-list-table tr:hover td {
  background: rgba(0, 50, 116, 0.03);
}
.parity-list-table tr.is-current td {
  background: rgba(0, 50, 116, 0.08);
}
.row-actions-col,
.row-actions-cell {
  width: 80px;
  text-align: right;
}
.empty-state {
  padding: 32px;
  text-align: center;
  color: #6B7280;
  font-size: 13px;
}
</style>
