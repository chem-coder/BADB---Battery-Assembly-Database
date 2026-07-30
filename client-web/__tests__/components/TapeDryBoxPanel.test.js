// Component test for src/components/TapeDryBoxPanel.vue — the P2
// «Хранение ленты» card (2026-07-30, docs/future/drybox_removal_plan.md).
//
// The closet workflow (place/remove/return + parameter editor) is retired.
// Pinned behavior:
//   - storage notes bind to tapeState.general.storageNotes and blur calls
//     tapeState.saveGeneral() (single owner of the save path);
//   - deplete stays: confirm → POST /dry-box-state/deplete → reload;
//   - depleted state disables editing and hides the deplete button;
//   - historical dry-box rows render as a read-only archive line.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';

vi.mock('@/services/api', () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock('@/utils/errorClassifier', () => ({ toastApiError: vi.fn() }));

import api from '@/services/api';
import TapeDryBoxPanel from '@/components/TapeDryBoxPanel.vue';

const ButtonStub = {
  name: 'Button',
  props: ['label', 'icon', 'severity', 'outlined', 'size', 'disabled'],
  emits: ['click'],
  template: `<button class="btn-stub" :data-label="label" :disabled="disabled" @click="$emit('click')">{{ label }}</button>`,
};
const AreaStub = {
  name: 'Textarea',
  props: ['modelValue', 'disabled', 'rows', 'autoResize', 'placeholder', 'id'],
  emits: ['update:modelValue', 'blur'],
  template: `<textarea class="area-stub" :disabled="disabled" :value="modelValue"
    @input="$emit('update:modelValue', $event.target.value)" @blur="$emit('blur')" />`,
};

function makeTapeState() {
  return {
    general: reactive({ storageNotes: 'вынута 30.07 на 30 мин' }),
    saveGeneral: vi.fn().mockResolvedValue(1),
  };
}

function mountCard(state, tapeState = makeTapeState(), tapeId = 42) {
  api.get.mockResolvedValueOnce({ data: state });
  const wrapper = mount(TapeDryBoxPanel, {
    props: { tapeId, tapeState },
    global: { stubs: { Button: ButtonStub, Textarea: AreaStub } },
  });
  return { wrapper, tapeState };
}

describe('TapeDryBoxPanel.vue — «Хранение ленты» card (P2)', () => {
  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
    api.put.mockReset();
    vi.restoreAllMocks();
  });

  it('renders notes from tapeState and saves via saveGeneral on blur', async () => {
    const { wrapper, tapeState } = mountCard({ availability_status: null });
    await flushPromises();

    const area = wrapper.find('.area-stub');
    expect(area.element.value).toBe('вынута 30.07 на 30 мин');

    await area.setValue('вернула И.И.');
    expect(tapeState.general.storageNotes).toBe('вернула И.И.');

    await area.trigger('blur');
    await flushPromises();
    expect(tapeState.saveGeneral).toHaveBeenCalledTimes(1);
  });

  it('no closet buttons exist; deplete confirms and POSTs the deplete endpoint', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.post.mockResolvedValue({ data: {} });
    const { wrapper } = mountCard({ availability_status: 'out_of_dry_box' });
    await flushPromises();

    const labels = wrapper.findAll('.btn-stub').map(b => b.attributes('data-label'));
    expect(labels).toEqual(['Лента израсходована']);

    api.get.mockResolvedValueOnce({ data: { availability_status: 'depleted' } });
    await wrapper.find('.btn-stub').trigger('click');
    await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/api/tapes/42/dry-box-state/deplete');
  });

  it('depleted tape: textarea disabled, deplete button hidden', async () => {
    const { wrapper } = mountCard({ availability_status: 'depleted' });
    await flushPromises();
    expect(wrapper.find('.area-stub').attributes('disabled')).toBeDefined();
    expect(wrapper.findAll('.btn-stub')).toHaveLength(0);
    expect(wrapper.text()).toContain('израсходована');
  });

  it('historical dry-box record renders as a read-only archive line', async () => {
    const { wrapper } = mountCard({
      availability_status: 'out_of_dry_box',
      started_at: '2026-07-01T10:00:00Z',
      removed_at: '2026-07-02T12:00:00Z',
      temperature_c: 25,
      atmosphere: 'air',
    });
    await flushPromises();
    const archive = wrapper.find('.sc-archive');
    expect(archive.exists()).toBe(true);
    expect(archive.text()).toContain('помещена');
    expect(archive.text()).toContain('извлечена');
    expect(archive.text()).toContain('25 °C');
  });

  it('deplete declined in confirm → no POST', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { wrapper } = mountCard({ availability_status: null });
    await flushPromises();
    await wrapper.find('.btn-stub').trigger('click');
    expect(api.post).not.toHaveBeenCalled();
  });
});
