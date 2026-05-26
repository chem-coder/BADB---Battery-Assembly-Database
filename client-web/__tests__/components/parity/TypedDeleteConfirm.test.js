// Component test for src/components/parity/TypedDeleteConfirm.vue
//
// Stubs Dialog/Button/InputText so we can mount without full PrimeVue
// configuration. Verifies typed-phrase gating and blocker rendering.

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TypedDeleteConfirm from '@/components/parity/TypedDeleteConfirm.vue';

const DialogStub = {
  name: 'Dialog',
  props: ['visible', 'header', 'style', 'modal', 'closable', 'draggable'],
  emits: ['update:visible'],
  template: `<div class="dialog-stub" v-if="visible">
    <h3>{{ header }}</h3>
    <div class="body"><slot /></div>
    <div class="footer"><slot name="footer" /></div>
  </div>`,
};

const ButtonStub = {
  name: 'Button',
  props: ['label', 'severity', 'outlined', 'disabled'],
  emits: ['click'],
  template: `<button
    class="btn-stub"
    :data-severity="severity"
    :data-label="label"
    :disabled="disabled"
    @click="$emit('click')">{{ label }}</button>`,
};

const InputTextStub = {
  name: 'InputText',
  props: ['modelValue', 'placeholder', 'autofocus'],
  emits: ['update:modelValue'],
  template: `<input
    class="input-stub"
    :value="modelValue"
    :placeholder="placeholder"
    @input="$emit('update:modelValue', $event.target.value)"
    @keydown.enter="$emit('keydown', $event)" />`,
};

function mountConfirm(props = {}) {
  return mount(TypedDeleteConfirm, {
    props: { visible: true, phrase: 'DELETE RECIPE 42', ...props },
    global: { stubs: { Dialog: DialogStub, Button: ButtonStub, InputText: InputTextStub } },
  });
}

describe('TypedDeleteConfirm.vue', () => {
  it('renders title and phrase when visible', () => {
    const wrapper = mountConfirm();
    expect(wrapper.text()).toContain('Подтверждение удаления');
    expect(wrapper.find('code.phrase').text()).toBe('DELETE RECIPE 42');
  });

  it('uses custom title when provided', () => {
    const wrapper = mountConfirm({ title: 'Удаление батареи' });
    expect(wrapper.text()).toContain('Удаление батареи');
  });

  it('renders description when provided', () => {
    const wrapper = mountConfirm({ description: 'Это необратимо' });
    expect(wrapper.text()).toContain('Это необратимо');
  });

  it('delete button disabled when typed phrase does not match', () => {
    const wrapper = mountConfirm();
    const deleteBtn = wrapper.findAll('.btn-stub').find((b) => b.attributes('data-label') === 'Удалить');
    expect(deleteBtn.attributes('disabled')).toBe('');
  });

  it('delete button enabled when typed phrase matches', async () => {
    const wrapper = mountConfirm();
    const input = wrapper.find('input.input-stub');
    await input.setValue('DELETE RECIPE 42');

    const deleteBtn = wrapper.findAll('.btn-stub').find((b) => b.attributes('data-label') === 'Удалить');
    expect(deleteBtn.attributes('disabled')).toBeFalsy();
  });

  it('clicking delete emits confirmed when phrase matches', async () => {
    const wrapper = mountConfirm();
    await wrapper.find('input').setValue('DELETE RECIPE 42');
    const deleteBtn = wrapper.findAll('.btn-stub').find((b) => b.attributes('data-label') === 'Удалить');
    await deleteBtn.trigger('click');

    expect(wrapper.emitted().confirmed).toHaveLength(1);
  });

  it('clicking delete does NOT emit when phrase wrong', async () => {
    const wrapper = mountConfirm();
    await wrapper.find('input').setValue('wrong');
    const deleteBtn = wrapper.findAll('.btn-stub').find((b) => b.attributes('data-label') === 'Удалить');
    await deleteBtn.trigger('click');

    expect(wrapper.emitted().confirmed).toBeUndefined();
  });

  it('cancel emits update:visible=false and cancelled', async () => {
    const wrapper = mountConfirm();
    const cancelBtn = wrapper.findAll('.btn-stub').find((b) => b.attributes('data-label') === 'Отмена');
    await cancelBtn.trigger('click');

    expect(wrapper.emitted()['update:visible']).toEqual([[false]]);
    expect(wrapper.emitted().cancelled).toHaveLength(1);
  });

  it('blockers list hides confirm button and renders items', () => {
    const wrapper = mountConfirm({ blockers: ['Lента №1', 'Лента №2'] });
    expect(wrapper.text()).toContain('Нельзя удалить');
    expect(wrapper.text()).toContain('Lента №1');
    expect(wrapper.text()).toContain('Лента №2');

    const deleteBtn = wrapper.findAll('.btn-stub').find((b) => b.attributes('data-label') === 'Удалить');
    expect(deleteBtn).toBeUndefined(); // not rendered
  });

  it('confirmEnabled=false disables confirm even when phrase matches', async () => {
    const wrapper = mountConfirm({ confirmEnabled: false });
    await wrapper.find('input').setValue('DELETE RECIPE 42');
    const deleteBtn = wrapper.findAll('.btn-stub').find((b) => b.attributes('data-label') === 'Удалить');
    expect(deleteBtn.attributes('disabled')).toBe('');
  });

  it('typed input resets when visibility changes to true', async () => {
    const wrapper = mountConfirm({ visible: false });
    await wrapper.setProps({ visible: true });
    expect(wrapper.find('input').element.value).toBe('');
  });
});
