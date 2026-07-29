// Component test for the «+ Новая рецептура…» quick-create flow
// (feature_backlog 2026-07-28 №3).
//
// Contract under test:
//   - save() first POSTs /api/recipes/check-duplicate with the full line
//     set (active line material_id NULL — the d047 open slot);
//   - a duplicate answer does NOT create; the inline prompt appears and
//     «Использовать существующую» emits created(existing id);
//   - no duplicate → POST /api/recipes with the composition-derived name
//     and emits created(new id);
//   - the name derives in the d047 convention with trimmed numbers.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

vi.mock('@/services/api', () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));
const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }));
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: toastAdd }) }));
vi.mock('@/utils/errorClassifier', () => ({ toastApiError: vi.fn() }));

import api from '@/services/api';
import RecipeQuickCreateDialog from '@/components/RecipeQuickCreateDialog.vue';

const MATERIALS = [
  { material_id: 11, name: 'Super P', role: 'conductive_additive' },
  { material_id: 12, name: 'PVDF', role: 'binder' },
  { material_id: 13, name: 'NMP', role: 'solvent' },
];

const stubs = {
  Dialog: { template: '<div><slot /><slot name="footer" /></div>', props: ['visible'] },
  Button: { template: '<button @click="$emit(\'click\')"><slot />{{ label }}</button>', props: ['label', 'disabled', 'loading'] },
  Select: { template: '<select />', props: ['modelValue', 'options'] },
  InputText: { template: '<input />', props: ['modelValue'] },
  InputNumber: { template: '<input type="number" />', props: ['modelValue'] },
};

function mountDialog() {
  const wrapper = mount(RecipeQuickCreateDialog, {
    props: { visible: true, materials: MATERIALS, initialRole: 'cathode' },
    global: { stubs },
  });
  return wrapper;
}

function fillValidComposition(vm) {
  vm.activePercent = 95.5;
  vm.lines.splice(0, vm.lines.length,
    { recipe_role: 'additive', material_id: 11, slurry_percent: 2.5 },
    { recipe_role: 'binder', material_id: 12, slurry_percent: 2 },
    { recipe_role: 'solvent', material_id: 13, slurry_percent: 40 },
  );
}

describe('RecipeQuickCreateDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('derives the name in the d047 convention (solvent excluded, numbers trimmed)', async () => {
    const w = mountDialog();
    fillValidComposition(w.vm);
    await flushPromises();
    expect(w.vm.suggestedName).toBe('95.5 АМ : 2.5 Super P : 2 PVDF');
    expect(w.vm.includedSum).toBe(100);
    expect(w.vm.canSave).toBe(true);
  });

  it('checks for duplicates first and switches to the existing recipe', async () => {
    const w = mountDialog();
    fillValidComposition(w.vm);
    api.post.mockResolvedValueOnce({ data: { duplicate: { tape_recipe_id: 7, name: '95.5 АМ : 2.5 Super P : 2 PVDF' } } });

    await w.vm.save();
    await flushPromises();

    // Only the check ran — no create.
    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe('/api/recipes/check-duplicate');
    // Active line is the d047 open slot.
    expect(body.lines[0]).toMatchObject({ recipe_role: 'cathode_active', material_id: null, slurry_percent: 95.5 });
    // Solvent excluded from the 100% basis.
    expect(body.lines.find(l => l.recipe_role === 'solvent').include_in_pct).toBe(false);
    expect(w.vm.duplicate).toMatchObject({ tape_recipe_id: 7 });

    w.vm.useExisting();
    expect(w.emitted('created')[0]).toEqual([7]);
  });

  it('creates when no duplicate and emits the new id', async () => {
    const w = mountDialog();
    fillValidComposition(w.vm);
    api.post
      .mockResolvedValueOnce({ data: { duplicate: null } })
      .mockResolvedValueOnce({ data: { tape_recipe_id: 42 } });

    await w.vm.save();
    await flushPromises();

    expect(api.post).toHaveBeenCalledTimes(2);
    const [url, body] = api.post.mock.calls[1];
    expect(url).toBe('/api/recipes');
    expect(body.name).toBe('95.5 АМ : 2.5 Super P : 2 PVDF');
    expect(body.role).toBe('cathode');
    expect(w.emitted('created')[0]).toEqual([42]);
  });
});
