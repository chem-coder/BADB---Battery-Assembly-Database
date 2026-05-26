// Component test for src/components/parity/EditableTitle.vue
//
// Verifies: click toggles to input → Enter commits via v-model + 'commit'
// event → blur also commits → Escape cancels (no event).

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import EditableTitle from '@/components/parity/EditableTitle.vue';

function mountTitle(props = {}) {
  return mount(EditableTitle, {
    props: { modelValue: 'Initial', ...props },
  });
}

describe('EditableTitle.vue', () => {
  it('renders modelValue as span when not editing', () => {
    const wrapper = mountTitle({ modelValue: 'Hello' });
    expect(wrapper.find('span.editable-title').text()).toBe('Hello');
    expect(wrapper.find('input.editable-title-input').exists()).toBe(false);
  });

  it('renders placeholder when modelValue is empty', () => {
    const wrapper = mountTitle({ modelValue: '', placeholder: 'Type here' });
    expect(wrapper.find('span.editable-title').text()).toBe('Type here');
  });

  it('renders dash when modelValue and placeholder both empty', () => {
    const wrapper = mountTitle({ modelValue: '' });
    expect(wrapper.find('span.editable-title').text()).toBe('—');
  });

  it('click on span enters editing mode with input visible', async () => {
    const wrapper = mountTitle();
    await wrapper.find('span.editable-title').trigger('click');
    expect(wrapper.find('input.editable-title-input').exists()).toBe(true);
    expect(wrapper.find('span.editable-title').exists()).toBe(false);
  });

  it('Enter commits new value via update:modelValue and commit events', async () => {
    const wrapper = mountTitle({ modelValue: 'Old' });
    await wrapper.find('span').trigger('click');
    const input = wrapper.find('input');
    await input.setValue('New');
    await input.trigger('keydown', { key: 'Enter' });

    const emitted = wrapper.emitted();
    expect(emitted['update:modelValue']).toEqual([['New']]);
    expect(emitted.commit).toEqual([['New']]);
  });

  it('blur commits new value', async () => {
    const wrapper = mountTitle({ modelValue: 'Old' });
    await wrapper.find('span').trigger('click');
    const input = wrapper.find('input');
    await input.setValue('Changed');
    await input.trigger('blur');

    expect(wrapper.emitted()['update:modelValue']).toEqual([['Changed']]);
  });

  it('Escape cancels without emitting commit', async () => {
    const wrapper = mountTitle({ modelValue: 'Old' });
    await wrapper.find('span').trigger('click');
    const input = wrapper.find('input');
    await input.setValue('Discarded');
    await input.trigger('keydown', { key: 'Escape' });

    expect(wrapper.emitted().commit).toBeUndefined();
    expect(wrapper.emitted()['update:modelValue']).toBeUndefined();
  });

  it('does not emit when value is unchanged on commit', async () => {
    const wrapper = mountTitle({ modelValue: 'Same' });
    await wrapper.find('span').trigger('click');
    const input = wrapper.find('input');
    // value already "Same" from initial; just blur
    await input.trigger('blur');

    expect(wrapper.emitted().commit).toBeUndefined();
  });

  it('trims whitespace before emitting', async () => {
    const wrapper = mountTitle({ modelValue: 'Old' });
    await wrapper.find('span').trigger('click');
    const input = wrapper.find('input');
    await input.setValue('  Spaced  ');
    await input.trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted()['update:modelValue']).toEqual([['Spaced']]);
  });

  it('disabled prop prevents entering edit mode', async () => {
    const wrapper = mountTitle({ disabled: true });
    await wrapper.find('span').trigger('click');
    expect(wrapper.find('input').exists()).toBe(false);
  });
});
