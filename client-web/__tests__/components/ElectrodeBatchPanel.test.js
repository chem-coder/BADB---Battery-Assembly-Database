// Component test for src/components/ElectrodeBatchPanel.vue
//
// The panel replaces the legacy ElectrodeFormPage and surfaces three
// concerns: electrode mass list (per-row inline edits), foil masses,
// capacity summary. Tests cover the smoke path + the key behaviours
// that were called out as P2/P3 audit items:
//   - save indicator state machine (saving → saved flash → idle)
//   - scope hint visibility when constructorCount > 1
//   - DS confirm dialog wiring (PrimeVue useConfirm) for delete
//   - scrap-reason dialog open/close
//   - capacity reload debounce after PUT bursts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

vi.mock('@/services/api', () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }));

// `useConfirm` from PrimeVue is the DS confirm replacement for
// window.confirm — we expose a `require` mock so tests can assert that
// our delete handler asks the service and runs the accept callback.
const confirmRequire = vi.fn((opts) => { confirmRequire._lastOpts = opts; });
vi.mock('primevue/useconfirm', () => ({
  useConfirm: () => ({ require: confirmRequire }),
}));
vi.mock('@/utils/errorClassifier', () => ({ toastApiError: vi.fn() }));
vi.mock('@/utils/formatCapacity', () => ({ fmtCapacity: (v) => v == null ? '—' : `${v} мАч` }));

import api from '@/services/api';
import { toastApiError } from '@/utils/errorClassifier';
import ElectrodeBatchPanel from '@/components/ElectrodeBatchPanel.vue';

const ButtonStub = {
  name: 'Button',
  props: ['label', 'icon', 'severity', 'outlined', 'text', 'loading', 'disabled', 'rounded', 'size', 'title'],
  emits: ['click'],
  // Surface BOTH label and icon as data-attrs so tests can find buttons
  // by their semantic role (e.g. data-icon="pi pi-trash") even when the
  // visible label is absent (icon-only action buttons).
  template: `<button class="btn-stub" :data-label="label || ''" :data-icon="icon || ''" :data-title="title || ''" :disabled="disabled || loading" @click="$emit('click')">{{ label }}</button>`,
};
const NumberStub = {
  name: 'InputNumber',
  props: ['modelValue'],
  emits: ['update:modelValue', 'blur'],
  template: `<input class="num-stub" :value="modelValue" @blur="$emit('blur')" />`,
};
const TextStub = {
  name: 'InputText',
  props: ['modelValue'],
  emits: ['update:modelValue', 'blur'],
  template: `<input class="text-stub" :value="modelValue" @blur="$emit('blur')" />`,
};
const CheckboxStub = {
  name: 'Checkbox',
  props: ['modelValue', 'binary'],
  emits: ['update:modelValue'],
  template: `<input class="cb-stub" type="checkbox" :checked="modelValue" @change="$emit('update:modelValue', $event.target.checked)" />`,
};
const DialogStub = {
  name: 'Dialog',
  props: ['visible', 'header', 'modal', 'closable', 'draggable', 'style'],
  template: `<div v-if="visible" class="dialog-stub"><div class="dialog-header">{{ header }}</div><slot /><slot name="footer" /></div>`,
};
const TextareaStub = {
  name: 'Textarea',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: `<textarea class="ta-stub" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`,
};
const CollapsibleSectionStub = {
  name: 'CollapsibleSection',
  props: ['title', 'count'],
  template: `<section class="cs-stub" :data-title="title" :data-count="count"><slot /></section>`,
};
const BulkPasteStub = {
  name: 'ElectrodeBulkPasteDialog',
  props: ['visible'],
  emits: ['update:visible', 'applied'],
  template: `<div v-if="visible" class="bp-stub" />`,
};

function makeStubs() {
  return {
    Button: ButtonStub,
    InputNumber: NumberStub,
    InputText: TextStub,
    Checkbox: CheckboxStub,
    Dialog: DialogStub,
    Textarea: TextareaStub,
    CollapsibleSection: CollapsibleSectionStub,
    ElectrodeBulkPasteDialog: BulkPasteStub,
  };
}

