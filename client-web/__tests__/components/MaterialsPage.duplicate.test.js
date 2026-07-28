// Component test for the duplicate-warning flow on material create
// (materials_model_cleanup.md §6.3, decision D3) in
// src/pages/reference/MaterialsPage.vue.
//
// Contract under test:
//   - before POST the typed name's fingerprint (nameFingerprint) is
//     compared against the loaded catalog; a collision opens the
//     «Похожий материал» dialog instead of creating;
//   - «Нет, это другой материал» proceeds with creation as typed
//     (warn — never block);
//   - «Использовать существующий» abandons the create and selects the
//     existing material;
//   - no collision → straight POST, no dialog.
//
// Same mount recipe as ElectrodeBatchPanel.test.js: api + toast mocked,
// PrimeVue components replaced with thin stubs.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

vi.mock('@/services/api', () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));
const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }));
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: toastAdd }) }));
vi.mock('@/utils/errorClassifier', () => ({ toastApiError: vi.fn() }));

import api from '@/services/api';
import MaterialsPage from '@/pages/reference/MaterialsPage.vue';

const ButtonStub = {
  name: 'Button',
  props: ['label', 'icon', 'severity', 'outlined', 'text', 'loading', 'disabled', 'size', 'title'],
  emits: ['click'],
  template: `<button class="btn-stub" :data-label="label || ''" :data-icon="icon || ''" :disabled="disabled || loading" @click="$emit('click')">{{ label }}</button>`,
};

const InputTextStub = {
  name: 'InputText',
  props: ['modelValue', 'placeholder'],
  emits: ['update:modelValue'],
  template: `<input class="input-stub" :value="modelValue" :placeholder="placeholder" @input="$emit('update:modelValue', $event.target.value)" />`,
};

const SelectStub = {
  name: 'Select',
  props: ['modelValue', 'options', 'optionLabel', 'optionValue', 'placeholder', 'showClear', 'filter', 'optionDisabled'],
  emits: ['update:modelValue'],
  template: `<select class="select-stub" :value="modelValue" @change="$emit('update:modelValue', $event.target.value)">
    <option value=""></option>
    <option v-for="o in (options || [])" :key="o[optionValue || 'value']" :value="o[optionValue || 'value']">{{ o[optionLabel || 'label'] }}</option>
  </select>`,
};

const DialogStub = {
  name: 'Dialog',
  props: ['visible', 'header', 'modal', 'style'],
  emits: ['update:visible'],
  template: `<div class="dialog-stub" v-if="visible">
    <h3>{{ header }}</h3>
    <div class="body"><slot /></div>
    <div class="footer"><slot name="footer" /></div>
  </div>`,
};

const CATALOG = [
  { material_id: 1, name: 'CMC', role: 'binder', family: null, manufacturer: null },
  { material_id: 2, name: 'NMC 811 BTR', role: 'cathode_active', family: 'NMC', manufacturer: 'BTR' },
];

function installApiMock() {
  api.get.mockImplementation((url) => {
    if (url === '/api/materials') return Promise.resolve({ data: CATALOG.map(m => ({ ...m })) });
    if (url === '/api/reference/material-families') return Promise.resolve({ data: [] });
    // instances / components / source-info / properties / files
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: {} });
}

function mountPage() {
  return mount(MaterialsPage, {
    global: {
      stubs: {
        Button: ButtonStub,
        InputText: InputTextStub,
        Select: SelectStub,
        Dialog: DialogStub,
        PageHeader: true,
        DateInputISO: true,
      },
      directives: { tooltip: {} },
    },
  });
}

// Open the inline create form, type a name, pick a role, hit «Создать».
async function submitCreate(wrapper, name, role) {
  await wrapper.find('button[data-label="Добавить"]').trigger('click');
  await wrapper.find('input[placeholder="Название"]').setValue(name);
  await wrapper.find('.create-material-form select').setValue(role);
  await wrapper.find('button[data-label="Создать"]').trigger('click');
  await flushPromises();
}

function dupDialog(wrapper) {
  return wrapper.find('.dialog-stub');
}

beforeEach(() => {
  vi.clearAllMocks();
  installApiMock();
});

describe('MaterialsPage — duplicate warning on create (D3)', () => {
  it('opens the warning dialog instead of POSTing when the fingerprint collides (Cyrillic homoglyphs)', async () => {
    const wrapper = mountPage();
    await flushPromises();

    // «СМС» typed in Cyrillic is pixel-identical to the existing "CMC"
    await submitCreate(wrapper, 'СМС', 'binder');

    expect(api.post).not.toHaveBeenCalled();
    const dlg = dupDialog(wrapper);
    expect(dlg.exists()).toBe(true);
    expect(dlg.text()).toContain('Похоже на существующий «CMC» — использовать его?');
  });

  it('«Нет, это другой материал» proceeds with creation exactly as typed', async () => {
    const wrapper = mountPage();
    await flushPromises();

    await submitCreate(wrapper, 'СМС', 'binder');
    await dupDialog(wrapper).find('button[data-label="Нет, это другой материал"]').trigger('click');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith('/api/materials', {
      name: 'СМС', // original spelling stored — fingerprint is comparison-only
      role: 'binder',
      family: null,
      manufacturer: null,
    });
    expect(dupDialog(wrapper).exists()).toBe(false);
  });

  it('«Использовать существующий» abandons the create and selects the existing material', async () => {
    const wrapper = mountPage();
    await flushPromises();

    await submitCreate(wrapper, 'СМС', 'binder');
    await dupDialog(wrapper).find('button[data-label="Использовать существующий"]').trigger('click');
    await flushPromises();

    expect(api.post).not.toHaveBeenCalled();
    // Create form closed… (the right-panel edit form has its own
    // «Название» input, so assert on the create-form container)
    expect(wrapper.find('.create-material-form').exists()).toBe(false);
    // …and the existing material got selected (its instances were fetched).
    expect(api.get).toHaveBeenCalledWith('/api/materials/1/instances');
    expect(wrapper.find('.material-item.active').text()).toContain('CMC');
  });

  it('creates directly with no dialog when the name is genuinely new', async () => {
    const wrapper = mountPage();
    await flushPromises();

    await submitCreate(wrapper, 'LFP S19', 'binder');

    expect(dupDialog(wrapper).exists()).toBe(false);
    expect(api.post).toHaveBeenCalledWith('/api/materials', {
      name: 'LFP S19',
      role: 'binder',
      family: null,
      manufacturer: null,
    });
  });

  it('catches case/spacing/punctuation variants, not only homoglyphs', async () => {
    const wrapper = mountPage();
    await flushPromises();

    await submitCreate(wrapper, '  nmc   811 BTR. ', 'cathode_active');

    expect(api.post).not.toHaveBeenCalled();
    expect(dupDialog(wrapper).text()).toContain('Похоже на существующий «NMC 811 BTR»');
  });
});
