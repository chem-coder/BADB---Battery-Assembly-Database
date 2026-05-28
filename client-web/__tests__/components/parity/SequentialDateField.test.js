// Component test for src/components/parity/SequentialDateField.vue
//
// Second Phase A primitive. Tests:
//   1. `prev` parsing — both {date,time} and ISO string shapes
//   2. validation — current value earlier than prev surfaces error
//   3. cascade — empty fields auto-fill from prev on mount when enabled
//   4. event passthrough — updates from inner DateTimeWithNow propagate
//   5. validation-change event fires on prev/date/time change

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SequentialDateField from '@/components/parity/SequentialDateField.vue';

/**
 * DatePicker stub — same shape as the one in DateTimeWithNow.test.js.
 * Exposes the (date-only) min/max constraints as data attributes for
 * assertions, and round-trips Date ↔ YYYY-MM-DD via @input.
 */
function pad(n) { return String(n).padStart(2, '0'); }
function dateToIso(d) {
  if (!d) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const DatePickerStub = {
  name: 'DatePicker',
  props: [
    'modelValue', 'disabled', 'dateFormat', 'placeholder',
    'minDate', 'maxDate', 'firstDayOfWeek', 'showIcon',
    'showOnFocus', 'manualInput',
  ],
  emits: ['update:modelValue'],
  computed: {
    isoStr() { return dateToIso(this.modelValue); },
    minIso() { return dateToIso(this.minDate); },
    maxIso() { return dateToIso(this.maxDate); },
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
                   :min="minIso" :max="maxIso"
                   @input="onInput">`,
};

function makeWrapper(props = {}) {
  return mount(SequentialDateField, {
    props,
    global: { stubs: { DatePicker: DatePickerStub } },
  });
}

describe('SequentialDateField.vue', () => {
  describe('prev parsing', () => {
    it('accepts {date,time} object shape', () => {
      const wrapper = makeWrapper();
      const parsed = wrapper.vm._parsePrev({ date: '2026-05-27', time: '14:30' });
      expect(parsed).toEqual({ date: '2026-05-27', time: '14:30' });
    });

    it('accepts ISO string with T separator', () => {
      const wrapper = makeWrapper();
      const parsed = wrapper.vm._parsePrev('2026-05-27T14:30:00');
      expect(parsed).toEqual({ date: '2026-05-27', time: '14:30' });
    });

    it('accepts ISO string with space separator', () => {
      const wrapper = makeWrapper();
      const parsed = wrapper.vm._parsePrev('2026-05-27 14:30:00');
      expect(parsed).toEqual({ date: '2026-05-27', time: '14:30' });
    });

    it('defaults time to 00:00 when object omits time', () => {
      const wrapper = makeWrapper();
      const parsed = wrapper.vm._parsePrev({ date: '2026-05-27' });
      expect(parsed).toEqual({ date: '2026-05-27', time: '00:00' });
    });

    it('returns null for null / empty / malformed', () => {
      const wrapper = makeWrapper();
      expect(wrapper.vm._parsePrev(null)).toBeNull();
      expect(wrapper.vm._parsePrev('')).toBeNull();
      expect(wrapper.vm._parsePrev('not a date')).toBeNull();
      expect(wrapper.vm._parsePrev({})).toBeNull();
    });
  });

  describe('validation — earlier than prev', () => {
    it('surfaces error when current date is before prev', () => {
      const wrapper = makeWrapper({
        date: '2026-05-26',
        time: '10:00',
        prev: { date: '2026-05-27', time: '14:30' },
        prevLabel: 'Сушка',
      });
      const err = wrapper.find('[data-testid="sdf-error"]');
      expect(err.exists()).toBe(true);
      expect(err.text()).toContain('Не может быть раньше «Сушка»');
    });

    it('surfaces error when same date but earlier time', () => {
      const wrapper = makeWrapper({
        date: '2026-05-27',
        time: '12:00',
        prev: { date: '2026-05-27', time: '14:30' },
        prevLabel: 'Сушка',
      });
      expect(wrapper.find('[data-testid="sdf-error"]').exists()).toBe(true);
    });

    it('passes when later than prev', () => {
      const wrapper = makeWrapper({
        date: '2026-05-28',
        time: '09:00',
        prev: { date: '2026-05-27', time: '14:30' },
        prevLabel: 'Сушка',
      });
      expect(wrapper.find('[data-testid="sdf-error"]').exists()).toBe(false);
    });

    it('passes when exactly equal to prev', () => {
      const wrapper = makeWrapper({
        date: '2026-05-27',
        time: '14:30',
        prev: { date: '2026-05-27', time: '14:30' },
        prevLabel: 'Сушка',
      });
      expect(wrapper.find('[data-testid="sdf-error"]').exists()).toBe(false);
    });

    it('no error when prev is missing', () => {
      const wrapper = makeWrapper({
        date: '2026-05-27',
        time: '14:30',
        prev: null,
      });
      expect(wrapper.find('[data-testid="sdf-error"]').exists()).toBe(false);
    });

    it('no error when current is partial (date only, no time)', () => {
      const wrapper = makeWrapper({
        date: '2026-05-26',
        time: '',
        prev: { date: '2026-05-27', time: '14:30' },
      });
      expect(wrapper.find('[data-testid="sdf-error"]').exists()).toBe(false);
    });

    it('uses generic label when prevLabel is omitted', () => {
      const wrapper = makeWrapper({
        date: '2026-05-26',
        time: '10:00',
        prev: { date: '2026-05-27', time: '14:30' },
      });
      const err = wrapper.find('[data-testid="sdf-error"]');
      expect(err.text()).toContain('предыдущего этапа');
    });
  });

  describe('minDate derivation', () => {
    it('passes prev.date as min on the inner date input', () => {
      const wrapper = makeWrapper({
        prev: { date: '2026-05-27', time: '14:30' },
      });
      const dateInput = wrapper.find('.dp-stub');
      expect(dateInput.attributes('min')).toBe('2026-05-27');
    });

    it('explicit minDate prop overrides prev-derived min', () => {
      const wrapper = makeWrapper({
        prev: { date: '2026-05-27', time: '14:30' },
        minDate: '2026-06-01',
      });
      const dateInput = wrapper.find('.dp-stub');
      expect(dateInput.attributes('min')).toBe('2026-06-01');
    });
  });

  describe('cascade from prev on mount', () => {
    it('fills empty date+time from prev when cascadeFromPrev=true', () => {
      const wrapper = makeWrapper({
        date: '',
        time: '',
        prev: { date: '2026-05-27', time: '14:30' },
        cascadeFromPrev: true,
      });
      const dateEvents = wrapper.emitted('update:date');
      const timeEvents = wrapper.emitted('update:time');
      expect(dateEvents).toHaveLength(1);
      expect(dateEvents[0][0]).toBe('2026-05-27');
      expect(timeEvents).toHaveLength(1);
      expect(timeEvents[0][0]).toBe('14:30');
    });

    it('does NOT overwrite when fields already have values', () => {
      const wrapper = makeWrapper({
        date: '2026-05-28',
        time: '09:00',
        prev: { date: '2026-05-27', time: '14:30' },
        cascadeFromPrev: true,
      });
      expect(wrapper.emitted('update:date')).toBeFalsy();
      expect(wrapper.emitted('update:time')).toBeFalsy();
    });

    it('does NOT cascade when cascadeFromPrev=false', () => {
      const wrapper = makeWrapper({
        date: '',
        time: '',
        prev: { date: '2026-05-27', time: '14:30' },
        cascadeFromPrev: false,
      });
      expect(wrapper.emitted('update:date')).toBeFalsy();
      expect(wrapper.emitted('update:time')).toBeFalsy();
    });

    it('does NOT cascade when prev is null', () => {
      const wrapper = makeWrapper({
        date: '',
        time: '',
        prev: null,
        cascadeFromPrev: true,
      });
      expect(wrapper.emitted('update:date')).toBeFalsy();
    });
  });

  describe('event passthrough', () => {
    it('propagates update:date from inner input', async () => {
      const wrapper = makeWrapper({ date: '2026-05-27', time: '14:30' });
      const input = wrapper.find('.dp-stub');
      await input.setValue('2026-05-28');
      expect(wrapper.emitted('update:date').at(-1)).toEqual(['2026-05-28']);
    });

    it('propagates update:time from inner input', async () => {
      const wrapper = makeWrapper({ date: '2026-05-27', time: '14:30' });
      const input = wrapper.find('input[type="time"]');
      await input.setValue('15:45');
      expect(wrapper.emitted('update:time').at(-1)).toEqual(['15:45']);
    });
  });

  describe('validation-change event', () => {
    it('fires with ok:true on mount when no prev', () => {
      const wrapper = makeWrapper({ date: '2026-05-27', time: '14:30' });
      const events = wrapper.emitted('validation-change');
      expect(events).toBeTruthy();
      expect(events.at(-1)).toEqual([{ ok: true, message: '' }]);
    });

    it('fires with ok:false when current < prev', () => {
      const wrapper = makeWrapper({
        date: '2026-05-26',
        time: '10:00',
        prev: { date: '2026-05-27', time: '14:30' },
        prevLabel: 'Сушка',
      });
      const events = wrapper.emitted('validation-change');
      const last = events.at(-1)[0];
      expect(last.ok).toBe(false);
      expect(last.message).toContain('Сушка');
    });

    it('flips ok:false → ok:true after user pushes the date forward', async () => {
      const wrapper = makeWrapper({
        date: '2026-05-26',
        time: '10:00',
        prev: { date: '2026-05-27', time: '14:30' },
      });
      // Initial state: invalid.
      const evts1 = wrapper.emitted('validation-change');
      expect(evts1.at(-1)[0].ok).toBe(false);

      // Parent updates props to a valid value.
      await wrapper.setProps({ date: '2026-05-28', time: '10:00' });

      const evts2 = wrapper.emitted('validation-change');
      expect(evts2.at(-1)[0].ok).toBe(true);
    });
  });

  describe('hint slot', () => {
    it('shows hint text when valid', () => {
      const wrapper = makeWrapper({
        date: '2026-05-28',
        time: '10:00',
        prev: { date: '2026-05-27', time: '14:30' },
        hint: 'Дата cушки',
      });
      expect(wrapper.find('[data-testid="sdf-hint"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="sdf-hint"]').text()).toBe('Дата cушки');
    });

    it('error supersedes hint when invalid', () => {
      const wrapper = makeWrapper({
        date: '2026-05-26',
        time: '10:00',
        prev: { date: '2026-05-27', time: '14:30' },
        hint: 'Дата cушки',
      });
      expect(wrapper.find('[data-testid="sdf-error"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="sdf-hint"]').exists()).toBe(false);
    });
  });
});
