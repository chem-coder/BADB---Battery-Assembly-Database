// Component test for src/components/CrudTable.vue
//
// Covers the 2026-07 toolbar/table changes:
//   1. «Строк в окне» — options 5/20/50/Все, default 20, and graceful
//      handling of a stored legacy pref (25) that is no longer in the
//      base option set (rendered as an extra option, not reset).
//   2. Shrink-to-fit — hiding ≥1 column puts the card in shrink mode
//      and passes an explicit computed px width to the DataTable
//      (№ 50px + Σ visible column widths, 80px fallback).
//   3. Selection-only lens — «Выбрано: N — показать» toggle appears
//      only with a non-empty selection, narrows filteredData to the
//      selected rows, and auto-exits when the selection empties.
//
// PrimeVue components are stubbed (same approach as the other component
// tests) — we test CrudTable's own logic, not DataTable internals.

import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { vi } from 'vitest';

// CrudTable + useUserPref both namespace persistence by the auth user id.
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { userId: 42 } }),
}));

import CrudTable from '@/components/CrudTable.vue';

const DataTableStub = {
  name: 'DataTable',
  props: ['value', 'tableStyle', 'loading', 'scrollHeight', 'rowClass'],
  template: `<div class="dt-stub"><slot /></div>`,
};
const ColumnStub = {
  name: 'Column',
  props: ['field', 'header', 'frozen', 'sortable'],
  template: `<div class="col-stub" :data-field="field || ''" />`,
};
const ButtonStub = {
  name: 'Button',
  props: ['label', 'icon', 'severity', 'text', 'size'],
  emits: ['click'],
  template: `<button class="btn-stub" :data-icon="icon || ''" @click="$emit('click', $event)">{{ label }}</button>`,
};
const CheckboxStub = {
  name: 'Checkbox',
  props: ['modelValue', 'binary', 'disabled'],
  emits: ['update:modelValue'],
  template: `<input class="cb-stub" type="checkbox" :checked="modelValue" :disabled="disabled"
    @change="$emit('update:modelValue', $event.target.checked)" />`,
};
const InputTextStub = {
  name: 'InputText',
  props: ['modelValue', 'placeholder', 'size'],
  emits: ['update:modelValue'],
  template: `<input class="it-stub" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`,
};
const PaginatorStub = {
  name: 'Paginator',
  props: ['first', 'rows', 'totalRecords', 'template'],
  template: `<div class="pg-stub" />`,
};

const COLUMNS = [
  { field: 'a', header: 'A', width: '120px' },
  { field: 'b', header: 'B', minWidth: '100px' },
  { field: 'c', header: 'C' }, // no width → 80px fallback
];

const DATA = [
  { id: 1, a: 'x1', b: 'y1', c: 'z1' },
  { id: 2, a: 'x2', b: 'y2', c: 'z2' },
  { id: 3, a: 'x3', b: 'y3', c: 'z3' },
  { id: 4, a: 'x4', b: 'y4', c: 'z4' },
];

function mountTable(props = {}) {
  return mount(CrudTable, {
    props: {
      columns: COLUMNS,
      data: DATA,
      idField: 'id',
      tableKey: 'test-table',
      ...props,
    },
    global: {
      stubs: {
        DataTable: DataTableStub,
        Column: ColumnStub,
        Button: ButtonStub,
        Checkbox: CheckboxStub,
        InputText: InputTextStub,
        Paginator: PaginatorStub,
      },
      directives: { tooltip: {} },
    },
  });
}

const PREF_KEY = 'badb:pref:crud:visible-rows:test-table:42';

beforeEach(() => {
  localStorage.clear();
});

describe('CrudTable.vue — «Строк в окне»', () => {
  it('defaults to 20 with options 5/20/50/Все', () => {
    const wrapper = mountTable();
    const select = wrapper.find('select.ct-rows-select');
    expect(select.element.value).toBe('20');
    const labels = select.findAll('option').map(o => o.text());
    expect(labels).toEqual(['5', '20', '50', 'Все']);
  });

  it('keeps a stored legacy pref (25) working as an extra sorted option', () => {
    localStorage.setItem(PREF_KEY, '25');
    const wrapper = mountTable();
    const select = wrapper.find('select.ct-rows-select');
    expect(select.element.value).toBe('25');
    const labels = select.findAll('option').map(o => o.text());
    expect(labels).toEqual(['5', '20', '25', '50', 'Все']);
  });

  it('keeps the -1 («Все») sentinel valid', () => {
    localStorage.setItem(PREF_KEY, '-1');
    const wrapper = mountTable();
    const select = wrapper.find('select.ct-rows-select');
    expect(select.element.value).toBe('-1');
    expect(select.findAll('option').map(o => o.text())).toEqual(['5', '20', '50', 'Все']);
  });

  it('falls back to 20 on a corrupted stored value', () => {
    localStorage.setItem(PREF_KEY, '0');
    const wrapper = mountTable();
    expect(wrapper.find('select.ct-rows-select').element.value).toBe('20');
  });
});

