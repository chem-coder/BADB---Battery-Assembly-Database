// Component test for src/components/parity/DateTimeWithNow.vue
//
// First Phase A primitive. Tests the wiring (events, disabled state) and
// the MSK formatter behaviour exposed via defineExpose. We don't test
// browser-native date/time picker UI — that's out of scope for unit tests.

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DateTimeWithNow from '@/components/parity/DateTimeWithNow.vue';

/**
 * PrimeVue DatePicker is heavy (calendar overlay, manual-input parser,
 * locale wiring) and is unfit for unit tests where we only care about
 * the primitive's model wiring. The stub below mirrors just the surface
 * we need: a string-backed input that emits Date objects on change,
 * matching DatePicker's `v-model` contract.
 */
const DatePickerStub = {
  name: 'DatePicker',
  props: [
    'modelValue', 'disabled', 'dateFormat', 'placeholder',
    'minDate', 'maxDate', 'firstDayOfWeek', 'showIcon',
    'showOnFocus', 'manualInput',
  ],
  emits: ['update:modelValue'],
  computed: {
    isoStr() {
      const d = this.modelValue;
      if (!d) return '';
      const yy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yy}-${mm}-${dd}`;
    },
  },
  methods: {
    onInput(e) {
      const v = e.target.value;
      const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      this.$emit(
        'update:modelValue',
        m ? new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)) : null,
      );
    },
  },
  template: `<input class="dp-stub" :value="isoStr" :disabled="disabled"
                   :data-min="minDate ? minDate.toISOString() : ''"
                   :data-max="maxDate ? maxDate.toISOString() : ''"
                   @input="onInput">`,
};

function makeWrapper(props = {}) {
  return mount(DateTimeWithNow, {
    props,
    global: { stubs: { DatePicker: DatePickerStub } },
  });
}

describe('DateTimeWithNow.vue', () => {
  describe('rendering', () => {
    it('renders both date and time inputs', () => {
      const wrapper = makeWrapper({ date: '2026-05-27', time: '14:30' });
      expect(wrapper.find('.dp-stub').element.value).toBe('2026-05-27');
      expect(wrapper.find('input[type="time"]').element.value).toBe('14:30');
    });

    it('renders the «Сейчас» button by default', () => {
      const wrapper = makeWrapper();
      expect(wrapper.find('.dtwn-now').exists()).toBe(true);
    });

    it('hides the «Сейчас» button when showNowButton=false', () => {
      const wrapper = makeWrapper({ showNowButton: false });
      expect(wrapper.find('.dtwn-now').exists()).toBe(false);
    });

    it('renders label when provided', () => {
      const wrapper = makeWrapper({ label: 'Начало нарезки' });
      expect(wrapper.find('.dtwn-label').text()).toBe('Начало нарезки');
    });

    it('skips label when not provided', () => {
      const wrapper = makeWrapper();
      expect(wrapper.find('.dtwn-label').exists()).toBe(false);
    });

    it('shows «Сейчас» text label when compact=false', () => {
      const wrapper = makeWrapper({ compact: false });
      expect(wrapper.find('.dtwn-now-label').text()).toBe('Сейчас');
    });

    it('hides the text label when compact=true (default)', () => {
      const wrapper = makeWrapper();
      expect(wrapper.find('.dtwn-now-label').exists()).toBe(false);
    });
  });

  describe('events', () => {
    it('emits update:date when the date input changes', async () => {
      const wrapper = makeWrapper({ date: '2026-05-27', time: '' });
      const input = wrapper.find('.dp-stub');
      await input.setValue('2026-06-01');
      expect(wrapper.emitted('update:date')).toBeTruthy();
      expect(wrapper.emitted('update:date').at(-1)).toEqual(['2026-06-01']);
    });

    it('emits update:time when the time input changes', async () => {
      const wrapper = makeWrapper({ date: '', time: '14:00' });
      const input = wrapper.find('input[type="time"]');
      await input.setValue('15:45');
      expect(wrapper.emitted('update:time')).toBeTruthy();
      expect(wrapper.emitted('update:time').at(-1)).toEqual(['15:45']);
    });

    it('clicking «Сейчас» emits update:date + update:time + set-now', async () => {
      const wrapper = makeWrapper();
      await wrapper.find('.dtwn-now').trigger('click');

      const dateEvents = wrapper.emitted('update:date');
      const timeEvents = wrapper.emitted('update:time');
      const setNowEvents = wrapper.emitted('set-now');

      expect(dateEvents).toHaveLength(1);
      expect(timeEvents).toHaveLength(1);
      expect(setNowEvents).toHaveLength(1);

      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      const timePattern = /^\d{2}:\d{2}:\d{2}$/;
      expect(dateEvents[0][0]).toMatch(datePattern);
      expect(timeEvents[0][0]).toMatch(timePattern);

      const payload = setNowEvents[0][0];
      expect(payload).toHaveProperty('date');
      expect(payload).toHaveProperty('time');
      expect(payload.date).toMatch(datePattern);
      expect(payload.time).toMatch(timePattern);
      // set-now payload matches the two emitted values exactly.
      expect(payload.date).toBe(dateEvents[0][0]);
      expect(payload.time).toBe(timeEvents[0][0]);
    });
  });

  describe('disabled state', () => {
    it('disables both inputs and the button when disabled=true', () => {
      const wrapper = makeWrapper({ disabled: true });
      expect(wrapper.find('.dp-stub').element.disabled).toBe(true);
      expect(wrapper.find('input[type="time"]').element.disabled).toBe(true);
      expect(wrapper.find('.dtwn-now').element.disabled).toBe(true);
    });
  });

  describe('MSK formatter (nowInMsk)', () => {
    it('returns ISO YYYY-MM-DD + HH:MM:SS for a known UTC instant', () => {
      const wrapper = makeWrapper();
      // 2026-05-27T10:15:42Z → 13:15:42 in Moscow (UTC+3).
      const utc = new Date(Date.UTC(2026, 4, 27, 10, 15, 42));
      const result = wrapper.vm._nowInMsk(utc);
      expect(result.date).toBe('2026-05-27');
      expect(result.time).toBe('13:15:42');
    });

    it('returns 2-digit padded month/day/hour/minute/second for early-year date', () => {
      const wrapper = makeWrapper();
      // 2026-01-03T06:05:07Z → 09:05:07 in Moscow (UTC+3).
      const utc = new Date(Date.UTC(2026, 0, 3, 6, 5, 7));
      const result = wrapper.vm._nowInMsk(utc);
      expect(result.date).toBe('2026-01-03');
      expect(result.time).toBe('09:05:07');
    });

    it('rolls date forward when UTC time is late but MSK has passed midnight', () => {
      const wrapper = makeWrapper();
      // 2026-05-27T22:30:15Z → 01:30:15 on 2026-05-28 in Moscow (UTC+3).
      const utc = new Date(Date.UTC(2026, 4, 27, 22, 30, 15));
      const result = wrapper.vm._nowInMsk(utc);
      expect(result.date).toBe('2026-05-28');
      expect(result.time).toBe('01:30:15');
    });
  });

  describe('hint slot', () => {
    it('renders the hint slot when provided', () => {
      const wrapper = mount(DateTimeWithNow, {
        slots: { hint: '<span class="hint-content">Дата сушки</span>' },
        global: { stubs: { DatePicker: DatePickerStub } },
      });
      expect(wrapper.find('.dtwn-hint').exists()).toBe(true);
      expect(wrapper.find('.hint-content').text()).toBe('Дата сушки');
    });

    it('omits the hint container when slot is empty', () => {
      const wrapper = makeWrapper();
      expect(wrapper.find('.dtwn-hint').exists()).toBe(false);
    });
  });
});
