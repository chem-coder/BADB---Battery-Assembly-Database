// Component test for src/components/parity/RowActionMenu.vue
//
// Fifth Phase A primitive. Tests:
//   1. Inline vs overflow split per `overflowAfter`
//   2. action event payload (key, rowId)
//   3. hidden actions are filtered out
//   4. overflow menu open/close + outside-click + escape
//   5. emoji vs icon precedence

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import RowActionMenu from '@/components/parity/RowActionMenu.vue';

function makeWrapper(props = {}) {
  return mount(RowActionMenu, {
    attachTo: document.body, // so document.addEventListener('click') fires
    props: {
      rowId: 42,
      actions: [
        { key: 'print', label: 'Печать отчёта', emoji: '🖨️' },
        { key: 'duplicate', label: 'Дублировать запись', emoji: '📑' },
      ],
      ...props,
    },
  });
}

describe('RowActionMenu.vue', () => {
  describe('inline rendering', () => {
    it('renders all actions inline when below overflowAfter', () => {
      const wrapper = makeWrapper();
      const buttons = wrapper.findAll('.ram-btn');
      // 2 actions + no overflow → 2 buttons total
      expect(buttons).toHaveLength(2);
      expect(wrapper.find('.ram-btn--overflow').exists()).toBe(false);
    });

    it('respects overflowAfter', () => {
      const wrapper = makeWrapper({
        overflowAfter: 1,
        actions: [
          { key: 'a', label: 'A', emoji: 'A' },
          { key: 'b', label: 'B', emoji: 'B' },
          { key: 'c', label: 'C', emoji: 'C' },
        ],
      });
      // Inline: 1 + overflow button = 2 buttons rendered, 2 in overflow menu (hidden)
      const inlineButtons = wrapper.findAll('.ram > .ram-btn');
      expect(inlineButtons).toHaveLength(1);
      expect(wrapper.find('.ram-btn--overflow').exists()).toBe(true);
    });

    it('filters out hidden actions', () => {
      const wrapper = makeWrapper({
        actions: [
          { key: 'a', label: 'A', emoji: 'A' },
          { key: 'b', label: 'B', emoji: 'B', hidden: true },
          { key: 'c', label: 'C', emoji: 'C' },
        ],
      });
      const buttons = wrapper.findAll('.ram-btn');
      // hidden 'b' dropped → 2 visible
      expect(buttons).toHaveLength(2);
    });

    it('drops actions missing the key field', () => {
      const wrapper = makeWrapper({
        actions: [
          { key: 'a', label: 'A', emoji: 'A' },
          { label: 'no-key', emoji: '?' },
        ],
      });
      const buttons = wrapper.findAll('.ram-btn');
      expect(buttons).toHaveLength(1);
    });
  });

  describe('action event', () => {
    it('emits action with key + rowId on inline button click', async () => {
      const wrapper = makeWrapper();
      const printBtn = wrapper.findAll('.ram-btn')[0];
      await printBtn.trigger('click');
      const events = wrapper.emitted('action');
      expect(events).toHaveLength(1);
      expect(events[0][0]).toEqual({ key: 'print', rowId: 42 });
    });

    it('emits action with key + rowId from overflow menu item', async () => {
      const wrapper = makeWrapper({
        overflowAfter: 0,
        actions: [{ key: 'arch', label: 'Архив', icon: 'pi-archive' }],
      });
      await wrapper.find('.ram-btn--overflow').trigger('click');
      await wrapper.find('.ram-menu-item').trigger('click');
      const events = wrapper.emitted('action');
      expect(events).toHaveLength(1);
      expect(events[0][0]).toEqual({ key: 'arch', rowId: 42 });
    });

    it('passes the rowId of the bound row', async () => {
      const wrapper = makeWrapper({ rowId: 'abc-123' });
      await wrapper.findAll('.ram-btn')[0].trigger('click');
      expect(wrapper.emitted('action')[0][0].rowId).toBe('abc-123');
    });
  });

  describe('overflow menu', () => {
    it('opens when ⋮ is clicked', async () => {
      const wrapper = makeWrapper({
        overflowAfter: 0,
        actions: [{ key: 'arch', label: 'Архив', icon: 'pi-archive' }],
      });
      expect(wrapper.find('.ram-menu').exists()).toBe(false);
      await wrapper.find('.ram-btn--overflow').trigger('click');
      expect(wrapper.find('.ram-menu').exists()).toBe(true);
    });

    it('closes when an item is selected', async () => {
      const wrapper = makeWrapper({
        overflowAfter: 0,
        actions: [{ key: 'arch', label: 'Архив' }],
      });
      await wrapper.find('.ram-btn--overflow').trigger('click');
      await wrapper.find('.ram-menu-item').trigger('click');
      expect(wrapper.find('.ram-menu').exists()).toBe(false);
    });

    it('closes on Escape', async () => {
      const wrapper = makeWrapper({
        overflowAfter: 0,
        actions: [{ key: 'arch', label: 'Архив' }],
      });
      await wrapper.find('.ram-btn--overflow').trigger('click');
      expect(wrapper.find('.ram-menu').exists()).toBe(true);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await wrapper.vm.$nextTick();
      expect(wrapper.find('.ram-menu').exists()).toBe(false);
    });

    it('closes on outside click', async () => {
      const wrapper = makeWrapper({
        overflowAfter: 0,
        actions: [{ key: 'arch', label: 'Архив' }],
      });
      await wrapper.find('.ram-btn--overflow').trigger('click');
      expect(wrapper.find('.ram-menu').exists()).toBe(true);

      // Simulate a click outside the menu.
      const outsideEl = document.createElement('div');
      document.body.appendChild(outsideEl);
      outsideEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wrapper.vm.$nextTick();
      expect(wrapper.find('.ram-menu').exists()).toBe(false);
      outsideEl.remove();
    });
  });

  describe('icon vs emoji', () => {
    it('renders emoji when present', () => {
      const wrapper = makeWrapper({
        actions: [{ key: 'a', label: 'A', emoji: '🚀' }],
      });
      expect(wrapper.find('.ram-emoji').text()).toBe('🚀');
    });

    it('renders pi icon when only icon set', () => {
      const wrapper = makeWrapper({
        actions: [{ key: 'a', label: 'A', icon: 'pi-print' }],
      });
      expect(wrapper.find('.pi-print').exists()).toBe(true);
      expect(wrapper.find('.ram-emoji').exists()).toBe(false);
    });

    it('emoji takes precedence over icon when both set', () => {
      const wrapper = makeWrapper({
        actions: [{ key: 'a', label: 'A', emoji: '🖨️', icon: 'pi-print' }],
      });
      expect(wrapper.find('.ram-emoji').exists()).toBe(true);
      expect(wrapper.find('.pi-print').exists()).toBe(false);
    });

    it('falls back to first letter of label when neither set', () => {
      const wrapper = makeWrapper({
        actions: [{ key: 'a', label: 'Архив' }],
      });
      expect(wrapper.find('.ram-fallback').text()).toBe('А');
    });
  });

  describe('accessibility', () => {
    it('sets aria-label and title on inline buttons', () => {
      const wrapper = makeWrapper();
      const btn = wrapper.findAll('.ram-btn')[0];
      expect(btn.attributes('title')).toBe('Печать отчёта');
      expect(btn.attributes('aria-label')).toBe('Печать отчёта');
    });

    it('sets aria-expanded on overflow button', async () => {
      const wrapper = makeWrapper({
        overflowAfter: 0,
        actions: [{ key: 'arch', label: 'Архив' }],
      });
      const overflowBtn = wrapper.find('.ram-btn--overflow');
      expect(overflowBtn.attributes('aria-expanded')).toBe('false');
      await overflowBtn.trigger('click');
      expect(overflowBtn.attributes('aria-expanded')).toBe('true');
    });
  });
});