describe('CrudTable.vue — shrink-to-fit on column deselect', () => {
  async function hideColumn(wrapper, field) {
    // Open the columns menu (first ct-toolbar-btn = «Колонки»)
    await wrapper.findAll('button.ct-toolbar-btn')[0].trigger('click');
    const items = wrapper.findAll('label.ct-columns-item');
    const idx = COLUMNS.findIndex(c => c.field === field);
    await items[idx].find('input.cb-stub').setValue(false);
  }

  it('no constraint while all columns are visible', () => {
    const wrapper = mountTable();
    expect(wrapper.find('.ct-table-card').classes()).not.toContain('ct-table-card--shrink');
    expect(wrapper.findComponent(DataTableStub).props('tableStyle')).toBeUndefined();
  });

  it('hiding a column activates shrink mode with summed width', async () => {
    const wrapper = mountTable();
    await hideColumn(wrapper, 'c');
    expect(wrapper.find('.ct-table-card').classes()).toContain('ct-table-card--shrink');
    // № 50 + a 120 + b 100 = 270 (hidden c excluded)
    expect(wrapper.findComponent(DataTableStub).props('tableStyle')).toEqual({ width: '270px' });
  });

  it('uses the 80px fallback for columns without declared width', async () => {
    const wrapper = mountTable();
    await hideColumn(wrapper, 'a');
    // № 50 + b 100 + c 80 = 230
    expect(wrapper.findComponent(DataTableStub).props('tableStyle')).toEqual({ width: '230px' });
  });
});

describe('CrudTable.vue — selection-only lens («Выбрано: N — показать»)', () => {
  it('toggle is hidden while nothing is selected', () => {
    const wrapper = mountTable();
    expect(wrapper.find('.ct-selection-toggle').exists()).toBe(false);
  });

  it('appears with the selection count and filters to selected rows', async () => {
    const wrapper = mountTable();
    wrapper.vm.selectedRows.add(1);
    wrapper.vm.selectedRows.add(3);
    await nextTick();

    const toggle = wrapper.find('.ct-selection-toggle');
    expect(toggle.exists()).toBe(true);
    expect(toggle.text()).toBe('Выбрано: 2 — показать');
    expect(wrapper.vm.filteredData).toHaveLength(4);

    await toggle.trigger('click');
    expect(wrapper.find('.ct-selection-toggle').text()).toBe('Выбрано: 2 — все строки');
    expect(wrapper.find('.ct-selection-toggle').classes()).toContain('is-active');
    // Original order preserved, only selected rows remain
    expect(wrapper.vm.filteredData.map(r => r.id)).toEqual([1, 3]);
  });

  it('clicking again restores the full list', async () => {
    const wrapper = mountTable();
    wrapper.vm.selectedRows.add(2);
    await nextTick();
    await wrapper.find('.ct-selection-toggle').trigger('click');
    expect(wrapper.vm.filteredData).toHaveLength(1);
    await wrapper.find('.ct-selection-toggle').trigger('click');
    expect(wrapper.vm.filteredData).toHaveLength(4);
    expect(wrapper.find('.ct-selection-toggle').classes()).not.toContain('is-active');
  });

  it('auto-exits the mode when the selection empties', async () => {
    const wrapper = mountTable();
    wrapper.vm.selectedRows.add(1);
    await nextTick();
    await wrapper.find('.ct-selection-toggle').trigger('click');
    expect(wrapper.vm.filteredData).toHaveLength(1);

    wrapper.vm.clearSelection();
    await nextTick();
    // Toggle gone, full list back
    expect(wrapper.find('.ct-selection-toggle').exists()).toBe(false);
    expect(wrapper.vm.filteredData).toHaveLength(4);

    // Re-selecting starts in the OFF state (mode was reset, not latent)
    wrapper.vm.selectedRows.add(2);
    await nextTick();
    expect(wrapper.find('.ct-selection-toggle').text()).toBe('Выбрано: 1 — показать');
    expect(wrapper.vm.filteredData).toHaveLength(4);
  });
});
