// Component test for src/components/parity/LiveDelayBadge.vue
//
// Third Phase A primitive. Focus areas:
//   1. `since` parsing — ISO string + {date,time} shapes
//   2. label flows through useLiveDuration formatter
//   3. tone class switches per threshold
//   4. muted tone for null/unparseable source

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import LiveDelayBadge from '@/components/parity/LiveDelayBadge.vue';

function makeWrapper(props = {}) {
  return mount(LiveDelayBadge, { props });
}

describe('LiveDelayBadge.vue', () => {
  let nowSpy;

  beforeEach(() => {
    // Anchor "now" so elapsed values are deterministic.
    nowSpy = vi.spyOn(Date, 'now').mockReturnValue(
      new Date('2026-05-27T12:00:00Z').getTime()
    );
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  describe('source parsing', () => {
    it('accepts ISO string', () => {
      // 30 min ago
      const wrapper = makeWrapper({ since: '2026-05-27T11:30:00Z' });
      expect(wrapper.find('.ldb-text').text()).toBe('30 мин');
    });

    it('accepts {date, time} shape (interpreted as UTC for test stability)', () => {
      // Format the source so combined "YYYY-MM-DDTHH:MM:00" is 2h before "now".
      // Plain Date.parse uses local TZ; we just want a relative gap, and the
      // formatter is monotonic so test only on label not exact ms.
      const offsetHours = -2;
      const ts = new Date('2026-05-27T12:00:00Z').getTime() + offsetHours * 3600_000;
      const d = new Date(ts);
      const pad = (n) => String(n).padStart(2, '0');
      // Use the locally-rendered components since Date.parse(`YYYY-MM-DDTHH:MM:00`)
      // also interprets in local TZ — keeps the round-trip consistent.
      const localDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const localTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

      const wrapper = makeWrapper({
        since: { date: localDate, time: localTime },
      });
      // 2 hours ago → "2 ч 0 мин"
      expect(wrapper.find('.ldb-text').text()).toBe('2 ч 0 мин');
    });

    it('defaults time to 00:00 when {date} only', () => {
      const wrapper = makeWrapper({
        since: { date: '2026-05-27' },
      });
      // Just verify it renders some label (no crash on missing time).
      expect(wrapper.find('.ldb-text').exists()).toBe(true);
    });

    it('renders "—" muted for null source', () => {
      const wrapper = makeWrapper({ since: null });
      expect(wrapper.find('.ldb-text').text()).toBe('—');
      expect(wrapper.classes()).toContain('ldb--muted');
    });

    it('renders "—" muted for unparseable string', () => {
      const wrapper = makeWrapper({ since: 'not a date' });
      expect(wrapper.find('.ldb-text').text()).toBe('—');
      expect(wrapper.classes()).toContain('ldb--muted');
    });

    it('renders "—" muted for empty object', () => {
      const wrapper = makeWrapper({ since: {} });
      expect(wrapper.find('.ldb-text').text()).toBe('—');
      expect(wrapper.classes()).toContain('ldb--muted');
    });
  });

  describe('prefix rendering', () => {
    it('includes prefix text when provided', () => {
      const wrapper = makeWrapper({
        since: '2026-05-27T11:30:00Z',
        prefix: 'Прошло:',
      });
      expect(wrapper.find('.ldb-text').text()).toBe('Прошло: 30 мин');
    });

    it('omits prefix when empty', () => {
      const wrapper = makeWrapper({ since: '2026-05-27T11:30:00Z' });
      expect(wrapper.find('.ldb-text').text()).toBe('30 мин');
    });
  });

  describe('tone thresholds', () => {
    it('ok tone when below warn threshold', () => {
      // 30 min ago, warn at 60 min → ok
      const wrapper = makeWrapper({
        since: '2026-05-27T11:30:00Z',
        warnAfterMinutes: 60,
        errorAfterMinutes: 240,
      });
      expect(wrapper.classes()).toContain('ldb--ok');
    });

    it('warn tone when between warn and error', () => {
      // 2 hours ago, warn at 60 min, error at 240 min → warn
      const wrapper = makeWrapper({
        since: '2026-05-27T10:00:00Z',
        warnAfterMinutes: 60,
        errorAfterMinutes: 240,
      });
      expect(wrapper.classes()).toContain('ldb--warn');
    });

    it('error tone when above error threshold', () => {
      // 5 hours ago, error at 240 min → error
      const wrapper = makeWrapper({
        since: '2026-05-27T07:00:00Z',
        warnAfterMinutes: 60,
        errorAfterMinutes: 240,
      });
      expect(wrapper.classes()).toContain('ldb--error');
    });

    it('ok tone when only warn threshold set and elapsed is below', () => {
      const wrapper = makeWrapper({
        since: '2026-05-27T11:30:00Z',
        warnAfterMinutes: 60,
      });
      expect(wrapper.classes()).toContain('ldb--ok');
    });

    it('ok tone when no thresholds at all', () => {
      const wrapper = makeWrapper({ since: '2026-05-27T11:30:00Z' });
      expect(wrapper.classes()).toContain('ldb--ok');
    });
  });

  describe('icon prop', () => {
    it('renders pi-clock by default', () => {
      const wrapper = makeWrapper({ since: '2026-05-27T11:30:00Z' });
      expect(wrapper.find('.pi-clock').exists()).toBe(true);
    });

    it('renders custom icon when given', () => {
      const wrapper = makeWrapper({
        since: '2026-05-27T11:30:00Z',
        icon: 'pi-history',
      });
      expect(wrapper.find('.pi-history').exists()).toBe(true);
      expect(wrapper.find('.pi-clock').exists()).toBe(false);
    });

    it('hides icon when icon=null', () => {
      const wrapper = makeWrapper({
        since: '2026-05-27T11:30:00Z',
        icon: null,
      });
      expect(wrapper.find('i.pi').exists()).toBe(false);
    });
  });

  describe('title attribute', () => {
    it('exposes the ISO source as title for hover tooltip', () => {
      const wrapper = makeWrapper({ since: '2026-05-27T11:30:00Z' });
      expect(wrapper.attributes('title')).toBe('2026-05-27T11:30:00Z');
    });

    it('exposes the combined ISO from {date,time}', () => {
      const wrapper = makeWrapper({
        since: { date: '2026-05-27', time: '11:30' },
      });
      expect(wrapper.attributes('title')).toBe('2026-05-27T11:30:00');
    });

    it('renders empty title when no source', () => {
      const wrapper = makeWrapper({ since: null });
      expect(wrapper.attributes('title') || '').toBe('');
    });
  });
});