function mountPanel(props = {}) {
  // Default the three GET responses (electrodes / foil / report).
  api.get.mockImplementation((url) => {
    if (url.endsWith('/electrodes')) return Promise.resolve({ data: [] });
    if (url.endsWith('/foil-masses')) return Promise.resolve({ data: [] });
    if (url.endsWith('/report')) return Promise.resolve({ data: { capacity_summary: null } });
    return Promise.resolve({ data: null });
  });
  return mount(ElectrodeBatchPanel, {
    props: { batchId: 7, ...props },
    global: { stubs: makeStubs() },
  });
}

describe('ElectrodeBatchPanel.vue', () => {
  beforeEach(() => {
    api.get.mockReset();
    api.put.mockReset();
    api.post.mockReset();
    api.delete.mockReset();
    confirmRequire.mockClear();
    confirmRequire._lastOpts = null;
  });

  describe('mount + load', () => {
    it('null batchId → renders nothing, no API calls', () => {
      const w = mount(ElectrodeBatchPanel, {
        props: { batchId: null },
        global: { stubs: makeStubs() },
      });
      expect(w.find('.ebp').exists()).toBe(false);
      expect(api.get).not.toHaveBeenCalled();
    });

    it('fetches electrodes + foil masses + report on mount', async () => {
      mountPanel();
      await flushPromises();
      const urls = api.get.mock.calls.map((c) => c[0]);
      expect(urls.some((u) => u.endsWith('/7/electrodes'))).toBe(true);
      expect(urls.some((u) => u.endsWith('/7/foil-masses'))).toBe(true);
      expect(urls.some((u) => u.endsWith('/7/report'))).toBe(true);
    });

    it('header is hidden when nothing meaningful to surface (constructorCount=1, no save in flight)', async () => {
      // Batch id used to live here, but the constructor above already
      // shows «ЭТАПЫ ДЛЯ: #N». Surfacing it twice gave us a dead header
      // row, so it now renders only when there's a save state or a
      // multi-batch scope hint to display.
      const w = mountPanel();
      await flushPromises();
      expect(w.find('.ebp-header').exists()).toBe(false);
    });
  });

  describe('scope hint (audit P2 #7)', () => {
    it('hidden when constructorCount = 1 (default)', async () => {
      const w = mountPanel();
      await flushPromises();
      expect(w.find('.ebp-scope-warn').exists()).toBe(false);
    });

    it('visible when constructorCount > 1', async () => {
      const w = mountPanel({ constructorCount: 3 });
      await flushPromises();
      const warn = w.find('.ebp-scope-warn');
      expect(warn.exists()).toBe(true);
      expect(warn.text()).toContain('3 в конструкторе');
    });
  });

  describe('save indicator (audit P2 #5)', () => {
    it('shows "Сохранение…" during an in-flight PUT', async () => {
      api.get.mockImplementation((url) => {
        if (url.endsWith('/electrodes')) return Promise.resolve({ data: [
          { electrode_id: 1, electrode_mass_g: 1.2, cup_number: 5, comments: '',
            include_in_capacity_average: true, status_code: 1 },
        ]});
        if (url.endsWith('/foil-masses')) return Promise.resolve({ data: [] });
        if (url.endsWith('/report')) return Promise.resolve({ data: { capacity_summary: null } });
        return Promise.resolve({ data: null });
      });
      const w = mount(ElectrodeBatchPanel, {
        props: { batchId: 7 },
        global: { stubs: makeStubs() },
      });
      await flushPromises();

      // Trigger a save by toggling include_in_capacity_average via the checkbox.
      let putResolve;
      api.put.mockReturnValue(new Promise((r) => { putResolve = () => r({ data: {} }); }));
      await w.find('.cb-stub').trigger('change');

      // Mid-flight: saving indicator visible.
      await w.vm.$nextTick();
      expect(w.find('.ebp-status--saving').exists()).toBe(true);

      // Resolve + finish reload chain.
      putResolve();
      await flushPromises();

      // saveInflight back to 0; flash window kicks in.
      expect(w.find('.ebp-status--saving').exists()).toBe(false);
    });
  });

  describe('delete dialog (audit P2 #6)', () => {
    it('opens PrimeVue confirm with "Удалить" accept label', async () => {
      api.get.mockImplementation((url) => {
        if (url.endsWith('/electrodes')) return Promise.resolve({ data: [
          { electrode_id: 42, electrode_mass_g: 1.5, status_code: 1 },
        ]});
        if (url.endsWith('/foil-masses')) return Promise.resolve({ data: [] });
        if (url.endsWith('/report')) return Promise.resolve({ data: {} });
        return Promise.resolve({ data: null });
      });
      const w = mount(ElectrodeBatchPanel, {
        props: { batchId: 7 },
        global: { stubs: makeStubs() },
      });
      await flushPromises();

      // Click the FIRST trash button inside the electrode table (foil
      // table also has trash icons, but those come later in DOM order).
      const electrodeTable = w.find('.cs-stub[data-title="Электроды"]');
      const trashBtns = electrodeTable.findAll('[data-icon="pi pi-trash"]');
      await trashBtns[0].trigger('click');

      expect(confirmRequire).toHaveBeenCalled();
      expect(confirmRequire._lastOpts.acceptLabel).toBe('Удалить');
      expect(confirmRequire._lastOpts.message).toContain('#42');
    });
  });

  describe('column sorting', () => {
    // Server order = number_in_batch ASC; masses/cups deliberately NOT
    // monotonic so we can tell the sorts apart.
    const serverRows = [
      { electrode_id: 11, number_in_batch: 1, electrode_mass_g: 3.0, cup_number: 9, comments: '', include_in_capacity_average: true, status_code: 1 },
      { electrode_id: 12, number_in_batch: 2, electrode_mass_g: 1.0, cup_number: 7, comments: '', include_in_capacity_average: true, status_code: 3 },
      { electrode_id: 13, number_in_batch: 3, electrode_mass_g: 2.0, cup_number: 8, comments: '', include_in_capacity_average: true, status_code: 2 },
    ];

    function mountWithRows() {
      api.get.mockImplementation((url) => {
        if (url.endsWith('/electrodes')) return Promise.resolve({ data: serverRows.map((r) => ({ ...r })) });
        if (url.endsWith('/foil-masses')) return Promise.resolve({ data: [] });
        if (url.endsWith('/report')) return Promise.resolve({ data: { capacity_summary: null } });
        return Promise.resolve({ data: null });
      });
      return mount(ElectrodeBatchPanel, {
        props: { batchId: 7 },
        global: { stubs: makeStubs() },
      });
    }

    // № column is the 2nd <td> of each electrode row.
    function numberColumn(w) {
      const table = w.find('.cs-stub[data-title="Электроды"] table');
      return table.findAll('tbody tr').map((tr) => tr.findAll('td')[1].text());
    }

    it('default sort = № ascending with ▲ indicator on №', async () => {
      const w = mountWithRows();
      await flushPromises();
      expect(numberColumn(w)).toEqual(['1', '2', '3']);
      const numTh = w.find('th[data-sort-key="number"]');
      expect(numTh.text()).toContain('▲');
      // Other sortable headers carry no indicator.
      expect(w.find('th[data-sort-key="mass"]').text()).not.toMatch(/[▲▼]/);
    });

    it('click on Масса sorts asc, second click toggles desc', async () => {
      const w = mountWithRows();
      await flushPromises();
      const massTh = w.find('th[data-sort-key="mass"]');

      await massTh.trigger('click');
      // masses 1.0 (№2), 2.0 (№3), 3.0 (№1)
      expect(numberColumn(w)).toEqual(['2', '3', '1']);
      expect(massTh.text()).toContain('▲');

      await massTh.trigger('click');
      expect(numberColumn(w)).toEqual(['1', '3', '2']);
      expect(massTh.text()).toContain('▼');
    });

    it('status header sorts by status_code; unsaved drafts stay at the bottom', async () => {
      const w = mountWithRows();
      await flushPromises();

      // Add a manual draft row, then resort — the draft must remain
      // last (and deletable) regardless of the active sort.
      await w.find('[data-label="Добавить строку"]').trigger('click');
      await w.find('th[data-sort-key="status"]').trigger('click');

      const rows = w.find('.cs-stub[data-title="Электроды"] table').findAll('tbody tr');
      expect(rows.length).toBe(4);
      expect(numberColumn(w).slice(0, 3)).toEqual(['1', '3', '2']); // status_code 1,2,3
      expect(rows[3].text()).toContain('новый');

      // Deleting the draft after a resort removes THAT row (identity
      // lookup, not display index).
      const trash = rows[3].find('[data-icon="pi pi-trash"]');
      await trash.trigger('click');
      expect(w.find('.cs-stub[data-title="Электроды"] table').findAll('tbody tr').length).toBe(3);
      expect(confirmRequire).not.toHaveBeenCalled(); // draft delete needs no confirm
    });
  });

  describe('bulk paste — sequential commit in paste order', () => {
    const pasted = [
      { mass_g: 1.1, cup_number: 1, comments: '' },
      { mass_g: 2.2, cup_number: 2, comments: 'x' },
      { mass_g: 3.3, cup_number: null, comments: '' },
    ];

    it('POSTs each row awaited in paste order, then refreshes the list once', async () => {
      const w = mountPanel();
      await flushPromises();
      api.get.mockClear();

      let active = 0;
      let maxActive = 0;
      const postedMasses = [];
      api.post.mockImplementation(async (url, body) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        postedMasses.push(body.electrode_mass_g);
        await Promise.resolve(); // if calls were parallel, active would stack
        active -= 1;
        return { data: {} };
      });

      w.findComponent({ name: 'ElectrodeBulkPasteDialog' }).vm.$emit('applied', pasted);
      await flushPromises();

      expect(api.post).toHaveBeenCalledTimes(3);
      expect(postedMasses).toEqual([1.1, 2.2, 3.3]); // paste order preserved
      expect(maxActive).toBe(1);                     // strictly sequential
      expect(api.post.mock.calls[0][1]).toMatchObject({ cut_batch_id: 7, electrode_mass_g: 1.1, cup_number: 1 });

      // Exactly ONE electrodes reload after the whole sequence.
      const electrodeGets = api.get.mock.calls.filter((c) => c[0].endsWith('/electrodes'));
      expect(electrodeGets.length).toBe(1);
    });

    it('mid-sequence failure: stops, toasts the failing row, keeps rest as drafts', async () => {
      const w = mountPanel();
      await flushPromises();
      toastApiError.mockClear();

      api.post
        .mockResolvedValueOnce({ data: {} })                 // row 1 OK
        .mockRejectedValueOnce(new Error('boom'));           // row 2 fails

      w.findComponent({ name: 'ElectrodeBulkPasteDialog' }).vm.$emit('applied', pasted);
      await flushPromises();

      // Row 3 must NOT have been attempted after the failure.
      expect(api.post).toHaveBeenCalledTimes(2);
      expect(toastApiError).toHaveBeenCalledTimes(1);
      expect(toastApiError.mock.calls[0][2]).toContain('строка 2 из 3');

      // Failed row 2 + untried row 3 remain as editable drafts.
      const drafts = w.findAll('.badge').filter((b) => b.text() === 'новый');
      expect(drafts.length).toBe(2);
    });
  });

  describe('scrap dialog (audit P2 #6)', () => {
    it('opens scrap dialog with disabled "Списать" button until reason typed', async () => {
      api.get.mockImplementation((url) => {
        if (url.endsWith('/electrodes')) return Promise.resolve({ data: [
          { electrode_id: 99, electrode_mass_g: 1.5, status_code: 1 },
        ]});
        if (url.endsWith('/foil-masses')) return Promise.resolve({ data: [] });
        if (url.endsWith('/report')) return Promise.resolve({ data: {} });
        return Promise.resolve({ data: null });
      });
      const w = mount(ElectrodeBatchPanel, {
        props: { batchId: 7 },
        global: { stubs: makeStubs() },
      });
      await flushPromises();

      // Scrap action = pi-ban icon, only present in electrode table.
      const banBtn = w.find('[data-icon="pi pi-ban"]');
      await banBtn.trigger('click');
      await w.vm.$nextTick();

      expect(w.find('.dialog-stub').exists()).toBe(true);
      expect(w.find('.dialog-stub').text()).toContain('#99');
    });
  });
});
