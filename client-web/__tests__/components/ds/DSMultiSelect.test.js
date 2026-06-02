import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DSMultiSelect from '@/components/ds/DSMultiSelect.vue';

// Stub PrimeVue MultiSelect so we can assert the props DSMultiSelect
// forwards, without pulling the full component / theme into the test.
const MultiSelectStub = {
  name: 'MultiSelect',
  props: {
    modelValue: { default: undefined },
    options: { default: undefined },
    optionLabel: { default: undefined },
    optionValue: { default: undefined },
    placeholder: { default: undefined },
    scrollHeight: { default: undefined },
    maxSelectedLabels: { default: undefined },
    selectedItemsLabel: { default: undefined },
    // Boolean-typed so a valueless `show-clear` / `filter` attribute
    // coerces to true (same as PrimeVue), not the empty string ''.
    filter: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
    showClear: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  template: '<div class="ms-stub" @click="$emit(\'update:modelValue\', [1,2])" />',
};

function mountDS(props = {}) {
  return mount(DSMultiSelect, {
    props,
    global: { stubs: { MultiSelect: MultiSelectStub } },
  });
}

describe('DSMultiSelect — encapsulated defaults', () => {
  it('forces the project MultiSelect behaviour (no chip, counter, clear)', () => {
    const ms = mountDS({ options: [], modelValue: [] }).findComponent(MultiSelectStub);
    // maxSelectedLabels=1 + counter label is exactly the «no chip» mode:
    // one selection shows its name, 2+ collapse to «Выбрано: N». No
    // `display="chip"` is ever forwarded.
    expect(ms.props('maxSelectedLabels')).toBe(1);
    expect(ms.props('selectedItemsLabel')).toBe('Выбрано: {0}');
    expect(ms.props('showClear')).toBe(true);
  });

  it('defaults optionLabel/optionValue to the { label, value } convention', () => {
    const ms = mountDS({ options: [] }).findComponent(MultiSelectStub);
    expect(ms.props('optionLabel')).toBe('label');
    expect(ms.props('optionValue')).toBe('value');
  });

  it('auto-enables filter only once options exceed the threshold (default 6)', () => {
    const few = mountDS({ options: Array.from({ length: 6 }, (_, i) => ({ value: i, label: `o${i}` })) });
    expect(few.findComponent(MultiSelectStub).props('filter')).toBe(false);

    const many = mountDS({ options: Array.from({ length: 7 }, (_, i) => ({ value: i, label: `o${i}` })) });
    expect(many.findComponent(MultiSelectStub).props('filter')).toBe(true);
  });

  it('respects a custom filterThreshold', () => {
    const w = mountDS({
      filterThreshold: 2,
      options: [{ value: 1, label: 'a' }, { value: 2, label: 'b' }, { value: 3, label: 'c' }],
    });
    expect(w.findComponent(MultiSelectStub).props('filter')).toBe(true);
  });

  it('coerces a null modelValue to an empty array', () => {
    const ms = mountDS({ modelValue: null, options: [] }).findComponent(MultiSelectStub);
    expect(ms.props('modelValue')).toEqual([]);
  });

  it('re-emits update:modelValue from the inner MultiSelect', async () => {
    const w = mountDS({ modelValue: [], options: [] });
    await w.find('.ms-stub').trigger('click');
    expect(w.emitted('update:modelValue')[0]).toEqual([[1, 2]]);
  });

  it('forwards scrollHeight (default 200px) for dense constructor cells', () => {
    expect(mountDS({ options: [] }).findComponent(MultiSelectStub).props('scrollHeight')).toBe('200px');
    expect(mountDS({ options: [], scrollHeight: '120px' }).findComponent(MultiSelectStub).props('scrollHeight')).toBe('120px');
  });
});
