// Component test for src/components/StatusBadge.vue
//
// StatusBadge is a small presentational component used across the app
// (HomePage activity feed, AssemblyPage status column, etc.). It maps
// a status string to a localized label + PrimeVue Tag severity.
//
// We mount it with @vue/test-utils + jsdom and verify the rendered
// label text. We don't test PrimeVue's internals (Tag is just a wrapper)
// — only that StatusBadge passes the right props down.

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import StatusBadge from '@/components/StatusBadge.vue';

// PrimeVue Tag component requires registration. We stub it as a simple
// passthrough so we can inspect the props StatusBadge passes to it.
// This is more robust than mounting real PrimeVue (which needs config
// + theme + icon registration in tests).
const TagStub = {
  name: 'Tag',
  props: ['value', 'severity', 'rounded'],
  template: `<span class="tag-stub" :data-value="value" :data-severity="severity">{{ value }}</span>`,
};

function mountBadge(status) {
  return mount(StatusBadge, {
    props: { status },
    global: {
      stubs: { Tag: TagStub },
    },
  });
}

describe('StatusBadge.vue', () => {
  describe('known statuses → mapped label + severity', () => {
    it('"active" → "Активно" with severity=success', () => {
      const wrapper = mountBadge('active');
      const tag = wrapper.find('.tag-stub');
      expect(tag.attributes('data-value')).toBe('Активно');
      expect(tag.attributes('data-severity')).toBe('success');
    });

    it('"draft" → "Черновик" with severity=secondary', () => {
      const wrapper = mountBadge('draft');
      const tag = wrapper.find('.tag-stub');
      expect(tag.attributes('data-value')).toBe('Черновик');
      expect(tag.attributes('data-severity')).toBe('secondary');
    });

    it('"rejected" → "Отклонено" with severity=danger', () => {
      const wrapper = mountBadge('rejected');
      const tag = wrapper.find('.tag-stub');
      expect(tag.attributes('data-value')).toBe('Отклонено');
      expect(tag.attributes('data-severity')).toBe('danger');
    });

    it('"processing" → "Обработка" with severity=warn', () => {
      const wrapper = mountBadge('processing');
      const tag = wrapper.find('.tag-stub');
      expect(tag.attributes('data-value')).toBe('Обработка');
      expect(tag.attributes('data-severity')).toBe('warn');
    });

    it('"error" → "Ошибка" with severity=danger', () => {
      const wrapper = mountBadge('error');
      const tag = wrapper.find('.tag-stub');
      expect(tag.attributes('data-value')).toBe('Ошибка');
      expect(tag.attributes('data-severity')).toBe('danger');
    });

    it('"accepted" → "Принято" with severity=success', () => {
      const wrapper = mountBadge('accepted');
      const tag = wrapper.find('.tag-stub');
      expect(tag.attributes('data-value')).toBe('Принято');
      expect(tag.attributes('data-severity')).toBe('success');
    });

    it('"inactive" → "Неактивен" with severity=secondary', () => {
      const wrapper = mountBadge('inactive');
      const tag = wrapper.find('.tag-stub');
      expect(tag.attributes('data-value')).toBe('Неактивен');
      expect(tag.attributes('data-severity')).toBe('secondary');
    });

    it('"ready" → "Готово" with severity=success', () => {
      const wrapper = mountBadge('ready');
      const tag = wrapper.find('.tag-stub');
      expect(tag.attributes('data-value')).toBe('Готово');
      expect(tag.attributes('data-severity')).toBe('success');
    });
  });

  describe('unknown statuses', () => {
    it('falls back to raw status as label', () => {
      const wrapper = mountBadge('unknown_status');
      const tag = wrapper.find('.tag-stub');
      expect(tag.attributes('data-value')).toBe('unknown_status');
    });

    it('falls back to severity=secondary for unknown', () => {
      const wrapper = mountBadge('unknown_status');
      const tag = wrapper.find('.tag-stub');
      expect(tag.attributes('data-severity')).toBe('secondary');
    });
  });

  describe('empty / default props', () => {
    it('handles empty string status gracefully', () => {
      const wrapper = mountBadge('');
      const tag = wrapper.find('.tag-stub');
      expect(tag.attributes('data-value')).toBe('');
      expect(tag.attributes('data-severity')).toBe('secondary');
    });

    it('uses default empty string when prop omitted', () => {
      const wrapper = mount(StatusBadge, {
        global: { stubs: { Tag: TagStub } },
      });
      const tag = wrapper.find('.tag-stub');
      expect(tag.attributes('data-value')).toBe('');
    });
  });
});
