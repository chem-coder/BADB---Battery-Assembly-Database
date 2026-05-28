// Component test for src/components/parity/BulkMassesGrid.vue
//
// Sixth Phase A primitive. Tests:
//   1. Renders rows from modelValue
//   2. Add / remove row events
//   3. Inline input updates emit update:modelValue with parsed values
//   4. Bulk-paste replaces rows via parseBulkPaste
//   5. Column toggles (showCupNumber / showComments)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import BulkMassesGrid from '@/components/parity/BulkMassesGrid.vue';

function makeWrapper(props = {}) {
  return mount(BulkMassesGrid, { props });
}

describe('BulkMassesGrid.vue', () => {
  describe('rendering', () => {
    it('renders empty state when modelValue is []', () => {
      const wrapper = makeWrapper({ modelValue: [] });
      expect(wrapper.find('.bmg-empty').exists()).toBe(true);
      expect(wrapper.findAll('.bmg-tr')).toHaveLength(0);
    });

    it('renders one row per modelValue item', () => {
      const wrapper = makeWrapper({
        modelValue: [
          { mass_g: 1.23, cup_number: 1, comments: '' },
          { mass_g: 2.34, cup_number: 2, comments: 'note' },
        ],
      });
      expect(wrapper.findAll('.bmg-tr')).toHaveLength(2);
    });

    it('formats mass with Russian decimal comma', () => {
      const wrapper = makeWrapper({
        modelValue: [{ mass_g: 1.23, cup_number: 1, comments: '' }],
      });
      const massInput = wrapper.find('.bmg-input--mass');
      expect(massInput.element.value).toBe('1,23');
    });

    it('hides cup_number column when showCupNumber=false', () => {
      const wrapper = makeWrapper({
        modelValue: [{ mass_g: 1, cup_number: 1, comments: '' }],
        showCupNumber: false,
      });
      expect(wrapper.find('.bmg-th--cup').exists()).toBe(false);
    });

    it('hides comments column when showComments=false', () => {
      const wrapper = makeWrapper({
        modelValue: [{ mass_g: 1, cup_number: 1, comments: '' }],
        showComments: false,
      });
      expect(wrapper.find('.bmg-th--comments').exists()).toBe(false);
    });
  });

  describe('add / remove', () => {
    it('emits update:modelValue with a new blank row when «Добавить» is clicked', async () => {
      const wrapper = makeWrapper({ modelValue: [] });
      await wrapper.find('.bmg-btn').trigger('click');
      const events = wrapper.emitted('update:modelValue');
      expect(events).toHaveLength(1);
      expect(events[0][0]).toEqual([{ mass_g: null, cup_number: null, comments: '' }]);
    });

    it('emits update:modelValue without the removed row', async () => {
      const wrapper = makeWrapper({
        modelValue: [
          { mass_g: 1, cup_number: 1, comments: '' },
          { mass_g: 2, cup_number: 2, comments: '' },
        ],
      });
      await wrapper.findAll('.bmg-del-btn')[0].trigger('click');
      const events = wrapper.emitted('update:modelValue');
      expect(events).toHaveLength(1);
      expect(events[0][0]).toEqual([{ mass_g: 2, cup_number: 2, comments: '' }]);
    });
  });

  describe('inline edits', () => {
    it('parses Russian decimal comma on mass input', async () => {
      const wrapper = makeWrapper({
        modelValue: [{ mass_g: null, cup_number: null, comments: '' }],
      });
      const massInput = wrapper.find('.bmg-input--mass');
      await massInput.setValue('3,14');
      const events = wrapper.emitted('update:modelValue');
      expect(events.at(-1)[0][0].mass_g).toBeCloseTo(3.14);
    });

    it('parses dot decimal on mass input', async () => {
      const wrapper = makeWrapper({
        modelValue: [{ mass_g: null, cup_number: null, comments: '' }],
      });
      const massInput = wrapper.find('.bmg-input--mass');
      await massInput.setValue('3.14');
      const events = wrapper.emitted('update:modelValue');
      expect(events.at(-1)[0][0].mass_g).toBeCloseTo(3.14);
    });

    it('clears mass to null when input is empty', async () => {
      const wrapper = makeWrapper({
        modelValue: [{ mass_g: 1.23, cup_number: 1, comments: '' }],
      });
      const massInput = wrapper.find('.bmg-input--mass');
      await massInput.setValue('');
      const events = wrapper.emitted('update:modelValue');
      expect(events.at(-1)[0][0].mass_g).toBeNull();
    });

    it('updates cup_number as integer', async () => {
      const wrapper = makeWrapper({
        modelValue: [{ mass_g: 1, cup_number: null, comments: '' }],
      });
      const cupInput = wrapper.findAll('.bmg-input')[1]; // mass, cup, comments
      await cupInput.setValue('7');
      const events = wrapper.emitted('update:modelValue');
      expect(events.at(-1)[0][0].cup_number).toBe(7);
    });

    it('updates comments as string', async () => {
      const wrapper = makeWrapper({
        modelValue: [{ mass_g: 1, cup_number: 1, comments: '' }],
      });
      const inputs = wrapper.findAll('.bmg-input');
      const commentsInput = inputs[2];
      await commentsInput.setValue('катод A');
      const events = wrapper.emitted('update:modelValue');
      expect(events.at(-1)[0][0].comments).toBe('катод A');
    });
  });

  describe('bulk-paste', () => {
    let confirmSpy;
    beforeEach(() => {
      confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    });
    afterEach(() => {
      confirmSpy.mockRestore();
    });

    function pasteText(wrapper, text) {
      const event = new Event('paste', { bubbles: true });
      // jsdom doesn't ship ClipboardEvent; fake clipboardData ourselves.
      Object.defineProperty(event, 'clipboardData', {
        value: { getData: () => text },
      });
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
      wrapper.element.dispatchEvent(event);
      return event;
    }

    it('replaces rows when pasting multiline text from empty', async () => {
      const wrapper = makeWrapper({ modelValue: [] });
      pasteText(wrapper, '1,23\n2,34\n3,45');
      await wrapper.vm.$nextTick();

      const events = wrapper.emitted('update:modelValue');
      expect(events).toHaveLength(1);
      const rows = events[0][0];
      expect(rows).toHaveLength(3);
      expect(rows[0].mass_g).toBeCloseTo(1.23);
      expect(rows[1].mass_g).toBeCloseTo(2.34);
      expect(rows[2].mass_g).toBeCloseTo(3.45);
    });

    it('confirms before replacing existing rows', async () => {
      const wrapper = makeWrapper({
        modelValue: [{ mass_g: 9, cup_number: 9, comments: '' }],
      });
      pasteText(wrapper, '1,23\n2,34');
      await wrapper.vm.$nextTick();
      expect(confirmSpy).toHaveBeenCalled();
    });

    it('skips replacement when confirm is denied', async () => {
      confirmSpy.mockReturnValue(false);
      const wrapper = makeWrapper({
        modelValue: [{ mass_g: 9, cup_number: 9, comments: '' }],
      });
      pasteText(wrapper, '1,23\n2,34');
      await wrapper.vm.$nextTick();
      expect(wrapper.emitted('update:modelValue')).toBeFalsy();
    });

    it('ignores single-cell paste (no newline, no tab/semicolon)', async () => {
      const wrapper = makeWrapper({
        modelValue: [{ mass_g: null, cup_number: null, comments: '' }],
      });
      pasteText(wrapper, '5,67');
      await wrapper.vm.$nextTick();
      // No replacement: the input's @input handler still runs normally.
      expect(wrapper.emitted('update:modelValue')).toBeFalsy();
    });

    it('emits bulk-paste event with summary', async () => {
      const wrapper = makeWrapper({ modelValue: [] });
      pasteText(wrapper, '1,23\n2,34\n3,45');
      await wrapper.vm.$nextTick();
      const events = wrapper.emitted('bulk-paste');
      expect(events).toHaveLength(1);
      expect(events[0][0]).toEqual({ rowsAdded: 3, skipped: 0, replaced: false });
    });
  });

  describe('disabled state', () => {
    it('disables all inputs and buttons', () => {
      const wrapper = makeWrapper({
        modelValue: [{ mass_g: 1, cup_number: 1, comments: '' }],
        disabled: true,
      });
      wrapper.findAll('.bmg-input').forEach((input) => {
        expect(input.element.disabled).toBe(true);
      });
      expect(wrapper.find('.bmg-btn').element.disabled).toBe(true);
      expect(wrapper.find('.bmg-del-btn').element.disabled).toBe(true);
    });
  });
});
