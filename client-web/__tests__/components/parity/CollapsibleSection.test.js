// Component test for src/components/parity/CollapsibleSection.vue
//
// Fourth Phase A primitive. Tests:
//   1. open / collapsed default state
//   2. toggle on header click + keyboard
//   3. persistKey writes to localStorage via useUserPref
//   4. local-only state when persistKey is empty
//   5. count + icon + disabled rendering

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import CollapsibleSection from '@/components/parity/CollapsibleSection.vue';

function makeWrapper(props = {}, slotContent = '<div class="cs-test-body">body</div>') {
  return mount(CollapsibleSection, {
    props: { title: 'Сухое смешивание', ...props },
    slots: { default: slotContent },
  });
}

describe('CollapsibleSection.vue', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('default state', () => {
    it('starts open by default', () => {
      const wrapper = makeWrapper();
      expect(wrapper.find('.cs-body').exists()).toBe(true);
      expect(wrapper.find('.cs-header').attributes('aria-expanded')).toBe('true');
      expect(wrapper.find('.pi-chevron-down').exists()).toBe(true);
    });

    it('starts collapsed when collapsedByDefault=true', () => {
      const wrapper = makeWrapper({ collapsedByDefault: true });
      expect(wrapper.find('.cs-body').exists()).toBe(false);
      expect(wrapper.find('.cs-header').attributes('aria-expanded')).toBe('false');
      expect(wrapper.find('.pi-chevron-right').exists()).toBe(true);
    });
  });

  describe('toggling', () => {
    it('toggles on header click', async () => {
      const wrapper = makeWrapper();
      const header = wrapper.find('.cs-header');
      expect(wrapper.find('.cs-body').exists()).toBe(true);
      await header.trigger('click');
      expect(wrapper.find('.cs-body').exists()).toBe(false);
      await header.trigger('click');
      expect(wrapper.find('.cs-body').exists()).toBe(true);
    });

    it('emits update:collapsed on toggle', async () => {
      const wrapper = makeWrapper();
      await wrapper.find('.cs-header').trigger('click');
      const events = wrapper.emitted('update:collapsed');
      expect(events).toBeTruthy();
      expect(events.at(-1)).toEqual([true]);
      await wrapper.find('.cs-header').trigger('click');
      expect(wrapper.emitted('update:collapsed').at(-1)).toEqual([false]);
    });

    it('respects disabled — no toggle, no chevron', async () => {
      const wrapper = makeWrapper({ disabled: true });
      const header = wrapper.find('.cs-header');
      expect(header.attributes('disabled')).toBeDefined();
      expect(wrapper.find('.cs-chevron').exists()).toBe(false);
      await header.trigger('click');
      expect(wrapper.find('.cs-body').exists()).toBe(true); // unchanged
    });
  });

  describe('persistKey + useUserPref', () => {
    it('writes to localStorage namespaced by guest on toggle', async () => {
      const wrapper = makeWrapper({ persistKey: 'mixing-dry' });
      await wrapper.find('.cs-header').trigger('click');
      const stored = localStorage.getItem('badb:pref:section:mixing-dry:guest');
      expect(stored).toBe('true');
    });

    it('reads initial state from localStorage', () => {
      localStorage.setItem('badb:pref:section:mixing-dry:guest', 'true');
      const wrapper = makeWrapper({ persistKey: 'mixing-dry' });
      expect(wrapper.find('.cs-body').exists()).toBe(false);
    });

    it('does NOT write to localStorage when persistKey is empty', async () => {
      const wrapper = makeWrapper(); // no persistKey
      await wrapper.find('.cs-header').trigger('click');
      // No key should have been written.
      const keys = Object.keys(localStorage).filter((k) => k.startsWith('badb:'));
      expect(keys).toEqual([]);
    });
  });

  describe('rendering', () => {
    it('renders title text', () => {
      const wrapper = makeWrapper({ title: 'Влажное смешивание' });
      expect(wrapper.find('.cs-title').text()).toBe('Влажное смешивание');
    });

    it('renders count badge when count is provided', () => {
      const wrapper = makeWrapper({ count: 5 });
      expect(wrapper.find('.cs-count').text()).toBe('5');
    });

    it('omits count badge when count is null', () => {
      const wrapper = makeWrapper();
      expect(wrapper.find('.cs-count').exists()).toBe(false);
    });

    it('renders icon when icon prop is set', () => {
      const wrapper = makeWrapper({ icon: 'pi-flask' });
      expect(wrapper.find('.cs-icon.pi-flask').exists()).toBe(true);
    });

    it('renders default slot content', () => {
      const wrapper = makeWrapper({}, '<div class="user-content">hello</div>');
      expect(wrapper.find('.user-content').text()).toBe('hello');
    });
  });
});
