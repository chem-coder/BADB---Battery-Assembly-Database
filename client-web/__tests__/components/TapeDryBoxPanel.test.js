// Component test for src/components/TapeDryBoxPanel.vue
//
// Surfaces audit #6 — the 6 dry-box endpoints. Tests focus on the
// status-driven action button visibility (the panel's core UX) and
// that the load + place + remove + deplete flows hit the right URLs.
// PrimeVue Button/InputNumber/InputText/Textarea are stubbed so the
// tests don't pull in the full theme runtime.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

vi.mock('@/services/api', () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock('@/utils/errorClassifier', () => ({ toastApiError: vi.fn() }));
vi.mock('@/composables/useNotify', () => ({
  useNotify: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import api from '@/services/api';
import TapeDryBoxPanel from '@/components/TapeDryBoxPanel.vue';

const ButtonStub = {
  name: 'Button',
  props: ['label', 'icon', 'severity', 'outlined', 'text', 'loading'],
  emits: ['click'],
  template: `<button class="btn-stub" :data-label="label" :disabled="loading" @click="$emit('click')">{{ label }}</button>`,
};
const FieldStub = {
  name: 'InputText',
  props: ['modelValue', 'disabled'],
  template: `<input class="input-stub" />`,
};
const NumberStub = { ...FieldStub, name: 'InputNumber' };
const AreaStub = { ...FieldStub, name: 'Textarea' };

function mountPanel(state, tapeId = 42) {
  api.get.mockResolvedValueOnce({ data: state });
  return mount(TapeDryBoxPanel, {
    props: { tapeId },
    global: {
      stubs: {
        Button: ButtonStub,
        InputText: FieldStub,
        InputNumber: NumberStub,
        Textarea: AreaStub,
      },
    },
  });
}

describe('TapeDryBoxPanel.vue', () => {
  beforeEach(() => {
    api.get.mockReset();
    api.put.mockReset();
    api.post.mockReset();
  });

  describe('initial state — status badge + action buttons', () => {
    it('null status → "Не помещалась" badge + only "Поместить в шкаф" button', async () => {
      const w = mountPanel({ availability_status: null, has_final_dry_box_storage: false });
      await flushPromises();
      expect(w.text()).toContain('Не помещалась');
      const labels = w.findAll('.btn-stub').map((b) => b.attributes('data-label'));
      expect(labels).toContain('Поместить в шкаф');
      expect(labels).not.toContain('Извлечь');
      expect(labels).not.toContain('Вернуть в шкаф');
    });

    it('in_dry_box + has_final_dry_box_storage → shows Сохранить + Извлечь + Списать', async () => {
      const w = mountPanel({
        availability_status: 'in_dry_box',
        started_at: '2026-05-01T10:00:00Z',
        has_final_dry_box_storage: true,
      });
      await flushPromises();
      expect(w.text()).toContain('В шкафу');
      const labels = w.findAll('.btn-stub').map((b) => b.attributes('data-label'));
      // No more «Сохранить параметры» — param fields autosave on blur
      // (Dima 2026-05-28). Only state-transition buttons remain.
      expect(labels).not.toContain('Сохранить параметры');
      expect(labels).toContain('Извлечь');
      expect(labels).toContain('Списать');
    });

    it('in_dry_box BUT no final dry — "Извлечь" hidden (backend would 400)', async () => {
      const w = mountPanel({
        availability_status: 'in_dry_box',
        has_final_dry_box_storage: false,
      });
      await flushPromises();
      const labels = w.findAll('.btn-stub').map((b) => b.attributes('data-label'));
      expect(labels).not.toContain('Извлечь');
    });

    it('out_of_dry_box → "Вернуть в шкаф" + "Списать"', async () => {
      const w = mountPanel({ availability_status: 'out_of_dry_box' });
      await flushPromises();
      expect(w.text()).toContain('Извлечена');
      const labels = w.findAll('.btn-stub').map((b) => b.attributes('data-label'));
      expect(labels).toContain('Вернуть в шкаф');
      expect(labels).toContain('Списать');
    });

    it('depleted → no action buttons (terminal)', async () => {
      const w = mountPanel({ availability_status: 'depleted' });
      await flushPromises();
      expect(w.text()).toContain('Израсходована');
      const labels = w.findAll('.btn-stub').map((b) => b.attributes('data-label'));
      expect(labels).not.toContain('Поместить в шкаф');
      expect(labels).not.toContain('Извлечь');
      expect(labels).not.toContain('Вернуть в шкаф');
      expect(labels).not.toContain('Списать');
    });
  });

  describe('endpoints', () => {
    it('GET on mount hits /api/tapes/:id/dry-box-state', async () => {
      api.get.mockResolvedValueOnce({ data: { availability_status: null } });
      mount(TapeDryBoxPanel, {
        props: { tapeId: 123 },
        global: { stubs: { Button: ButtonStub, InputText: FieldStub, InputNumber: NumberStub, Textarea: AreaStub } },
      });
      await flushPromises();
      expect(api.get).toHaveBeenCalledWith('/api/tapes/123/dry-box-state');
    });

    it('"Поместить в шкаф" → POST place-now', async () => {
      const w = mountPanel({ availability_status: null });
      await flushPromises();
      api.post.mockResolvedValueOnce({ data: { availability_status: 'in_dry_box' } });
      const btn = w.findAll('.btn-stub').find((b) => b.attributes('data-label') === 'Поместить в шкаф');
      await btn.trigger('click');
      await flushPromises();
      expect(api.post).toHaveBeenCalledWith(
        expect.stringMatching(/\/dry-box-state\/place-now$/),
        expect.any(Object),
      );
    });

    it('"Извлечь" → POST remove-now', async () => {
      const w = mountPanel({
        availability_status: 'in_dry_box',
        has_final_dry_box_storage: true,
      });
      await flushPromises();
      api.post.mockResolvedValueOnce({ data: { availability_status: 'out_of_dry_box' } });
      const btn = w.findAll('.btn-stub').find((b) => b.attributes('data-label') === 'Извлечь');
      await btn.trigger('click');
      await flushPromises();
      expect(api.post).toHaveBeenCalledWith(
        expect.stringMatching(/\/dry-box-state\/remove-now$/),
        expect.any(Object),
      );
    });
  });

  describe('null tapeId', () => {
    it('does not render anything when tapeId is null', () => {
      const w = mount(TapeDryBoxPanel, {
        props: { tapeId: null },
        global: { stubs: { Button: ButtonStub, InputText: FieldStub, InputNumber: NumberStub, Textarea: AreaStub } },
      });
      expect(w.find('.tdb-card').exists()).toBe(false);
      expect(api.get).not.toHaveBeenCalled();
    });
  });
});
