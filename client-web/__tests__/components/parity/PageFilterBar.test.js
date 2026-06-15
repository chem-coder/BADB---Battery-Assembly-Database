// Component test for src/components/parity/PageFilterBar.vue
//
// Verifies the filter strip emits state changes, resets correctly, and
// renders the count line per the convention in
// docs/instructions/vanilla_ui_patterns.md §"Filter Layout".

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PageFilterBar from '@/components/parity/PageFilterBar.vue';

const FILTERS = [
  { field: 'text', type: 'text', placeholder: 'Search', label: 'Поиск' },
  {
    field: 'role',
    type: 'select',
    label: 'Роль',
    options: [
      { value: 'cathode', label: 'катод' },
      { value: 'anode', label: 'анод' },
    ],
    emptyOption: 'Все роли',
  },
];

function mountBar(props = {}) {
  return mount(PageFilterBar, {
    props: { filters: FILTERS, total: 10, shown: 10, ...props },
  });
}

describe('PageFilterBar.vue', () => {
  it('renders all filter fields', () => {
    const wrapper = mountBar();
    expect(wrapper.find('input[type="search"]').exists()).toBe(true);
    expect(wrapper.find('select').exists()).toBe(true);
  });

  it('renders labels for filter fields', () => {
    const wrapper = mountBar();
    expect(wrapper.text()).toContain('Поиск');
    expect(wrapper.text()).toContain('Роль');
  });

  it('renders empty-option for select filters', () => {
    const wrapper = mountBar();
    expect(wrapper.find('select').text()).toContain('Все роли');
  });

  it('shows "Всего: N" when no filter active', () => {
    const wrapper = mountBar({ total: 10, shown: 10 });
    expect(wrapper.find('.filter-count').text()).toBe('Всего: 10');
  });

  it('shows "Показано N из M" when filter is active and counts differ', async () => {
    const wrapper = mountBar({ total: 10, shown: 4 });
    await wrapper.find('input[type="search"]').setValue('foo');
    expect(wrapper.find('.filter-count').text()).toBe('Показано 4 из 10');
  });

  it('emits update:state when text filter changes', async () => {
    const wrapper = mountBar();
    await wrapper.find('input[type="search"]').setValue('hello');

    const emissions = wrapper.emitted()['update:state'];
    expect(emissions).toBeDefined();
    const last = emissions[emissions.length - 1][0];
    expect(last.text).toBe('hello');
  });

  it('emits update:state when select changes', async () => {
    const wrapper = mountBar();
    await wrapper.find('select').setValue('cathode');

    const emissions = wrapper.emitted()['update:state'];
    const last = emissions[emissions.length - 1][0];
    expect(last.role).toBe('cathode');
  });

  it('reset button clears all filters and emits reset', async () => {
    const wrapper = mountBar();
    await wrapper.find('input[type="search"]').setValue('hello');
    await wrapper.find('select').setValue('cathode');

    await wrapper.find('.filter-reset').trigger('click');

    expect(wrapper.find('input[type="search"]').element.value).toBe('');
    expect(wrapper.find('select').element.value).toBe('');
    expect(wrapper.emitted().reset).toHaveLength(1);
  });

  it('reset button has correct tooltip', () => {
    const wrapper = mountBar();
    const btn = wrapper.find('.filter-reset');
    expect(btn.attributes('title')).toBe('Сбросить фильтры');
    expect(btn.attributes('aria-label')).toBe('Сбросить фильтры');
  });

  it('count line is positioned BELOW filter controls', () => {
    const wrapper = mountBar();
    const html = wrapper.html();
    const controlsIdx = html.indexOf('filter-controls');
    const countIdx = html.indexOf('filter-count');
    expect(controlsIdx).toBeLessThan(countIdx);
  });
});
